/**
 * LLM Client — 内部 adapter（仅供 kb-model-call.ts 使用）
 *
 * 职责：
 * - 封装 AI SDK（generateText / streamText）调用
 * - 处理 OpenAI-compatible raw JSON fallback
 * - 提供基础错误处理和 debug 统计
 *
 * 业务层不得直接导入本文件的任何函数或类型。
 * 所有模型调用必须通过 qa/kb-model-call.ts。
 */

import { generateText, streamText, Output } from "ai";
import type { ZodType } from "zod";
import { getKbSettings } from "../settings/kb-settings-service";
import { buildOpenAICompatibleRawJsonRequestBody } from "./openai-compatible-request-body";
import { createSelectedChatModel, resolveOpenAICompatibleBaseUrlForProvider } from "./model-provider-factory";
import type { SelectedChatModelInfo } from "./model-provider-factory";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { ControlPlaneCompatibility } from "../../types/settings";
import { DEFAULT_TEMPERATURE } from "../../constants/default-settings";
import { pushAgentDebugEvent, getIsVerboseStreamDebugEnabled } from "../agent-workbench/debug/workbench-debug";
import { resolveProviderProfile, resolveModelTemperatureForRequest } from "./provider-profile";
import { streamOpenAICompatibleJsonPlanner, type StreamJsonPlannerResultFailure } from "./openai-compatible-stream-json";

// ═══════════════════════════════════════════════════════════════════
// Control plane error with stable reasonCode
// ═══════════════════════════════════════════════════════════════════

export class AgentControlPlaneError extends Error {
  constructor(
    message: string,
    public readonly reasonCode: string,
  ) {
    super(message);
    this.name = "AgentControlPlaneError";
  }
}

// ═══════════════════════════════════════════════════════════════════
// AbortSignal combiner: external signal + timeout
// ═══════════════════════════════════════════════════════════════════

function combineAbortSignal(
  externalSignal?: AbortSignal,
  timeoutMs?: number,
): { signal: AbortSignal; timer: ReturnType<typeof setTimeout> | null } {
  if (!timeoutMs && !externalSignal) {
    return { signal: undefined as unknown as AbortSignal, timer: null };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  if (timeoutMs && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  return { signal: controller.signal, timer };
}

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
  purpose?: "analyze" | "planner" | "compose" | "generic";
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

  // 解析合并后的 provider profile 获取 controlPlaneCompatibility
  let mergedCp: ControlPlaneCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(selected.providerConfig.type, {
      providerControlPlaneCompatibility: selected.providerConfig.controlPlaneCompatibility,
      modelControlPlaneCompatibility: selected.modelConfig.controlPlaneCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    mergedCp = profile.controlPlaneCompatibility;
  } catch { /* use undefined */ }

  const temperature = resolveModelTemperatureForRequest({
    providerType: selected.providerConfig.type,
    modelId: selected.modelConfig.id,
    modelConfigTemperature: selected.modelConfig.temperature,
    optionsTemperature: options.temperature,
    controlPlaneCompatibility: mergedCp,
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

/**
 * 判断 provider 是否支持 AI SDK structuredOutputs
 * 所有入口底层都是 OpenAI-compatible，不原生支持 structuredOutputs
 * @internal — 只在 llm-client 内部使用，业务层不得直接调用
 */
function providerSupportsStructuredOutputs(_providerType: string): boolean {
  return false;
}

/**
 * @internal — 只在 llm-client 内部使用，业务层不得直接调用
 */
function isOpenAICompatibleProtocolProvider(providerType: string): boolean {
  return ["kimi", "kimi-api", "kimi-coding", "mimo", "mimo-api", "mimo-coding-plan", "deepseek", "deepseek-api", "openai-compatible"].includes(providerType);
}

// ==================== 增强 JSON 解析 ====================

function stripThinkingTags(text: string): string {
  let result = text;
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, "");
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");
  return result.trim();
}

interface BalancedJsonCandidate {
  text: string;
  startIndex: number;
  endIndex: number;
}

function extractBalancedJsonObjects(text: string): BalancedJsonCandidate[] {
  const candidates: BalancedJsonCandidate[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === "{") {
      let depth = 0;
      let inString = false;
      let escapeNext = false;
      let j = i;

      for (; j < text.length; j++) {
        const ch = text[j];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (ch === "\\" && inString) {
          escapeNext = true;
          continue;
        }

        if (ch === "\"") {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidateText = text.slice(i, j + 1);
            candidates.push({
              text: candidateText,
              startIndex: i,
              endIndex: j,
            });
            i = j + 1;
            break;
          }
        }
      }

      if (depth !== 0) {
        i++;
      }
    } else {
      i++;
    }
  }

  return candidates;
}

interface ParseLlmJsonObjectResult {
  success: boolean;
  parsed?: unknown;
  candidateCount: number;
  usedCandidateIndex: number;
  errorKind?: string;
  issueCount?: number;
  firstIssueCode?: string;
  firstIssuePath?: string;
}

function safeRepairJsonCandidateText(text: string): string {
  let repaired = text.trim();
  // Remove wrapping code blocks (defensive; upstream already strips most)
  const codeBlockMatch = repaired.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (codeBlockMatch) {
    repaired = codeBlockMatch[1].trim();
  }
  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  return repaired;
}

function parseLlmJsonObjectFromTextSafe<T>(
  rawText: string,
  providerType: string,
  modelLabel: string,
  schema?: ZodType<T>,
  parseMode?: "strict" | "lenient",
): ParseLlmJsonObjectResult {
  // ── Strict mode ──────────────────────────────────────────────
  // stream_json Planner path: rawText.trim() must directly JSON.parse.
  // No code fence extraction, no balanced-JSON search, no repair.
  if (parseMode === "strict") {
    const text = rawText.trim();
    try {
      const parsed = JSON.parse(text);
      if (schema) {
        const result = schema.safeParse(parsed);
        if (result.success) {
          return { success: true, parsed: result.data, candidateCount: 1, usedCandidateIndex: 0 };
        }
        return { success: false, candidateCount: 1, usedCandidateIndex: -1, errorKind: "schema_validation_failed" };
      }
      return { success: true, parsed, candidateCount: 1, usedCandidateIndex: 0 };
    } catch {
      pushAgentDebugEvent("LLM_JSON_STRICT_PARSE_FAILED_SAFE", {
        providerType,
        modelLabel,
        rawChars: text.length,
        parseMode: "strict",
      });
      return { success: false, candidateCount: 1, usedCandidateIndex: -1, errorKind: "invalid_json" };
    }
  }

  // ── Lenient mode (existing) ──────────────────────────────────
  let cleaned = rawText.trim();

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  cleaned = stripThinkingTags(cleaned);

  const candidates = extractBalancedJsonObjects(cleaned);

  if (candidates.length === 0) {
    pushAgentDebugEvent("LLM_JSON_FALLBACK_PARSE_FAILED_SAFE", {
      providerType,
      modelLabel,
      rawChars: cleaned.length,
      candidateCount: 0,
      errorKind: "no_json_found",
    });
    return { success: false, candidateCount: 0, usedCandidateIndex: -1, errorKind: "no_json_found" };
  }

  const parsedCandidates: { parsed: unknown; index: number; repaired: boolean }[] = [];
  let repairAttempted = false;
  let repairSucceeded = false;
  for (let i = 0; i < candidates.length; i++) {
    try {
      const parsed = JSON.parse(candidates[i].text);
      parsedCandidates.push({ parsed, index: i, repaired: false });
    } catch {
      const repairedText = safeRepairJsonCandidateText(candidates[i].text);
      if (repairedText !== candidates[i].text) {
        repairAttempted = true;
        try {
          const parsed = JSON.parse(repairedText);
          parsedCandidates.push({ parsed, index: i, repaired: true });
          repairSucceeded = true;
        } catch {
          // skip still invalid JSON
        }
      }
    }
  }

  if (parsedCandidates.length === 0) {
    pushAgentDebugEvent("LLM_JSON_FALLBACK_PARSE_FAILED_SAFE", {
      providerType,
      modelLabel,
      rawChars: cleaned.length,
      candidateCount: candidates.length,
      errorKind: "json_parse_failed",
      repairAttempted,
      repairSucceeded,
    });
    return { success: false, candidateCount: candidates.length, usedCandidateIndex: -1, errorKind: "json_parse_failed" };
  }

  if (schema) {
    for (const candidate of parsedCandidates) {
      const result = schema.safeParse(candidate.parsed);
      if (result.success) {
        pushAgentDebugEvent("LLM_JSON_FALLBACK_PARSE_REPAIRED_SAFE", {
          providerType,
          modelLabel,
          rawChars: cleaned.length,
          candidateCount: candidates.length,
          usedCandidateIndex: candidate.index,
          repairAttempted,
          repairSucceeded,
        });
        return {
          success: true,
          parsed: result.data,
          candidateCount: candidates.length,
          usedCandidateIndex: candidate.index,
        };
      }
    }

    const firstParsed = parsedCandidates[0].parsed;
    const firstResult = schema.safeParse(firstParsed);
    const issues = !firstResult.success ? firstResult.error.issues : [];

    const parsedObj = firstParsed && typeof firstParsed === "object" ? firstParsed as Record<string, unknown> : {};
    const candidateTopLevelType = typeof parsedObj.type === "string" ? parsedObj.type : undefined;
    const candidateTopLevelKeys = Object.keys(parsedObj).slice(0, 12);
    const argsObj = parsedObj.args && typeof parsedObj.args === "object" && parsedObj.args !== null
      ? parsedObj.args as Record<string, unknown>
      : undefined;
    const candidateArgsKeys = argsObj ? Object.keys(argsObj).slice(0, 12) : undefined;
    const candidateBodyChars = typeof argsObj?.body === "string" ? argsObj.body.length : undefined;
    const refs = argsObj?.references;
    const candidateReferencesType = Array.isArray(refs) ? "array" : refs === undefined ? "undefined" : typeof refs;
    const decisionShape = candidateTopLevelType && !["tool", "answer", "stop"].includes(candidateTopLevelType)
      ? "unknown_type"
      : undefined;

    pushAgentDebugEvent("LLM_JSON_SCHEMA_VALIDATION_SHAPE_SAFE", {
      providerType,
      modelLabel,
      rawChars: cleaned.length,
      candidateCount: candidates.length,
      errorKind: "schema_validation_failed",
      issueCount: issues.length,
      firstIssueCode: issues[0]?.code,
      firstIssuePath: issues[0]?.path?.join("."),
      candidateTopLevelType,
      candidateTopLevelKeys,
      candidateArgsKeys,
      candidateBodyChars,
      candidateReferencesType,
      decisionShape,
      repairAttempted,
      repairSucceeded,
    });
    return {
      success: false,
      candidateCount: candidates.length,
      usedCandidateIndex: -1,
      errorKind: "schema_validation_failed",
      issueCount: issues.length,
      firstIssueCode: issues[0]?.code,
      firstIssuePath: issues[0]?.path?.join("."),
    };
  }

  pushAgentDebugEvent("LLM_JSON_FALLBACK_PARSE_REPAIRED_SAFE", {
    providerType,
    modelLabel,
    rawChars: cleaned.length,
    candidateCount: candidates.length,
    usedCandidateIndex: parsedCandidates[0].index,
    repairAttempted,
    repairSucceeded,
  });
  return {
    success: true,
    parsed: parsedCandidates[0].parsed,
    candidateCount: candidates.length,
    usedCandidateIndex: parsedCandidates[0].index,
  };
}

const CONTROL_PLANE_JSON_MAX_OUTPUT_TOKENS = 800;

/**
 * 从 providerOptions 中安全提取 thinking.type 参数。
 *
 * 接受 "enabled" 和 "disabled"。off 时 kb-model-call 可能对需要显式关闭的 provider 传入 disabled。
 * 本函数只读取 openai/openai-compatible 下的 thinking.type，不把整个 providerOptions 展开到 raw body。
 */
function extractOpenAICompatibleThinkingParams(
  providerOptions: Record<string, Record<string, unknown>> | undefined,
): {
  thinking?: { type: "enabled" | "disabled" };
  enableThinking?: boolean;
} {
  const result: { thinking?: { type: "enabled" | "disabled" }; enableThinking?: boolean } = {};
  if (!providerOptions) return result;
  for (const key of ["openai", "openai-compatible"]) {
    const provider = providerOptions[key];
    if (!provider || typeof provider !== "object") continue;

    // 提取 thinking.type
    const thinking = provider["thinking"];
    if (thinking && typeof thinking === "object") {
      const typeVal = (thinking as Record<string, unknown>)["type"];
      if (typeVal === "enabled" || typeVal === "disabled") {
        result.thinking = { type: typeVal };
      }
    }

    // 提取 enable_thinking
    const enableThinking = provider["enable_thinking"];
    if (typeof enableThinking === "boolean") {
      result.enableThinking = enableThinking;
    }

    break; // 找到一个即可
  }
  return result;
}

async function callOpenAICompatibleRawJsonObjectFallback<T>(
  selected: ReturnType<typeof createSelectedChatModel>,
  prompt: string,
  schema: ZodType<T>,
  options: LlmCallOptions = {},
): Promise<T> {
  const providerConfig = selected.providerConfig;
  const modelId = selected.modelConfig.id;

  const apiKey = providerConfig.apiKey;
  let baseURL = resolveOpenAICompatibleBaseUrlForProvider(providerConfig);

  if (!baseURL) {
    throw new Error("OpenAI-compatible raw fallback: baseUrl 为空");
  }
  if (!baseURL.endsWith("/chat/completions")) {
    if (baseURL.endsWith("/v1")) {
      baseURL = baseURL + "/chat/completions";
    } else {
      baseURL = baseURL + "/v1/chat/completions";
    }
  }

  const purpose = options.purpose ?? "generic";
  const maxTokens = options.maxOutputTokens ?? CONTROL_PLANE_JSON_MAX_OUTPUT_TOKENS;

  // Resolve provider profile for timeout + jsonOutputStrategy
  let profileTimeoutMs: number | undefined;
  let profileEndpointKind: string | undefined;
  let jsonOutputStrategy: "raw_prompt" | "response_format_json_object" | undefined;
  let tokenParamStrategy: "max_tokens" | "max_completion_tokens" | undefined;
  let mergedCp: ControlPlaneCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(providerConfig.type, {
      providerControlPlaneCompatibility: selected.providerConfig.controlPlaneCompatibility,
      modelControlPlaneCompatibility: selected.modelConfig.controlPlaneCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    profileTimeoutMs = profile.controlPlaneTimeoutMs;
    profileEndpointKind = profile.endpointKind;
    jsonOutputStrategy = profile.controlPlaneCompatibility?.jsonOutputStrategy;
    tokenParamStrategy = profile.controlPlaneCompatibility?.tokenParamStrategy;
    mergedCp = profile.controlPlaneCompatibility;
  } catch {
    // profile 解析失败，使用默认
  }

  pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_START_SAFE", {
    providerType: providerConfig.type,
    modelLabel: modelId,
    purpose,
    rawPromptMode: "system_user_json_contract",
    jsonOutputStrategy: jsonOutputStrategy ?? "raw_prompt",
  });

  // 在 buildBody 之前提取 thinking 参数，供后续写入 raw body
  const extractedThinking = extractOpenAICompatibleThinkingParams(options.providerOptions);

  const buildBody = () => {
    const systemContent = "你是控制面 JSON 输出器，只能输出一个合法 JSON object；第一个字符必须是 {，最后一个字符必须是 }；禁止 Markdown、解释、思考过程、自然语言前后缀。";

    const temperature = resolveModelTemperatureForRequest({
      providerType: providerConfig.type,
      modelId,
      modelConfigTemperature: selected.modelConfig.temperature,
      optionsTemperature: purpose === "planner" ? undefined : options.temperature,
      controlPlaneCompatibility: mergedCp,
      fallbackTemperature: DEFAULT_TEMPERATURE,
    });

    const body = buildOpenAICompatibleRawJsonRequestBody({
      modelId,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt },
      ],
      maxTokens,
      temperature,
      jsonOutputStrategy,
      thinkingParams: extractedThinking,
      tokenParamStrategy,
    });

    pushAgentDebugEvent("LLM_JSON_RAW_REQUEST_BODY_FEATURES_SAFE", {
      hasProviderOptions: !!options.providerOptions,
      hasThinkingParam: !!extractedThinking.thinking,
      thinkingType: extractedThinking.thinking?.type ?? null,
      hasEnableThinkingParam: typeof extractedThinking.enableThinking === "boolean",
      enableThinkingValue: extractedThinking.enableThinking ?? null,
      requestMode: purpose,
      jsonOutputStrategy: jsonOutputStrategy ?? "raw_prompt",
      tokenParamStrategy,
    });

    return body;
  };

  const doFetch = async (body: Record<string, unknown>): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const { signal, timer } = combineAbortSignal(options.abortSignal, profileTimeoutMs);
    try {
      const res = await fetch(baseURL, { method: "POST", headers, body: JSON.stringify(body), signal });
      return res;
    } catch (fetchErr: any) {
      if (options.abortSignal?.aborted) {
        throw new AgentControlPlaneError("用户取消了操作。", "user_aborted");
      }
      if (signal?.aborted && (!options.abortSignal || !options.abortSignal.aborted)) {
        if (profileEndpointKind === "coding_plan") {
          pushAgentDebugEvent("CONTROL_PLANE_TIMEOUT_DIAG_SAFE", {
            endpointKind: profileEndpointKind,
            detail: "Coding Plan 可能不适合作为 Planner JSON 控制面",
          }, "debug");
        }
        throw new AgentControlPlaneError("模型没有在设定时间内返回可继续执行的内容。", "control_plane_timeout");
      }
      throw fetchErr;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const extractContent = (data: unknown): { content: string; reasoningChars: number; reasoningCount: number } => {
    const d = data as Record<string, unknown>;
    const choices = d?.choices;
    if (!Array.isArray(choices) || choices.length === 0) return { content: "", reasoningChars: 0, reasoningCount: 0 };
    const msg = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    if (!msg) return { content: "", reasoningChars: 0, reasoningCount: 0 };
    const content = typeof msg.content === "string" ? msg.content : "";
    let reasoningChars = 0;
    let reasoningCount = 0;
    for (const key of ["reasoning_content", "reasoning", "thinking"]) {
      const val = msg[key];
      if (typeof val === "string" && val.length > 0) {
        reasoningChars += val.length;
        reasoningCount++;
      }
    }
    return { content, reasoningChars, reasoningCount };
  };

  let response: Response;
  try {
    response = await doFetch(buildBody());
  } catch (fetchErr: any) {
    if (fetchErr instanceof AgentControlPlaneError) throw fetchErr;
    pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: "fetch_failed",
      errorName: fetchErr?.name,
      sanitizedMessage: String(fetchErr?.message || fetchErr).slice(0, 120),
    });
    throw new AgentControlPlaneError("模型请求失败。", "control_plane_fetch_failed");
  }

  // 不再 retry：jsonOutputStrategy 决定一次请求，失败即 fail closed
  if (!response.ok) {
    const statusCode = response.status;
    let httpErrorCode: string;
    if (statusCode === 401) httpErrorCode = "http_401";
    else if (statusCode === 403) httpErrorCode = "http_403";
    else if (statusCode === 429) httpErrorCode = "http_429";
    else if (statusCode >= 500) httpErrorCode = "http_5xx";
    else httpErrorCode = "http_xxx";
    pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: `http_${statusCode}`,
      httpStatus: statusCode,
    });
    const httpMessageMap: Record<string, string> = {
      "http_401": "连接失败：当前 API Key 未通过鉴权。",
      "http_403": "连接失败：当前 API Key 没有调用该模型的权限。",
      "http_429": "请求过于频繁或额度受限，请稍后重试。",
      "http_5xx": "服务商暂时无法完成请求，请稍后重试。",
      "http_xxx": "模型请求失败。",
    };
    const userSafeMessage = httpMessageMap[httpErrorCode] ?? "模型请求失败。";
    throw new AgentControlPlaneError(userSafeMessage, httpErrorCode);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: "json_parse_failed",
    });
    throw new AgentControlPlaneError("模型响应格式不符合要求。", "json_parse_failed");
  }

  const { content, reasoningChars, reasoningCount } = extractContent(data);

  // 如果 thinking=disabled 但 provider 仍返回 reasoning，记录 debug（不阻止解析 content）
  const requestedThinkingDisabled = extractedThinking?.thinking?.type === "disabled";
  if (requestedThinkingDisabled && reasoningCount > 0 && reasoningChars > 0) {
    pushAgentDebugEvent("PROVIDER_RETURNED_REASONING_WHEN_DISABLED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      reasoningChars,
      reasoningCount,
    }, "warn");
  }

  pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_RESULT_SAFE", {
    providerType: providerConfig.type,
    modelLabel: modelId,
    purpose,
    contentChars: content.length,
    reasoningChars,
    reasoningCount,
  });

  if (!content || content.trim().length === 0) {
    if (reasoningCount > 0 && reasoningChars > 0) {
      pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE", {
        providerType: providerConfig.type,
        modelLabel: modelId,
        purpose,
        errorKind: "reasoning_only_control_plane",
      });
      throw new AgentControlPlaneError("模型没有返回可执行内容。", "reasoning_only_control_plane");
    }
    pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: "empty_content",
    });
    throw new AgentControlPlaneError("模型没有返回可执行内容。", "empty_content");
  }

  const parseResult = parseLlmJsonObjectFromTextSafe(content, providerConfig.type, modelId, schema);
  if (!parseResult.success) {
    pushAgentDebugEvent("LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: parseResult.errorKind,
    });
    throw new AgentControlPlaneError("模型输出格式不符合自动操作要求。", "invalid_json");
  }

  return parseResult.parsed as T;
}

/**
 * 流式 JSON Planner：通过 SSE 流式接收 content，结束后严格 JSON.parse。
 * 与 callOpenAICompatibleRawJsonObjectFallback 共用请求体构造逻辑。
 */
async function callOpenAICompatibleRawJsonObjectStream<T>(
  selected: ReturnType<typeof createSelectedChatModel>,
  prompt: string,
  schema: ZodType<T>,
  options: LlmCallOptions = {},
): Promise<T> {
  const providerConfig = selected.providerConfig;
  const modelId = selected.modelConfig.id;

  const apiKey = providerConfig.apiKey;
  let baseURL = resolveOpenAICompatibleBaseUrlForProvider(providerConfig);

  if (!baseURL) {
    throw new AgentControlPlaneError("配置错误：服务地址未配置。", "invalid_args");
  }
  if (!baseURL.endsWith("/chat/completions")) {
    if (baseURL.endsWith("/v1")) {
      baseURL = baseURL + "/chat/completions";
    } else {
      baseURL = baseURL + "/v1/chat/completions";
    }
  }

  const purpose = options.purpose ?? "generic";
  const maxTokens = options.maxOutputTokens ?? CONTROL_PLANE_JSON_MAX_OUTPUT_TOKENS;

  // Resolve provider profile
  let jsonOutputStrategy: "raw_prompt" | "response_format_json_object" | undefined;
  let tokenParamStrategy: "max_tokens" | "max_completion_tokens" | undefined;
  let idleTimeoutMs = 30000;
  let mergedCp: ControlPlaneCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(providerConfig.type, {
      providerControlPlaneCompatibility: selected.providerConfig.controlPlaneCompatibility,
      modelControlPlaneCompatibility: selected.modelConfig.controlPlaneCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    jsonOutputStrategy = profile.controlPlaneCompatibility?.jsonOutputStrategy;
    tokenParamStrategy = profile.controlPlaneCompatibility?.tokenParamStrategy;
    idleTimeoutMs = profile.controlPlaneTimeoutMs ?? 30000;
    // 流式模式下 timeoutMs 语义为 idle timeout，最小 30s，最大 300s
    idleTimeoutMs = Math.max(30000, Math.min(300000, idleTimeoutMs));
    mergedCp = profile.controlPlaneCompatibility;
  } catch {
    // defaults
  }

  const temperature = resolveModelTemperatureForRequest({
    providerType: providerConfig.type,
    modelId,
    modelConfigTemperature: selected.modelConfig.temperature,
    optionsTemperature: purpose === "planner" ? undefined : options.temperature,
    controlPlaneCompatibility: mergedCp,
    fallbackTemperature: DEFAULT_TEMPERATURE,
  });

  const extractedThinking = extractOpenAICompatibleThinkingParams(options.providerOptions);

  const systemContent = "你是控制面 JSON 输出器，只能输出一个合法 JSON object；第一个字符必须是 {，最后一个字符必须是 }；禁止 Markdown、解释、思考过程、自然语言前后缀。";

  const body = buildOpenAICompatibleRawJsonRequestBody({
    modelId,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: prompt },
    ],
    maxTokens,
    temperature,
    jsonOutputStrategy,
    thinkingParams: extractedThinking,
    tokenParamStrategy,
  });

  pushAgentDebugEvent("LLM_JSON_STREAM_START_SAFE", {
    providerType: providerConfig.type,
    modelLabel: modelId,
    purpose,
    transport: "stream_json",
    jsonOutputStrategy: jsonOutputStrategy ?? "raw_prompt",
    idleTimeoutMs,
  });

  const result = await streamOpenAICompatibleJsonPlanner({
    endpoint: baseURL,
    apiKey,
    body,
    idleTimeoutMs,
    abortSignal: options.abortSignal,
  });

  if (!result.success) {
    const failResult = result as StreamJsonPlannerResultFailure;
    pushAgentDebugEvent("LLM_JSON_STREAM_FAILED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      idleTimeoutMs,
      timeoutMode: "idle",
      errorCode: failResult.errorCode,
      reasoningChars: failResult.reasoningChars,
      reasoningCount: failResult.reasoningCount,
      contentCharsSoFar: failResult.contentCharsSoFar,
      receivedDoneSignal: failResult.receivedDoneSignal,
      finishReason: failResult.finishReason,
      malformedLineCount: failResult.malformedLineCount,
      transport: "stream_json",
    });
    throw new AgentControlPlaneError(failResult.message, failResult.errorCode);
  }

  pushAgentDebugEvent("LLM_JSON_STREAM_RESULT_SAFE", {
    providerType: providerConfig.type,
    modelLabel: modelId,
    contentChars: result.content.length,
    reasoningChars: result.reasoningChars,
    reasoningCount: result.reasoningCount,
    receivedDoneSignal: result.receivedDoneSignal,
    finishReason: result.finishReason,
    malformedLineCount: result.malformedLineCount,
    idleTimeoutMs,
    timeoutMode: "idle",
    transport: "stream_json",
  });

  // JSON parse + schema validation
  const parseResult = parseLlmJsonObjectFromTextSafe(result.content, providerConfig.type, modelId, schema, "strict");
  if (!parseResult.success) {
    pushAgentDebugEvent("LLM_JSON_STREAM_FAILED_SAFE", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      errorCode: parseResult.errorKind,
      contentChars: result.content.length,
      idleTimeoutMs,
      timeoutMode: "idle",
      transport: "stream_json",
    });
    throw new AgentControlPlaneError("模型输出格式不符合自动操作要求。", "invalid_json");
  }

  return parseResult.parsed as T;
}

/**
 * 对不支持 structuredOutputs 的提供商，用纯文本 + JSON 解析获取结构化对象
 */
async function callLlmObjectFallback<T>(
  selected: ReturnType<typeof createSelectedChatModel>,
  prompt: string,
  schema: ZodType<T>,
  options: LlmCallOptions = {},
): Promise<T> {
  const purpose = options.purpose ?? "generic";

  const isOpenAICompatibleEarly = isOpenAICompatibleProtocolProvider(selected.providerConfig.type);
  const defaultRawFirst = isOpenAICompatibleEarly && purpose !== "generic";

  let profileRawFirst = false;
  let plannerTransport: "non_stream_json" | "stream_json" = "non_stream_json";
  let mergedCp: ControlPlaneCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(selected.providerConfig.type, {
      providerControlPlaneCompatibility: selected.providerConfig.controlPlaneCompatibility,
      modelControlPlaneCompatibility: selected.modelConfig.controlPlaneCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    profileRawFirst = profile.controlPlaneStrategy === "raw_first";
    plannerTransport = (profile.plannerTransport
      ?? selected.modelConfig.controlPlaneCompatibility?.plannerTransport
      ?? selected.providerConfig.controlPlaneCompatibility?.plannerTransport
      ?? "non_stream_json") as "non_stream_json" | "stream_json";
    mergedCp = profile.controlPlaneCompatibility;
  } catch {
    // profile 解析失败，使用默认行为
  }

  const temperature = resolveModelTemperatureForRequest({
    providerType: selected.providerConfig.type,
    modelId: selected.modelConfig.id,
    modelConfigTemperature: selected.modelConfig.temperature,
    optionsTemperature: options.temperature,
    controlPlaneCompatibility: mergedCp,
    fallbackTemperature: DEFAULT_TEMPERATURE,
  });

  const useRawFirst = defaultRawFirst || profileRawFirst;

  // 只调用一次模型并进行本地严格解析；失败抛出稳定 reasonCode，由 AgentLoop 决定是否作为协议错误 observation 处理。
  if (useRawFirst) {
    // 流式模式：通过 SSE 流式接收 content，结束后严格 JSON.parse
    if (plannerTransport === "stream_json") {
      try {
        return await callOpenAICompatibleRawJsonObjectStream(selected, prompt, schema, options);
      } catch (streamErr) {
        if (streamErr instanceof AgentControlPlaneError) throw streamErr;
        pushAgentDebugEvent("LLM_JSON_FALLBACK_FAILED_SAFE", {
          errorName: (streamErr as any)?.name ?? "unknown",
          sanitizedMessage: String((streamErr as any)?.message ?? streamErr).slice(0, 200),
        }, "warn");
        throw new AgentControlPlaneError("模型没有返回可继续执行的内容。", "planner_model_call_failed");
      }
    }

    // 非流式模式：现有路径
    try {
      return await callOpenAICompatibleRawJsonObjectFallback(selected, prompt, schema, options);
    } catch (rawErr) {
      if (rawErr instanceof AgentControlPlaneError) throw rawErr;
      pushAgentDebugEvent("LLM_JSON_FALLBACK_FAILED_SAFE", {
        errorName: (rawErr as any)?.name ?? "unknown",
        sanitizedMessage: String((rawErr as any)?.message ?? rawErr).slice(0, 200),
      }, "warn");
      throw new AgentControlPlaneError("模型没有返回可继续执行的内容。", "planner_model_call_failed");
    }
  }

  const generateOptions: Parameters<typeof generateText>[0] = {
    model: selected.model,
    messages: [{ role: "user", content: prompt }],
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

  const result = await generateText(generateOptions);
  const text = typeof result.text === "string" ? result.text : "";

  if (!text || text.trim().length === 0) {
    throw new AgentControlPlaneError("模型没有返回可执行内容。", "empty_content");
  }

  const parseResult = parseLlmJsonObjectFromTextSafe(
    text,
    selected.providerConfig.type,
    selected.modelConfig.id,
    schema,
  );

  if (!parseResult.success) {
    throw new AgentControlPlaneError("模型输出格式不符合自动操作要求。", "invalid_json");
  }

  return parseResult.parsed as T;
}

/**
 * @internal 仅供 qa/kb-model-call.ts 内部使用，业务层不得直接导入。
 */
export async function callLlmObject<T>(
  prompt: string,
  schema: ZodType<T>,
  options: LlmCallOptions = {}
): Promise<T> {
  let selected = options.selectedChatModel;
  if (!selected) {
    const settings = await getKbSettings();
    selected = createSelectedChatModel(
      settings,
      options.chatModelSelection ?? activeChatModelSelection
    );
  }

  if (!providerSupportsStructuredOutputs(selected.providerConfig.type)) {
    return callLlmObjectFallback(selected, prompt, schema, options);
  }

  // 解析合并后的 provider profile 获取 controlPlaneCompatibility
  let mergedCp: ControlPlaneCompatibility | undefined;
  try {
    const p = resolveProviderProfile(selected.providerConfig.type, {
      providerControlPlaneCompatibility: selected.providerConfig.controlPlaneCompatibility,
      modelControlPlaneCompatibility: selected.modelConfig.controlPlaneCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    mergedCp = p.controlPlaneCompatibility;
  } catch { /* use undefined */ }

  const temperature = resolveModelTemperatureForRequest({
    providerType: selected.providerConfig.type,
    modelId: selected.modelConfig.id,
    modelConfigTemperature: selected.modelConfig.temperature,
    optionsTemperature: options.temperature,
    controlPlaneCompatibility: mergedCp,
    fallbackTemperature: DEFAULT_TEMPERATURE,
  });

  // 构建 generateText 参数
  const generateOptions: Parameters<typeof generateText>[0] = {
    model: selected.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    output: Output.object({ schema }),
    abortSignal: options.abortSignal,
  };

  if (temperature !== undefined) {
    generateOptions.temperature = temperature;
  }

  // 如果 modelConfig.maxTokens 有值，则映射到 maxOutputTokens
  if (selected.modelConfig.maxTokens !== undefined && selected.modelConfig.maxTokens > 0) {
    generateOptions.maxOutputTokens = selected.modelConfig.maxTokens;
  }

  // 如果 options.maxOutputTokens 有值，覆盖 modelConfig 的值
  if (options.maxOutputTokens !== undefined && options.maxOutputTokens > 0) {
    generateOptions.maxOutputTokens = options.maxOutputTokens;
  }

  // providerOptions 真实传递
  if (options.providerOptions) {
    generateOptions.providerOptions = options.providerOptions as typeof generateOptions.providerOptions;
  }

  try {
    const { output } = await generateText(generateOptions);

    if (!output) {
      throw new Error("模型返回空结构化输出");
    }

    return output;
  } catch (err: any) {
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

    if (message.includes("404") || message.includes("Not Found")) {
      throw new Error(
        `AI 调用失败 [${providerInfo}]: ${message}\n` +
        `请检查模型服务是否正常运行`
      );
    }

    throw new Error(`AI 结构化输出调用失败 [${providerInfo}]: ${message}`);
  }
}

// ==================== 流式输出接口 ====================

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

  // 解析合并后的 provider profile 获取 controlPlaneCompatibility
  let mergedCp: ControlPlaneCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(selected.providerConfig.type, {
      providerControlPlaneCompatibility: selected.providerConfig.controlPlaneCompatibility,
      modelControlPlaneCompatibility: selected.modelConfig.controlPlaneCompatibility,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    mergedCp = profile.controlPlaneCompatibility;
  } catch { /* use undefined */ }

  const temperature = resolveModelTemperatureForRequest({
    providerType: selected.providerConfig.type,
    modelId: selected.modelConfig.id,
    modelConfigTemperature: selected.modelConfig.temperature,
    optionsTemperature: options.temperature,
    controlPlaneCompatibility: mergedCp,
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
