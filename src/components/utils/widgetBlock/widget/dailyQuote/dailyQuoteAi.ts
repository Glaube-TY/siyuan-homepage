import { formatLocalDate } from "@/components/tools/date-utils";
import {
    ensureHomepageEntitlementGranted,
    isHomepageEntitlementGranted,
    resolveHomepageEntitlementMessage,
} from "@/features/entitlement/homepage-entitlement";
import { HOMEPAGE_DAILY_QUOTE_AGENT_PROFILE_ID } from "@/features/agent-platform/agent-profile";
import { generatePlainText } from "@/services/ai/plain-text-generation";
import {
    DAILY_QUOTE_AI_GENERATOR_VERSION,
    DAILY_QUOTE_AI_OUTPUT_MAX_LENGTH,
    normalizeDailyQuoteAiPrompt,
    normalizeDailyQuoteAiUseMemory,
} from "./dailyQuoteAiConfig";
import {
    DAILY_QUOTE_AI_CACHE_SCHEMA,
    DAILY_QUOTE_AI_CACHE_VERSION,
    loadDailyQuoteAiCache,
    saveDailyQuoteAiCache,
    type DailyQuoteAiCacheRecord,
} from "./dailyQuoteAiCache";

export type DailyQuoteAiFailureReason = "not_premium" | "no_model" | "model_error" | "empty_output" | "aborted";

export type GenerateDailyQuoteAiResult =
    | {
        ok: true;
        text: string;
        fromCache: boolean;
        localDate: string;
        configKey: string;
    }
    | {
        ok: false;
        reason: DailyQuoteAiFailureReason;
        message: string;
    };

export interface GenerateDailyQuoteAiParams {
    plugin: any;
    instanceId: string;
    prompt: unknown;
    useMemory: unknown;
    abortSignal?: AbortSignal;
    forceRefresh?: boolean;
    now?: Date;
}

const inFlightGenerations = new Map<string, Promise<GenerateDailyQuoteAiResult>>();

function createNotPremiumResult(): Extract<GenerateDailyQuoteAiResult, { ok: false }> {
    return {
        ok: false,
        reason: "not_premium",
        message: resolveHomepageEntitlementMessage("AI 每日一句"),
    };
}

export function buildDailyQuoteAiPrompt(userPrompt: unknown, now = new Date()): string {
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    const normalizedPrompt = normalizeDailyQuoteAiPrompt(userPrompt);
    return `你是个人主页的“每日一句”原创短句生成器。

当前本地日期：${formatLocalDate(now)}
当前星期：${weekday}

用户生成要求：
${normalizedPrompt}

硬性规则：
1. 只输出一句适合放在个人主页中的中文短句。
2. 不要解释。
3. 不要 Markdown。
4. 不要 HTML。
5. 不要列表。
6. 不要加“每日一句：”“今日寄语：”等前缀。
7. 不要使用外层引号包裹。
8. 不要署名。
9. 不要声称来自真实人物、书籍或作品。
10. 不要编造事实或数字。
11. 语言自然、完整。
12. 控制为适合 Widget 阅读的短句。
长期记忆只作为隐性的个性化参考，不要泄露记忆来源，不要直接复述具体敏感内容。`;
}

function stripQuoteWrapper(text: string): string {
    const pairs: Array<[string, string]> = [["“", "”"], ["‘", "’"], ["\"", "\""], ["'", "'"]];
    for (const [left, right] of pairs) {
        if (text.startsWith(left) && text.endsWith(right) && text.length > left.length + right.length) {
            return text.slice(left.length, -right.length).trim();
        }
    }
    return text;
}

function cleanDailyQuoteLine(rawLine: string): string {
    let line = rawLine.trim();
    line = line.replace(/^(?:[-*+•·]|\d+[.)])\s+/, "");
    line = stripQuoteWrapper(line).trim();
    line = line.replace(/^(?:每日一句|今日寄语|今日一言|每日一言)\s*[:：-]\s*/, "").trim();
    return stripQuoteWrapper(line).trim();
}

export function cleanDailyQuoteAiText(rawText: unknown): string {
    const lines = String(rawText ?? "")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map(cleanDailyQuoteLine)
        .filter(Boolean);
    const firstLine = lines[0] || "";
    return Array.from(firstLine).slice(0, DAILY_QUOTE_AI_OUTPUT_MAX_LENGTH).join("").trim();
}

export function buildDailyQuoteAiConfigKey(prompt: unknown, useMemory: unknown): string {
    return JSON.stringify({
        generatorVersion: DAILY_QUOTE_AI_GENERATOR_VERSION,
        prompt: normalizeDailyQuoteAiPrompt(prompt),
        useMemory: normalizeDailyQuoteAiUseMemory(useMemory),
    });
}

function mapPlainTextFailure(reason: string): DailyQuoteAiFailureReason {
    if (reason === "aborted") return "aborted";
    if (reason === "no_model") return "no_model";
    return "model_error";
}

async function generateDailyQuoteAiOnce(
    params: GenerateDailyQuoteAiParams,
    localDate: string,
    configKey: string,
    useMemory: boolean,
    forceRefresh: boolean,
): Promise<GenerateDailyQuoteAiResult> {
    if (!await ensureHomepageEntitlementGranted(params.plugin)) return createNotPremiumResult();
    if (params.abortSignal?.aborted) return { ok: false, reason: "aborted", message: "请求已取消" };

    const cacheIdentity = {
        instanceId: params.instanceId,
        localDate,
        configKey,
    } satisfies Pick<DailyQuoteAiCacheRecord, "instanceId" | "localDate" | "configKey">;
    if (!forceRefresh) {
        const cached = await loadDailyQuoteAiCache(params.plugin, cacheIdentity);
        if (cached) {
            if (!isHomepageEntitlementGranted()) return createNotPremiumResult();
            return { ok: true, text: cached.text, fromCache: true, localDate, configKey };
        }
    }

    const result = await generatePlainText({
        profileId: HOMEPAGE_DAILY_QUOTE_AGENT_PROFILE_ID,
        contextSources: useMemory ? ["global-memory"] : [],
        prompt: buildDailyQuoteAiPrompt(params.prompt, params.now),
        thinkingMode: "off",
        maxOutputTokens: 192,
        temperature: 0.9,
        abortSignal: params.abortSignal,
        purpose: "generic",
    });
    if (result.ok === false) {
        return { ok: false, reason: mapPlainTextFailure(result.reason), message: result.message };
    }

    const text = cleanDailyQuoteAiText(result.text);
    if (!text) return { ok: false, reason: "empty_output", message: "模型没有返回可显示的每日一句" };
    if (!isHomepageEntitlementGranted()) return createNotPremiumResult();

    const record: DailyQuoteAiCacheRecord = {
        schema: DAILY_QUOTE_AI_CACHE_SCHEMA,
        version: DAILY_QUOTE_AI_CACHE_VERSION,
        instanceId: params.instanceId,
        localDate,
        configKey,
        text,
        generatedAt: new Date().toISOString(),
    };
    try {
        await saveDailyQuoteAiCache(params.plugin, record);
    } catch (error) {
        console.warn("[dailyQuoteAi] 生成成功但 runtime cache 保存失败", error);
    }
    return { ok: true, text, fromCache: false, localDate, configKey };
}

export async function generateDailyQuoteAi(params: GenerateDailyQuoteAiParams): Promise<GenerateDailyQuoteAiResult> {
    if (params.abortSignal?.aborted) return { ok: false, reason: "aborted", message: "请求已取消" };
    if (!await ensureHomepageEntitlementGranted(params.plugin)) return createNotPremiumResult();

    const now = params.now || new Date();
    const localDate = formatLocalDate(now);
    const useMemory = normalizeDailyQuoteAiUseMemory(params.useMemory);
    const configKey = buildDailyQuoteAiConfigKey(params.prompt, useMemory);
    const requestKey = `${params.instanceId}\u0000${localDate}\u0000${configKey}`;
    const forceRefresh = params.forceRefresh === true;

    if (forceRefresh) {
        inFlightGenerations.delete(requestKey);
    } else {
        const existing = inFlightGenerations.get(requestKey);
        if (existing) {
            const result = await existing;
            return isHomepageEntitlementGranted() ? result : createNotPremiumResult();
        }
    }

    let generation: Promise<GenerateDailyQuoteAiResult>;
    generation = generateDailyQuoteAiOnce(params, localDate, configKey, useMemory, forceRefresh)
        .finally(() => {
            if (inFlightGenerations.get(requestKey) === generation) inFlightGenerations.delete(requestKey);
        });
    inFlightGenerations.set(requestKey, generation);
    const result = await generation;
    return isHomepageEntitlementGranted() ? result : createNotPremiumResult();
}
