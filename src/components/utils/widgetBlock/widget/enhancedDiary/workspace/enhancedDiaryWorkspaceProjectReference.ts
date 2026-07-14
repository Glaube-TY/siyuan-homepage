const PROJECT_MARKER = "📁";
const BLOCK_REF_PATTERN = /\(\(([0-9]{14}-[a-z0-9]{7})(?:\s+["'](?:\\.|[^"'])*["'])?\)\)/gi;

function escapeRefTitle(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\r\n]+/g, " ").trim();
}

/** 生成思源动态块引用。引用文本只是展示缓存，稳定关系由块 ID 与块属性承担。 */
export function generateVisibleProjectReference(targetId: string, title: string): string {
    if (!/^[0-9]{14}-[a-z0-9]{7}$/i.test(targetId)) throw new Error("项目目标 ID 无效。");
    return `${PROJECT_MARKER}${`((${targetId} \"${escapeRefTitle(title)}\"))`}`;
}

export function parseVisibleProjectTargetId(markdown: unknown): string | undefined {
    const text = String(markdown || "");
    const markerIndex = text.lastIndexOf(PROJECT_MARKER);
    if (markerIndex < 0) return undefined;
    BLOCK_REF_PATTERN.lastIndex = 0;
    const match = BLOCK_REF_PATTERN.exec(text.slice(markerIndex));
    return match?.[1];
}

export function removeVisibleProjectReference(markdown: unknown): string {
    const text = String(markdown || "");
    return text
        .replace(/\s*（?\s*📁\s*\(\([0-9]{14}-[a-z0-9]{7}(?:\s+["'](?:\\.|[^"'])*["'])?\)\)\s*）?/gi, "")
        .replace(/[ \t]+$/gm, "")
        .trimEnd();
}

export function appendTaskProjectReference(markdown: string, targetId: string, title: string): string {
    const base = removeVisibleProjectReference(markdown).trimEnd();
    return `${base} ${generateVisibleProjectReference(targetId, title)}`;
}

export function appendRecordProjectReference(markdown: string, targetId: string, title: string): string {
    const base = removeVisibleProjectReference(markdown).trimEnd();
    return `${base}\n\n（${generateVisibleProjectReference(targetId, title)}）`;
}
