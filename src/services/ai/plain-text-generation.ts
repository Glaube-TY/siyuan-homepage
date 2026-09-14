import type { ChatModelSelection } from "@/features/kb/types/chat-model-selection";
import type { ThinkingMode } from "@/features/kb/types/session";
import { callModelText, streamModelText } from "@/features/kb/services/qa/kb-model-call";
import {
    agentProfileAllowsContext,
    getAgentProfile,
    type AgentContextSourceId,
} from "@/features/agent-platform/agent-profile";
import { buildGlobalMemoryContext } from "@/features/kb/services/agent-workbench/memory/global-memory-store";
import { AgentProviderError, type AgentProviderErrorCategory } from "@/features/kb/services/agent-core/providers/provider-error";
import { pushAgentDebugEvent } from "@/features/kb/services/agent-workbench/debug/workbench-debug";

export interface GeneratePlainTextOptions {
    profileId: string;
    contextSources: readonly AgentContextSourceId[];
    prompt: string;
    modelSelection?: ChatModelSelection | null;
    thinkingMode?: ThinkingMode;
    maxOutputTokens?: number;
    temperature?: number;
    abortSignal?: AbortSignal;
    purpose?: "homepage_status" | "daily_quote" | "selection_ai" | "generic" | "compose";
    stream?: boolean;
    onToken?: (token: string, fullText: string) => void;
}

export type GeneratePlainTextFailureReason = "no_model" | "provider_error" | "permission_denied" | "aborted" | "unknown";

export type GeneratePlainTextResult =
    | {
        ok: true;
        text: string;
    }
    | {
        ok: false;
        message: string;
        reason: GeneratePlainTextFailureReason;
        errorCode?: string;
        status?: number;
        category?: AgentProviderErrorCategory;
        retryable?: boolean;
        userAction?: "retry" | "check_credentials" | "switch_model" | "inspect_provider";
    };

function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    if (error instanceof Error && error.name === "AbortError") return true;
    return error instanceof AgentProviderError && error.category === "cancelled";
}

type StructuredError = {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    category?: unknown;
    retryable?: unknown;
    userAction?: unknown;
};

const PROVIDER_ERROR_CODES = new Set([
    "provider_error",
    "provider_auth_failed",
    "provider_rate_limited",
    "provider_timeout",
    "provider_stream_idle_timeout",
    "provider_network_error",
    "provider_http_error",
    "provider_config_invalid",
    "empty_stream",
    "provider_aborted",
]);

const PROVIDER_ERROR_MESSAGES: Record<string, string> = {
    provider_auth_failed: "模型鉴权失败，请检查 API Key。",
    provider_rate_limited: "模型服务当前限流或额度不足。",
    provider_timeout: "模型响应超时，请稍后重试。",
    provider_stream_idle_timeout: "模型响应超时，请稍后重试。",
    provider_network_error: "无法连接模型服务。",
    provider_http_error: "模型服务拒绝了当前请求参数。",
    empty_stream: "模型没有返回可显示内容。",
    provider_config_invalid: "模型配置无效，请检查 API Key 或 Base URL。",
};

function readStructuredError(error: unknown): {
    code?: string;
    status?: number;
    category?: AgentProviderErrorCategory;
    retryable?: boolean;
    userAction?: "retry" | "check_credentials" | "switch_model" | "inspect_provider";
} {
    const value = error as StructuredError | null;
    const code = typeof value?.code === "string" ? value.code : undefined;
    const rawStatus = value?.status ?? value?.statusCode;
    const status = typeof rawStatus === "number" && Number.isFinite(rawStatus) ? rawStatus : undefined;
    const category = value?.category === "authentication"
        || value?.category === "rate_limit"
        || value?.category === "network"
        || value?.category === "timeout"
        || value?.category === "cancelled"
        || value?.category === "protocol"
        || value?.category === "unknown"
        ? value.category
        : undefined;
    const userAction = value?.userAction === "retry"
        || value?.userAction === "check_credentials"
        || value?.userAction === "switch_model"
        || value?.userAction === "inspect_provider"
        ? value.userAction
        : undefined;
    return {
        code,
        status,
        category,
        retryable: typeof value?.retryable === "boolean" ? value.retryable : undefined,
        userAction,
    };
}

function buildPlainTextFailure(error: unknown): Extract<GeneratePlainTextResult, { ok: false }> {
    if (isAbortError(error)) return { ok: false, reason: "aborted", message: "请求已取消", errorCode: "provider_aborted" };

    const structured = readStructuredError(error);
    const code = structured.code;
    const isProviderError = (code ? PROVIDER_ERROR_CODES.has(code) : false)
        || structured.status !== undefined
        || (structured.category !== undefined && structured.category !== "unknown");
    const reason = code === "no_model" ? "no_model" : isProviderError ? "provider_error" : "unknown";
    const safeMessage = code === "no_model"
        ? "未选择可用大模型"
        : (code ? PROVIDER_ERROR_MESSAGES[code] : undefined) ?? "模型调用失败。";

    return {
        ok: false,
        reason,
        message: safeMessage,
        ...(code ? { errorCode: code } : {}),
        ...(structured.status !== undefined ? { status: structured.status } : {}),
        ...(structured.category ? { category: structured.category } : {}),
        ...(structured.retryable !== undefined ? { retryable: structured.retryable } : {}),
        ...(structured.userAction ? { userAction: structured.userAction } : {}),
    };
}

export async function generatePlainText(options: GeneratePlainTextOptions): Promise<GeneratePlainTextResult> {
    const profile = getAgentProfile(options.profileId);
    const deniedContext = options.contextSources.find((source) => !agentProfileAllowsContext(profile, source));
    if (deniedContext) {
        return { ok: false, reason: "permission_denied", message: `当前 AI 入口无权读取上下文：${deniedContext}` };
    }

    const rawPrompt = typeof options.prompt === "string" ? options.prompt.trim() : "";
    const memory = options.contextSources.includes("global-memory")
        ? await buildGlobalMemoryContext(rawPrompt, { limit: 5, maxChars: 1800 })
        : undefined;
    const prompt = memory
        ? `${rawPrompt}\n\n用户长期记忆（只用于个性化，当前输入冲突时以当前输入为准，不得在结果中说明记忆来源）：\n${memory}`
        : rawPrompt;
    if (!prompt) {
        return { ok: false, reason: "unknown", message: "提示语为空" };
    }

    if (options.modelSelection === null) {
        return { ok: false, reason: "no_model", message: "未选择可用大模型" };
    }

    try {
        if (options.stream) {
            let fullText = "";
            await streamModelText(prompt, options.thinkingMode ?? "off", {
                onChunk: ({ chunk, fullContent }) => {
                    fullText = fullContent;
                    options.onToken?.(chunk, fullContent);
                },
            }, {
                chatModelSelection: options.modelSelection,
                abortSignal: options.abortSignal,
                maxOutputTokens: options.maxOutputTokens,
                temperature: options.temperature,
                purpose: options.purpose ?? "generic",
            });
            return { ok: true, text: fullText };
        }

        const text = await callModelText(prompt, options.thinkingMode ?? "off", {
            chatModelSelection: options.modelSelection,
            abortSignal: options.abortSignal,
            maxOutputTokens: options.maxOutputTokens,
            temperature: options.temperature,
            purpose: options.purpose ?? "generic",
        });
        return { ok: true, text };
    } catch (error) {
        const failure = buildPlainTextFailure(error);
        pushAgentDebugEvent("PLAIN_TEXT_MODEL_CALL_FAILED_SAFE", {
            purpose: options.purpose ?? "generic",
            reason: failure.reason,
            errorCode: failure.errorCode,
            status: failure.status,
            category: failure.category,
            retryable: failure.retryable,
            userAction: failure.userAction,
        }, "warn");
        return failure;
    }
}
