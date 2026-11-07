// Runs the exact published MD4C WASM parser and Paseo's TypeScript classifier without a UI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../packages/app/src");
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file + ".ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: mod.exports,
    module: mod,
    URL,
    require: (name) =>
      load(name.startsWith("@/") ? name.slice(2) : path.posix.join(path.posix.dirname(file), name)),
  });
  return mod.exports;
}
(async () => {
  const parserPath = require.resolve("react-native-enriched-markdown/package.json", {
    paths: [path.resolve(__dirname, "../packages/app")],
  });
  const wasm = fs.readFileSync(
    path.join(path.dirname(parserPath), "lib/module/web/wasm/md4c.js"),
    "utf8",
  );
  const context = { console, URL, WebAssembly, TextDecoder, TextEncoder, atob, fetch };
  vm.createContext(context);
  vm.runInContext(wasm.replace(/export default createMd4cModule;?/, ""), context);
  const module = await context.createMd4cModule();
  const parse = module.cwrap("parseMarkdown", "string", ["string", ...Array(8).fill("number")]);
  const classifier = load("assistant-file-links/parse");
  const cases = [
    ["/Users/test/K2 Work/reports/README.md", "/Users/test/K2 Work/reports/README.md"],
    ["/Users/test/K2%20Work/reports/README.md", "/Users/test/K2 Work/reports/README.md"],
    ["reports/My Report.md", "/repo/reports/My Report.md"],
  ];
  for (const [href, expected] of cases) {
    const ast = JSON.parse(parse(`[Report](<${href}>)`, 0, 0, 0, 0, 0, 1, 0, 1));
    const urls = [];
    function walk(node) {
      if (node.type === "Link") urls.push(node.attributes.url);
      for (const child of node.children || []) walk(child);
    }
    walk(ast);
    assert.equal(urls.length, 1);
    const result = classifier.classifyAssistantFileLink(urls[0], {
      workspaceRoot: "/repo",
      explicitLink: true,
      decodeHref: true,
    });
    assert.equal(result?.kind, "directFile");
    assert.equal(result.target.path, expected);
  }
  console.log("MD4C-to-Paseo file-link regression: 3 cases passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
