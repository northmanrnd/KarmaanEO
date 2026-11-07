import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  releasePlan,
  isLatestStable,
  assertVersion,
  syncVersions,
  verifyRelease,
  prepareRelease,
  tagRelease,
  pushRelease,
  assertRemote,
  assertClean,
} from "./karmaaneo-release.mjs";
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
function fixture(t) {
  const base = mkdtempSync(path.join(tmpdir(), "karmaaneo-release-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const cwd = path.join(base, "repo");
  mkdirSync(path.join(cwd, "packages/member"), { recursive: true });
  mkdirSync(path.join(cwd, "releases"));
  const member = {
    name: "@getpaseo/member",
    version: "0.1.0",
    private: true,
    dependencies: { "@getpaseo/client": "*" },
  };
  save(path.join(cwd, "package.json"), {
    version: "0.1.0",
    private: true,
    workspaces: ["packages/member"],
  });
  save(path.join(cwd, "packages/member/package.json"), member);
  save(path.join(cwd, "package-lock.json"), {
    version: "0.1.0",
    packages: { "": { version: "0.1.0" }, "packages/member": member },
  });
  writeFileSync(path.join(cwd, "releases/karmaaneo-v0.1.0.md"), "Initial release\n");
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "karmaaneo");
  git("config", "user.name", "Release Test");
  git("config", "user.email", "release-test@example.invalid");
  git("remote", "add", "origin", "https://github.com/northmanrnd/KarmaanEO.git");
  const commit = () => {
    git("add", ".");
    git("commit", "-m", "Fixture");
  };
  commit();
  const notes = path.join(base, "notes.md");
  writeFileSync(notes, "A documented change.\n");
  return { cwd, git, commit, notes };
}
test("stable and beta version transitions", () => {
  for (const [mode, expected] of Object.entries({
    patch: "1.2.4",
    minor: "1.3.0",
    major: "2.0.0",
    "beta-patch": "1.2.4-beta.1",
    "beta-minor": "1.3.0-beta.1",
    "beta-major": "2.0.0-beta.1",
  })) {
    assert.equal(releasePlan("1.2.3", mode).version, expected);
  }
  assert.equal(releasePlan("1.3.0-beta.2", "beta-next").tag, "karmaaneo-v1.3.0-beta.3");
  assert.equal(releasePlan("1.3.0-beta.2", "promote").prerelease, false);
  assert.throws(() => releasePlan("1.3.0-beta.2", "patch"), /Promote/);
  assert.throws(() => releasePlan("1.2.3", "promote"), /Cannot promote/);
  assert.throws(() => releasePlan("1.2.3", "unknown"), /Unsupported/);
  for (const bad of ["01.2.3", "1.2", "v1.2.3", "1.2.3-beta.0", "1.2.3-rc.1", "1.2.3;echo bad"])
    assert.throws(() => assertVersion(bad));
});
test("preparation synchronizes versions and notes without tagging", (t) => {
  const f = fixture(t);
  const p = prepareRelease(f.cwd, "minor", f.notes);
  assert.equal(p.version, "0.2.0");
  assert.deepEqual(verifyRelease(f.cwd, p.tag), p);
  assert.equal(f.git("tag", "--list"), "");
  assert.match(
    readFileSync(path.join(f.cwd, "releases", p.tag + ".md"), "utf8"),
    /A documented change/,
  );
  assert.throws(() => tagRelease(f.cwd), /clean/);
  f.commit();
  tagRelease(f.cwd);
  assert.equal(f.git("cat-file", "-t", "refs/tags/" + p.tag), "tag");
  assert.throws(() => tagRelease(f.cwd), /immutable/);
});
test("wrong remotes, branches, dirty trees, mismatched tags and empty notes fail", (t) => {
  const f = fixture(t);
  assert.throws(() => verifyRelease(f.cwd, "v0.1.0"), /does not match/);
  f.git("switch", "-c", "feature/test");
  assert.throws(() => tagRelease(f.cwd), /Tag releases from/);
  f.git("remote", "set-url", "origin", "https://github.com/getpaseo/paseo.git");
  assert.throws(() => assertRemote(f.cwd), /origin must/);
  f.git("remote", "set-url", "origin", "https://github.com/northmanrnd/KarmaanEO.git");
  writeFileSync(f.notes, "  ");
  assert.throws(() => prepareRelease(f.cwd, "patch", f.notes), /empty/);
  assert.equal(f.git("status", "--porcelain"), "");
  writeFileSync(path.join(f.cwd, "untracked"), "x");
  assert.throws(() => assertClean(f.cwd), /clean/);
});
test("invalid workspace preflight leaves manifests unchanged", (t) => {
  const f = fixture(t);
  const rootBefore = readFileSync(path.join(f.cwd, "package.json"), "utf8");
  const memberFile = path.join(f.cwd, "packages/member/package.json");
  const member = JSON.parse(readFileSync(memberFile));
  member.private = false;
  save(memberFile, member);
  assert.throws(() => syncVersions(f.cwd, "1.0.0"), /private and locked/);
  assert.equal(readFileSync(path.join(f.cwd, "package.json"), "utf8"), rootBefore);
  assert.throws(() => verifyRelease(f.cwd), /mismatch/);
});
test("dependency and lockfile drift fail validation", (t) => {
  const f = fixture(t);
  const memberFile = path.join(f.cwd, "packages/member/package.json");
  const member = JSON.parse(readFileSync(memberFile));
  member.dependencies["@getpaseo/client"] = "0.15.1";
  save(memberFile, member);
  assert.throws(() => verifyRelease(f.cwd), /dependency drift/);
  syncVersions(f.cwd, "0.2.0");
  writeFileSync(path.join(f.cwd, "releases/karmaaneo-v0.2.0.md"), "New release");
  verifyRelease(f.cwd);
  const lockFile = path.join(f.cwd, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockFile));
  lock.version = "0.1.0";
  save(lockFile, lock);
  assert.throws(() => verifyRelease(f.cwd), /lockfile version mismatch/);
});
test("existing release notes are never overwritten", (t) => {
  const f = fixture(t);
  assert.throws(() => prepareRelease(f.cwd, "current", f.notes), /already exist/);
  assert.equal(f.git("status", "--porcelain"), "");
});

test("publication rejects lightweight tags and tags behind HEAD without contacting GitHub", (t) => {
  const f = fixture(t);
  f.git("tag", "karmaaneo-v0.1.0");
  assert.throws(() => pushRelease(f.cwd), /must be annotated/);
  f.git("tag", "-d", "karmaaneo-v0.1.0");
  tagRelease(f.cwd);
  writeFileSync(path.join(f.cwd, "change"), "new source");
  f.commit();
  assert.throws(() => pushRelease(f.cwd), /does not point to HEAD/);
});
test("a different push destination is refused even when fetch origin is correct", (t) => {
  const f = fixture(t);
  f.git("remote", "set-url", "--push", "origin", "https://github.com/getpaseo/paseo.git");
  assert.throws(() => assertRemote(f.cwd), /fetch and push/);
});

test("latest stable never moves backward or follows beta/draft releases", () => {
  const releases = [
    { tag_name: "karmaaneo-v1.10.0", draft: false, prerelease: false },
    { tag_name: "karmaaneo-v2.0.0", draft: true, prerelease: false },
    { tag_name: "karmaaneo-v3.0.0-beta.1", draft: false, prerelease: true },
    { tag_name: "v99.0.0", draft: false, prerelease: false },
  ];
  assert.equal(isLatestStable("1.9.1", releases), false);
  assert.equal(isLatestStable("1.10.0", releases), true);
  assert.equal(isLatestStable("1.11.0", releases), true);
  assert.equal(isLatestStable("2.0.0-beta.2", releases), false);
});
