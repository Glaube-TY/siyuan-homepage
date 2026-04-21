/**
 * 思源文档图标处理工具
 * 提供最小化的 icon 归一化和解析功能
 */

/** 图标解析结果类型 */
export interface DocIconResult {
    type: "text" | "image";
    value: string;
}

/** 图片扩展名列表 */
const IMAGE_EXTENSIONS = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"];

/**
 * 检查值是否为自定义图标路径
 * @param value 原始值
 * @returns 是否为图片路径
 */
function isCustomIconPath(value: string): boolean {
    if (!value.includes("/")) {
        return false;
    }
    const lowerValue = value.toLowerCase();
    return IMAGE_EXTENSIONS.some(ext => lowerValue.endsWith(ext));
}

/**
 * 规范化自定义图标路径
 * @param path 原始路径（如 "kmind/kminddoc.svg"）
 * @returns 可用于 <img src> 的路径
 */
function normalizeIconPath(path: string): string {
    // 如果已经是完整 URL 或绝对路径，直接返回
    if (path.startsWith("http") || path.startsWith("/") || path.startsWith("data:")) {
        return path;
    }
    // 形如 "包名/文件名.svg" 的格式，补全为思源图标路径
    // 思源自定义图标通常存放在 /emojis/ 目录下
    return `/emojis/${path}`;
}

/**
 * 将思源文档 icon 原始值归一化为可直接显示的字符
 * @param raw 原始 icon 值（可能是 emoji、普通字符或 Unicode 编码串）
 * @returns 可直接显示的最终字符
 */
export function normalizeSiyuanDocIcon(raw?: string): string {
    if (!raw || raw.trim() === "") {
        return "";
    }

    const trimmed = raw.trim();

    // 如果已经是普通字符（非编码串格式），直接返回
    // 编码串特征：包含 - 或者是纯十六进制字符
    if (!trimmed.includes("-") && !/^[0-9a-fA-F]+$/.test(trimmed)) {
        return trimmed;
    }

    // 尝试解析 Unicode 编码串（如 "1f600"、"1f4c4"、"270d-fe0f"、"1f468-200d-1f4bb"）
    try {
        const codePoints = trimmed.split("-").map(part => parseInt(part, 16));
        // 检查所有 code point 是否有效
        if (codePoints.every(cp => !isNaN(cp) && cp >= 0)) {
            return String.fromCodePoint(...codePoints);
        }
    } catch {
        // 解析失败，回退原值
    }

    return trimmed;
}

/**
 * 解析文档图标，返回可用于渲染的结果
 * 区分文本图标（emoji/字符）和图片图标（自定义图标路径）
 * @param raw 原始 icon 值
 * @returns 解析结果，无法解析时返回 null
 */
export function parseDocIcon(raw?: string): DocIconResult | null {
    if (!raw || raw.trim() === "") {
        return null;
    }

    const trimmed = raw.trim();

    // 检查是否为自定义图标路径
    if (isCustomIconPath(trimmed)) {
        return {
            type: "image",
            value: normalizeIconPath(trimmed)
        };
    }

    // 尝试作为 emoji/Unicode 编码串解析
    const normalized = normalizeSiyuanDocIcon(trimmed);
    if (normalized) {
        return {
            type: "text",
            value: normalized
        };
    }

    return null;
}

/**
 * 从文档对象中解析出内置图标
 * 优先从 doc.icon 获取，其次从 doc.ial 中提取
 * @param doc 文档对象
 * @returns 解析结果，未找到时返回 null
 */
export function resolveBuiltinDocIcon(doc: any): DocIconResult | null {
    if (!doc) {
        return null;
    }

    // 优先从 doc.icon 获取
    if (doc.icon && typeof doc.icon === "string" && doc.icon.trim() !== "") {
        const result = parseDocIcon(doc.icon);
        if (result) return result;
    }

    // 其次从 doc.ial 中提取 icon="..."
    if (doc.ial && typeof doc.ial === "string") {
        const iconMatch = doc.ial.match(/icon="([^"]+)"/);
        if (iconMatch && iconMatch[1]) {
            const result = parseDocIcon(iconMatch[1]);
            if (result) return result;
        }
    }

    return null;
}
