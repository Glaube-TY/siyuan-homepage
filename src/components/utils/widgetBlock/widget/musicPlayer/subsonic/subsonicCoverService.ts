import type { SubsonicEndpointManager } from "./subsonicEndpointManager";
import type { SubsonicClient, SubsonicProxy } from "./subsonicClient";
import { SubsonicError, toSubsonicTransportError } from "./subsonicErrors";

interface CachedCover { url: string; touchedAt: number; }

function base64ToObjectUrl(body: string, contentType: string): string {
    const cleanBody = body.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    const binary = atob(cleanBody);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: contentType || "image/jpeg" }));
}

export class SubsonicCoverService {
    private readonly cache = new Map<string, CachedCover>();
    constructor(
        private readonly endpoints: SubsonicEndpointManager,
        private readonly client: SubsonicClient,
        private readonly maxEntries = 100,
        private readonly proxy?: SubsonicProxy,
    ) {}

    async load(coverArtId: string, size: number): Promise<string | undefined> {
        if (!coverArtId) return undefined;
        const key = `${coverArtId}:${size}`;
        const cached = this.cache.get(key);
        if (cached) { cached.touchedAt = Date.now(); return cached.url; }
        try {
            const objectUrl = await this.endpoints.executeRead(async (ctx) => {
                if (ctx.signal?.aborted) throw new SubsonicError("request_aborted", "请求已取消。" );
                const url = this.client.buildUrl(ctx.baseUrl, "getCoverArt", { id: coverArtId, size });
                try {
                    const proxy = this.proxy || (await import("../../../../../../api")).forwardProxyChecked;
                    const response = await proxy(url, "GET", {}, [], 10000, "application/octet-stream", undefined, "base64");
                    if (ctx.signal?.aborted) throw new SubsonicError("request_aborted", "请求已取消。" );
                    if ([502, 503, 504].includes(response.status)) throw new SubsonicError("server_transient", "封面服务暂时不可用。", { httpStatus: response.status });
                    if (response.status < 200 || response.status >= 300 || !response.body) throw new SubsonicError("server_error", "封面暂时不可用。", { httpStatus: response.status });
                    return base64ToObjectUrl(response.body, response.contentType);
                } catch (error) { throw toSubsonicTransportError(error, ctx.kind); }
            });
            this.cache.set(key, { url: objectUrl, touchedAt: Date.now() });
            this.evict();
            return objectUrl;
        } catch { return undefined; }
    }

    destroy(): void {
        for (const item of this.cache.values()) URL.revokeObjectURL(item.url);
        this.cache.clear();
    }

    private evict(): void {
        if (this.cache.size <= this.maxEntries) return;
        const oldest = [...this.cache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt);
        for (const [key, item] of oldest) {
            if (this.cache.size <= this.maxEntries) break;
            URL.revokeObjectURL(item.url);
            this.cache.delete(key);
        }
    }
}
