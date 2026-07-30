import fs from "node:fs";
import path from "node:path";
import { loadLocalEnvFile } from "./utils.js";
import {
    mirrorGeneratedDirectory,
    resolveConfiguredDevPluginDir,
    syncDevDeployment,
} from "./dev_deploy.js";

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, "dist");
const devDir = path.resolve(rootDir, "dev");

if (!fs.existsSync(path.join(distDir, "index.js"))) {
    throw new Error("dist/index.js is missing; run the production build first");
}

const localStats = mirrorGeneratedDirectory(distDir, devDir);
console.log(`[sync-dev] Synced production output to ${devDir} (copied ${localStats.copied}, unchanged ${localStats.unchanged}, deleted ${localStats.deleted})`);

loadLocalEnvFile();
if (process.env.SIYUAN_SKIP_DEV_DEPLOY !== "1" && resolveConfiguredDevPluginDir(rootDir)) {
    const deployStats = syncDevDeployment({ rootDir, sourceDir: devDir });
    console.log(`[sync-dev] Synced real plugin directory ${deployStats.targetDir} (copied ${deployStats.copied}, unchanged ${deployStats.unchanged}, deleted ${deployStats.deleted})`);
}
