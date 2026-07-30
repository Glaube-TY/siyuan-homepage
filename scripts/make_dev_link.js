/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2023-07-15 15:31:31
 * @FilePath     : /scripts/make_dev_link.js
 * @LastEditTime : 2024-09-06 18:13:53
 * @Description  : 
 */
// make_dev_link.js
import fs from 'fs';
import path from 'node:path';
import {
    log,
    error,
    getSiYuanDir,
    chooseTarget,
    loadLocalEnvFile
} from './utils.js';
import { saveDevPluginDir, syncDevDeployment } from './dev_deploy.js';

let targetDir = '';
loadLocalEnvFile();

/**
 * 1. Get the parent directory to install the plugin
 */
log('>>> Try to visit constant "targetDir" in make_dev_link.js...');
if (targetDir === '') {
    const configuredPluginDir = process.env?.SIYUAN_PLUGIN_DIR?.trim();
    if (configuredPluginDir) {
        targetDir = path.resolve(configuredPluginDir);
        log(`>>> Use "SIYUAN_PLUGIN_DIR" from the local environment: ${targetDir}`);
    } else {
        log('>>> "SIYUAN_PLUGIN_DIR" is empty, try to get SiYuan directory automatically....');
        const res = await getSiYuanDir();

        if (!res || res.length === 0) {
            log('>>> 无法通过思源 Kernel API 获取工作空间，可能是思源未运行、API 授权未配置、端口不是 6806 或返回结构变化。');
            error('\tPlease set SIYUAN_PLUGIN_DIR in .env to the intended workspace data/plugins directory.');
            process.exit(1);
        } else {
            targetDir = await chooseTarget(res);
        }
    }

    log(`>>> Successfully got target directory: ${targetDir}`);
}
const targetSegments = [
    path.basename(path.dirname(targetDir)).toLowerCase(),
    path.basename(targetDir).toLowerCase()
];
if (targetSegments[0] !== 'data' || targetSegments[1] !== 'plugins') {
    error(`Failed! Refusing to use a directory that is not data/plugins: "${targetDir}"`);
    process.exit(1);
}
if (!fs.existsSync(targetDir)) {
    error(`Failed! Plugin directory not exists: "${targetDir}"`);
    error('Please set the plugin directory in scripts/make_dev_link.js');
    process.exit(1);
}

/** 2. The dev directory, which contains the compiled plugin code. */
const devDir = path.resolve(process.cwd(), 'dev');
if (!fs.existsSync(devDir)) {
    error(`Failed! Development output does not exist: "${devDir}"`);
    process.exit(1);
}

/** 3. Persist the selected workspace and deploy a real, syncable directory. */
const result = syncDevDeployment({ sourceDir: devDir, pluginDir: targetDir });
if (!result) {
    error('Failed! Development deployment target is not configured.');
    process.exit(1);
}
const configPath = saveDevPluginDir(targetDir);
log(`Done! Deployed a real plugin directory: ${result.targetDir}`);
log(`\tCopied ${result.copied}, unchanged ${result.unchanged}, deleted ${result.deleted}`);
if (result.convertedLink) {
    log('\tConverted the previous symbolic link into a real directory.');
}
log(`\tSaved development target config: ${configPath}`);
