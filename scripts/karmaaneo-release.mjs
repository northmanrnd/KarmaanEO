import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { computeNextReleaseVersion } from "./release-version-utils.mjs";

export const REPOSITORY = "northmanrnd/KarmaanEO";
export const RELEASE_BRANCH = "karmaaneo";
export const TAG_PREFIX = "karmaaneo-v";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function assertVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$/.test(version)) {
    throw new Error(`Invalid KarmaanEO version: ${version}`);
  }
  return version;
}
export function releasePlan(version, mode = "current") {
  assertVersion(version);
  const next = assertVersion(
    mode === "current" ? version : computeNextReleaseVersion(version, mode),
  );
  return {
    version: next,
    tag: TAG_PREFIX + next,
    prerelease: next.includes("-beta."),
    repository: REPOSITORY,
  };
}
export function isLatestStable(version, releases) {
  assertVersion(version);
  if (version.includes("-beta.")) return false;
  const current = version.split(".").map(Number);
  return !releases.some((release) => {
    if (release.draft || release.prerelease || !/^karmaaneo-v\d+\.\d+\.\d+$/.test(release.tag_name))
      return false;
    const candidate = release.tag_name.slice(TAG_PREFIX.length).split(".").map(Number);
    for (let i = 0; i < 3; i++) if (candidate[i] !== current[i]) return candidate[i] > current[i];
    return false;
  });
}
export function assertRemote(cwd) {
  for (const args of [
    ["remote", "get-url", "origin"],
    ["remote", "get-url", "--push", "origin"],
  ]) {
    const remote = git(cwd, ...args)
      .replace(/\/$/, "")
      .replace(/\.git$/, "");
    if (!["https://github.com/" + REPOSITORY, "git@github.com:" + REPOSITORY].includes(remote)) {
      throw new Error(`origin must be ${REPOSITORY} for fetch and push`);
    }
  }
}
export function assertClean(cwd) {
  if (git(cwd, "status", "--porcelain"))
    throw new Error("Release requires a clean working tree, including untracked files");
}
export function syncVersions(cwd, version) {
  assertVersion(version);
  const pkg = json(path.join(cwd, "package.json"));
  const lock = json(path.join(cwd, "package-lock.json"));
  if (!pkg.private || !lock.packages?.[""])
    throw new Error("Root package must be private and locked");
  const members = pkg.workspaces.map((workspace) => {
    const file = path.join(cwd, workspace, "package.json");
    const member = json(file);
    if (!member.private || !lock.packages[workspace])
      throw new Error(`Workspace must be private and locked: ${workspace}`);
    return { workspace, file, member };
  });
  pkg.version = version;
  lock.version = version;
  lock.packages[""].version = version;
  for (const { workspace, file, member } of members) {
    member.version = version;
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      for (const name of Object.keys(member[section] ?? {})) {
        if (name.startsWith("@getpaseo/") && name !== member.name) member[section][name] = "*";
      }
      if (member[section]) lock.packages[workspace][section] = member[section];
    }
    save(file, member);
    lock.packages[workspace].version = version;
    lock.packages[workspace].private = true;
  }
  save(path.join(cwd, "package.json"), pkg);
  save(path.join(cwd, "package-lock.json"), lock);
}
export function verifyRelease(cwd, tag) {
  const pkg = json(path.join(cwd, "package.json"));
  if (!pkg.private) throw new Error("Root package must be private");
  const plan = releasePlan(pkg.version);
  if (tag && tag !== plan.tag)
    throw new Error(`Tag ${tag} does not match package version ${plan.version}`);
  const lock = json(path.join(cwd, "package-lock.json"));
  if (lock.version !== plan.version || lock.packages[""].version !== plan.version)
    throw new Error("Root lockfile version mismatch");
  for (const workspace of pkg.workspaces) {
    const member = json(path.join(cwd, workspace, "package.json"));
    if (
      !member.private ||
      member.version !== plan.version ||
      lock.packages[workspace]?.version !== plan.version
    ) {
      throw new Error(`Workspace version/private mismatch: ${workspace}`);
    }
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      for (const [name, value] of Object.entries(member[section] ?? {})) {
        if (name.startsWith("@getpaseo/") && value !== "*")
          throw new Error(`Internal dependency drift: ${workspace}/${name}`);
        if (lock.packages[workspace][section]?.[name] !== value)
          throw new Error(`Workspace lockfile dependency drift: ${workspace}/${name}`);
      }
    }
  }
  if (!readFileSync(path.join(cwd, "releases", plan.tag + ".md"), "utf8").trim())
    throw new Error("Release notes are empty");
  return plan;
}
export function prepareRelease(cwd, mode, notesFile) {
  assertRemote(cwd);
  assertClean(cwd);
  const plan = releasePlan(json(path.join(cwd, "package.json")).version, mode);
  const notes = readFileSync(notesFile, "utf8").trim();
  if (!notes) throw new Error("Release notes cannot be empty");
  const destination = path.join(cwd, "releases", plan.tag + ".md");
  if (existsSync(destination))
    throw new Error("Release notes already exist; use a new release version");
  if (git(cwd, "tag", "--list", plan.tag)) throw new Error("Release tag already exists");
  syncVersions(cwd, plan.version);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `# KarmaanEO ${plan.version}\n\n${notes}\n`);
  verifyRelease(cwd, plan.tag);
  return plan;
}
export function tagRelease(cwd) {
  assertRemote(cwd);
  assertClean(cwd);
  if (git(cwd, "branch", "--show-current") !== RELEASE_BRANCH)
    throw new Error(`Tag releases from ${RELEASE_BRANCH}`);
  const plan = verifyRelease(cwd);
  if (git(cwd, "tag", "--list", plan.tag))
    throw new Error("Release tag already exists; tags are immutable");
  git(cwd, "tag", "-a", plan.tag, "-m", `KarmaanEO ${plan.version}`);
  return plan;
}
export function pushRelease(cwd) {
  assertRemote(cwd);
  assertClean(cwd);
  const plan = verifyRelease(cwd);
  if (git(cwd, "branch", "--show-current") !== RELEASE_BRANCH)
    throw new Error(`Publish from ${RELEASE_BRANCH}`);
  if (git(cwd, "cat-file", "-t", `refs/tags/${plan.tag}`) !== "tag")
    throw new Error("Release tag must be annotated");
  if (git(cwd, "rev-parse", `${plan.tag}^{commit}`) !== git(cwd, "rev-parse", "HEAD"))
    throw new Error("Release tag does not point to HEAD");
  const existing = git(cwd, "ls-remote", "origin", `refs/tags/${plan.tag}`);
  if (existing) throw new Error("Remote release tag already exists; never overwrite it");
  // Atomic and non-forced: a branch rejection cannot leave a published tag behind.
  git(
    cwd,
    "push",
    "--atomic",
    "origin",
    `HEAD:refs/heads/${RELEASE_BRANCH}`,
    `refs/tags/${plan.tag}`,
  );
  return plan;
}
function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { notes: { type: "string" }, tag: { type: "string" } },
  });
  const [command = "plan", mode = "current"] = positionals;
  let result;
  if (command === "plan") result = releasePlan(json(path.join(root, "package.json")).version, mode);
  else if (command === "prepare") {
    if (!values.notes) throw new Error("prepare requires --notes <file>");
    result = prepareRelease(root, mode, values.notes);
  } else if (command === "check") result = verifyRelease(root, values.tag);
  else if (command === "tag") result = tagRelease(root);
  else if (command === "push") result = pushRelease(root);
  else
    throw new Error(
      "Commands: plan [mode], prepare [mode] --notes <file>, check [--tag <tag>], tag, push",
    );
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
