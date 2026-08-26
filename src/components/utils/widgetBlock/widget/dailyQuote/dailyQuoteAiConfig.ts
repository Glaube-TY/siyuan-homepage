export const DAILY_QUOTE_AI_GENERATOR_VERSION = 1 as const;
export const DAILY_QUOTE_AI_PROMPT_MAX_LENGTH = 1000;
export const DAILY_QUOTE_AI_OUTPUT_MAX_LENGTH = 160;

export const DEFAULT_DAILY_QUOTE_AI_PROMPT =
    "自然、克制、有启发性，可以有一点文学感；避免空洞鸡汤、网络套话、说教和夸张表达。";

export function normalizeDailyQuoteAiPrompt(value: unknown): string {
    const prompt = typeof value === "string" ? value.trim() : "";
    return (prompt || DEFAULT_DAILY_QUOTE_AI_PROMPT).slice(0, DAILY_QUOTE_AI_PROMPT_MAX_LENGTH);
}

export function normalizeDailyQuoteAiUseMemory(value: unknown): boolean {
    return typeof value === "boolean" ? value : true;
}
