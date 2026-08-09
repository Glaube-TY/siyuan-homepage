// 构建 Electron Provider bundles：build/robot-electron/*.cjs
// - feishu-provider.cjs：bundle @larksuiteoapi/node-sdk（含 ws / protobuf 等 npm 依赖）
// - qq-provider.cjs：依赖 @tencent-connect/qqbot-nodejs；SDK 未安装时跳过（等待依赖接入）
// platform=node、format=cjs、external 仅 Node builtins。
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { build } from "esbuild";

const rootDir = process.cwd();
const outdir = path.join(rootDir, "build", "robot-electron");
fs.mkdirSync(outdir, { recursive: true });

const entries = [
  {
    name: "feishu-provider",
    entry: path.join(rootDir, "src", "features", "robot-assistant", "providers", "electron", "feishu-provider.entry.cjs"),
  },
  {
    name: "qq-provider",
    entry: path.join(rootDir, "src", "features", "robot-assistant", "providers", "electron", "qq-provider.entry.mjs"),
  },
];

let built = 0;
for (const item of entries) {
  if (!fs.existsSync(item.entry)) {
    console.warn(`[build-robot-electron] 跳过 ${item.name}：入口不存在（${item.entry}）`);
    continue;
  }
  await build({
    entryPoints: [item.entry],
    outfile: path.join(outdir, `${item.name}.cjs`),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node16",
    minify: true,
    logLevel: "info",
    external: builtinModules,
  });
  built += 1;
  console.log(`[build-robot-electron] ${item.name}.cjs`);
}
if (built === 0) {
  console.warn("[build-robot-electron] 没有可构建的 Electron Provider 入口");
}
