/**
 * LLM Client — 内部 adapter（仅供 kb-model-call.ts 使用）
 *
 * 职责：
 * - 封装 AI SDK（generateText / streamText）调用
 * - 处理文本与流式模型请求的基础参数
 * - 提供基础错误处理和 debug 统计
 *
 * 业务层不得直接导入本文件的任何函数或类型。
 * 所有模型调用必须通过 qa/kb-model-call.ts。
 */

import { generateText, streamText } from "ai";
import { getKbSettings } from "../settings/kb-settings-service";
import { createSelectedChatModel } from "./model-provider-factory";
import type { SelectedChatModelInfo } from "./model-provider-factory";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { ProviderNativeAgentCompatibility } from "../../types/settings";
import { DEFAULT_TEMPERATURE } from "../../constants/default-settings";
import { pushAgentDebugEvent, getIsVerboseStreamDebugEnabled } from "../agent-workbench/debug/workbench-debug";
import { resolveProviderProfile, resolveModelTemperatureForRequest } from "./provider-profile";

export class AiProviderUnavailableError extends Error {
  providerType: string;
  providerLabel: string;
  modelId: string;
  status: number;
  errorType: string;
  safeMessage: string;

  constructor(params: {
    providerType: string;
    providerLabel: string;
    modelId: string;
    status: number;
    errorType: string;
    safeMessage: string;
  }) {
    super(`AI 提供商不可用 [${params.providerLabel} / ${params.modelId}]: ${params.safeMessage}`);
    this.name = "AiProviderUnavailableError";
    this.providerType = params.providerType;
    this.providerLabel = params.providerLabel;
    this.modelId = params.modelId;
    this.status = params.status;
    this.errorType = params.errorType;
    this.safeMessage = params.safeMessage;
  }
}

const PROVIDER_UNAVAILABLE_STATUSES = new Set([400, 401, 403, 404, 429]);

export interface ProviderRejectionInfo {
  rejected: boolean;
  statusCode?: number;
  name?: string;
  originalName?: string;
  message: string;
  providerType?: string;
  providerLabel?: string;
  modelLabel?: string;
  combinedText?: string;
}

function safeGet(obj: unknown, key: string): unknown {
  try {
    return (obj as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function collectPrimitiveText(value: unknown, depth: number, seen: WeakSet<object>, parts: string[]): void {
  if (depth > 4) return;
  if (value === null || value === undefined) return;

  if (typeof value === "string") {
    if (value.length > 0) parts.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }

  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPrimitiveText(item, depth + 1, seen, parts);
    }
    return;
  }

  if (typeof value === "object") {
    const keys = Reflect.ownKeys(value as object) as string[];
    for (const key of keys) {
      const v = safeGet(value, key);
      collectPrimitiveText(v, depth + 1, seen, parts);
    }
    return;
  }
}

function collectErrorTextParts(err: unknown, depth = 0, seen: WeakSet<object> | null = null): {
  texts: string[];
  names: string[];
  statusCode?: number;
  status?: number;
} {
  const actualSeen = seen ?? new WeakSet<object>();
  const texts: string[] = [];
  const names: string[] = [];
  let statusCode: number | undefined;
  let status: number | undefined;

  if (depth > 4) return { texts, names, statusCode, status };
  if (!err) return { texts, names, statusCode, status };

  texts.push(String(err));

  if (err instanceof Error) {
    if (err.message) texts.push(err.message);
    if (err.name) names.push(err.name);
    if (err.stack) texts.push(err.stack);
  }

  if (typeof err === "object" && err !== null) {
    const keys = Reflect.ownKeys(err) as string[];
    for (const key of keys) {
      try {
        const v = (err as Record<string, unknown>)[key];
        if (key === "statusCode" && typeof v === "number") statusCode = v;
        if (key === "status" && typeof v === "number") status = v;
        if (key === "name" && typeof v === "string") names.push(v);
        if (key === "originalName" && typeof v === "string") names.push(v);
      } catch {
      }
    }

    const directKeys = ["responseBody", "response", "body", "data", "error", "errors", "cause"];
    for (const key of directKeys) {
      const v = safeGet(err, key);
      if (v !== undefined) {
        collectPrimitiveText(v, depth + 1, actualSeen, texts);
      }
    }

    const cause = safeGet(err, "cause");
    if (cause && cause instanceof Error) {
      const sub = collectErrorTextParts(cause, depth + 1, actualSeen);
      texts.push(...sub.texts);
      names.push(...sub.names);
      if (sub.statusCode !== undefined) statusCode = sub.statusCode;
      if (sub.status !== undefined) status = sub.status;
    }
  }

  return { texts, names, statusCode, status };
}

export function isProviderRejectedError(err: unknown): boolean {
  return getProviderRejectionInfo(err).rejected;
}

export function getProviderRejectionInfo(err: unknown): ProviderRejectionInfo {
  const defaultMessage = err instanceof Error ? err.message : String(err);
  const defaultInfo: ProviderRejectionInfo = {
    rejected: false,
    message: defaultMessage,
  };

  if (!err) return defaultInfo;

  const e = err as Record<string, unknown>;

  const message = err instanceof Error ? err.message : String(err);
  const name = typeof e.name === "string" ? e.name : undefined;
  const originalName = typeof e.originalName === "string" ? e.originalName : undefined;
  const statusCode = typeof e.statusCode === "number" ? e.statusCode : undefined;
  const status = typeof e.status === "number" ? e.status : undefined;
  const resolvedStatus = statusCode ?? status;
  const providerType = typeof e.providerType === "string" ? e.providerType : undefined;
  const providerLabel = typeof e.providerLabel === "string" ? e.providerLabel : undefined;
  const modelLabel = typeof e.modelLabel === "string" ? e.modelLabel : undefined;

  if ((e.providerRejected as boolean) === true) {
    const nested = e.providerRejectionInfo as ProviderRejectionInfo | undefined;
    if (nested?.rejected === true) {
      return {
        rejected: true,
        statusCode: nested.statusCode ?? resolvedStatus,
        name: nested.name ?? name,
        originalName: nested.originalName ?? originalName,
        message: nested.message || message,
        providerType: nested.providerType ?? providerType,
        providerLabel: nested.providerLabel ?? providerLabel,
        modelLabel: nested.modelLabel ?? modelLabel,
      };
    }
    return {
      rejected: true,
      statusCode: resolvedStatus,
      name,
      originalName,
      message,
      providerType,
      providerLabel,
      modelLabel,
    };
  }

  if ((e.providerRejectionInfo as ProviderRejectionInfo | undefined)?.rejected === true) {
    const nested = e.providerRejectionInfo as ProviderRejectionInfo;
    return {
      rejected: true,
      statusCode: nested.statusCode ?? resolvedStatus,
      name: nested.name ?? name,
      originalName: nested.originalName ?? originalName,
      message: nested.message || message,
      providerType: nested.providerType ?? providerType,
      providerLabel: nested.providerLabel ?? providerLabel,
      modelLabel: nested.modelLabel ?? modelLabel,
    };
  }

  const { texts, names, statusCode: extractedStatusCode, status: extractedStatus } = collectErrorTextParts(err);
  const combinedText = texts.join("\n");
  const allNames = [...new Set(names)];

  const finalStatusCode = extractedStatusCode ?? extractedStatus ?? resolvedStatus;

  const rejectionPatterns = [
    /high\s*risk/i,
    /considered\s*high\s*risk/i,
    /rejected/i,
    /content\s*filter/i,
    /safety/i,
    /blocked/i,
    /refused/i,
    /policy\s*violation/i,
  ];

  let isRejected = rejectionPatterns.some((p) => p.test(combinedText));

  if (!isRejected) {
    for (const n of allNames) {
      if ((n === "AI_APICallError" || n === "APICallError") && finalStatusCode === 400) {
        isRejected = true;
        break;
      }
    }
  }

  if (!isRejected && providerType === "kimi" && finalStatusCode === 400) {
    isRejected = true;
  }

  return {
    rejected: isRejected,
    statusCode: finalStatusCode,
    name,
    originalName,
    message,
    providerType,
    providerLabel,
    modelLabel,
    combinedText,
  };
}

function isProviderUnavailableError(err: unknown): boolean {
  if (err instanceof AiProviderUnavailableError) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message || "";
  const hasStatus = PROVIDER_UNAVAILABLE_STATUSES.has(
    parseInt((err as any)?.statusCode || (err as any)?.status || "0", 10)
  );
  if (hasStatus) return true;
  if (msg.includes("401") || msg.includes("403") || msg.includes("404") || msg.includes("429")) return true;
  if (msg.includes("Unauthorized") || msg.includes("Forbidden") || msg.includes("Not Found") || msg.includes("Permission denied")) return true;
  return false;
}

/**
 * @internal 仅供 qa/kb-model-call.ts 内部使用，业务层不得直接导入。
 */
export interface LlmCallOptions {
  /** 温度，默认使用模型配置 */
  temperature?: number;
  /** 是否流式输出，默认 false（当前阶段仍以非流式为主） */
  stream?: boolean;
  /** 最大输出 token 数 */
  maxOutputTokens?: number;
  /** 本轮对话使用的模型选择（优先于 settings 中的默认模型） */
  chatModelSelection?: ChatModelSelection | null;
  /** 用于中断请求的 AbortSignal */
  abortSignal?: AbortSignal;
  /** 预构建的 providerOptions（由 kb-model-call 统一构造） */
  providerOptions?: Record<string, Record<string, unknown>>;
  /** 调用目的，用于日志区分 */
  purpose?: "analyze" | "compose" | "generic";
  /** 已解析的 selected model（由 kb-model-call 传入，避免重复 getKbSettings + createSelectedChatModel） */
  selectedChatModel?: SelectedChatModelInfo;
}

// ==================== 运行时模型选择上下文 ====================

let activeChatModelSelection: ChatModelSelection | null = null;

/**
 * 在指定模型选择上下文中运行任务
 * 当前 UI 限制同一时间只能 asking 一个问题，模块级上下文风险可控
 * @param selection 模型选择
 * @param task 要执行的任务
 * @returns 任务执行结果
 */
export async function runWithChatModelSelection<T>(
  selection: ChatModelSelection | null | undefined,
  task: () => Promise<T>
): Promise<T> {
  const previous = activeChatModelSelection;
  activeChatModelSelection = selection ?? null;
  try {
    return await task();
  } finally {
    activeChatModelSelection = previous;
  }
}

export interface LlmResponse {
  content: string;
}

/**
 * 调用 LLM（非流式）
 * @internal 仅供 qa/kb-model-call.ts 内部使用，业务层不得直接导入。
 */
export async function callLlm(
  prompt: string,
  options: LlmCallOptions = {}
): Promise<LlmResponse> {
  let selected = options.selectedChatModel;
  if (!selected) {
    const settings = await getKbSettings();
    selected = createSelectedChatModel(
      settings,
      options.chatModelSelection ?? activeChatModelSelection
    );
  }

  const startTime = Date.now();

  // 解析合并后的 provider profile 获取 ProviderNativeAgentCompatibility
  let mergedCp: ProviderNativeAgentCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(selected.providerConfig.type, {
      providerNativeAgentCompatibility: selected.providerConfig.providerNativeAgentCompatibility,
      modelNativeAgentCompatibility: selected.modelConfig.providerNativeAgentCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    mergedCp = profile.providerNativeAgentCompatibility;
  } catch { /* use undefined */ }

  const temperature = resolveModelTemperatureForRequest({
    providerType: selected.providerConfig.type,
    modelId: selected.modelConfig.id,
    modelConfigTemperature: selected.modelConfig.temperature,
    optionsTemperature: options.temperature,
    providerNativeAgentCompatibility: mergedCp,
    fallbackTemperature: DEFAULT_TEMPERATURE,
  });

  const generateOptions: Parameters<typeof generateText>[0] = {
    model: selected.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    abortSignal: options.abortSignal,
  };

  if (temperature !== undefined) {
    generateOptions.temperature = temperature;
  }

  if (selected.modelConfig.maxTokens !== undefined && selected.modelConfig.maxTokens > 0) {
    generateOptions.maxOutputTokens = selected.modelConfig.maxTokens;
  }

  if (options.maxOutputTokens !== undefined && options.maxOutputTokens > 0) {
    generateOptions.maxOutputTokens = options.maxOutputTokens;
  }

  if (options.providerOptions) {
    generateOptions.providerOptions = options.providerOptions as typeof generateOptions.providerOptions;
  }

  try {
    const { text } = await generateText(generateOptions);

    const content = text?.trim() || "";

    if (!content) {
      const durationMs = Date.now() - startTime;
      pushAgentDebugEvent("LLM_CALL_TIMING", {
        purpose: "compose",
        providerType: selected.providerConfig.type,
        modelLabel: selected.modelLabel,
        durationMs,
        success: false,
      });
      throw new Error("模型返回空内容");
    }

    const durationMs = Date.now() - startTime;
    pushAgentDebugEvent("LLM_CALL_TIMING", {
      purpose: "compose",
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelLabel,
      durationMs,
      success: true,
    });

    return { content };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    pushAgentDebugEvent("LLM_CALL_TIMING", {
      purpose: "compose",
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelLabel,
      durationMs,
      success: false,
    });

    const message = err?.message || String(err);
    const providerInfo = `${selected.providerLabel} / ${selected.modelLabel}`;

    if (err?.name === "AbortError" || options.abortSignal?.aborted) {
      throw err;
    }

    if (isProviderUnavailableError(err)) {
      const statusCode = parseInt(err?.statusCode || err?.status || "0", 10) || 0;
      throw new AiProviderUnavailableError({
        providerType: selected.providerConfig.type,
        providerLabel: selected.providerLabel,
        modelId: selected.modelConfig.id,
        status: statusCode,
        errorType: err?.name || "unknown",
        safeMessage: message.split(selected.providerConfig.apiKey || "").join("***").replace(/[a-zA-Z0-9_-]{20,}/g, "***"),
      });
    }

    const rejectionInfo = getProviderRejectionInfo(err);
    if (rejectionInfo.rejected) {
      const wrappedError = new Error(`AI 调用被提供商拒绝 [${providerInfo}]: ${rejectionInfo.message.substring(0, 200)}`);
      (wrappedError as any).cause = err;
      (wrappedError as any).statusCode = rejectionInfo.statusCode;
      (wrappedError as any).status = rejectionInfo.statusCode;
      (wrappedError as any).originalName = rejectionInfo.name;
      (wrappedError as any).providerType = selected.providerConfig.type;
      (wrappedError as any).providerLabel = selected.providerLabel;
      (wrappedError as any).modelLabel = selected.modelLabel;
      (wrappedError as any).providerRejected = true;
      (wrappedError as any).providerRejectionInfo = rejectionInfo;
      throw wrappedError;
    }

    if (message.includes("404") || message.includes("Not Found")) {
      throw new Error(
        `AI 调用失败 [${providerInfo}]: ${message}\n` +
        `请检查模型服务是否正常运行`
      );
    }

    const wrappedError = new Error(`AI 调用失败 [${providerInfo}]: ${message}`);
    (wrappedError as any).cause = err;
    (wrappedError as any).statusCode = err?.statusCode ?? err?.status;
    (wrappedError as any).originalName = err?.name;
    (wrappedError as any).providerType = selected.providerConfig.type;
    (wrappedError as any).providerLabel = selected.providerLabel;
    (wrappedError as any).modelLabel = selected.modelLabel;
    (wrappedError as any).providerRejected = false;
    (wrappedError as any).providerRejectionInfo = getProviderRejectionInfo(err);
    throw wrappedError;
  }
}
export interface StreamChunk {
  /** 本次增量内容 */
  chunk: string;
  /** 当前累积的完整内容 */
  fullContent: string;
}

export interface StreamStatusEvent {
  type: "reasoning-start" | "reasoning-delta" | "reasoning-end" | "text-start" | "text-delta" | "finish" | "error";
  delta?: string;
  fullContent?: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onFinish?: (fullContent: string) => void | Promise<void>;
  onError?: (error: Error) => void;
  onStreamStatus?: (event: StreamStatusEvent) => void;
}

function extractTextDeltaFromStreamPart(part: unknown): string {
  const p = part as Record<string, unknown> | null;
  if (!p) return "";

  const candidateKeys = ["textDelta", "text", "delta", "content", "value"];
  for (const key of candidateKeys) {
    const v = p[key];
    if (v === undefined || v === null) continue;

    if (typeof v === "string") {
      return v;
    }

    if (Array.isArray(v)) {
      const parts: string[] = [];
      for (const item of v) {
        if (typeof item === "string") {
          parts.push(item);
        } else if (item && typeof item === "object" && "text" in item) {
          const t = (item as Record<string, unknown>).text;
          if (typeof t === "string") parts.push(t);
        }
      }
      if (parts.length > 0) return parts.join("");
    }

    if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      for (const subKey of ["text", "content", "value"]) {
        const sub = obj[subKey];
        if (typeof sub === "string") return sub;
      }
    }
  }

  return "";
}

const TEXT_DELTA_TYPES = new Set(["text-delta", "text", "content-delta"]);
const REASONING_DELTA_TYPES = new Set(["reasoning", "reasoning-delta"]);

function logStreamPartSafe(
  part: unknown,
  partIndex: number,
  selected: ReturnType<typeof createSelectedChatModel>,
): void {
  if (!getIsVerboseStreamDebugEnabled()) return;

  const p = part as Record<string, unknown> | null;
  if (!p) return;

  const partType = typeof p.type === "string" ? p.type : "unknown";
  const keys = Object.keys(p);
  const hasTextDelta = typeof p.textDelta === "string" && p.textDelta.length > 0;
  const hasText = typeof p.text === "string" && p.text.length > 0;
  const hasDelta = typeof p.delta === "string" && p.delta.length > 0;
  const extracted = extractTextDeltaFromStreamPart(part);
  const extractedChars = extracted.length;

  pushAgentDebugEvent("LLM_STREAM_PART_SAFE", {
    partIndex,
    partType,
    keys,
    hasTextDelta,
    hasText,
    hasDelta,
    extractedChars,
    providerType: selected.providerConfig.type,
    modelLabel: selected.modelLabel,
  });
}

function buildLlmStreamError(
  err: unknown,
  selected: ReturnType<typeof createSelectedChatModel>,
  fullContent: string,
): Error {
  const message = err instanceof Error ? err.message : String(err);
  const providerInfo = `${selected.providerLabel} / ${selected.modelLabel}`;
  const rejectionInfo = getProviderRejectionInfo(err);

  pushAgentDebugEvent("LLM_STREAM_ERROR_NORMALIZED_SAFE", {
    providerType: selected.providerConfig.type,
    providerLabel: selected.providerLabel,
    modelLabel: selected.modelLabel,
    statusCode: rejectionInfo.statusCode,
    name: (err as any)?.name,
    rejected: rejectionInfo.rejected,
    fullContentChars: fullContent.length,
  }, "warn");

  const rejectionMessagePrefix = rejectionInfo.rejected
    ? `AI 调用被拒绝 [${providerInfo}]: ${rejectionInfo.message.substring(0, 200)}`
    : `AI 流式调用失败 [${providerInfo}]: ${message}`;

  const wrappedError = new Error(rejectionMessagePrefix);
  (wrappedError as any).cause = err;
  (wrappedError as any).statusCode = (err as any)?.statusCode ?? (err as any)?.status;
  (wrappedError as any).status = (err as any)?.status ?? (err as any)?.statusCode;
  (wrappedError as any).originalName = (err as any)?.name;
  (wrappedError as any).name = (err as any)?.name;
  (wrappedError as any).providerType = selected.providerConfig.type;
  (wrappedError as any).providerLabel = selected.providerLabel;
  (wrappedError as any).modelLabel = selected.modelLabel;
  (wrappedError as any).providerRejected = rejectionInfo.rejected;
  (wrappedError as any).providerRejectionInfo = rejectionInfo;

  return wrappedError;
}

/**
 * 流式调用 LLM
 * @internal 仅供 qa/kb-model-call.ts 内部使用，业务层不得直接导入。
 */
export async function streamLlm(
  prompt: string,
  callbacks: StreamCallbacks,
  options: LlmCallOptions = {},
  abortSignal?: AbortSignal
): Promise<void> {
  let selected = options.selectedChatModel;
  if (!selected) {
    const settings = await getKbSettings();
    // 创建选中的模型，优先使用传入的 selection 或运行时上下文
    selected = createSelectedChatModel(
      settings,
      options.chatModelSelection ?? activeChatModelSelection
    );
  }

  // 解析合并后的 provider profile 获取 ProviderNativeAgentCompatibility
  let mergedCp: ProviderNativeAgentCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(selected.providerConfig.type, {
      providerNativeAgentCompatibility: selected.providerConfig.providerNativeAgentCompatibility,
      modelNativeAgentCompatibility: selected.modelConfig.providerNativeAgentCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    mergedCp = profile.providerNativeAgentCompatibility;
  } catch { /* use undefined */ }

  const temperature = resolveModelTemperatureForRequest({
    providerType: selected.providerConfig.type,
    modelId: selected.modelConfig.id,
    modelConfigTemperature: selected.modelConfig.temperature,
    optionsTemperature: options.temperature,
    providerNativeAgentCompatibility: mergedCp,
    fallbackTemperature: DEFAULT_TEMPERATURE,
  });

  // 构建 streamText 参数
  const streamOptions: Parameters<typeof streamText>[0] = {
    model: selected.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    abortSignal,
  };

  if (temperature !== undefined) {
    streamOptions.temperature = temperature;
  }

  // 如果 modelConfig.maxTokens 有值，则映射到 maxOutputTokens
  if (selected.modelConfig.maxTokens !== undefined && selected.modelConfig.maxTokens > 0) {
    streamOptions.maxOutputTokens = selected.modelConfig.maxTokens;
  }

  // 如果 options.maxOutputTokens 有值，覆盖 modelConfig 的值
  if (options.maxOutputTokens !== undefined && options.maxOutputTokens > 0) {
    streamOptions.maxOutputTokens = options.maxOutputTokens;
  }

  if (options.providerOptions) {
    streamOptions.providerOptions = options.providerOptions as any;
  }

  const hasProviderOptions = !!streamOptions.providerOptions;
  const openaiOptions = (streamOptions.providerOptions as any)?.openai ?? {};
  const hasThinkingParam = !!openaiOptions.thinking;
  const thinkingType = openaiOptions.thinking?.type ?? undefined;

  pushAgentDebugEvent("LLM_ADAPTER_REQUEST_BODY_FEATURES_SAFE", {
    purpose: options.purpose ?? "generic",
    mode: "stream",
    hasThinkingParam,
    thinkingType: thinkingType ?? null,
    hasProviderOptions,
  }, "info");

  // fullContent 提升到 try 外部，保证各分支都能安全访问
  let fullContent = "";

  const result = streamText(streamOptions);

  if (result.fullStream) {
    let partCount = 0;
    let textDeltaPartCount = 0;
    let reasoningPartCount = 0;
    let reasoningChars = 0;
    const seenPartTypes = new Set<string>();
    let reasoningStarted = false;
    let textStarted = false;
    const streamStartTime = Date.now();

    try {
      for await (const part of result.fullStream) {
        partCount++;
        const partType = (part as any)?.type ?? "unknown";
        seenPartTypes.add(partType);

        logStreamPartSafe(part, partCount, selected);

        if (REASONING_DELTA_TYPES.has(partType)) {
          const delta = extractTextDeltaFromStreamPart(part);
          if (delta) {
            reasoningPartCount++;
            reasoningChars += delta.length;
            if (!reasoningStarted) {
              reasoningStarted = true;
              callbacks.onStreamStatus?.({ type: "reasoning-start" });
            }
            callbacks.onStreamStatus?.({ type: "reasoning-delta", delta });
          }
        } else if (TEXT_DELTA_TYPES.has(partType)) {
          const delta = extractTextDeltaFromStreamPart(part);
          if (delta) {
            if (reasoningStarted) {
              reasoningStarted = false;
              callbacks.onStreamStatus?.({ type: "reasoning-end" });
            }
            if (!textStarted) {
              textStarted = true;
              const elapsedMs = Date.now() - streamStartTime;
              pushAgentDebugEvent("ANSWER_FIRST_TEXT_DELTA_SAFE", {
                elapsedMsFromStreamStart: elapsedMs,
                reasoningPartCountBeforeText: reasoningPartCount,
                evidenceItemCount: (options as any).__evidenceItemCount ?? 0,
              }, "info");
              callbacks.onStreamStatus?.({ type: "text-start" });
            }
            fullContent += delta;
            textDeltaPartCount++;
            callbacks.onChunk({
              chunk: delta,
              fullContent,
            });
            callbacks.onStreamStatus?.({ type: "text-delta", delta, fullContent });
          }
        } else if (partType === "error") {
          if (reasoningStarted) {
            reasoningStarted = false;
            callbacks.onStreamStatus?.({ type: "reasoning-end" });
          }
          const err = (part as any).error;
          const wrappedError = buildLlmStreamError(err, selected, fullContent);
          callbacks.onStreamStatus?.({ type: "error" });
          callbacks.onError?.(wrappedError);
          throw wrappedError;
        }
      }

      if (reasoningStarted) {
        reasoningStarted = false;
        callbacks.onStreamStatus?.({ type: "reasoning-end" });
      }

      if (!abortSignal?.aborted && !fullContent.trim()) {
        pushAgentDebugEvent("LLM_STREAM_EMPTY_CONTENT_SAFE", {
          providerType: selected.providerConfig.type,
          providerLabel: selected.providerLabel,
          modelLabel: selected.modelLabel,
          partCount,
          textDeltaPartCount,
          reasoningPartCount,
          reasoningChars,
          extractedTextChars: fullContent.length,
          seenPartTypes: [...seenPartTypes],
        }, "warn");

        const wrappedError = new Error("模型流式返回空内容");
        (wrappedError as any).errorType = "EMPTY_STREAM_CONTENT";
        (wrappedError as any).providerType = selected.providerConfig.type;
        (wrappedError as any).providerLabel = selected.providerLabel;
        (wrappedError as any).modelLabel = selected.modelLabel;
        callbacks.onError?.(wrappedError);
        throw wrappedError;
      }

      const streamDurationMs = Date.now() - streamStartTime;
      pushAgentDebugEvent("LLM_STREAM_AGGREGATE_SAFE", {
        providerType: selected.providerConfig.type,
        modelLabel: selected.modelLabel,
        streamPartCount: partCount,
        reasoningPartCount,
        reasoningChars,
        textDeltaPartCount,
        answerChars: fullContent.length,
        durationMs: streamDurationMs,
      }, "info");

      if (hasThinkingParam && reasoningPartCount > 0) {
        // thinkingMode=on: reasoning returned as requested
        pushAgentDebugEvent("PROVIDER_REASONING_CONTROL_EFFECT_SAFE", {
          providerType: selected.providerConfig.type,
          modelLabel: selected.modelLabel,
          reasoningControlApplied: true,
          reasoningPartCount,
          reasoningChars,
          effect: "reasoning_returned_as_requested" as const,
        }, "info");
      } else if (hasThinkingParam) {
        pushAgentDebugEvent("PROVIDER_REASONING_CONTROL_EFFECT_SAFE", {
          providerType: selected.providerConfig.type,
          modelLabel: selected.modelLabel,
          reasoningControlApplied: true,
          reasoningPartCount,
          reasoningChars,
          effect: "reasoning_not_returned" as const,
        }, "info");
      } else if (reasoningPartCount > 0) {
        // thinkingMode=off but provider still returned reasoning — safe debug only
        pushAgentDebugEvent("PROVIDER_REASONING_CONTROL_EFFECT_SAFE", {
          providerType: selected.providerConfig.type,
          modelLabel: selected.modelLabel,
          reasoningControlApplied: false,
          reasoningPartCount,
          reasoningChars,
          effect: "provider_returned_reasoning_when_off",
        }, "info");
      }

      await callbacks.onFinish?.(fullContent);
    } catch (err: any) {
      if (err?.name === "AbortError" || abortSignal?.aborted) {
        if (fullContent.trim().length > 0) {
          await callbacks.onFinish?.(fullContent);
          return;
        }
        pushAgentDebugEvent("LLM_STREAM_LOCAL_ABORT_SUPPRESSED_FINISH_SAFE", {
          providerType: selected.providerConfig.type,
          modelLabel: selected.modelLabel,
          fullContentChars: fullContent.length,
          reason: abortSignal?.reason ?? "unknown",
        });
        const abortError = new Error("stream aborted with empty content");
        (abortError as any).errorType = "LOCAL_ABORT_EMPTY_CONTENT";
        (abortError as any).providerType = selected.providerConfig.type;
        (abortError as any).modelLabel = selected.modelLabel;
        callbacks.onError?.(abortError);
        throw abortError;
      }
      if ((err as any).providerRejectionInfo !== undefined) {
        throw err;
      }
      if ((err as any).errorType === "EMPTY_STREAM_CONTENT") {
        throw err;
      }
      const wrappedError = buildLlmStreamError(err, selected, fullContent);
      callbacks.onError?.(wrappedError);
      throw wrappedError;
    }
  } else {
    // fallback: textStream
    try {
      const { textStream } = result;

      for await (const chunk of textStream) {
        fullContent += chunk;
        callbacks.onChunk({
          chunk,
          fullContent,
        });
      }

      // 非主动取消且模型返回空内容，视为模型错误
      if (!abortSignal?.aborted && !fullContent.trim()) {
        callbacks.onError?.(new Error("模型返回空内容"));
        return;
      }

      await callbacks.onFinish?.(fullContent);
    } catch (err: any) {
      // 如果是用户主动中断，不视为错误
      if (err?.name === "AbortError" || abortSignal?.aborted) {
        await callbacks.onFinish?.(fullContent);
        return;
      }

      const wrappedError = buildLlmStreamError(err, selected, fullContent);
      callbacks.onError?.(wrappedError);
      throw wrappedError;
    }
  }
}
