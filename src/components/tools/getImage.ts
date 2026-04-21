import { getImageAsBase64 } from "@/api";

export async function getImage(url: string) {
    try {
        const result = await getImageAsBase64(url, 10000);
        return result || "";
    } catch (error) {
        console.error("图片获取失败:", error);
        return "";
    }
}
