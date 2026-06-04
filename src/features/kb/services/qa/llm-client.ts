/**
 * LLM Client
 * 模型调用封装 - 基于 AI SDK Core
 *
 * 职责：
 * - 统一封装 AI SDK 调用
 * - 提供基础错误处理
 * - 为后续 streaming 预留扩展点
 * - 支持本轮模型选择覆盖
 *
 * 注意：
 * - 当前阶段主要使用 generateText（非流式）
 * - streamText 接口已预留，但 UI 暂不切换
 */

import { generateText, streamText, Output } from "ai";
import type { ZodType } from "zod";
import { getKbSettings } from "../settings/kb-settings-service";
import { createSelectedChatModel, resolveOpenAICompatibleBaseUrlForProvider } from "./model-provider-factory";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import { DEFAULT_TEMPERATURE } from "../../constants/default-settings";
import { pushAgentDebugEvent, getIsVerboseStreamDebugEnabled } from "../agentic-rag/debug/agentic-rag-debug";
import { resolveProviderProfile, buildReasoningProviderOptionsFromProfile } from "./provider-profile";

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

function sanitizeTemperatureForProvider(
  providerType: string,
  temperature: number,
): number | undefined {
  if (providerType === "kimi") {
    return undefined;
  }
  return temperature;
}

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
  /** 推理力度控制：low=最小推理，medium=适度推理，none=禁用深度推理 */
  reasoningEffort?: "low" | "medium" | "none";
  /** 预构建的 providerOptions（优先于 reasoningEffort + buildReasoningProviderOptions） */
  providerOptions?: Record<string, Record<string, unknown>>;
  /** 调用目的，用于日志区分 */
  purpose?: "analyze" | "planner" | "compose" | "generic";
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
 * @param prompt 提示词
 * @param options 可选参数
 * @returns 模型返回的文本内容
 */
export async function callLlm(
  prompt: string,
  options: LlmCallOptions = {}
): Promise<LlmResponse> {
  const settings = await getKbSettings();

  const selected = createSelectedChatModel(
    settings,
    options.chatModelSelection ?? activeChatModelSelection
  );

  const startTime = Date.now();

  const rawTemperature =
    options.temperature ??
    selected.modelConfig.temperature ??
    DEFAULT_TEMPERATURE;

  const temperature = sanitizeTemperatureForProvider(
    selected.providerConfig.type,
    Number(rawTemperature),
  );

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

  try {
    const { text } = await generateText(generateOptions);

    const content = text?.trim() || "";

    if (!content) {
      const durationMs = Date.now() - startTime;
      console.info("[KB-AGENT | LLM_CALL_TIMING]", {
        purpose: "compose",
        providerType: selected.providerConfig.type,
        modelLabel: selected.modelLabel,
        durationMs,
        success: false,
      });
      throw new Error("模型返回空内容");
    }

    const durationMs = Date.now() - startTime;
    console.info("[KB-AGENT | LLM_CALL_TIMING]", {
      purpose: "compose",
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelLabel,
      durationMs,
      success: true,
    });

    return { content };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.info("[KB-AGENT | LLM_CALL_TIMING]", {
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
 * 调用 LLM 获取结构化 JSON 输出
 * @param prompt 提示词
 * @param options 可选参数
 * @returns 解析后的 JSON 对象
 */
export async function callLlmJson<T = unknown>(
  prompt: string,
  options: LlmCallOptions = {}
): Promise<T> {
  const response = await callLlm(prompt, options);

  try {
    // 尝试提取 JSON 块（如果模型输出了 markdown 代码块）
    const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleanText = jsonMatch ? jsonMatch[1].trim() : response.content.trim();
    return JSON.parse(cleanText) as T;
  } catch (err) {
    throw new Error(`JSON 解析失败: ${err}`);
  }
}

/**
 * 判断 provider 是否支持 AI SDK structuredOutputs
 * 所有四个入口底层都是 OpenAI-compatible，不原生支持 structuredOutputs
 */
export function providerSupportsStructuredOutputs(_providerType: string): boolean {
  return false;
}

export function isOpenAICompatibleProtocolProvider(providerType: string): boolean {
  return ["kimi", "kimi-api", "kimi-coding", "mimo", "mimo-api", "mimo-coding-plan", "deepseek", "deepseek-api", "openai-compatible"].includes(providerType);
}

export function providerSupportsReasoningControl(providerType: string): boolean {
  return ["mimo", "mimo-api", "mimo-coding-plan"].includes(providerType);
}

/**
 * 将 reasoningEffort 转换为 AI SDK providerOptions。
 *
 * 委托给 provider-profile 的能力映射：
 * - 仅当 provider profile supportsReasoningControl 时才返回 providerOptions；
 * - effort === "none" 时返回 undefined；
 * - openai_effort 风格返回 `{ openai: { reasoning_effort: effort } }`；
 * - 不支持的 provider 不强行写 providerOptions。
 */
function buildReasoningProviderOptions(
  providerType: string,
  effort: "low" | "medium" | "none",
): Record<string, Record<string, unknown>> | undefined {
  const profile = resolveProviderProfile(providerType);
  return buildReasoningProviderOptionsFromProfile(profile, effort);
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

function parseLlmJsonObjectFromTextSafe<T>(
  rawText: string,
  providerType: string,
  modelLabel: string,
  schema?: ZodType<T>,
): ParseLlmJsonObjectResult {
  let cleaned = rawText.trim();

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  cleaned = stripThinkingTags(cleaned);

  const candidates = extractBalancedJsonObjects(cleaned);

  if (candidates.length === 0) {
    console.info("[KB-AGENT | LLM_JSON_FALLBACK_PARSE_FAILED_SAFE]", {
      providerType,
      modelLabel,
      rawChars: cleaned.length,
      candidateCount: 0,
      errorKind: "no_json_found",
    });
    return { success: false, candidateCount: 0, usedCandidateIndex: -1, errorKind: "no_json_found" };
  }

  const parsedCandidates: { parsed: unknown; index: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    try {
      const parsed = JSON.parse(candidates[i].text);
      parsedCandidates.push({ parsed, index: i });
    } catch {
      // skip invalid JSON
    }
  }

  if (parsedCandidates.length === 0) {
    console.info("[KB-AGENT | LLM_JSON_FALLBACK_PARSE_FAILED_SAFE]", {
      providerType,
      modelLabel,
      rawChars: cleaned.length,
      candidateCount: candidates.length,
      errorKind: "json_parse_failed",
    });
    return { success: false, candidateCount: candidates.length, usedCandidateIndex: -1, errorKind: "json_parse_failed" };
  }

  if (schema) {
    for (const candidate of parsedCandidates) {
      const result = schema.safeParse(candidate.parsed);
      if (result.success) {
        console.info("[KB-AGENT | LLM_JSON_FALLBACK_PARSE_REPAIRED_SAFE]", {
          providerType,
          modelLabel,
          rawChars: cleaned.length,
          candidateCount: candidates.length,
          usedCandidateIndex: candidate.index,
        });
        return {
          success: true,
          parsed: result.data,
          candidateCount: candidates.length,
          usedCandidateIndex: candidate.index,
        };
      }
    }

    const firstResult = schema.safeParse(parsedCandidates[0].parsed);
    const issues = !firstResult.success ? firstResult.error.issues : [];
    console.info("[KB-AGENT | LLM_JSON_FALLBACK_PARSE_FAILED_SAFE]", {
      providerType,
      modelLabel,
      rawChars: cleaned.length,
      candidateCount: candidates.length,
      errorKind: "schema_validation_failed",
      issueCount: issues.length,
      firstIssueCode: issues[0]?.code,
      firstIssuePath: issues[0]?.path?.join("."),
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

  console.info("[KB-AGENT | LLM_JSON_FALLBACK_PARSE_REPAIRED_SAFE]", {
    providerType,
    modelLabel,
    rawChars: cleaned.length,
    candidateCount: candidates.length,
    usedCandidateIndex: parsedCandidates[0].index,
  });
  return {
    success: true,
    parsed: parsedCandidates[0].parsed,
    candidateCount: candidates.length,
    usedCandidateIndex: parsedCandidates[0].index,
  };
}

const JSON_FALLBACK_MAX_RETRIES = 1;
const JSON_FALLBACK_RETRY_SUFFIX = "\n\n=== 重试指令 ===\n上次输出不是合法 schema JSON。请重新输出。只能输出一个 JSON object，第一个字符 {，最后一个字符 }，不要 Markdown，不要解释，不要思考过程。";

export const CONTROL_PLANE_JSON_MAX_OUTPUT_TOKENS = 800;

interface ControlPlaneJsonObservation {
  providerType: string;
  modelLabel: string;
  controlPlaneJsonMode: "ai_sdk_first" | "raw_first";
  rawFallbackSuccessCount: number;
  aiSdkEmptyOrInvalidCount: number;
  lastUpdatedAt: number;
}

const CONTROL_PLANE_OBSERVATION_STORAGE_KEY = "kb_cp_json_obs_v1";
const CONTROL_PLANE_OBSERVATION_TTL_MS = 1000 * 60 * 60 * 4;

function loadControlPlaneObservationFromStorage(): Map<string, ControlPlaneJsonObservation> {
  const map = new Map<string, ControlPlaneJsonObservation>();
  try {
    const raw = sessionStorage.getItem(CONTROL_PLANE_OBSERVATION_STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, ControlPlaneJsonObservation>;
    const now = Date.now();
    for (const [key, obs] of Object.entries(parsed)) {
      if (now - obs.lastUpdatedAt < CONTROL_PLANE_OBSERVATION_TTL_MS) {
        map.set(key, obs);
      }
    }
  } catch {
    // sessionStorage unavailable or corrupt
  }
  return map;
}

function persistControlPlaneObservationToStorage(cache: Map<string, ControlPlaneJsonObservation>): void {
  try {
    const obj: Record<string, ControlPlaneJsonObservation> = {};
    for (const [key, obs] of cache) {
      obj[key] = obs;
    }
    sessionStorage.setItem(CONTROL_PLANE_OBSERVATION_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // sessionStorage unavailable
  }
}

const controlPlaneJsonObservationCache = loadControlPlaneObservationFromStorage();

function getControlPlaneJsonObservationKey(providerType: string, modelLabel: string): string {
  return `${providerType}:${modelLabel}`;
}

function getControlPlaneJsonObservation(providerType: string, modelLabel: string): ControlPlaneJsonObservation | undefined {
  return controlPlaneJsonObservationCache.get(getControlPlaneJsonObservationKey(providerType, modelLabel));
}

function updateControlPlaneJsonObservation(
  providerType: string,
  modelLabel: string,
  event: "raw_success" | "ai_sdk_empty_or_invalid",
): void {
  const key = getControlPlaneJsonObservationKey(providerType, modelLabel);
  const existing = controlPlaneJsonObservationCache.get(key);
  if (!existing) {
    const obs: ControlPlaneJsonObservation = {
      providerType,
      modelLabel,
      controlPlaneJsonMode: "raw_first",
      rawFallbackSuccessCount: event === "raw_success" ? 1 : 0,
      aiSdkEmptyOrInvalidCount: event === "ai_sdk_empty_or_invalid" ? 1 : 0,
      lastUpdatedAt: Date.now(),
    };
    controlPlaneJsonObservationCache.set(key, obs);
    console.info("[KB-AGENT | CONTROL_PLANE_JSON_OBSERVATION_RECORDED_SAFE]", {
      providerType,
      modelLabel,
      mode: obs.controlPlaneJsonMode,
      reason: event,
      rawFallbackSuccessCount: obs.rawFallbackSuccessCount,
      aiSdkEmptyOrInvalidCount: obs.aiSdkEmptyOrInvalidCount,
    });
    persistControlPlaneObservationToStorage(controlPlaneJsonObservationCache);
    return;
  }
  if (event === "raw_success") {
    existing.rawFallbackSuccessCount++;
  } else {
    existing.aiSdkEmptyOrInvalidCount++;
  }
  existing.controlPlaneJsonMode = "raw_first";
  existing.lastUpdatedAt = Date.now();
  console.info("[KB-AGENT | CONTROL_PLANE_JSON_OBSERVATION_RECORDED_SAFE]", {
    providerType,
    modelLabel,
    mode: existing.controlPlaneJsonMode,
    reason: event,
    rawFallbackSuccessCount: existing.rawFallbackSuccessCount,
    aiSdkEmptyOrInvalidCount: existing.aiSdkEmptyOrInvalidCount,
  });
  persistControlPlaneObservationToStorage(controlPlaneJsonObservationCache);
}

function shouldUseRawFirst(providerType: string, modelLabel: string): boolean {
  const obs = getControlPlaneJsonObservation(providerType, modelLabel);
  const result = obs?.controlPlaneJsonMode === "raw_first";
  if (obs) {
    console.info("[KB-AGENT | CONTROL_PLANE_JSON_MODE_RESOLVED_SAFE]", {
      providerType,
      modelLabel,
      mode: obs.controlPlaneJsonMode,
      rawFirst: result,
      rawFallbackSuccessCount: obs.rawFallbackSuccessCount,
      aiSdkEmptyOrInvalidCount: obs.aiSdkEmptyOrInvalidCount,
    });
  }
  return result;
}

function buildSchemaAwareJsonRetryPrompt(originalPrompt: string): string {
  return originalPrompt + JSON_FALLBACK_RETRY_SUFFIX;
}

function safeGetNumber(obj: unknown, key: string): number | undefined {
  try {
    const v = (obj as Record<string, unknown>)?.[key];
    return typeof v === "number" ? v : undefined;
  } catch {
    return undefined;
  }
}

function safeGetFinishReason(result: unknown): string | undefined {
  try {
    const r = result as Record<string, unknown>;
    if (typeof r.finishReason === "string") return r.finishReason;
    if (typeof r.finish_reason === "string") return r.finish_reason;
    if (Array.isArray(r.content)) {
      const first = r.content[0] as Record<string, unknown> | undefined;
      if (first && typeof first.finishReason === "string") return first.finishReason;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function extractResultShape(result: unknown): {
  textChars: number;
  finishReason: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  contentPartCount: number;
  textPartCount: number;
  reasoningPartCount: number;
} {
  const r = result as Record<string, unknown> | null;
  if (!r) {
    return { textChars: 0, finishReason: undefined, inputTokens: undefined, outputTokens: undefined, totalTokens: undefined, contentPartCount: 0, textPartCount: 0, reasoningPartCount: 0 };
  }

  const text = typeof r.text === "string" ? r.text : "";
  const finishReason = safeGetFinishReason(r);

  const usage = r.usage as Record<string, unknown> | undefined;
  const inputTokens = safeGetNumber(usage, "inputTokens") ?? safeGetNumber(usage, "prompt_tokens");
  const outputTokens = safeGetNumber(usage, "outputTokens") ?? safeGetNumber(usage, "completion_tokens");
  const totalTokens = safeGetNumber(usage, "totalTokens") ?? safeGetNumber(usage, "total_tokens");

  let contentPartCount = 0;
  let textPartCount = 0;
  let reasoningPartCount = 0;

  const content = r.content;
  if (Array.isArray(content)) {
    contentPartCount = content.length;
    for (const part of content) {
      const p = part as Record<string, unknown>;
      const type = typeof p.type === "string" ? p.type : "";
      if (type === "text" || type === "text-delta") textPartCount++;
      if (type === "reasoning" || type === "reasoning-delta" || type === "thinking") reasoningPartCount++;
    }
  }

  return { textChars: text.length, finishReason, inputTokens, outputTokens, totalTokens, contentPartCount, textPartCount, reasoningPartCount };
}

/**
 * 从 providerOptions 中安全提取 reasoning_effort 值。
 *
 * AI SDK 的 providerOptions 结构为 Record<string, Record<string, unknown>>，
 * 即 { providerName: { key: value } }。
 * 只读取 openai / openai-compatible 下的 reasoning_effort / reasoningEffort，
 * 只接受 "low" | "medium" 这类安全字符串值，"none" 不写入请求体。
 * 不把整个 providerOptions 展开到 raw JSON 请求体。
 */
function extractOpenAICompatibleReasoningEffortFromProviderOptions(
  providerOptions: Record<string, Record<string, unknown>> | undefined,
): "low" | "medium" | undefined {
  if (!providerOptions) return undefined;
  const SAFE_EFFORT_VALUES = new Set(["low", "medium"]);
  for (const key of ["openai", "openai-compatible"]) {
    const provider = providerOptions[key];
    if (!provider || typeof provider !== "object") continue;
    for (const field of ["reasoning_effort", "reasoningEffort"]) {
      const val = provider[field];
      if (typeof val === "string" && SAFE_EFFORT_VALUES.has(val)) {
        return val as "low" | "medium";
      }
    }
  }
  return undefined;
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

  console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_START_SAFE]", {
    providerType: providerConfig.type,
    modelLabel: modelId,
    purpose,
  });

  const buildBody = (withResponseFormat: boolean) => {
    const body: Record<string, unknown> = {
      model: modelId,
      messages: [{ role: "user", content: prompt + "\n\n请只输出一个合法 JSON Object，不要 Markdown 代码块，不要解释。" }],
      max_tokens: maxTokens,
    };
    const temp = options.temperature ?? selected.modelConfig.temperature ?? DEFAULT_TEMPERATURE;
    const sanitized = sanitizeTemperatureForProvider(providerConfig.type, Number(temp));
    if (sanitized !== undefined) body.temperature = sanitized;
    if (withResponseFormat) body.response_format = { type: "json_object" };
    // reasoningEffort 真实传递（OpenAI-compatible top-level 参数）
    // providerOptions 安全映射（优先级高于 reasoningEffort）
    const extractedEffort = extractOpenAICompatibleReasoningEffortFromProviderOptions(options.providerOptions);
    if (extractedEffort) {
      body.reasoning_effort = extractedEffort;
    } else {
      const reasoningEffort = options.reasoningEffort;
      if (reasoningEffort && reasoningEffort !== "none") {
        body.reasoning_effort = reasoningEffort;
      }
    }
    return body;
  };

  const doFetch = async (body: Record<string, unknown>): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    return fetch(baseURL, { method: "POST", headers, body: JSON.stringify(body), signal: options.abortSignal });
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
    response = await doFetch(buildBody(true));
  } catch (fetchErr: any) {
    console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE]", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: "fetch_failed",
    });
    throw new Error(`OpenAI-compatible raw fallback fetch 失败: ${fetchErr?.message || String(fetchErr)}`);
  }

  if (!response.ok && (response.status === 400 || response.status === 422)) {
    console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_RETRY_NO_RESPONSE_FORMAT_SAFE]", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      status: response.status,
    });
    try {
      response = await doFetch(buildBody(false));
    } catch (retryErr: any) {
      console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE]", {
        providerType: providerConfig.type,
        modelLabel: modelId,
        purpose,
        errorKind: "retry_fetch_failed",
      });
      throw new Error(`OpenAI-compatible raw fallback retry fetch 失败: ${retryErr?.message || String(retryErr)}`);
    }
  }

  if (!response.ok) {
    console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE]", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: `http_${response.status}`,
    });
    throw new Error(`OpenAI-compatible raw fallback HTTP ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE]", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: "json_parse_failed",
    });
    throw new Error("OpenAI-compatible raw fallback: 响应非 JSON");
  }

  const { content, reasoningChars, reasoningCount } = extractContent(data);

  console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_RESULT_SAFE]", {
    providerType: providerConfig.type,
    modelLabel: modelId,
    purpose,
    contentChars: content.length,
    reasoningChars,
    reasoningCount,
  });

  if (!content || content.trim().length === 0) {
    if (reasoningCount > 0 && reasoningChars > 0) {
      console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE]", {
        providerType: providerConfig.type,
        modelLabel: modelId,
        purpose,
        errorKind: "reasoning_only_control_plane",
      });
      throw new Error("OpenAI-compatible raw fallback: 模型只返回 reasoning，无 content");
    }
    console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE]", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: "empty_content",
    });
    throw new Error("OpenAI-compatible raw fallback: content 为空");
  }

  const parseResult = parseLlmJsonObjectFromTextSafe(content, providerConfig.type, modelId, schema);
  if (!parseResult.success) {
    console.info("[KB-AGENT | LLM_JSON_RAW_OPENAI_COMPAT_FAILED_SAFE]", {
      providerType: providerConfig.type,
      modelLabel: modelId,
      purpose,
      errorKind: parseResult.errorKind,
    });
    throw new Error(`OpenAI-compatible raw fallback JSON 解析失败: ${parseResult.errorKind}`);
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
  const rawTemperature =
    options.temperature ??
    selected.modelConfig.temperature ??
    DEFAULT_TEMPERATURE;

  const temperature = sanitizeTemperatureForProvider(
    selected.providerConfig.type,
    Number(rawTemperature),
  );

  const purpose = options.purpose ?? "generic";
  let lastErrorKind = "unknown";
  let attemptCount = 0;

  const isOpenAICompatibleEarly = isOpenAICompatibleProtocolProvider(selected.providerConfig.type);
  const defaultRawFirst = isOpenAICompatibleEarly && purpose !== "generic";

  let profileRawFirst = false;
  let profileAllowStructuredFallback = true;
  try {
    const profile = resolveProviderProfile(selected.providerConfig.type, {
      reasoningCapability: selected.modelConfig.reasoningCapability,
      finalComposeMode: selected.modelConfig.finalComposeMode,
    });
    profileRawFirst = profile.controlPlaneStrategy === "raw_first";
    profileAllowStructuredFallback = profile.allowStructuredFallback;
  } catch {
    // profile 解析失败，使用默认行为
  }

  const useRawFirst = defaultRawFirst || profileRawFirst || shouldUseRawFirst(selected.providerConfig.type, selected.modelConfig.id);

  if (useRawFirst) {
    console.info("[KB-AGENT | LLM_JSON_CONTROL_PLANE_RAW_FIRST_START_SAFE]", {
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelConfig.id,
      purpose,
      profileRawFirst,
      profileAllowStructuredFallback,
    });
    try {
      const rawResult = await callOpenAICompatibleRawJsonObjectFallback(selected, prompt, schema, options);
      console.info("[KB-AGENT | LLM_JSON_CONTROL_PLANE_RAW_FIRST_SUCCESS_SAFE]", {
        providerType: selected.providerConfig.type,
        modelLabel: selected.modelConfig.id,
        purpose,
      });
      return rawResult;
    } catch (rawErr) {
      console.info("[KB-AGENT | LLM_JSON_CONTROL_PLANE_RAW_FIRST_FAILED_SAFE]", {
        providerType: selected.providerConfig.type,
        modelLabel: selected.modelConfig.id,
        purpose,
        errorMessage: rawErr instanceof Error ? rawErr.message.substring(0, 100) : "unknown",
      });
      if (!profileAllowStructuredFallback) {
        pushAgentDebugEvent("CONTROL_PLANE_FAST_JSON_RETRY_SAFE", {
          providerType: selected.providerConfig.type,
          modelLabel: selected.modelConfig.id,
          retryCount: 1,
          reason: "raw_first_failed,profile_no_structured_fallback",
        }, "info");
        try {
          const retryResult = await callOpenAICompatibleRawJsonObjectFallback(selected, prompt, schema, options);
          pushAgentDebugEvent("CONTROL_PLANE_FAST_JSON_RETRY_SAFE", {
            providerType: selected.providerConfig.type,
            modelLabel: selected.modelConfig.id,
            retryCount: 1,
            reason: "retry_success",
          }, "info");
          return retryResult;
        } catch (retryErr) {
          pushAgentDebugEvent("CONTROL_PLANE_STRUCTURED_FALLBACK_SKIPPED_SAFE", {
            providerType: selected.providerConfig.type,
            modelLabel: selected.modelConfig.id,
            reason: "profile_allowStructuredFallback=false,raw_first_and_retry_failed",
          }, "info");
          throw new Error(`JSON 解析失败 [${selected.providerLabel} / ${selected.modelLabel}]: raw_first 和 fast retry 均失败`);
        }
      }
    }
  }

  if (!profileAllowStructuredFallback) {
    pushAgentDebugEvent("CONTROL_PLANE_STRUCTURED_FALLBACK_SKIPPED_SAFE", {
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelConfig.id,
      reason: "profile_allowStructuredFallback=false",
    }, "info");
    throw new Error(`JSON 解析失败 [${selected.providerLabel} / ${selected.modelLabel}]: profile 不允许 structured fallback`);
  }

  const buildGenerateOptions = (retryPrompt: string): Parameters<typeof generateText>[0] => {
    const opts: Parameters<typeof generateText>[0] = {
      model: selected.model,
      messages: [{ role: "user", content: retryPrompt }],
      abortSignal: options.abortSignal,
    };
    if (temperature !== undefined) {
      opts.temperature = temperature;
    }
    if (selected.modelConfig.maxTokens !== undefined && selected.modelConfig.maxTokens > 0) {
      opts.maxOutputTokens = selected.modelConfig.maxTokens;
    }
    if (options.maxOutputTokens !== undefined && options.maxOutputTokens > 0) {
      opts.maxOutputTokens = options.maxOutputTokens;
    }
    // reasoningEffort / providerOptions 真实传递
    if (options.providerOptions) {
      opts.providerOptions = options.providerOptions as typeof opts.providerOptions;
    } else if (
      options.reasoningEffort &&
      providerSupportsReasoningControl(selected.providerConfig.type)
    ) {
      const built = buildReasoningProviderOptions(
        selected.providerConfig.type,
        options.reasoningEffort,
      );
      if (built) {
        opts.providerOptions = built as typeof opts.providerOptions;
      }
    }
    return opts;
  };

  const attemptParse = async (retryPrompt: string, isRetry: boolean): Promise<T | null> => {
    attemptCount++;
    const startTime = Date.now();
    const result = await generateText(buildGenerateOptions(retryPrompt));
    const durationMs = Date.now() - startTime;
    const shape = extractResultShape(result);

    console.info("[KB-AGENT | LLM_CALL_TIMING]", {
      purpose: "structured_json_fallback",
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelConfig.id,
      durationMs,
      supportsStructuredOutputs: false,
      usedJsonRepair: true,
      attempt: attemptCount,
      isRetry,
    });

    console.info("[KB-AGENT | LLM_JSON_FALLBACK_RESULT_SHAPE_SAFE]", {
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelConfig.id,
      purpose,
      attempt: attemptCount,
      textChars: shape.textChars,
      finishReason: shape.finishReason,
      contentPartCount: shape.contentPartCount,
      textPartCount: shape.textPartCount,
      reasoningPartCount: shape.reasoningPartCount,
      outputTokens: shape.outputTokens,
    });

    const text = typeof result.text === "string" ? result.text : "";

    if (!text || text.trim().length === 0) {
      lastErrorKind = "empty_text";
      console.info("[KB-AGENT | LLM_JSON_FALLBACK_EMPTY_TEXT_SAFE]", {
        providerType: selected.providerConfig.type,
        modelLabel: selected.modelConfig.id,
        purpose,
        attempt: attemptCount,
        maxOutputTokens: options.maxOutputTokens,
      });
      return null;
    }

    const parseResult = parseLlmJsonObjectFromTextSafe(
      text,
      selected.providerConfig.type,
      selected.modelConfig.id,
      schema,
    );

    if (parseResult.success) {
      return parseResult.parsed as T;
    }

    lastErrorKind = parseResult.errorKind ?? "unknown";
    return null;
  };

  const initialPrompt = prompt + "\n\n请只输出一个合法 JSON Object，不要 Markdown 代码块，不要解释。";
  const result = await attemptParse(initialPrompt, false);
  if (result !== null) {
    return result;
  }

  if (attemptCount <= JSON_FALLBACK_MAX_RETRIES) {
    const retryPrompt = buildSchemaAwareJsonRetryPrompt(prompt);
    console.info("[KB-AGENT | LLM_JSON_FALLBACK_RETRY_SAFE]", {
      providerType: selected.providerConfig.type,
      modelLabel: selected.modelConfig.id,
      purpose,
      attempt: attemptCount,
      reason: lastErrorKind,
      retryPromptMode: "schema_aware_original_prompt",
    });
    const retryResult = await attemptParse(retryPrompt, true);
    if (retryResult !== null) {
      return retryResult;
    }
  }

  const isOpenAICompatible = isOpenAICompatibleProtocolProvider(selected.providerConfig.type);
  if (isOpenAICompatible) {
    updateControlPlaneJsonObservation(selected.providerConfig.type, selected.modelConfig.id, "ai_sdk_empty_or_invalid");
    try {
      const rawResult = await callOpenAICompatibleRawJsonObjectFallback(selected, prompt, schema, options);
      updateControlPlaneJsonObservation(selected.providerConfig.type, selected.modelConfig.id, "raw_success");
      return rawResult;
    } catch (rawErr) {
      lastErrorKind = "raw_openai_compat_failed";
    }
  }

  console.info("[KB-AGENT | LLM_JSON_FALLBACK_TERMINAL_FAILED_SAFE]", {
    providerType: selected.providerConfig.type,
    modelLabel: selected.modelConfig.id,
    purpose,
    attemptCount,
    lastErrorKind,
  });
  throw new Error(`JSON 解析失败 [${selected.providerLabel} / ${selected.modelLabel}]: ${lastErrorKind}`);
}

export async function callLlmObject<T>(
  prompt: string,
  schema: ZodType<T>,
  options: LlmCallOptions = {}
): Promise<T> {
  const settings = await getKbSettings();

  const selected = createSelectedChatModel(
    settings,
    options.chatModelSelection ?? activeChatModelSelection
  );

  if (!providerSupportsStructuredOutputs(selected.providerConfig.type)) {
    return callLlmObjectFallback(selected, prompt, schema, options);
  }

  // 温度优先级：options.temperature > modelConfig.temperature > DEFAULT_TEMPERATURE
  const rawTemperature =
    options.temperature ??
    selected.modelConfig.temperature ??
    DEFAULT_TEMPERATURE;

  const temperature = sanitizeTemperatureForProvider(
    selected.providerConfig.type,
    Number(rawTemperature),
  );

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

  // reasoningEffort / providerOptions 真实传递
  if (options.providerOptions) {
    generateOptions.providerOptions = options.providerOptions as typeof generateOptions.providerOptions;
  } else if (
    options.reasoningEffort &&
    providerSupportsReasoningControl(selected.providerConfig.type)
  ) {
    const built = buildReasoningProviderOptions(
      selected.providerConfig.type,
      options.reasoningEffort,
    );
    if (built) {
      generateOptions.providerOptions = built as typeof generateOptions.providerOptions;
    }
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

export interface StreamChunk {
  chunk: string;
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

  console.info(`[KB-AGENT | LLM_STREAM_PART_SAFE]`, {
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
 * @param prompt 提示词
 * @param callbacks 回调函数
 * @param options 可选参数
 * @param abortSignal 用于中断请求
 * @returns 可取消的流式调用
 */
export async function streamLlm(
  prompt: string,
  callbacks: StreamCallbacks,
  options: LlmCallOptions = {},
  abortSignal?: AbortSignal
): Promise<void> {
  const settings = await getKbSettings();

  // 创建选中的模型，优先使用传入的 selection 或运行时上下文
  const selected = createSelectedChatModel(
    settings,
    options.chatModelSelection ?? activeChatModelSelection
  );

  // 温度优先级：options.temperature > modelConfig.temperature > DEFAULT_TEMPERATURE
  const rawTemperature =
    options.temperature ??
    selected.modelConfig.temperature ??
    DEFAULT_TEMPERATURE;

  const temperature = sanitizeTemperatureForProvider(
    selected.providerConfig.type,
    Number(rawTemperature),
  );

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
  } else if (options.reasoningEffort && providerSupportsReasoningControl(selected.providerConfig.type)) {
    const reasoningOptions = buildReasoningProviderOptions(selected.providerConfig.type, options.reasoningEffort);
    if (reasoningOptions) {
      streamOptions.providerOptions = reasoningOptions as any;
    }
  }

  const hasProviderOptions = !!streamOptions.providerOptions;
  const openaiOptions = (streamOptions.providerOptions as any)?.openai ?? {};
  const hasThinkingParam = !!openaiOptions.thinking;
  const thinkingType = openaiOptions.thinking?.type ?? undefined;
  const hasReasoningEffort = openaiOptions.reasoning_effort !== undefined;
  const requestMode = options.reasoningEffort ? "reasoning_effort" : hasThinkingParam ? "thinking_type" : "none";

  pushAgentDebugEvent("PROVIDER_REQUEST_BODY_FEATURES_SAFE", {
    providerType: selected.providerConfig.type,
    endpointKind: "openai_compatible",
    hasProviderOptions,
    hasThinkingParam,
    thinkingType: thinkingType ?? null,
    hasReasoningEffort,
    requestMode,
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

      const reasoningControlApplied = hasThinkingParam || hasReasoningEffort;
      const reasoningEffective = reasoningControlApplied ? reasoningPartCount === 0 : undefined;
      if (reasoningControlApplied) {
        pushAgentDebugEvent("PROVIDER_REASONING_CONTROL_EFFECT_SAFE", {
          providerType: selected.providerConfig.type,
          modelLabel: selected.modelLabel,
          reasoningControlApplied,
          reasoningPartCount,
          reasoningChars,
          effective: reasoningEffective,
          reasonCode: reasoningEffective ? undefined : "provider_still_returned_reasoning",
        }, "info");
      }

      await callbacks.onFinish?.(fullContent);
    } catch (err: any) {
      if (err?.name === "AbortError" || abortSignal?.aborted) {
        if (fullContent.trim().length > 0) {
          await callbacks.onFinish?.(fullContent);
          return;
        }
        console.info("[KB-AGENT | LLM_STREAM_LOCAL_ABORT_SUPPRESSED_FINISH_SAFE]", {
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
