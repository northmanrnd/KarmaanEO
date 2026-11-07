// Legacy entry point: preparation never publishes npm packages or creates v* tags.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const mode = args[args.indexOf("--mode") + 1];
if (!args.includes("--mode") || !mode)
  throw new Error("Use npm run release:prepare -- <mode> --notes <file>");
const child = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("./karmaaneo-release.mjs", import.meta.url)),
    args.includes("--print") ? "plan" : "prepare",
    mode,
    ...args.slice(args.indexOf(mode) + 1).filter((arg) => arg !== "--print"),
  ],
  { stdio: "inherit" },
);
process.exitCode = child.status ?? 1;
