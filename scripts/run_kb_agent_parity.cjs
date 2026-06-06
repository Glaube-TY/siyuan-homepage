const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, ".tmp", "kb-agent-parity");
const entry = path.join(
  repoRoot,
  "src",
  "features",
  "kb",
  "services",
  "agentic-rag",
  "harness",
  "parity",
  "dev-runner.ts",
);
const compiledEntry = path.join(
  outDir,
  "features",
  "kb",
  "services",
  "agentic-rag",
  "harness",
  "parity",
  "dev-runner.js",
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "package.json"), "{\"type\":\"commonjs\"}\n");

run("npx", [
  "tsc",
  "--target",
  "ES2020",
  "--module",
  "commonjs",
  "--moduleResolution",
  "node",
  "--lib",
  "ES2020,DOM,DOM.Iterable",
  "--types",
  "node",
  "--skipLibCheck",
  "--esModuleInterop",
  "--allowSyntheticDefaultImports",
  "--resolveJsonModule",
  "--rootDir",
  "src",
  "--outDir",
  outDir,
  "--noEmit",
  "false",
  "--strict",
  "false",
  "--noUnusedLocals",
  "false",
  "--noUnusedParameters",
  "false",
  entry,
]);

run("node", [compiledEntry]);
