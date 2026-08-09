import type { ResolvedPlaybackSource } from "./musicSourceTypes";
import { createRuntimeUuid } from "@/libs/runtime-id";

interface RelayEntry {
    upstreamUrl: string;
    expiresAt: number;
}

const RELAY_ENTRY_TTL_MS = 6 * 60 * 60 * 1000;
const FORWARDED_RESPONSE_HEADERS = [
    "accept-ranges", "cache-control", "content-length", "content-range", "content-type", "etag", "last-modified",
];

export function needsDesktopMusicStreamRelay(
    pageProtocol: string,
    streamUrl: string,
    electronAvailable: boolean,
): boolean {
    if (!electronAvailable || pageProtocol !== "https:") return false;
    try { return new URL(streamUrl).protocol === "http:"; }
    catch { return false; }
}

export function assertMusicStreamTransportAllowed(
    pageProtocol: string,
    streamUrl: string,
    electronAvailable: boolean,
): void {
    if (pageProtocol !== "https:" || electronAvailable) return;
    let streamProtocol = "";
    try { streamProtocol = new URL(streamUrl).protocol; } catch { return; }
    if (streamProtocol === "http:") {
        throw new Error("当前页面为 HTTPS，HTTP 音频会被系统拦截。请为 NAS 音乐地址配置 HTTPS。" );
    }
}

export class DesktopMusicStreamRelay {
    private server: any = null;
    private port = 0;
    private readonly entries = new Map<string, RelayEntry>();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly nodeRequire: ((id: string) => any) | null = null) {}

    async wrap(source: ResolvedPlaybackSource, electronAvailable: boolean): Promise<ResolvedPlaybackSource> {
        const pageProtocol = typeof location === "undefined" ? "" : location.protocol;
        assertMusicStreamTransportAllowed(pageProtocol, source.url, electronAvailable);
        if (!needsDesktopMusicStreamRelay(pageProtocol, source.url, electronAvailable)) return source;
        await this.ensureServer();
        const token = this.createToken();
        this.entries.set(token, { upstreamUrl: source.url, expiresAt: Date.now() + RELAY_ENTRY_TTL_MS });
        return {
            ...source,
            url: `http://127.0.0.1:${this.port}/stream/${token}`,
            dispose: () => { this.entries.delete(token); },
        };
    }

    destroy(): void {
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
        this.entries.clear();
        try { this.server?.close(); } catch { /* 已关闭 */ }
        this.server = null;
        this.port = 0;
    }

    private async ensureServer(): Promise<void> {
        if (this.server?.listening && this.port > 0) return;
        const requireNode = this.nodeRequire || (typeof window !== "undefined" ? window.require : null);
        if (!requireNode) throw new Error("当前环境无法建立安全的本地音频流转发。" );
        const http = requireNode("http");
        this.server = http.createServer((request: any, response: any) => this.handleRequest(requireNode, request, response));
        await new Promise<void>((resolve, reject) => {
            const onError = (error: unknown) => { this.server?.off("listening", onListening); reject(error); };
            const onListening = () => { this.server?.off("error", onError); resolve(); };
            this.server.once("error", onError);
            this.server.once("listening", onListening);
            this.server.listen(0, "127.0.0.1");
        });
        const address = this.server.address();
        this.port = typeof address === "object" && address ? Number(address.port) : 0;
        if (!(this.port > 0)) throw new Error("本地音频流转发启动失败。" );
        this.server.unref?.();
        this.cleanupTimer = setInterval(() => this.removeExpiredEntries(), 60_000);
    }

    private handleRequest(requireNode: (id: string) => any, request: any, response: any): void {
        if (request.method !== "GET" && request.method !== "HEAD") {
            response.writeHead(405).end();
            return;
        }
        const path = String(request.url || "").split("?", 1)[0];
        const token = path.startsWith("/stream/") ? path.slice("/stream/".length) : "";
        const entry = token ? this.entries.get(token) : undefined;
        if (!entry || entry.expiresAt <= Date.now()) {
            if (token) this.entries.delete(token);
            response.writeHead(404).end();
            return;
        }
        entry.expiresAt = Date.now() + RELAY_ENTRY_TTL_MS;
        let parsed: URL;
        try { parsed = new URL(entry.upstreamUrl); }
        catch { response.writeHead(502).end(); return; }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            response.writeHead(502).end();
            return;
        }
        const transport = requireNode(parsed.protocol === "https:" ? "https" : "http");
        const headers: Record<string, string> = { accept: String(request.headers.accept || "*/*") };
        if (request.headers.range) headers.range = String(request.headers.range);
        const upstreamRequest = transport.request(parsed, { method: request.method, headers }, (upstreamResponse: any) => {
            const responseHeaders: Record<string, string | string[]> = {
                "access-control-allow-origin": "*",
                "cross-origin-resource-policy": "cross-origin",
            };
            for (const name of FORWARDED_RESPONSE_HEADERS) {
                const value = upstreamResponse.headers[name];
                if (value !== undefined) responseHeaders[name] = value;
            }
            response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
            upstreamResponse.pipe(response);
        });
        upstreamRequest.on("error", () => {
            if (!response.headersSent) response.writeHead(502);
            response.end();
        });
        request.on("aborted", () => upstreamRequest.destroy());
        response.on("close", () => { if (!response.writableEnded) upstreamRequest.destroy(); });
        upstreamRequest.end();
    }

    private removeExpiredEntries(): void {
        const now = Date.now();
        for (const [token, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(token);
    }

    private createToken(): string {
        return createRuntimeUuid();
    }
}
