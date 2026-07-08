/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-09-06 17:42:57
 * @FilePath     : /scripts/utils.js
 * @LastEditTime : 2024-09-06 19:23:12
 * @Description  : 
 */
// common.js
import fs from 'fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';

// Logging functions
export const log = (info) => console.log(`\x1B[36m%s\x1B[0m`, info);
export const error = (info) => console.log(`\x1B[31m%s\x1B[0m`, info);

// HTTP POST headers
export const POST_HEADER = {
    "Content-Type": "application/json",
};

const SIYUAN_WORKSPACES_API = 'http://127.0.0.1:6806/api/system/getWorkspaces';
const TOKEN_ENV_NAMES = ['SIYUAN_API_TOKEN', 'SIYUAN_TOKEN', 'SIYUAN_AUTH_TOKEN'];
const TOKEN_FILE_ENV_NAME = 'SIYUAN_API_TOKEN_FILE';
const DEFAULT_TOKEN_FILE = '.siyuan-api-token.local';
const AUTH_RETRY_STATUS = new Set([401, 403]);

function hasHeader(headers, headerName) {
    return Object.keys(headers).some((key) => key.toLowerCase() === headerName.toLowerCase());
}

function redactSensitive(value) {
    let text = String(value ?? '');
    getTokenSecrets().forEach((secret) => {
        text = text.split(secret).join('[redacted]');
    });
    return text.replace(/(Authorization\s*[:=]\s*)(token|Bearer)\s+[^,\s)]+/gi, '$1$2 [redacted]');
}

function getTokenSecrets() {
    const secrets = [];
    TOKEN_ENV_NAMES.forEach((name) => {
        const token = process.env?.[name];
        if (token) {
            secrets.push(token, token.trim(), token.trim().replace(/^(token|Bearer)\s/i, ''));
        }
    });

    const fileToken = readTokenFromLocalFile({ silent: true });
    if (fileToken) {
        secrets.push(fileToken, fileToken.trim(), fileToken.trim().replace(/^(token|Bearer)\s/i, ''));
    }

    return [...new Set(secrets.filter(Boolean))];
}

// Fetch function compatible with older Node.js versions
export async function myfetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const { body, ...requestOptions } = options;
        let requestBody = body;
        const headers = { ...(requestOptions.headers ?? {}) };
        if (requestBody !== undefined && requestBody !== null) {
            if (!Buffer.isBuffer(requestBody) && typeof requestBody !== 'string') {
                requestBody = JSON.stringify(requestBody);
            }
            if (!hasHeader(headers, 'Content-Length')) {
                headers['Content-Length'] = Buffer.isBuffer(requestBody)
                    ? requestBody.length
                    : Buffer.byteLength(requestBody);
            }
        }
        requestOptions.headers = headers;

        let req = http.request(url, requestOptions, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const status = res.statusCode ?? 0;
                resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    text: async () => data,
                    json: async () => {
                        try {
                            return JSON.parse(data);
                        } catch (e) {
                            const snippet = data.length > 0 ? redactSensitive(data.slice(0, 300)) : '<empty>';
                            throw new Error(`Failed to parse JSON response: ${e.message}. Raw response snippet: ${snippet}`);
                        }
                    }
                });
            });
        });
        req.on('error', (e) => {
            error(`\tError: ${redactSensitive(e?.message ?? e)}`);
            reject(e);
        });
        if (requestBody !== undefined && requestBody !== null) {
            req.write(requestBody);
        }
        req.end();
    });
}

function normalizeWorkspace(workspace) {
    if (!workspace || typeof workspace !== 'object') {
        return null;
    }
    if (typeof workspace.path !== 'string' || workspace.path.trim() === '') {
        return null;
    }
    return { path: workspace.path };
}

export function normalizeWorkspaces(payload) {
    const data = payload?.data;
    let workspaces = [];

    if (Array.isArray(data)) {
        workspaces = data;
    } else if (Array.isArray(data?.workspaces)) {
        workspaces = data.workspaces;
    } else if (data?.workspace && typeof data.workspace === 'object') {
        workspaces = [data.workspace];
    }

    return workspaces.map(normalizeWorkspace).filter(Boolean);
}

function getTokenFilePaths() {
    const paths = [];
    const configuredPath = process.env?.[TOKEN_FILE_ENV_NAME]?.trim();
    if (configuredPath) {
        paths.push(path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath));
    }
    paths.push(path.resolve(process.cwd(), DEFAULT_TOKEN_FILE));
    return [...new Set(paths)];
}

function parseTokenLine(line) {
    let token = line.trim();
    if (!token || token.startsWith('#')) {
        return null;
    }

    const authorizationMatch = token.match(/^Authorization\s*:\s*(.+)$/i);
    if (authorizationMatch) {
        return authorizationMatch[1].trim();
    }

    const envMatch = token.match(/^(SIYUAN_API_TOKEN|SIYUAN_TOKEN|SIYUAN_AUTH_TOKEN)\s*=\s*(.+)$/i);
    if (envMatch) {
        token = envMatch[2].trim();
        if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
            token = token.slice(1, -1).trim();
        }
        return token || null;
    }

    return token;
}

function parseTokenFileContent(content) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const token = parseTokenLine(line);
        if (token) {
            return token;
        }
    }
    return null;
}

function readTokenFromLocalFile({ silent = false } = {}) {
    for (const filePath of getTokenFilePaths()) {
        if (!fs.existsSync(filePath)) {
            continue;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const token = parseTokenFileContent(content);
            if (token) {
                return token;
            }
            if (!silent) {
                error(`\tToken file exists but no token value was found: ${filePath}`);
            }
        } catch (e) {
            if (!silent) {
                error(`\tFailed to read token file: ${filePath}`);
                error(`\t${redactSensitive(e?.message ?? e)}`);
            }
        }
    }
    return null;
}

function getConfiguredToken() {
    for (const name of TOKEN_ENV_NAMES) {
        const token = process.env?.[name]?.trim();
        if (token) {
            return token;
        }
    }
    return readTokenFromLocalFile();
}

function getAuthorizationValue(token) {
    if (/^(token|Bearer)\s/i.test(token)) {
        return token;
    }
    return `token ${token}`;
}

function getWorkspaceHeaders(authorization) {
    const headers = { ...POST_HEADER };
    if (authorization) {
        headers.Authorization = authorization;
    }
    return headers;
}

function hasApiError(payload) {
    const code = payload?.code;
    return code !== undefined && code !== null && String(code) !== '0';
}

function isDataEmpty(payload) {
    if (!payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
        return true;
    }

    const data = payload.data;
    if (data === null || data === undefined) {
        return true;
    }
    if (Array.isArray(data)) {
        return data.length === 0;
    }
    if (typeof data === 'object') {
        if (Array.isArray(data.workspaces)) {
            return data.workspaces.length === 0;
        }
        if (data.workspace && typeof data.workspace === 'object') {
            return Object.keys(data.workspace).length === 0;
        }
        return Object.keys(data).length === 0;
    }
    return false;
}

function isUnauthorized(attempt) {
    if (AUTH_RETRY_STATUS.has(attempt.status)) {
        return true;
    }

    const code = attempt.payload?.code;
    if (AUTH_RETRY_STATUS.has(Number(code))) {
        return true;
    }

    const msg = String(attempt.payload?.msg ?? '');
    return /unauthorized|auth|token|鉴权|授权|认证/i.test(msg);
}

function shouldRetryWithToken(attempt) {
    if (!attempt.status) {
        return false;
    }
    return isUnauthorized(attempt) || hasApiError(attempt.payload) || isDataEmpty(attempt.payload);
}

function summarizeValue(value) {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }
    if (Array.isArray(value)) {
        return `array(length=${value.length})`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).slice(0, 8);
        return `object(keys=${keys.join(',') || 'none'})`;
    }
    return typeof value;
}

function summarizePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return summarizeValue(payload);
    }

    const keys = Object.keys(payload).slice(0, 8);
    return `object(keys=${keys.join(',') || 'none'}, data=${summarizeValue(payload.data)})`;
}

function formatValue(value) {
    if (value === undefined || value === null || value === '') {
        return 'N/A';
    }
    return redactSensitive(value);
}

async function requestWorkspaces(authorization, label) {
    const attempt = {
        label,
        status: null,
        payload: null,
        workspaces: [],
        error: null,
        ok: false
    };

    try {
        const response = await myfetch(SIYUAN_WORKSPACES_API, {
            method: 'POST',
            headers: getWorkspaceHeaders(authorization),
            body: '{}'
        });
        attempt.status = response.status;
        attempt.payload = await response.json();
        attempt.workspaces = normalizeWorkspaces(attempt.payload);
        attempt.ok = response.ok && !hasApiError(attempt.payload) && attempt.workspaces.length > 0;
    } catch (e) {
        attempt.error = e;
    }

    return attempt;
}

function printWorkspacesFailure(attempts) {
    error('\t无法通过思源 Kernel API 获取工作空间。');
    attempts.forEach((attempt) => {
        error(`\t${attempt.label}: HTTP status=${formatValue(attempt.status)}, SiYuan API code=${formatValue(attempt.payload?.code)}, msg=${formatValue(attempt.payload?.msg)}`);
        error(`\t${attempt.label}: data 是否为空=${isDataEmpty(attempt.payload) ? '是' : '否'}, 标准化 workspace 数量=${attempt.workspaces.length}, 返回结构=${summarizePayload(attempt.payload)}`);
        if (attempt.error) {
            error(`\t${attempt.label}: ${redactSensitive(attempt.error?.message ?? attempt.error)}`);
        }
    });
    error('\t如果思源开启了 API 授权，请设置 SIYUAN_API_TOKEN 或创建 .siyuan-api-token.local；如果不想使用 API，请设置 SIYUAN_PLUGIN_DIR 作为兜底。');
}

/**
 * Fetch SiYuan workspaces from port 6806
 * @returns {Promise<{path: string}[] | null>}
 */
export async function getSiYuanDir() {
    const attempts = [];
    const firstAttempt = await requestWorkspaces(null, 'without Authorization');
    attempts.push(firstAttempt);

    if (firstAttempt.ok) {
        return firstAttempt.workspaces;
    }

    const token = getConfiguredToken();
    if (token && shouldRetryWithToken(firstAttempt)) {
        log('\tRetry SiYuan Kernel API with configured Authorization token...');
        const secondAttempt = await requestWorkspaces(getAuthorizationValue(token), 'with Authorization');
        attempts.push(secondAttempt);
        if (secondAttempt.ok) {
            return secondAttempt.workspaces;
        }
    }

    printWorkspacesFailure(attempts);
    return null;
}

/**
 * Choose target workspace
 * @param {{path: string}[]} workspaces
 * @returns {string} The path of the selected workspace
 */
export async function chooseTarget(workspaces) {
    let count = workspaces.length;
    log(`>>> Got ${count} SiYuan ${count > 1 ? 'workspaces' : 'workspace'}`);
    workspaces.forEach((workspace, i) => {
        log(`\t[${i}] ${workspace.path}`);
    });

    if (count === 1) {
        return `${workspaces[0].path}/data/plugins`;
    } else {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        let index = await new Promise((resolve) => {
            rl.question(`\tPlease select a workspace[0-${count - 1}]: `, (answer) => {
                resolve(answer);
            });
        });
        rl.close();
        return `${workspaces[index].path}/data/plugins`;
    }
}

/**
 * Check if two paths are the same
 * @param {string} path1
 * @param {string} path2
 * @returns {boolean}
 */
export function cmpPath(path1, path2) {
    path1 = path1.replace(/\\/g, '/');
    path2 = path2.replace(/\\/g, '/');
    if (path1[path1.length - 1] !== '/') {
        path1 += '/';
    }
    if (path2[path2.length - 1] !== '/') {
        path2 += '/';
    }
    return path1 === path2;
}

export function getThisPluginName() {
    if (!fs.existsSync('./plugin.json')) {
        process.chdir('../');
        if (!fs.existsSync('./plugin.json')) {
            error('Failed! plugin.json not found');
            return null;
        }
    }

    const plugin = JSON.parse(fs.readFileSync('./plugin.json', 'utf8'));
    const name = plugin?.name;
    if (!name) {
        error('Failed! Please set plugin name in plugin.json');
        return null;
    }

    return name;
}

export function copyDirectory(srcDir, dstDir) {
    if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir);
        log(`Created directory ${dstDir}`);
    }

    fs.readdirSync(srcDir, { withFileTypes: true }).forEach((file) => {
        const src = path.join(srcDir, file.name);
        const dst = path.join(dstDir, file.name);

        if (file.isDirectory()) {
            copyDirectory(src, dst);
        } else {
            fs.copyFileSync(src, dst);
            log(`Copied file: ${src} --> ${dst}`);
        }
    });
    log(`All files copied!`);
}


export function makeSymbolicLink(srcPath, targetPath) {
    if (!fs.existsSync(targetPath)) {
        // fs.symlinkSync(srcPath, targetPath, 'junction');
        //Go 1.23 no longer supports junctions as symlinks
        //Please refer to https://github.com/siyuan-note/siyuan/issues/12399
        fs.symlinkSync(srcPath, targetPath, 'dir');
        log(`Done! Created symlink ${targetPath}`);
        return;
    }

    //Check the existed target path
    let isSymbol = fs.lstatSync(targetPath).isSymbolicLink();
    if (!isSymbol) {
        error(`Failed! ${targetPath} already exists and is not a symbolic link`);
        return;
    }
    let existedPath = fs.readlinkSync(targetPath);
    if (cmpPath(existedPath, srcPath)) {
        log(`Good! ${targetPath} is already linked to ${srcPath}`);
    } else {
        error(`Error! Already exists symbolic link ${targetPath}\nBut it links to ${existedPath}`);
    }
}
