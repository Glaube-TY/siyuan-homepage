import { toWorkspaceImageUrl } from "@/homepage/utils/workspaceImage";
import { canUseElectronLocalFileSystem } from "@/components/tools/runtimeEnv";

export type PicSourceMode = "localFolder" | "workspaceAssets";
export interface PicCaroImage { name: string; path: string }
export const MAX_PIC_ASSETS = 100;

export function readPicCaroSource(data: Record<string, unknown>) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("图片轮播配置无法读取，未覆盖原配置");
    const mode = data.PicSourceMode === undefined ? "localFolder" : data.PicSourceMode;
    if (mode !== "localFolder" && mode !== "workspaceAssets") throw new Error("图片来源配置损坏，未覆盖原配置");
    let paths: string[] = [];
    if ("PicAssetPaths" in data) {
        if (!Array.isArray(data.PicAssetPaths) || data.PicAssetPaths.length > MAX_PIC_ASSETS) {
            throw new Error("资源图片列表配置损坏或超过 100 张，未覆盖原配置");
        }
        // Store raw assets paths so literal percent sequences in filenames round-trip unchanged.
        paths = data.PicAssetPaths.map((path) => decodeURIComponent(toWorkspaceImageUrl(path).slice(1)));
        if (new Set(paths).size !== paths.length) throw new Error("资源图片列表包含重复项，未覆盖原配置");
    } else if (mode === "workspaceAssets") {
        throw new Error("资源图片列表缺失，未覆盖原配置");
    }
    return { mode: mode as PicSourceMode, paths };
}

export function appendPicAsset(paths: string[], pickedUrl: string): string[] {
    const rawPath = decodeURIComponent(pickedUrl.replace(/^\//, ""));
    const normalized = readPicCaroSource({ PicAssetPaths: [rawPath] }).paths[0];
    if (paths.includes(normalized)) return paths;
    if (paths.length >= MAX_PIC_ASSETS) throw new Error("最多添加 100 张资源图片");
    return [...paths, normalized];
}

export function loadPicCaroImages(data: Record<string, unknown>): { mode: PicSourceMode; unsupported: boolean; images: PicCaroImage[] } {
    const { mode, paths } = readPicCaroSource(data);
    if (mode === "workspaceAssets") return { mode, unsupported: false, images: paths.map((path) => ({
        name: path.split("/").pop()!, path: toWorkspaceImageUrl(path),
    })) };
    if (!canUseElectronLocalFileSystem()) return { mode, unsupported: true, images: [] };
    if (!data.PicFolderPath) return { mode, unsupported: false, images: [] };
    const fs = window.require("fs"), pathLib = window.require("path");
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff", ".tif",
        ".raw", ".cr2", ".nef", ".arw", ".heic", ".heif", ".avif", ".jxl", ".psd", ".ai", ".eps"];
    const images = fs.readdirSync(data.PicFolderPath).filter((file: string) => imageExtensions.includes(pathLib.extname(file).toLowerCase()))
        .map((file: string) => ({ name: file, path: `file://${pathLib.join(data.PicFolderPath, file)}` }));
    return { mode, unsupported: false, images };
}

export function picCaroPlaybackImages(images: PicCaroImage[], random: boolean): PicCaroImage[] {
    const copy = [...images];
    if (random) for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
