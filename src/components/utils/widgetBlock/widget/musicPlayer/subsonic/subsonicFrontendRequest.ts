import { SubsonicError } from "./subsonicErrors";

export async function fetchSubsonicFrontend(
    url: string,
    timeoutMs: number,
    responseEncoding: "text" | "base64",
    signal?: AbortSignal,
): Promise<IResForwardProxy> {
    if (signal?.aborted) throw new SubsonicError("request_aborted", "请求已取消。");

    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, Math.max(1, timeoutMs));
    signal?.addEventListener("abort", abortFromParent, { once: true });

    try {
        const startedAt = Date.now();
        const response = await fetch(url, {
            method: "GET",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            redirect: "error",
            signal: controller.signal,
        });
        let body: string;
        if (responseEncoding === "base64") {
            const bytes = new Uint8Array(await response.arrayBuffer());
            const chunks: string[] = [];
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
            }
            body = btoa(chunks.join(""));
        } else {
            body = await response.text();
        }
        if (signal?.aborted) throw new SubsonicError("request_aborted", "请求已取消。");
        if (timedOut) throw new Error("Subsonic request timed out.");
        return {
            status: response.status,
            body,
            bodyEncoding: responseEncoding,
            contentType: response.headers.get("content-type") ?? "",
            headers: Object.fromEntries(response.headers.entries()),
            url,
            elapsed: Date.now() - startedAt,
        };
    } catch (error) {
        if (signal?.aborted) {
            throw new SubsonicError("request_aborted", "请求已取消。", { cause: error });
        }
        if (timedOut) throw new Error(`Subsonic request timed out after ${timeoutMs}ms.`);
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromParent);
    }
}
