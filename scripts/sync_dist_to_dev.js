import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, "dist");
const devDir = path.resolve(rootDir, "dev");

if (!fs.existsSync(path.join(distDir, "index.js"))) {
    throw new Error("dist/index.js is missing; run the production build first");
}

function copyDirectory(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

copyDirectory(distDir, devDir);
console.log(`[sync-dev] Synced production output to ${devDir}`);
