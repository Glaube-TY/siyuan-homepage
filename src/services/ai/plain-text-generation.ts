import type { ChatModelSelection } from "@/features/kb/types/chat-model-selection";
import type { ThinkingMode } from "@/features/kb/types/session";
import { callModelText } from "@/features/kb/services/qa/kb-model-call";

export interface GeneratePlainTextOptions {
    prompt: string;
    modelSelection?: ChatModelSelection | null;
    thinkingMode?: ThinkingMode;
    maxOutputTokens?: number;
    temperature?: number;
    abortSignal?: AbortSignal;
    purpose?: "homepage_status" | "generic";
}

export type GeneratePlainTextFailureReason = "no_model" | "provider_error" | "aborted" | "unknown";

export type GeneratePlainTextResult =
    | {
        ok: true;
        text: string;
    }
    | {
        ok: false;
        message: string;
        reason: GeneratePlainTextFailureReason;
    };

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || "未知错误");
}

function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    if (error instanceof Error) {
        return error.name === "AbortError" || /abort|aborted|cancel/i.test(error.message);
    }
    return false;
}

function classifyModelError(message: string): GeneratePlainTextFailureReason {
    if (
        message.includes("未找到可用的模型") ||
        message.includes("未找到选中的提供商") ||
        message.includes("未找到模型") ||
        message.includes("模型 ID 为空")
    ) {
        return "no_model";
    }
    if (
        message.includes("API Key") ||
        message.includes("baseUrl") ||
        message.includes("baseURL") ||
        message.includes("AI 调用失败") ||
        message.includes("AI 调用被提供商拒绝")
    ) {
        return "provider_error";
    }
    return "unknown";
}

export async function generatePlainText(options: GeneratePlainTextOptions): Promise<GeneratePlainTextResult> {
    const prompt = typeof options.prompt === "string" ? options.prompt.trim() : "";
    if (!prompt) {
        return { ok: false, reason: "unknown", message: "提示语为空" };
    }

    if (options.modelSelection === null) {
        return { ok: false, reason: "no_model", message: "未选择可用大模型" };
    }

    try {
        const text = await callModelText(prompt, options.thinkingMode ?? "off", {
            chatModelSelection: options.modelSelection,
            abortSignal: options.abortSignal,
            maxOutputTokens: options.maxOutputTokens,
            temperature: options.temperature,
            purpose: "generic",
        });
        return { ok: true, text };
    } catch (error) {
        if (isAbortError(error)) {
            return { ok: false, reason: "aborted", message: "请求已取消" };
        }
        const message = getErrorMessage(error);
        return {
            ok: false,
            reason: classifyModelError(message),
            message,
        };
    }
}
