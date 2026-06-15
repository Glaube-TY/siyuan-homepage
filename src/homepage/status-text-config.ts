export type HomepageStatusTextMode = "custom" | "ai";

export const DEFAULT_STATS_INFO_TEXT =
    "自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{blocksCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{docsCount}} 篇笔记。\n感谢自己的坚持！❤";

export const DEFAULT_STATUS_AI_PROMPT =
    "请生成一句简短、自然、有鼓励感的主页状态语。语气风趣幽默，尽量包含所有已知数据。使用表情符号增加趣味性。";

export const DEFAULT_STATUS_AI_MAX_CHARS = 200;
export const MIN_STATUS_AI_MAX_CHARS = 20;
export const MAX_STATUS_AI_MAX_CHARS = 500;

export function normalizeHomepageStatusTextMode(value: unknown): HomepageStatusTextMode {
    return value === "ai" ? "ai" : "custom";
}

export function normalizeStatusAiPrompt(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_STATUS_AI_PROMPT;
    const trimmed = value.trim();
    return trimmed || DEFAULT_STATUS_AI_PROMPT;
}

export function normalizeStatusAiMaxChars(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_STATUS_AI_MAX_CHARS;
    return Math.min(
        Math.max(Math.round(num), MIN_STATUS_AI_MAX_CHARS),
        MAX_STATUS_AI_MAX_CHARS,
    );
}

export function normalizeStatusAiModelId(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function normalizeStatusAiThinkingEnabled(value: unknown): boolean {
    return typeof value === "boolean" ? value : false;
}
