import fs from "node:fs";
import path from "node:path";

const TARGET_CONFIG_FILE = ".siyuan-dev-target.json";
const DEPLOY_MARKER_FILE = ".siyuan-dev-deploy.json";
const TARGET_CONFIG_SCHEMA = "siyuan-homepage-dev-target";
const DEPLOY_MARKER_SCHEMA = "siyuan-homepage-dev-deployment";

function assertDataPluginsDir(pluginDir) {
    const resolved = path.resolve(pluginDir);
    const parentName = path.basename(path.dirname(resolved)).toLowerCase();
    const directoryName = path.basename(resolved).toLowerCase();
    if (parentName !== "data" || directoryName !== "plugins") {
        throw new Error(`Refusing to deploy outside a data/plugins directory: ${resolved}`);
    }
    return resolved;
}

function assertExistingDataPluginsDir(pluginDir) {
    const resolved = assertDataPluginsDir(pluginDir);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error(`Configured data/plugins directory does not exist: ${resolved}`);
    }
    return resolved;
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPluginName(rootDir) {
    const plugin = readJsonFile(path.join(rootDir, "plugin.json"));
    if (typeof plugin?.name !== "string" || !plugin.name.trim()) {
        throw new Error("plugin.json does not contain a valid plugin name");
    }
    return plugin.name.trim();
}

function sameFileContent(sourcePath, targetPath) {
    if (!fs.existsSync(targetPath)) {
        return false;
    }
    const targetStat = fs.lstatSync(targetPath);
    if (!targetStat.isFile()) {
        return false;
    }
    const sourceStat = fs.statSync(sourcePath);
    if (sourceStat.size !== targetStat.size) {
        return false;
    }
    return fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath));
}

function collectFiles(directory, baseDir = directory, result = new Map()) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectFiles(entryPath, baseDir, result);
        } else if (entry.isFile()) {
            result.set(path.relative(baseDir, entryPath), entryPath);
        }
    }
    return result;
}

function assertNoNestedSymlinks(directory, targetRoot) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        const entryStat = fs.lstatSync(entryPath);
        if (entryStat.isSymbolicLink()) {
            throw new Error(`Refusing to follow a nested symbolic link in deployment target: ${path.relative(targetRoot, entryPath)}`);
        }
        if (entryStat.isDirectory()) {
            assertNoNestedSymlinks(entryPath, targetRoot);
        }
    }
}

function removeStaleEntries(directory, targetRoot, expectedFiles, stats) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        const relativePath = path.relative(targetRoot, entryPath);
        if (relativePath === DEPLOY_MARKER_FILE) {
            continue;
        }

        const entryStat = fs.lstatSync(entryPath);
        if (entryStat.isSymbolicLink()) {
            if (!expectedFiles.has(relativePath)) {
                fs.unlinkSync(entryPath);
                stats.deleted += 1;
            }
            continue;
        }
        if (entryStat.isDirectory()) {
            removeStaleEntries(entryPath, targetRoot, expectedFiles, stats);
            if (fs.readdirSync(entryPath).length === 0) {
                fs.rmdirSync(entryPath);
            }
        } else if (!expectedFiles.has(relativePath)) {
            fs.unlinkSync(entryPath);
            stats.deleted += 1;
        }
    }
}

function validateExistingTarget(targetDir, pluginName) {
    const markerPath = path.join(targetDir, DEPLOY_MARKER_FILE);
    if (fs.existsSync(markerPath)) {
        const marker = readJsonFile(markerPath);
        if (marker?.schema !== DEPLOY_MARKER_SCHEMA || marker?.pluginName !== pluginName) {
            throw new Error(`Development deployment marker does not match ${pluginName}: ${markerPath}`);
        }
        return;
    }

    const pluginJsonPath = path.join(targetDir, "plugin.json");
    if (!fs.existsSync(pluginJsonPath)) {
        if (fs.readdirSync(targetDir).length > 0) {
            throw new Error(`Refusing to overwrite an unrecognized non-empty directory: ${targetDir}`);
        }
        return;
    }
    const existingPlugin = readJsonFile(pluginJsonPath);
    if (existingPlugin?.name !== pluginName) {
        throw new Error(`Target directory contains another plugin: ${targetDir}`);
    }
}

function copyFileWithRetry(sourcePath, targetPath, maxRetries = 6, initialDelayMs = 60) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            fs.copyFileSync(sourcePath, targetPath);
            return;
        } catch (error) {
            const isLockError = error?.code === "EBUSY" || error?.code === "EPERM" || error?.code === "EACCES";
            if (isLockError && attempt < maxRetries) {
                const delay = initialDelayMs * Math.pow(1.5, attempt);
                const start = Date.now();
                while (Date.now() - start < delay) {}
                continue;
            }
            throw error;
        }
    }
}

/**
 * Mirrors generated files into a real directory. Only changed file contents
 * are copied, which prevents unchanged static assets from repeatedly entering
 * the SiYuan sync queue.
 */
export function mirrorGeneratedDirectory(sourceDir, targetDir, {
    marker = null,
    validateTarget = null,
} = {}) {
    const resolvedSource = path.resolve(sourceDir);
    const resolvedTarget = path.resolve(targetDir);
    if (!fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isDirectory()) {
        throw new Error(`Generated source directory does not exist: ${resolvedSource}`);
    }
    if (
        resolvedSource === resolvedTarget
        || resolvedTarget.startsWith(`${resolvedSource}${path.sep}`)
        || resolvedSource.startsWith(`${resolvedTarget}${path.sep}`)
    ) {
        throw new Error(`Deployment source and target cannot contain each other: ${resolvedSource} -> ${resolvedTarget}`);
    }

    const stats = { copied: 0, unchanged: 0, deleted: 0, convertedLink: false };
    if (fs.existsSync(resolvedTarget)) {
        const targetStat = fs.lstatSync(resolvedTarget);
        if (targetStat.isSymbolicLink()) {
            fs.unlinkSync(resolvedTarget);
            stats.convertedLink = true;
        } else if (!targetStat.isDirectory()) {
            throw new Error(`Deployment target is not a directory: ${resolvedTarget}`);
        }
    }
    fs.mkdirSync(resolvedTarget, { recursive: true });
    assertNoNestedSymlinks(resolvedTarget, resolvedTarget);
    validateTarget?.(resolvedTarget);

    const sourceFiles = collectFiles(resolvedSource);
    sourceFiles.delete(DEPLOY_MARKER_FILE);
    for (const [relativePath, sourcePath] of sourceFiles) {
        const targetPath = path.join(resolvedTarget, relativePath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        if (fs.existsSync(targetPath) && !fs.lstatSync(targetPath).isFile()) {
            throw new Error(`Deployment file conflicts with a non-file target: ${targetPath}`);
        }
        if (sameFileContent(sourcePath, targetPath)) {
            stats.unchanged += 1;
            continue;
        }
        copyFileWithRetry(sourcePath, targetPath);
        stats.copied += 1;
    }

    removeStaleEntries(resolvedTarget, resolvedTarget, new Set(sourceFiles.keys()), stats);
    if (marker) {
        const markerPath = path.join(resolvedTarget, DEPLOY_MARKER_FILE);
        const markerBody = `${JSON.stringify(marker, null, 2)}\n`;
        if (!fs.existsSync(markerPath) || fs.readFileSync(markerPath, "utf8") !== markerBody) {
            fs.writeFileSync(markerPath, markerBody, "utf8");
        }
    }
    return stats;
}

export function resolveConfiguredDevPluginDir(rootDir = process.cwd()) {
    const envDir = process.env.SIYUAN_PLUGIN_DIR?.trim();
    if (envDir) {
        return assertExistingDataPluginsDir(envDir);
    }

    const configPath = path.join(rootDir, TARGET_CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
        return null;
    }
    const config = readJsonFile(configPath);
    if (config?.schema !== TARGET_CONFIG_SCHEMA || typeof config?.pluginDir !== "string") {
        throw new Error(`Invalid development target config: ${configPath}`);
    }
    return assertExistingDataPluginsDir(config.pluginDir);
}

export function saveDevPluginDir(pluginDir, rootDir = process.cwd()) {
    const resolvedPluginDir = assertExistingDataPluginsDir(pluginDir);
    const configPath = path.join(rootDir, TARGET_CONFIG_FILE);
    fs.writeFileSync(configPath, `${JSON.stringify({
        schema: TARGET_CONFIG_SCHEMA,
        pluginDir: resolvedPluginDir,
    }, null, 2)}\n`, "utf8");
    return configPath;
}

export function syncDevDeployment({
    rootDir = process.cwd(),
    sourceDir = path.join(rootDir, "dev"),
    pluginDir = resolveConfiguredDevPluginDir(rootDir),
} = {}) {
    if (!pluginDir) {
        return null;
    }
    const pluginName = readPluginName(rootDir);
    const resolvedPluginDir = assertExistingDataPluginsDir(pluginDir);
    const targetDir = path.join(resolvedPluginDir, pluginName);
    const stats = mirrorGeneratedDirectory(sourceDir, targetDir, {
        marker: {
            schema: DEPLOY_MARKER_SCHEMA,
            version: 1,
            pluginName,
        },
        validateTarget: (directory) => validateExistingTarget(directory, pluginName),
    });
    return { pluginDir: resolvedPluginDir, targetDir, ...stats };
}
