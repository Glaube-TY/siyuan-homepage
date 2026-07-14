import { generatePlainText } from "@/services/ai/plain-text-generation";
import { getKbSettings } from "@/features/kb/services/settings/kb-settings-service";
import { buildChatModelOptions, findDefaultChatModelOption } from "@/features/kb/services/settings/chat-model-options";
import { buildChatModelKey, type ChatModelSelection } from "@/features/kb/types/chat-model-selection";
import type { ThinkingMode } from "@/features/kb/types/session";
import {
    HOMEPAGE_STATUS_STAT_DEFINITIONS,
    normalizeStatusAiMaxChars,
    normalizeStatusAiModelId,
    normalizeStatusAiPrompt,
    normalizeStatusAiThinkingEnabled,
    normalizeStatusAiStatKeys,
    type HomepageStatusStatKey,
} from "../status-text-config";
import { loadStatsDataResult } from "./stats-loader";

export interface HomepageStatusAiConfig {
    prompt: string;
    maxChars: number;
    providerId: string;
    modelId: string;
    thinkingEnabled: boolean;
    statKeys: HomepageStatusStatKey[];
}

export type HomepageStatusFacts = Partial<Record<HomepageStatusStatKey, string>>;

export type GenerateHomepageStatusTextResult =
    | {
        ok: true;
        text: string;
        cacheKey: string;
    }
    | {
        ok: false;
        message: string;
        reason: "not_premium" | "no_model" | "model_error" | "empty_output" | "aborted";
    };

function normalizeStatusAiConfig(config: HomepageStatusAiConfig): HomepageStatusAiConfig {
    return {
        prompt: normalizeStatusAiPrompt(config.prompt),
        maxChars: normalizeStatusAiMaxChars(config.maxChars),
        providerId: normalizeStatusAiModelId(config.providerId),
        modelId: normalizeStatusAiModelId(config.modelId),
        thinkingEnabled: normalizeStatusAiThinkingEnabled(config.thinkingEnabled),
        statKeys: normalizeStatusAiStatKeys(config.statKeys),
    };
}

export async function loadHomepageStatusFacts(
    plugin: any,
    selectedKeys: HomepageStatusStatKey[],
): Promise<HomepageStatusFacts> {
    const keys = normalizeStatusAiStatKeys(selectedKeys);
    const results = await Promise.all(keys.map(async (key) => [key, await loadStatsDataResult(key, plugin)] as const));
    const facts: HomepageStatusFacts = {};
    for (const [key, result] of results) {
        if (result.status === "ok" && result.value !== null) facts[key] = String(result.value);
    }
    return facts;
}

export function buildHomepageStatusPrompt(
    facts: HomepageStatusFacts,
    userPrompt: string,
    maxChars: number,
): string {
    const normalizedPrompt = normalizeStatusAiPrompt(userPrompt);
    const normalizedMaxChars = normalizeStatusAiMaxChars(maxChars);

    const factLines = HOMEPAGE_STATUS_STAT_DEFINITIONS
        .filter((item) => facts[item.key] !== undefined)
        .map((item) => `${item.promptName}：${facts[item.key]}`);
    const factsText = factLines.length > 0
        ? `以下数据仅包含用户主动选择且当前可用的统计项：\n${factLines.join("\n")}`
        : "用户没有选择统计数据，请只根据用户指定风格生成不包含虚构数字的状态语。";

    return `你是一个思源笔记主页状态语生成器。请根据下面的真实数据，生成一句适合显示在主页标题下方的中文状态语。

硬性规则：
- 只输出状态语正文，不要解释、不要列项、不要 Markdown/HTML；
- 不要编造数据，只使用下方提供的真实数据；
- 不超过 ${normalizedMaxChars} 个中文字符。

用户指定风格：
${normalizedPrompt}

真实数据：
${factsText}`;
}

export function cleanHomepageStatusText(rawText: string, maxChars: number): string {
    const normalizedMaxChars = normalizeStatusAiMaxChars(maxChars);
    let text = String(rawText ?? "").trim();

    const quotePairs: Array<[string, string]> = [
        ['"', '"'],
        ["'", "'"],
        ["“", "”"],
        ["‘", "’"],
        ["「", "」"],
        ["『", "』"],
    ];

    for (const [start, end] of quotePairs) {
        if (text.startsWith(start) && text.endsWith(end) && text.length >= start.length + end.length) {
            text = text.slice(start.length, text.length - end.length).trim();
            break;
        }
    }

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^(?:[-*]\s+|\d+[.、]\s*)/, ""))
        .filter((line) => line.length > 0)
        .slice(0, 2);

    text = lines.join("\n").trim();
    if (!text) return "";

    const chars = Array.from(text);
    if (chars.length > normalizedMaxChars) {
        text = chars.slice(0, normalizedMaxChars).join("").trim();
    }
    return text;
}

export function buildHomepageStatusAiCacheKey(config: HomepageStatusAiConfig, facts: HomepageStatusFacts): string {
    const normalizedConfig = normalizeStatusAiConfig(config);
    return JSON.stringify({
        ...normalizedConfig,
        facts,
    });
}

async function resolveConfiguredStatusModel(config: HomepageStatusAiConfig): Promise<ChatModelSelection | null> {
    const providerId = normalizeStatusAiModelId(config.providerId);
    const modelId = normalizeStatusAiModelId(config.modelId);

    const settings = await getKbSettings();
    const options = buildChatModelOptions(settings);
    if (options.length === 0) return null;

    // 优先使用配置的特定模型
    if (providerId && modelId) {
        const key = buildChatModelKey(providerId, modelId);
        const matched = options.find((option) => option.key === key);
        if (matched) {
            return {
                providerId: matched.providerId,
                modelId: matched.modelId,
            };
        }
        // 配置了特定模型但找不到，返回 null
        return null;
    }

    // 空 provider/model：使用 AI 知识库默认模型
    const fallback = findDefaultChatModelOption(settings, options);
    return fallback ? { providerId: fallback.providerId, modelId: fallback.modelId } : null;
}

export async function generateHomepageStatusText(params: {
    plugin: any;
    config: HomepageStatusAiConfig;
    facts?: HomepageStatusFacts;
    abortSignal?: AbortSignal;
}): Promise<GenerateHomepageStatusTextResult> {
    if (!params.plugin?.ADVANCED) {
        return {
            ok: false,
            reason: "not_premium",
            message: "AI 智能生成状态语是会员专属功能",
        };
    }

    const config = normalizeStatusAiConfig(params.config);
    const selection = await resolveConfiguredStatusModel(config);
    if (!selection) {
        return {
            ok: false,
            reason: "no_model",
            message: "尚未选择可用的状态语大模型",
        };
    }

    if (params.abortSignal?.aborted) {
        return { ok: false, reason: "aborted", message: "请求已取消" };
    }

    const facts = params.facts ?? await loadHomepageStatusFacts(params.plugin, config.statKeys);
    const cacheKey = buildHomepageStatusAiCacheKey(config, facts);
    const prompt = buildHomepageStatusPrompt(facts, config.prompt, config.maxChars);
    const thinkingMode: ThinkingMode = config.thinkingEnabled ? "on" : "off";

    const result = await generatePlainText({
        prompt,
        modelSelection: selection,
        thinkingMode,
        maxOutputTokens: Math.max(128, Math.min(512, config.maxChars * 4)),
        temperature: 0.7,
        abortSignal: params.abortSignal,
        purpose: "homepage_status",
    });

    if (result.ok === false) {
        return {
            ok: false,
            reason: result.reason === "aborted" ? "aborted" : result.reason === "no_model" ? "no_model" : "model_error",
            message: result.message,
        };
    }

    const text = cleanHomepageStatusText(result.text, config.maxChars);
    if (!text) {
        return {
            ok: false,
            reason: "empty_output",
            message: "模型没有返回可显示的状态语",
        };
    }

    return {
        ok: true,
        text,
        cacheKey,
    };
}
