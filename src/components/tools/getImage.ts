import { getImageAsBase64 } from "@/api";
import { isElectronRuntime } from "./runtimeEnv";

const imageCache = new Map<string, string>();

function isInlineResource(url: string): boolean {
    return url.startsWith("data:") || url.startsWith("blob:");
}

function isRemoteUrl(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://");
}

function isLocalPath(url: string): boolean {
    if (url.startsWith("/plugins/")) return true;
    if (url.startsWith("/assets/") || url.startsWith("assets/")) return true;
    if (url.startsWith("./") || url.startsWith("../")) return true;
    if (url.startsWith("/")) return true;
    return false;
}

export async function getImage(url: string): Promise<string> {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return "";

    const cached = imageCache.get(normalizedUrl);
    if (cached !== undefined) return cached;

    if (isInlineResource(normalizedUrl)) {
        return normalizedUrl;
    }

    let remoteUrl = normalizedUrl;
    if (remoteUrl.startsWith("//") && typeof location !== "undefined") {
        remoteUrl = `${location.protocol}${remoteUrl}`;
    }

    if (isRemoteUrl(remoteUrl)) {
        if (isElectronRuntime()) {
            imageCache.set(normalizedUrl, remoteUrl);
            return remoteUrl;
        }

        try {
            const result = await getImageAsBase64(remoteUrl, 10000);
            if (result) {
                imageCache.set(normalizedUrl, result);
                return result;
            }
            console.warn("getImage: proxy returned empty for", remoteUrl);
            return remoteUrl;
        } catch (error) {
            console.warn("getImage: proxy failed for", remoteUrl, error);
            return remoteUrl;
        }
    }

    if (isLocalPath(normalizedUrl)) {
        return normalizedUrl;
    }

    return normalizedUrl;
}

export function clearImageCache(): void {
    imageCache.clear();
}
