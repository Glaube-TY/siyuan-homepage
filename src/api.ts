/**
 * Copyright (c) 2023 frostime. All rights reserved.
 * https://github.com/frostime/sy-plugin-template-vite
 * 
 * See API Document in [API.md](https://github.com/siyuan-note/siyuan/blob/master/API.md)
 * API 文档见 [API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)
 * 
 * 【约定】
 * - 本文件是仓库中唯一允许直接调用 kernel API (/api/...) 的入口
 * - 后续新增思源 API 调用，优先在本文件补充 wrapper，组件层不要再直接 fetchSyncPost("/api/...")
 * - 所有 wrapper 统一返回口径，组件层不再处理 res.data / res.code 等原始响应结构
 * - 参考 router.go: https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go
 */

import { fetchPost, fetchSyncPost, IWebSocketData } from "siyuan";


export async function request(url: string, data: any) {
    let response: IWebSocketData = await fetchSyncPost(url, data);
    let res = response.code === 0 ? response.data : null;
    return res;
}

export async function debugAttributeViewRequest(url: string, payload: any, label: string): Promise<IWebSocketData> {
    console.groupCollapsed(`[AV debug] ${label}`);
    console.log("url", url);
    console.log("payload", JSON.parse(JSON.stringify(payload)));
    const response = await requestRaw(url, payload);
    console.log("response", response);
    console.groupEnd();
    return response;
}

export async function requestRaw(url: string, data: any): Promise<IWebSocketData> {
    return await fetchSyncPost(url, data);
}

/**
 * Checked request wrapper for Notebrain Agent API calls.
 * Throws Error when response.code !== 0, so callers cannot mistake API failures for success.
 * Returns response.data when code === 0 (data may be null, which is a valid success result).
 */
export async function requestChecked(url: string, data: any, label?: string): Promise<any> {
    const response: IWebSocketData = await fetchSyncPost(url, data);
    if (response.code !== 0) {
        const prefix = label ? `[${label}] ` : "";
        throw new Error(`${prefix}思源 API 调用失败：code=${response.code}，msg=${response.msg ?? "(无)"}`);
    }
    return response.data;
}

export interface SiyuanCloudIdentity {
    userId: string;
    userName: string;
    source: "getCloudUser" | "window.siyuan.user" | "none";
}

function normalizeIdentityValue(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}

function readIdentityFromObject(value: unknown): Pick<SiyuanCloudIdentity, "userId" | "userName"> {
    if (!value || typeof value !== "object") {
        return { userId: "", userName: "" };
    }

    const data = value as Record<string, any>;
    return {
        userId: normalizeIdentityValue(data.userId ?? data.id),
        userName: normalizeIdentityValue(data.userName ?? data.name),
    };
}

function readCloudIdentityFromResponse(data: unknown): Pick<SiyuanCloudIdentity, "userId" | "userName"> {
    const candidates = [
        data,
        (data as any)?.user,
        (data as any)?.cloudUser,
        (data as any)?.account,
        (data as any)?.data,
        (data as any)?.data?.user,
        (data as any)?.data?.cloudUser,
    ];

    for (const candidate of candidates) {
        const identity = readIdentityFromObject(candidate);
        if (identity.userId) {
            return identity;
        }
    }

    return { userId: "", userName: "" };
}

function readWindowSiyuanIdentity(): Pick<SiyuanCloudIdentity, "userId" | "userName"> {
    const user = (window as any)?.siyuan?.user;
    return readIdentityFromObject(user);
}

export async function getSiyuanCloudIdentity(): Promise<SiyuanCloudIdentity> {
    try {
        const response = await requestRaw("/api/setting/getCloudUser", {});
        if (response?.code === 0) {
            const identity = readCloudIdentityFromResponse(response.data);
            if (identity.userId) {
                return {
                    ...identity,
                    source: "getCloudUser",
                };
            }
        }
    } catch (error) {
        console.warn("[Homepage] getCloudUser failed, fallback to window.siyuan.user:", error);
    }

    const fallbackIdentity = readWindowSiyuanIdentity();
    if (fallbackIdentity.userId) {
        return {
            ...fallbackIdentity,
            source: "window.siyuan.user",
        };
    }

    return {
        userId: "",
        userName: "",
        source: "none",
    };
}


// **************************************** Noteboook ****************************************


export async function lsNotebooks(): Promise<IReslsNotebooks> {
    let url = '/api/notebook/lsNotebooks';
    return request(url, {});
}


export async function openNotebook(notebook: NotebookId) {
    let url = '/api/notebook/openNotebook';
    return request(url, { notebook: notebook });
}


export async function closeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/closeNotebook';
    return request(url, { notebook: notebook });
}


export async function renameNotebook(notebook: NotebookId, name: string) {
    let url = '/api/notebook/renameNotebook';
    return request(url, { notebook: notebook, name: name });
}


export async function createNotebook(name: string): Promise<Notebook> {
    let url = '/api/notebook/createNotebook';
    return request(url, { name: name });
}


export async function removeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/removeNotebook';
    return request(url, { notebook: notebook });
}


export async function getNotebookConf(notebook: NotebookId): Promise<IResGetNotebookConf> {
    let data = { notebook: notebook };
    let url = '/api/notebook/getNotebookConf';
    return request(url, data);
}


export async function setNotebookConf(notebook: NotebookId, conf: NotebookConf): Promise<NotebookConf> {
    let data = { notebook: notebook, conf: conf };
    let url = '/api/notebook/setNotebookConf';
    return request(url, data);
}


// **************************************** File Tree ****************************************
export async function createDocWithMd(notebook: NotebookId, path: string, markdown: string): Promise<DocumentId> {
    let data = {
        notebook: notebook,
        path: path,
        markdown: markdown,
    };
    let url = '/api/filetree/createDocWithMd';
    return request(url, data);
}

export async function createDailyNote(notebook: string, app: string): Promise<any> {
    return request("/api/filetree/createDailyNote", { notebook, app });
}


export async function renameDoc(notebook: NotebookId, path: string, title: string): Promise<null> {
    let data = {
        notebook: notebook,
        path: path,
        title: title
    };
    let url = '/api/filetree/renameDoc';
    const response = await requestRaw(url, data);
    if (response.code !== 0) {
        throw new Error(response.msg || 'renameDoc failed');
    }
    return null;
}

export async function renameDocByID(id: DocumentId, title: string): Promise<null> {
    let data = {
        id: id,
        title: title
    };
    let url = '/api/filetree/renameDocByID';
    const response = await requestRaw(url, data);
    if (response.code !== 0) {
        throw new Error(response.msg || 'renameDocByID failed');
    }
    return null;
}


export async function removeDoc(notebook: NotebookId, path: string): Promise<null> {
    let data = {
        notebook: notebook,
        path: path,
    };
    let url = '/api/filetree/removeDoc';
    const response = await requestRaw(url, data);
    if (response.code !== 0) {
        throw new Error(response.msg || 'removeDoc failed');
    }
    return null;
}

export async function removeDocByID(id: DocumentId): Promise<null> {
    let data = {
        id: id,
    };
    let url = '/api/filetree/removeDocByID';
    const response = await requestRaw(url, data);
    if (response.code !== 0) {
        throw new Error(response.msg || 'removeDocByID failed');
    }
    return null;
}


export async function moveDocs(fromPaths: string[], toNotebook: NotebookId, toPath: string) {
    let data = {
        fromPaths: fromPaths,
        toNotebook: toNotebook,
        toPath: toPath
    };
    let url = '/api/filetree/moveDocs';
    return request(url, data);
}


export async function getHPathByPath(notebook: NotebookId, path: string): Promise<string> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getHPathByPath';
    return request(url, data);
}


export async function getHPathByID(id: BlockId): Promise<string> {
    let data = {
        id: id
    };
    let url = '/api/filetree/getHPathByID';
    return request(url, data);
}


export async function getIDsByHPath(notebook: NotebookId, path: string): Promise<BlockId[]> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getIDsByHPath';
    return request(url, data);
}

export async function listDocsByPath(notebook: NotebookId, path: string): Promise<IResListDocsByPath> {
    let data = {
        notebook: notebook,
        path: path,
    };
    let url = '/api/filetree/listDocsByPath';
    return request(url, data);
}

// **************************************** Asset Files ****************************************

export async function upload(assetsDirPath: string, files: any[]): Promise<IResUpload> {
    let form = new FormData();
    form.append('assetsDirPath', assetsDirPath);
    for (let file of files) {
        form.append('file[]', file);
    }
    let url = '/api/asset/upload';
    return request(url, form);
}

// **************************************** Block ****************************************
type DataType = "markdown" | "dom";
export async function insertBlock(
    dataType: DataType, data: string,
    nextID?: BlockId, previousID?: BlockId, parentID?: BlockId
): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        nextID: nextID,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/insertBlock';
    return request(url, payload);
}


export async function prependBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/prependBlock';
    return request(url, payload);
}


export async function appendBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/appendBlock';
    return request(url, payload);
}


export async function updateBlock(dataType: DataType, data: string, id: BlockId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        id: id
    }
    let url = '/api/block/updateBlock';
    return request(url, payload);
}


export async function deleteBlock(id: BlockId): Promise<IResdoOperations[]> {
    let data = {
        id: id
    }
    let url = '/api/block/deleteBlock';
    return request(url, data);
}


export async function moveBlock(id: BlockId, previousID?: PreviousID, parentID?: ParentID): Promise<IResdoOperations[]> {
    let data = {
        id: id,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/moveBlock';
    return request(url, data);
}

/**
 * moveBlock 专用 raw wrapper，返回完整 IWebSocketData。
 * /api/block/moveBlock 成功时 data 可能为 null，
 * 旧 request() 口径会把 code=0+data=null 误判为失败。
 */
export async function moveBlockRaw(id: BlockId, previousID?: PreviousID, parentID?: ParentID): Promise<IWebSocketData> {
    let data = {
        id: id,
        previousID: previousID,
        parentID: parentID
    };
    return requestRaw('/api/block/moveBlock', data);
}


export async function foldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/foldBlock';
    return request(url, data);
}


export async function unfoldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/unfoldBlock';
    return request(url, data);
}


export async function getBlockKramdown(id: BlockId): Promise<IResGetBlockKramdown> {
    let data = {
        id: id
    }
    let url = '/api/block/getBlockKramdown';
    return request(url, data);
}


export async function getChildBlocks(id: BlockId): Promise<IResGetChildBlock[]> {
    let data = {
        id: id
    }
    let url = '/api/block/getChildBlocks';
    return request(url, data);
}

export async function transferBlockRef(fromID: BlockId, toID: BlockId, refIDs: BlockId[]) {
    let data = {
        fromID: fromID,
        toID: toID,
        refIDs: refIDs
    }
    let url = '/api/block/transferBlockRef';
    return request(url, data);
}

// **************************************** Attributes ****************************************
export async function setBlockAttrs(id: BlockId, attrs: { [key: string]: string }) {
    let data = {
        id: id,
        attrs: attrs
    }
    let url = '/api/attr/setBlockAttrs';
    return request(url, data);
}

export async function setBlockAttrsChecked(id: BlockId, attrs: { [key: string]: string }): Promise<void> {
    await requestChecked('/api/attr/setBlockAttrs', { id, attrs }, 'setBlockAttrs');
}


export async function getBlockAttrs(id: BlockId): Promise<{ [key: string]: string }> {
    let data = {
        id: id
    }
    let url = '/api/attr/getBlockAttrs';
    return request(url, data);
}

// **************************************** SQL ****************************************

export async function sql(sql: string): Promise<any[]> {
    let sqldata = {
        stmt: sql,
    };
    let url = '/api/query/sql';
    return request(url, sqldata);
}

export async function getBlockByID(blockId: string): Promise<Block> {
    let sqlScript = `select * from blocks where id ='${blockId}'`;
    let data = await sql(sqlScript);
    return data[0];
}

export async function flushTransaction(): Promise<null> {
    const url = '/api/sqlite/flushTransaction';
    const response = await requestRaw(url, {});
    if (response.code !== 0) {
        throw new Error(response.msg || 'flushTransaction failed');
    }
    return null;
}

// **************************************** Search ****************************************

export interface FullTextSearchBlockResult {
    id: string;
    rootID: string;
    box: string;
    path: string;
    hPath?: string;
    type: string;
    content: string;
    score?: number;
}

export interface FullTextSearchResponse {
    blocks: FullTextSearchBlockResult[];
    matchCount: number;
    docCount: number;
}

export async function fullTextSearchBlock(query: string, page: number = 0): Promise<FullTextSearchResponse | null> {
    const data = {
        query: query,
        page: page,
    };
    const url = '/api/search/fullTextSearchBlock';
    return request(url, data);
}

// **************************************** References ****************************************

export interface GetBacklinkPayload {
    id: string;
    k?: string;
    mk?: string;
    beforeLen?: number;
    containChildren?: boolean;
}

export async function getBacklink(payload: GetBacklinkPayload): Promise<any> {
    return request('/api/ref/getBacklink', payload);
}

// **************************************** Template ****************************************

export async function render(id: DocumentId, path: string): Promise<IResGetTemplates> {
    let data = {
        id: id,
        path: path
    }
    let url = '/api/template/render';
    return request(url, data);
}


export async function renderSprig(template: string): Promise<string> {
    let url = '/api/template/renderSprig';
    return request(url, { template: template });
}

// **************************************** File ****************************************

export async function getFile(path: string): Promise<any> {
    let data = {
        path: path
    }
    let url = '/api/file/getFile';
    return new Promise((resolve, _) => {
        fetchPost(url, data, (content: any) => {
            resolve(content)
        });
    });
}


/**
 * fetchPost will secretly convert data into json, this func merely return Blob
 * @param endpoint 
 * @returns 
 */
export const getFileBlob = async (path: string): Promise<Blob | null> => {
    const endpoint = '/api/file/getFile'
    let response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            path: path
        })
    });
    if (!response.ok) {
        return null;
    }
    let data = await response.blob();
    return data;
}


export async function putFile(path: string, isDir: boolean, file: any) {
    let form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    // Copyright (c) 2023, terwer.
    // https://github.com/terwer/siyuan-plugin-importer/blob/v1.4.1/src/api/kernel-api.ts
    form.append('modTime', Math.floor(Date.now() / 1000).toString());
    form.append('file', file);
    let url = '/api/file/putFile';
    return request(url, form);
}

export async function removeFile(path: string) {
    let data = {
        path: path
    }
    let url = '/api/file/removeFile';
    return request(url, data);
}



export async function readDir(path: string): Promise<IResReadDir> {
    let data = {
        path: path
    }
    let url = '/api/file/readDir';
    return request(url, data);
}


// **************************************** Export ****************************************

export async function exportMdContent(id: DocumentId): Promise<IResExportMdContent> {
    let data = {
        id: id
    }
    let url = '/api/export/exportMdContent';
    return request(url, data);
}

export async function exportResources(paths: string[], name: string): Promise<IResExportResources> {
    let data = {
        paths: paths,
        name: name
    }
    let url = '/api/export/exportResources';
    return request(url, data);
}

// **************************************** Convert ****************************************

export type PandocArgs = string;
export async function pandoc(args: PandocArgs[]) {
    let data = {
        args: args
    }
    let url = '/api/convert/pandoc';
    return request(url, data);
}

// **************************************** Notification ****************************************

// /api/notification/pushMsg
// {
//     "msg": "test",
//     "timeout": 7000
//   }
export async function pushMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushMsg";
    return request(url, payload);
}

export async function pushErrMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushErrMsg";
    return request(url, payload);
}

// **************************************** Network ****************************************
export async function forwardProxy(
    url: string, method: string = 'GET', payload: any = {},
    headers: any[] = [], timeout: number = 7000, contentType: string = "text/html",
    payloadEncoding?: string, responseEncoding?: string
): Promise<IResForwardProxy> {
    let data: any = {
        url: url,
        method: method,
        timeout: timeout,
        contentType: contentType,
        headers: headers,
        payload: payload
    };
    if (payloadEncoding) {
        data.payloadEncoding = payloadEncoding;
    }
    if (responseEncoding) {
        data.responseEncoding = responseEncoding;
    }
    let url1 = '/api/network/forwardProxy';
    return request(url1, data);
}

// endpoint: /api/network/forwardProxy (图片专用封装)
// 返回口径: 直接返回 data:image/...;base64,... 字符串
export async function getImageAsBase64(url: string, timeout: number = 10000): Promise<string | null> {
    try {
        let referer = "";
        try {
            const parsed = new URL(url);
            referer = parsed.origin + "/";
        } catch {
            // URL 解析失败，不中断流程
        }

        const headersObj: { [key: string]: string } = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        };
        if (referer) {
            headersObj['Referer'] = referer;
        }

        const res = await forwardProxy(
            url,
            'GET',
            {},
            [headersObj],
            timeout,
            'application/octet-stream',
            'text',
            'base64'
        );

        if (!res || !res.body) {
            console.warn('getImageAsBase64: 响应为空或 body 为空', url);
            return null;
        }

        if (typeof res.status === 'number' && (res.status < 200 || res.status >= 300)) {
            console.warn('getImageAsBase64: 非 2xx 状态码', res.status, url);
            return null;
        }

        // 已经是 data URL，直接返回
        if (res.body.startsWith('data:image/')) {
            return res.body;
        }

        // 检查编码，如果不是 base64 则拒绝
        if (res.bodyEncoding && res.bodyEncoding !== 'base64' && res.bodyEncoding !== 'base64-std') {
            console.warn('getImageAsBase64: 非 base64 编码', res.bodyEncoding, url);
            return null;
        }

        // 提取 content-type
        let contentType = 'image/png';
        if (res.contentType) {
            contentType = res.contentType.split(';')[0].trim();
        } else if (res.headers) {
            const ct = res.headers['content-type'] || res.headers['Content-Type'] || '';
            if (ct) {
                contentType = ct.split(';')[0].trim();
            }
        }

        // 如果不是 image/* 类型，fallback 到 image/png
        if (!contentType.startsWith('image/')) {
            if (contentType === 'application/octet-stream') {
                contentType = 'image/png';
            } else {
                console.warn('getImageAsBase64: 非图片 content-type', contentType, url);
                return null;
            }
        }

        // 清理空白字符
        const cleanBody = res.body.replace(/\s/g, '');

        return `data:${contentType};base64,${cleanBody}`;
    } catch (error) {
        console.warn('getImageAsBase64: 异常', error);
        return null;
    }
}


// **************************************** System ****************************************

export async function bootProgress(): Promise<IResBootProgress> {
    return request('/api/system/bootProgress', {});
}


export async function version(): Promise<string> {
    return request('/api/system/version', {});
}


export async function currentTime(): Promise<number> {
    return request('/api/system/currentTime', {});
}


// **************************************** Tag ****************************************
// endpoint: /api/tag/getTag
// 返回口径: 直接返回 Tag[] 数组，无需再取 res.data

export interface Tag {
    name?: string;
    label: string;
    children?: Tag[];
    type?: string;
    depth?: number;
    count: number;
}

export interface GetTagPayload {
    sort?: number;
    ignoreMaxListHint?: boolean;
    app?: string;
}

export interface SearchTagResponse {
    k: string;
    tags: string[];
}

export async function getTag(
    sortOrPayload: number | GetTagPayload = {},
    ignoreMaxListHint: boolean = true,
    app?: string,
): Promise<Tag[]> {
    const data: GetTagPayload = typeof sortOrPayload === "number"
        ? {
            sort: sortOrPayload,
            ignoreMaxListHint,
            ...(app ? { app } : {}),
        }
        : sortOrPayload;
    const res = await request('/api/tag/getTag', data);
    return Array.isArray(res) ? res : [];
}

export async function searchTag(k: string = ""): Promise<SearchTagResponse> {
    const res = await request('/api/search/searchTag', { k });
    return {
        k: typeof res?.k === "string" ? res.k : k,
        tags: Array.isArray(res?.tags) ? res.tags.filter((item: unknown): item is string => typeof item === "string") : [],
    };
}


// **************************************** Attribute View (Database) ****************************************
// endpoint: /api/av/getAttributeViewKeysByAvID, /api/av/getAttributeView
// 返回口径: 
//   - getAttributeViewKeysByAvID: 直接返回原始数据（各调用方需求不一，暂不统一）
//   - getAttributeView: 返回 { id, name, keyValues }，内部处理 res.av / res.data.av 嵌套差异

export interface AttributeViewKeyValue {
    key: {
        id: string;
        name: string;
        type: string;
    };
    values: any[];
}

export interface AttributeView {
    id: string;
    name: string;
    keyValues: AttributeViewKeyValue[];
    views?: any[];
    raw?: any;
}

export async function getAttributeViewKeysByAvID(avID: string): Promise<any> {
    const res = await request('/api/av/getAttributeViewKeysByAvID', { avID });
    return res || {};
}

export async function searchAttributeView(keyword: string = "", excludes: string[] = []): Promise<any> {
    const res = await request('/api/av/searchAttributeView', { keyword, excludes });
    return res || { results: [] };
}

export interface RenderAttributeViewPayload {
    id: string;
    blockID?: string;
    viewID?: string;
    page?: number;
    pageSize?: number;
    query?: string;
    groupPaging?: Record<string, any>;
    createIfNotExist?: boolean;
}

export async function renderAttributeView(payload: RenderAttributeViewPayload): Promise<any> {
    const res = await request('/api/av/renderAttributeView', payload);
    return res || null;
}

export async function getAttributeView(id: string): Promise<AttributeView | null> {
    const res = await request('/api/av/getAttributeView', { id });
    if (!res) return null;

    // 处理不同可能的响应结构：res.av / res.data.av / res
    const av = res.av || res.data?.av || res;
    if (!av) return null;

    return {
        id: av.id || id,
        name: av.name || '',
        keyValues: av.keyValues || [],
        views: av.views || [],
        raw: av,
    };
}

export async function appendAttributeViewDetachedBlocksWithValues(
    avID: string,
    blocksValues: any[][]
): Promise<any> {
    return request('/api/av/appendAttributeViewDetachedBlocksWithValues', {
        avID,
        blocksValues,
    });
}

export async function addAttributeViewKey(
    avID: string,
    keyID: string,
    keyName: string,
    keyType: string = "text",
    keyIcon: string = "",
    previousKeyID: string = ""
): Promise<any> {
    return request('/api/av/addAttributeViewKey', {
        avID,
        keyID,
        keyName,
        keyType,
        keyIcon,
        previousKeyID,
    });
}

export async function removeAttributeViewKey(
    avID: string,
    keyID: string,
    removeRelationDest: boolean = false
): Promise<any> {
    return request('/api/av/removeAttributeViewKey', {
        avID,
        keyID,
        removeRelationDest,
    });
}

export async function setAttributeViewBlockAttr(
    avID: string,
    keyID: string,
    itemID: string,
    value: any
): Promise<any> {
    return request('/api/av/setAttributeViewBlockAttr', {
        avID,
        keyID,
        itemID,
        value,
    });
}

export async function getAttributeViewItemIDsByBoundIDs(
    avID: string,
    blockIDs: string[]
): Promise<any> {
    return request('/api/av/getAttributeViewItemIDsByBoundIDs', {
        avID,
        blockIDs,
    });
}

export interface AddAttributeViewBlocksPayload {
    avID: string;
    /** Existing SiYuan block ids to attach as database rows. */
    blockIDs: string[];
    /** Optional database block id/context required by some SiYuan versions. */
    blockID?: string;
    viewID?: string;
    groupID?: string;
    previousID?: string;
    ignoreDefaultFill?: boolean;
}

// **************************************** Attribute View (Database) - Checked Wrappers ****************************************
// 与上面 appendAttributeViewDetachedBlocksWithValues / setAttributeViewBlockAttr / addAttributeViewKey 对应
// 区别：使用 requestRaw 保留完整 IWebSocketData 响应，code !== 0 时直接抛错

export async function appendAttributeViewDetachedBlocksWithValuesChecked(
    avID: string,
    blocksValues: any[][]
): Promise<void> {
    await requestChecked('/api/av/appendAttributeViewDetachedBlocksWithValues', {
        avID,
        blocksValues,
    }, 'appendAttributeViewDetachedBlocksWithValues');
}

export async function setAttributeViewBlockAttrChecked(
    avID: string,
    keyID: string,
    itemID: string,
    value: any
): Promise<void> {
    await requestChecked('/api/av/setAttributeViewBlockAttr', {
        avID,
        keyID,
        itemID,
        value,
    }, 'setAttributeViewBlockAttr');
}

export async function setAttributeViewBlockAttrWithCellChecked(params: {
    avID: string;
    keyID: string;
    /** 真实条目 ID（itemID）。rowID 作为旧别名兼容，内部转换为 itemID。 */
    itemID?: string;
    rowID?: string;
    cellID?: string;
    value: any;
}): Promise<void> {
    // itemID 优先；若没有 itemID 但传了 rowID，则用 rowID 作为 itemID
    const resolvedItemId = params.itemID?.trim() || params.rowID?.trim();
    if (!resolvedItemId) {
        throw new Error('setAttributeViewBlockAttrWithCellChecked: itemID 和 rowID 均为空，必须提供真实条目 ID。');
    }
    const payload: any = {
        avID: params.avID,
        keyID: params.keyID,
        itemID: resolvedItemId,
        value: params.value,
    };
    if (params.cellID) {
        payload.cellID = params.cellID;
    }
    await requestChecked('/api/av/setAttributeViewBlockAttr', payload, 'setAttributeViewBlockAttrWithCell');
}

export async function addAttributeViewKeyChecked(
    avID: string,
    keyID: string,
    keyName: string,
    keyType: string = "text",
    keyIcon: string = "",
    previousKeyID: string = ""
): Promise<void> {
    await requestChecked('/api/av/addAttributeViewKey', {
        avID,
        keyID,
        keyName,
        keyType,
        keyIcon,
        previousKeyID,
    }, 'addAttributeViewKey');
}

export async function removeAttributeViewKeyChecked(
    avID: string,
    keyID: string,
    removeRelationDest: boolean = false
): Promise<void> {
    await requestChecked('/api/av/removeAttributeViewKey', {
        avID,
        keyID,
        removeRelationDest,
    }, 'removeAttributeViewKey');
}

export async function addAttributeViewBlocksChecked(params: AddAttributeViewBlocksPayload): Promise<any> {
    const payload: any = {
        avID: params.avID,
        srcs: params.blockIDs.map((id) => ({ id, isDetached: false })),
        ignoreDefaultFill: params.ignoreDefaultFill ?? false,
    };
    if (params.blockID) payload.blockID = params.blockID;
    if (params.viewID) payload.viewID = params.viewID;
    if (params.groupID) payload.groupID = params.groupID;
    if (params.previousID) payload.previousID = params.previousID;

    return requestChecked('/api/av/addAttributeViewBlocks', payload, 'addAttributeViewBlocks');
}

// **************************************** Transactions ****************************************
// endpoint: /api/transactions
// 用于执行原子操作：insertAttrViewBlock、removeAttrViewBlock、addAttrViewCol、removeAttrViewCol 等

export interface TransactionOperation {
    action: string;
    id?: string;
    avID?: string;
    blockID?: string;
    viewID?: string;
    groupID?: string;
    previousID?: string;
    ignoreDefaultFill?: boolean;
    srcs?: Array<{ itemID?: string; id: string; isDetached: boolean }>;
    srcIDs?: string[];
    keyID?: string;
    name?: string;
    type?: string;
    [key: string]: any;
}

export interface TransactionBatch {
    doOperations: TransactionOperation[];
    undoOperations?: TransactionOperation[];
}

export async function performTransactionsChecked(
    transactions: TransactionBatch[],
    options?: { reqId?: string | number; app?: string; session?: string }
): Promise<void> {
    const reqId = typeof options?.reqId === "number"
        ? options.reqId
        : typeof options?.reqId === "string" && !isNaN(Number(options.reqId))
            ? Number(options.reqId)
            : Date.now();
    const payload = {
        transactions,
        reqId,
        app: options?.app ?? "",
        session: options?.session ?? "",
    };
    await requestChecked('/api/transactions', payload, 'transactions');
}

// **************************************** Attribute View ID Mapping ****************************************
// endpoint: /api/av/getAttributeViewItemIDsByBoundIDs, /api/av/getAttributeViewBoundBlockIDsByItemIDs

export async function getAttributeViewBoundBlockIDsByItemIDs(
    avID: string,
    itemIDs: string[]
): Promise<any> {
    return request('/api/av/getAttributeViewBoundBlockIDsByItemIDs', {
        avID,
        itemIDs,
    });
}

export async function getAttributeViewItemIDsByBoundIDsChecked(
    avID: string,
    blockIDs: string[]
): Promise<any> {
    return requestChecked('/api/av/getAttributeViewItemIDsByBoundIDs', {
        avID,
        blockIDs,
    }, 'getAttributeViewItemIDsByBoundIDs');
}

export async function getAttributeViewBoundBlockIDsByItemIDsChecked(
    avID: string,
    itemIDs: string[]
): Promise<any> {
    return requestChecked('/api/av/getAttributeViewBoundBlockIDsByItemIDs', {
        avID,
        itemIDs,
    }, 'getAttributeViewBoundBlockIDsByItemIDs');
}


// **************************************** Tabs ****************************************
// endpoint: /api/tab/getAllTabs
// v3.6.4+ 支持 type 参数，可按类型精确获取 tabs
// 返回口径: 直接返回 tabs 数组，无需再取 res.data

export interface Tab {
    id: string;
    type: string;
    title?: string;
    icon?: string;
    [key: string]: any;
}

/**
 * 获取所有 tabs，支持按类型筛选（v3.6.4+）
 * @param type - 可选，tab 类型（如 "homepage_tab"）
 * @returns Tab[] 数组
 */
export async function getAllTabs(type?: string): Promise<Tab[]> {
    const data: { type?: string } = {};
    if (type) {
        data.type = type;
    }
    const res = await request('/api/tab/getAllTabs', data);
    return res || [];
}


// **************************************** Task List Item Marker ****************************************
// endpoint: /api/block/updateTaskListItemMarker, /api/block/batchUpdateTaskListItemMarker
// v3.6.4+ 新增任务状态更新 API，支持单独或批量更新任务列表项的 marker 状态
// 返回口径: 直接返回操作结果，无需再取 res.data

export type TaskMarker = " " | "X" | "x" | "?" | "!" | "@" | "-" | "";

/**
 * 更新单个任务列表项的 marker 状态（v3.6.4+）
 * @param id - 任务块 ID
 * @param marker - 任务状态标记（如 " " 未完成，"X" 已完成）
 * @returns 操作结果
 */
export async function updateTaskListItemMarker(id: BlockId, marker: TaskMarker): Promise<boolean> {
    const url = '/api/block/updateTaskListItemMarker';
    const data = { id, marker };
    const res = await request(url, data);
    return res?.code === 0 || false;
}

/**
 * 批量更新任务列表项的 marker 状态（v3.6.4+）
 * @param ids - 任务块 ID 数组
 * @param marker - 任务状态标记（如 " " 未完成，"X" 已完成）
 * @returns 操作结果
 */
export async function batchUpdateTaskListItemMarker(ids: BlockId[], marker: TaskMarker): Promise<boolean> {
    const url = '/api/block/batchUpdateTaskListItemMarker';
    const data = { ids, marker };
    const res = await request(url, data);
    return res?.code === 0 || false;
}

// **************************************** Old Wrapper Checked Versions ****************************************
// Checked versions for legacy wrappers that use request() and swallow API failures.
// These are used by impl files to ensure API failures are not mistaken for success.
// Original wrappers are kept unchanged to avoid breaking legacy callers.
// All functions delegate to requestChecked so that code !== 0 throws with "思源 API 调用失败",
// which GenericSiyuanTool recognizes as siyuan_api_failed.

export async function foldBlockChecked(id: BlockId): Promise<void> {
    await requestChecked('/api/block/foldBlock', { id }, 'foldBlock');
}

export async function unfoldBlockChecked(id: BlockId): Promise<void> {
    await requestChecked('/api/block/unfoldBlock', { id }, 'unfoldBlock');
}

export async function updateTaskListItemMarkerChecked(id: BlockId, marker: TaskMarker): Promise<void> {
    await requestChecked('/api/block/updateTaskListItemMarker', { id, marker }, 'updateTaskListItemMarker');
}

export async function batchUpdateTaskListItemMarkerChecked(ids: BlockId[], marker: TaskMarker): Promise<void> {
    await requestChecked('/api/block/batchUpdateTaskListItemMarker', { ids, marker }, 'batchUpdateTaskListItemMarker');
}

export async function getBlockAttrsChecked(id: BlockId): Promise<{ [key: string]: string }> {
    return (await requestChecked('/api/attr/getBlockAttrs', { id }, 'getBlockAttrs')) || {};
}

export async function getBlockKramdownChecked(id: BlockId): Promise<IResGetBlockKramdown> {
    return await requestChecked('/api/block/getBlockKramdown', { id }, 'getBlockKramdown');
}

export async function getChildBlocksChecked(id: BlockId): Promise<IResGetChildBlock[]> {
    return (await requestChecked('/api/block/getChildBlocks', { id }, 'getChildBlocks')) || [];
}

export async function transferBlockRefChecked(fromID: BlockId, toID: BlockId, refIDs: BlockId[]): Promise<void> {
    await requestChecked('/api/block/transferBlockRef', { fromID, toID, refIDs }, 'transferBlockRef');
}

export async function getBacklinkChecked(payload: GetBacklinkPayload): Promise<any> {
    return await requestChecked('/api/ref/getBacklink', payload, 'getBacklink');
}

export async function sqlChecked(stmt: string): Promise<any[]> {
    return (await requestChecked('/api/query/sql', { stmt }, 'sql')) || [];
}

export async function getTagChecked(
    sortOrPayload: number | GetTagPayload = {},
    ignoreMaxListHint: boolean = true,
    app?: string,
): Promise<Tag[]> {
    const data: GetTagPayload = typeof sortOrPayload === "number"
        ? { sort: sortOrPayload, ignoreMaxListHint, ...(app ? { app } : {}) }
        : sortOrPayload;
    return (await requestChecked('/api/tag/getTag', data, 'getTag')) || [];
}

export async function searchTagChecked(k: string = ""): Promise<SearchTagResponse> {
    const res = await requestChecked('/api/search/searchTag', { k }, 'searchTag');
    return {
        k: typeof res?.k === "string" ? res.k : k,
        tags: Array.isArray(res?.tags) ? res.tags.filter((item: unknown): item is string => typeof item === "string") : [],
    };
}

export async function listDocsByPathChecked(notebook: NotebookId, path: string): Promise<IResListDocsByPath> {
    return await requestChecked('/api/filetree/listDocsByPath', { notebook, path }, 'listDocsByPath');
}

export async function moveDocsChecked(fromPaths: string[], toNotebook: NotebookId, toPath: string): Promise<void> {
    await requestChecked('/api/filetree/moveDocs', { fromPaths, toNotebook, toPath }, 'moveDocs');
}

export async function lsNotebooksChecked(): Promise<IReslsNotebooks> {
    return await requestChecked('/api/notebook/lsNotebooks', {}, 'lsNotebooks');
}

export async function openNotebookChecked(notebook: NotebookId): Promise<void> {
    await requestChecked('/api/notebook/openNotebook', { notebook }, 'openNotebook');
}

export async function closeNotebookChecked(notebook: NotebookId): Promise<void> {
    await requestChecked('/api/notebook/closeNotebook', { notebook }, 'closeNotebook');
}

export async function renameNotebookChecked(notebook: NotebookId, name: string): Promise<void> {
    await requestChecked('/api/notebook/renameNotebook', { notebook, name }, 'renameNotebook');
}

export async function createNotebookChecked(name: string): Promise<Notebook> {
    return await requestChecked('/api/notebook/createNotebook', { name }, 'createNotebook');
}

export async function removeNotebookChecked(notebook: NotebookId): Promise<void> {
    await requestChecked('/api/notebook/removeNotebook', { notebook }, 'removeNotebook');
}

export async function getNotebookConfChecked(notebook: NotebookId): Promise<IResGetNotebookConf> {
    return await requestChecked('/api/notebook/getNotebookConf', { notebook }, 'getNotebookConf');
}

export async function setNotebookConfChecked(notebook: NotebookId, conf: NotebookConf): Promise<NotebookConf> {
    return await requestChecked('/api/notebook/setNotebookConf', { notebook, conf }, 'setNotebookConf');
}

export async function getHPathByIDChecked(id: BlockId): Promise<string> {
    return await requestChecked('/api/filetree/getHPathByID', { id }, 'getHPathByID');
}

export async function getHPathByPathChecked(notebook: NotebookId, path: string): Promise<string> {
    return await requestChecked('/api/filetree/getHPathByPath', { notebook, path }, 'getHPathByPath');
}

export async function getIDsByHPathChecked(notebook: NotebookId, path: string): Promise<BlockId[]> {
    return (await requestChecked('/api/filetree/getIDsByHPath', { notebook, path }, 'getIDsByHPath')) || [];
}

export async function getAttributeViewKeysByAvIDChecked(avID: string): Promise<any> {
    return (await requestChecked('/api/av/getAttributeViewKeysByAvID', { avID }, 'getAttributeViewKeysByAvID')) || {};
}

export async function putFileChecked(path: string, isDir: boolean, file: any): Promise<void> {
    const form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    form.append('modTime', Math.floor(Date.now() / 1000).toString());
    form.append('file', file);
    await requestChecked('/api/file/putFile', form, 'putFile');
}

export async function removeFileChecked(path: string): Promise<void> {
    await requestChecked('/api/file/removeFile', { path }, 'removeFile');
}

export async function readDirChecked(path: string): Promise<IResReadDir> {
    return await requestChecked('/api/file/readDir', { path }, 'readDir');
}

export async function copyFileChecked(params: { path: string; targetPath: string }): Promise<void> {
    await requestChecked('/api/file/copyFile', params, 'copyFile');
}

export async function renameFileChecked(path: string, newPath: string): Promise<void> {
    await requestChecked('/api/file/renameFile', { path, newPath }, 'renameFile');
}

export async function getUniqueFilenameChecked(path: string): Promise<string> {
    return await requestChecked('/api/file/getUniqueFilename', { path }, 'getUniqueFilename');
}

/**
 * getFile uses fetchPost (not fetchSyncPost), so it doesn't follow standard code response.
 * We wrap it to give a meaningful error when the response indicates failure.
 */
export async function getFileChecked(path: string): Promise<any> {
    const content = await getFile(path);
    // null/undefined is failure; empty string, Blob, ArrayBuffer, plain text are all valid success
    if (content === null || content === undefined) {
        throw new Error(`getFile 返回 null/undefined，路径: ${path}`);
    }
    // If the response has a code field and it's non-zero, treat as failure
    if (content?.code !== undefined && content.code !== 0) {
        throw new Error(`[getFile] 思源 API 调用失败：code=${content.code}，msg=${content.msg ?? "(无)"}`);
    }
    return content;
}

// **************************************** Notebrain Agent Built-in Siyuan API wrappers ****************************************
// These wrappers are intentionally named and scoped. Do not expose a generic /api/* executor to Agent tools.

export type SiyuanApiPayload = Record<string, any>;

export async function getDocOutline(id: string): Promise<any> {
    return requestChecked('/api/outline/getDocOutline', { id }, 'getDocOutline');
}

export async function searchTemplate(k: string): Promise<any> {
    return requestChecked('/api/search/searchTemplate', { k }, 'searchTemplate');
}

export async function searchWidget(k: string): Promise<any> {
    return requestChecked('/api/search/searchWidget', { k }, 'searchWidget');
}

export async function searchRefBlock(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/search/searchRefBlock', params, 'searchRefBlock');
}

export async function searchEmbedBlock(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/search/searchEmbedBlock', params, 'searchEmbedBlock');
}

export async function getEmbedBlock(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/search/getEmbedBlock', params, 'getEmbedBlock');
}

export async function searchAsset(k: string): Promise<any> {
    return requestChecked('/api/search/searchAsset', { k }, 'searchAsset');
}

export async function fullTextSearchAssetContent(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/search/fullTextSearchAssetContent', params, 'fullTextSearchAssetContent');
}

export async function getAssetContent(path: string): Promise<any> {
    return requestChecked('/api/search/getAssetContent', { path }, 'getAssetContent');
}

export async function listInvalidBlockRefs(): Promise<any> {
    return requestChecked('/api/search/listInvalidBlockRefs', {}, 'listInvalidBlockRefs');
}

export async function getBacklinkDoc(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/ref/getBacklinkDoc', params, 'getBacklinkDoc');
}

export async function getBackmentionDoc(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/ref/getBackmentionDoc', params, 'getBackmentionDoc');
}

export async function refreshBacklink(): Promise<any> {
    return requestChecked('/api/ref/refreshBacklink', {}, 'refreshBacklink');
}

export async function getBlockInfo(id: string): Promise<any> {
    return requestChecked('/api/block/getBlockInfo', { id }, 'getBlockInfo');
}

export async function getBlockDOM(id: string): Promise<any> {
    return requestChecked('/api/block/getBlockDOM', { id }, 'getBlockDOM');
}

export async function getBlockDOMs(ids: string[]): Promise<any> {
    return requestChecked('/api/block/getBlockDOMs', { ids }, 'getBlockDOMs');
}

export async function getBlockDOMWithEmbed(id: string): Promise<any> {
    return requestChecked('/api/block/getBlockDOMWithEmbed', { id }, 'getBlockDOMWithEmbed');
}

export async function getBlockKramdowns(ids: string[]): Promise<any> {
    return requestChecked('/api/block/getBlockKramdowns', { ids }, 'getBlockKramdowns');
}

export async function getTailChildBlocks(id: string): Promise<any> {
    return requestChecked('/api/block/getTailChildBlocks', { id }, 'getTailChildBlocks');
}

export async function getBlockBreadcrumb(id: string): Promise<any> {
    return requestChecked('/api/block/getBlockBreadcrumb', { id }, 'getBlockBreadcrumb');
}

export async function getBlockIndex(id: string): Promise<any> {
    return requestChecked('/api/block/getBlockIndex', { id }, 'getBlockIndex');
}

export async function getBlocksIndexes(ids: string[]): Promise<any> {
    return requestChecked('/api/block/getBlocksIndexes', { ids }, 'getBlocksIndexes');
}

export async function getRefIDs(id: string): Promise<any> {
    return requestChecked('/api/block/getRefIDs', { id }, 'getRefIDs');
}

export async function getBlockDefIDsByRefText(refText: string): Promise<any> {
    return requestChecked('/api/block/getBlockDefIDsByRefText', { refText }, 'getBlockDefIDsByRefText');
}

export async function getRefText(id: string): Promise<any> {
    return requestChecked('/api/block/getRefText', { id }, 'getRefText');
}

export async function getDOMText(id: string): Promise<any> {
    return requestChecked('/api/block/getDOMText', { id }, 'getDOMText');
}

export async function getTreeStat(id: string): Promise<any> {
    return requestChecked('/api/block/getTreeStat', { id }, 'getTreeStat');
}

export async function getBlocksWordCount(ids: string[]): Promise<any> {
    return requestChecked('/api/block/getBlocksWordCount', { ids }, 'getBlocksWordCount');
}

export async function getContentWordCount(content: string): Promise<any> {
    return requestChecked('/api/block/getContentWordCount', { content }, 'getContentWordCount');
}

export async function getRecentUpdatedBlocks(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/block/getRecentUpdatedBlocks', params, 'getRecentUpdatedBlocks');
}

export async function checkBlockExist(id: string): Promise<any> {
    return requestChecked('/api/block/checkBlockExist', { id }, 'checkBlockExist');
}

export async function getBlockSiblingID(id: string): Promise<any> {
    return requestChecked('/api/block/getBlockSiblingID', { id }, 'getBlockSiblingID');
}

export async function getBlockRelevantIDs(id: string): Promise<any> {
    return requestChecked('/api/block/getBlockRelevantIDs', { id }, 'getBlockRelevantIDs');
}

export async function getBlockTreeInfos(ids: string[]): Promise<any> {
    return requestChecked('/api/block/getBlockTreeInfos', { ids }, 'getBlockTreeInfos');
}

export async function checkBlockRef(id: string): Promise<any> {
    return requestChecked('/api/block/checkBlockRef', { id }, 'checkBlockRef');
}

export async function swapBlockRef(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/block/swapBlockRef', params, 'swapBlockRef');
}

export async function batchGetBlockAttrs(ids: string[]): Promise<any> {
    return requestChecked('/api/attr/batchGetBlockAttrs', { ids }, 'batchGetBlockAttrs');
}

export async function batchSetBlockAttrs(items: Array<{ id: string; attrs: Record<string, string> }>): Promise<any> {
    return requestChecked('/api/attr/batchSetBlockAttrs', { items }, 'batchSetBlockAttrs');
}

export async function setBlockReminder(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/block/setBlockReminder', params, 'setBlockReminder');
}

export async function setNotebookIcon(notebook: string, icon: string): Promise<any> {
    return requestChecked('/api/notebook/setNotebookIcon', { notebook, icon }, 'setNotebookIcon');
}

export async function getPathByID(id: string): Promise<any> {
    return requestChecked('/api/filetree/getPathByID', { id }, 'getPathByID');
}

export async function getFullHPathByID(id: string): Promise<any> {
    return requestChecked('/api/filetree/getFullHPathByID', { id }, 'getFullHPathByID');
}

export async function getHPathsByPaths(paths: string[]): Promise<any> {
    return requestChecked('/api/filetree/getHPathsByPaths', { paths }, 'getHPathsByPaths');
}

export async function duplicateDoc(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/filetree/duplicateDoc', params, 'duplicateDoc');
}

export async function listDocTree(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/filetree/listDocTree', params, 'listDocTree');
}

export async function moveDocsByID(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/filetree/moveDocsByID', params, 'moveDocsByID');
}

export async function changeSort(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/filetree/changeSort', params, 'changeSort');
}

export async function doc2Heading(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/filetree/doc2Heading', params, 'doc2Heading');
}

export async function heading2Doc(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/filetree/heading2Doc', params, 'heading2Doc');
}

export async function li2Doc(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/filetree/li2Doc', params, 'li2Doc');
}

export async function renameTag(oldLabel: string, newLabel: string): Promise<any> {
    return requestChecked('/api/tag/renameTag', { oldLabel, newLabel }, 'renameTag');
}

export async function removeTag(label: string): Promise<any> {
    return requestChecked('/api/tag/removeTag', { label }, 'removeTag');
}

export async function getBookmark(): Promise<any> {
    return requestChecked('/api/bookmark/getBookmark', {}, 'getBookmark');
}

export async function renameBookmark(oldLabel: string, newLabel: string): Promise<any> {
    return requestChecked('/api/bookmark/renameBookmark', { oldLabel, newLabel }, 'renameBookmark');
}

export async function removeBookmark(label: string): Promise<any> {
    return requestChecked('/api/bookmark/removeBookmark', { label }, 'removeBookmark');
}

export async function resolveAssetPath(path: string): Promise<any> {
    return requestChecked('/api/asset/resolveAssetPath', { path }, 'resolveAssetPath');
}

export async function getFileAnnotation(path: string): Promise<any> {
    return requestChecked('/api/asset/getFileAnnotation', { path }, 'getFileAnnotation');
}

export async function setFileAnnotation(path: string, annotation: string): Promise<any> {
    return requestChecked('/api/asset/setFileAnnotation', { path, annotation }, 'setFileAnnotation');
}

export async function getUnusedAssets(): Promise<any> {
    return requestChecked('/api/asset/getUnusedAssets', {}, 'getUnusedAssets');
}

export async function getMissingAssets(): Promise<any> {
    return requestChecked('/api/asset/getMissingAssets', {}, 'getMissingAssets');
}

export async function removeUnusedAsset(path: string): Promise<any> {
    return requestChecked('/api/asset/removeUnusedAsset', { path }, 'removeUnusedAsset');
}

export async function getDocImageAssets(id: string): Promise<any> {
    return requestChecked('/api/asset/getDocImageAssets', { id }, 'getDocImageAssets');
}

export async function getDocAssets(id: string): Promise<any> {
    return requestChecked('/api/asset/getDocAssets', { id }, 'getDocAssets');
}

export async function renameAsset(oldPath: string, newName: string): Promise<any> {
    return requestChecked('/api/asset/renameAsset', { oldPath, newName }, 'renameAsset');
}

export async function getImageOCRText(path: string): Promise<any> {
    return requestChecked('/api/asset/getImageOCRText', { path }, 'getImageOCRText');
}

export async function setImageOCRText(path: string, text: string): Promise<any> {
    return requestChecked('/api/asset/setImageOCRText', { path, text }, 'setImageOCRText');
}

export async function ocrAsset(path: string): Promise<any> {
    return requestChecked('/api/asset/ocr', { path }, 'ocrAsset');
}

export async function fullReindexAssetContent(): Promise<any> {
    return requestChecked('/api/asset/fullReindexAssetContent', {}, 'fullReindexAssetContent');
}

export async function statAsset(path: string): Promise<any> {
    return requestChecked('/api/asset/statAsset', { path }, 'statAsset');
}

export async function copyFile(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/file/copyFile', params, 'copyFile');
}

export async function renameFile(path: string, newPath: string): Promise<any> {
    return requestChecked('/api/file/renameFile', { path, newPath }, 'renameFile');
}

export async function getUniqueFilename(path: string): Promise<any> {
    return requestChecked('/api/file/getUniqueFilename', { path }, 'getUniqueFilename');
}

export async function getAttributeViewFilterSort(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/getAttributeViewFilterSort', params, 'getAttributeViewFilterSort');
}

export async function getAttributeViewKeys(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/getAttributeViewKeys', params, 'getAttributeViewKeys');
}

export async function getAttributeViewPrimaryKeyValues(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/getAttributeViewPrimaryKeyValues', params, 'getAttributeViewPrimaryKeyValues');
}

export async function getMirrorDatabaseBlocks(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/getMirrorDatabaseBlocks', params, 'getMirrorDatabaseBlocks');
}

export async function getCurrentAttrViewImages(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/getCurrentAttrViewImages', params, 'getCurrentAttrViewImages');
}

export async function getUnusedAttributeViews(): Promise<any> {
    return requestChecked('/api/av/getUnusedAttributeViews', {}, 'getUnusedAttributeViews');
}

export async function setDatabaseBlockView(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/setDatabaseBlockView', params, 'setDatabaseBlockView');
}

export async function sortAttributeViewKey(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/sortAttributeViewKey', params, 'sortAttributeViewKey');
}

export async function sortAttributeViewViewKey(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/sortAttributeViewViewKey', params, 'sortAttributeViewViewKey');
}

export async function changeAttrViewLayout(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/changeAttrViewLayout', params, 'changeAttrViewLayout');
}

export async function setAttrViewGroup(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/av/setAttrViewGroup', params, 'setAttrViewGroup');
}

export async function createRiffDeck(name: string): Promise<any> {
    return requestChecked('/api/riff/createRiffDeck', { name }, 'createRiffDeck');
}

export async function renameRiffDeck(deckID: string, name: string): Promise<any> {
    return requestChecked('/api/riff/renameRiffDeck', { deckID, name }, 'renameRiffDeck');
}

export async function removeRiffDeck(deckID: string): Promise<any> {
    return requestChecked('/api/riff/removeRiffDeck', { deckID }, 'removeRiffDeck');
}

export async function getRiffDecks(): Promise<any> {
    return requestChecked('/api/riff/getRiffDecks', {}, 'getRiffDecks');
}

export async function addRiffCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/addRiffCards', params, 'addRiffCards');
}

export async function removeRiffCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/removeRiffCards', params, 'removeRiffCards');
}

export async function getRiffDueCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/getRiffDueCards', params, 'getRiffDueCards');
}

export async function getTreeRiffDueCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/getTreeRiffDueCards', params, 'getTreeRiffDueCards');
}

export async function getNotebookRiffDueCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/getNotebookRiffDueCards', params, 'getNotebookRiffDueCards');
}

export async function reviewRiffCard(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/reviewRiffCard', params, 'reviewRiffCard');
}

export async function skipReviewRiffCard(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/skipReviewRiffCard', params, 'skipReviewRiffCard');
}

export async function getRiffCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/getRiffCards', params, 'getRiffCards');
}

export async function getTreeRiffCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/getTreeRiffCards', params, 'getTreeRiffCards');
}

export async function getNotebookRiffCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/getNotebookRiffCards', params, 'getNotebookRiffCards');
}

export async function resetRiffCards(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/resetRiffCards', params, 'resetRiffCards');
}

export async function batchSetRiffCardsDueTime(params: SiyuanApiPayload): Promise<any> {
    return requestChecked('/api/riff/batchSetRiffCardsDueTime', params, 'batchSetRiffCardsDueTime');
}

export async function getRiffCardsByBlockIDs(blockIDs: string[]): Promise<any> {
    return requestChecked('/api/riff/getRiffCardsByBlockIDs', { blockIDs }, 'getRiffCardsByBlockIDs');
}
