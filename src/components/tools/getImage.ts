import { fetchSyncPost } from "siyuan";

export async function getImage(url: string) {
    try {
        const response = await fetchSyncPost("/api/network/forwardProxy", {
            url: url,
            method: "GET",
            contentType: "image/jpeg",
            headers: [
                {
                    name: "User-Agent",
                    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
                },
            ],
            payload: {},
            payloadEncoding: "text",
            responseEncoding: "base64",
        });
        const contentType =
            response.data.headers["Content-Type"]?.[0] || "image/jpeg";
        return `data:${contentType};base64,${response.data.body}`;
    } catch (error) {
        console.error("图片获取失败:", error);
        return "";
    }
}