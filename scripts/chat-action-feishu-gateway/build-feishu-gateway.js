import { builtinModules } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const rootDir = process.cwd();
const entry = path.join(rootDir, "scripts", "chat-action-feishu-gateway", "feishu-gateway.mjs");
const outdir = path.join(rootDir, "build", "chat-action-feishu-gateway");
const outfile = path.join(outdir, "feishu-gateway.mjs");
const stalePackageDirs = [
  path.join(rootDir, "dist", "scripts", "chat-action-feishu-gateway"),
];
const external = Array.from(new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]));

await fs.rm(outdir, { recursive: true, force: true });
for (const dir of stalePackageDirs) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // A locked stale file should not block rebuilding the gateway source artifact.
  }
}
await fs.mkdir(outdir, { recursive: true });

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  external,
  logLevel: "silent",
  legalComments: "none",
  banner: {
    js: [
      'import { createRequire as __gatewayCreateRequire } from "node:module";',
      'import { fileURLToPath as __gatewayFileURLToPath } from "node:url";',
      'import { dirname as __gatewayDirname } from "node:path";',
      "const require = __gatewayCreateRequire(import.meta.url);",
      "const __filename = __gatewayFileURLToPath(import.meta.url);",
      "const __dirname = __gatewayDirname(__filename);",
    ].join("\n"),
  },
});

await fs.chmod(outfile, 0o755);
