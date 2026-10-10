import { openAssetPicker } from "siyuan";

export const WORKSPACE_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"] as const;

/** Keep workspace resources on the current Host, independent of local filesystem paths. */
export function toWorkspaceImageUrl(input: string): string {
    if (typeof input !== "string" || !input.trim()) throw new Error("图片资源路径为空");
    let path = input.trim();
    if (/[\\\p{Cc}]/u.test(path)) throw new Error("图片资源路径包含非法分隔符");
    const absolute = /^https?:\/\/[^/]+(\/.*)$/i.exec(path);
    const isUrlPath = Boolean(absolute) || path.startsWith("/");
    if (absolute) {
        const url = new URL(path);
        if (typeof location === "undefined" || url.origin !== location.origin || url.username || url.password || url.search || url.hash) {
            throw new Error("图片资源必须属于当前思源工作空间");
        }
        path = absolute[1];
    }
    if (!/^\/?assets\//.test(path)) throw new Error("图片资源必须位于 assets 目录");
    const segments = path.replace(/^\//, "").split("/").map((segment) => {
        let decoded = segment;
        // The picker returns raw filenames; only URL input carries percent encoding.
        if (isUrlPath) {
            try { decoded = decodeURIComponent(segment); } catch { throw new Error("图片资源路径编码无效"); }
        }
        if (!decoded || decoded === "." || decoded === ".." || /[/\\\p{Cc}]/u.test(decoded) || (isUrlPath && /%[0-9a-f]{2}/i.test(decoded))) {
            throw new Error("图片资源路径不合法");
        }
        return decoded;
    });
    const extension = /\.([^.]+)$/.exec(segments[segments.length - 1])?.[1].toLowerCase();
    if (!extension || !(WORKSPACE_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) throw new Error("请选择支持的图片资源");
    return "/" + segments.map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
}

export async function pickWorkspaceImage(): Promise<string | null> {
    if (typeof openAssetPicker !== "function") throw new Error("资源选择器需要思源 3.8.6 或更高版本");
    const result = await openAssetPicker({ exts: [...WORKSPACE_IMAGE_EXTENSIONS] });
    return result === null ? null : toWorkspaceImageUrl(result?.path);
}
