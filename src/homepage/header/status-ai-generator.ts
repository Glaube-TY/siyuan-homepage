import { generatePlainText } from "@/services/ai/plain-text-generation";
import { getKbSettings } from "@/features/kb/services/settings/kb-settings-service";
import { buildChatModelOptions, findDefaultChatModelOption } from "@/features/kb/services/settings/chat-model-options";
import { buildChatModelKey, type ChatModelSelection } from "@/features/kb/types/chat-model-selection";
import type { ThinkingMode } from "@/features/kb/types/session";
import {
    normalizeStatusAiMaxChars,
    normalizeStatusAiModelId,
    normalizeStatusAiPrompt,
    normalizeStatusAiThinkingEnabled,
} from "../status-text-config";
import { loadStatsData } from "./stats-loader";

export interface HomepageStatusAiConfig {
    prompt: string;
    maxChars: number;
    providerId: string;
    modelId: string;
    thinkingEnabled: boolean;
}

export interface HomepageStatusFacts {
    nowDate: string;
    startDate: string;
    blocksCount: string;
    notebooksCount: string;
    docsCount: string;
    tasksCount?: string;
    doneTasksCount?: string;
    undoneTasksCount?: string;
    dailynotesCount?: string;
    tagsCount?: string;
}

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

function toText(value: unknown): string {
    return String(value ?? "未知");
}

function normalizeStatusAiConfig(config: HomepageStatusAiConfig): HomepageStatusAiConfig {
    return {
        prompt: normalizeStatusAiPrompt(config.prompt),
        maxChars: normalizeStatusAiMaxChars(config.maxChars),
        providerId: normalizeStatusAiModelId(config.providerId),
        modelId: normalizeStatusAiModelId(config.modelId),
        thinkingEnabled: normalizeStatusAiThinkingEnabled(config.thinkingEnabled),
    };
}

export async function loadHomepageStatusFacts(plugin: any): Promise<HomepageStatusFacts> {
    const [
        nowDate,
        startDate,
        blocksCount,
        notebooksCount,
        docsCount,
        tasksCount,
        doneTasksCount,
        undoneTasksCount,
        dailynotesCount,
        tagsCount,
    ] = await Promise.all([
        loadStatsData("nowDate", plugin),
        loadStatsData("startDate", plugin),
        loadStatsData("blocksCount", plugin),
        loadStatsData("notebooksCount", plugin),
        loadStatsData("docsCount", plugin),
        loadStatsData("tasksCount", plugin),
        loadStatsData("doneTasksCount", plugin),
        loadStatsData("undoneTasksCount", plugin),
        loadStatsData("dailynotesCount", plugin),
        loadStatsData("tagsCount", plugin),
    ]);

    return {
        nowDate: toText(nowDate),
        startDate: toText(startDate),
        blocksCount: toText(blocksCount),
        notebooksCount: toText(notebooksCount),
        docsCount: toText(docsCount),
        tasksCount: toText(tasksCount),
        doneTasksCount: toText(doneTasksCount),
        undoneTasksCount: toText(undoneTasksCount),
        dailynotesCount: toText(dailynotesCount),
        tagsCount: toText(tagsCount),
    };
}

export function buildHomepageStatusPrompt(
    facts: HomepageStatusFacts,
    userPrompt: string,
    maxChars: number,
): string {
    const normalizedPrompt = normalizeStatusAiPrompt(userPrompt);
    const normalizedMaxChars = normalizeStatusAiMaxChars(maxChars);

    return `你是一个思源笔记主页状态语生成器。请根据下面的真实数据，生成一句适合显示在主页标题下方的中文状态语。

硬性规则：
- 只输出状态语正文，不要解释、不要列项、不要 Markdown/HTML；
- 不要编造数据，只使用下方提供的真实数据；
- 不超过 ${normalizedMaxChars} 个中文字符。

用户指定风格：
${normalizedPrompt}

真实数据：
今天是：${facts.nowDate}
第一条笔记日期：${facts.startDate}
当前笔记本数量：${facts.notebooksCount}
当前文档数量：${facts.docsCount}
当前内容块数量：${facts.blocksCount}
当前任务数量：${facts.tasksCount ?? "未知"}
已完成任务数量：${facts.doneTasksCount ?? "未知"}
未完成任务数量：${facts.undoneTasksCount ?? "未知"}
日记数量：${facts.dailynotesCount ?? "未知"}
标签数量：${facts.tagsCount ?? "未知"}`;
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

    const facts = params.facts ?? await loadHomepageStatusFacts(params.plugin);
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
