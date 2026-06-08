/**
 * KB Model Call — 唯一模型调用接口
 *
 * 职责：
 * - 项目内唯一能构造 OpenAI-compatible 请求体的地方
 * - 提供三个对外方法：callModelJson / callModelText / streamModelText
 * - thinkingMode 到请求体参数的转换只在此模块内发生：
 *   - thinkingMode=off：不添加任何思考相关请求参数
 *   - thinkingMode=on：添加 OpenAI-compatible thinking.type="enabled"
 *
 * 其他文件（Planner、Composer、ask-by-mode 等）只能调用本模块的方法，
 * 不得直接拼接 thinking / providerOptions / extraBody / response_format /
 * stream body / raw JSON fallback body。
 */

import type { ZodType } from "zod";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { ThinkingMode } from "../../types/session";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { getKbSettings } from "../settings/kb-settings-service";

// 内部 llm-client 函数 — 外部不得直接导入
import {
  callLlmObject as _callLlmObject,
  callLlm as _callLlm,
  streamLlm as _streamLlm,
  type LlmCallOptions,
} from "./llm-client";

// ═══════════════════════════════════════════════════════════════════
// 公开类型
// ═══════════════════════════════════════════════════════════════════

export type { ThinkingMode } from "../../types/session";

export interface ModelCallCommonOptions {
  /** 本轮对话使用的模型选择（优先于 settings 中的默认模型） */
  chatModelSelection?: ChatModelSelection | null;
  /** 用于中断请求的 AbortSignal */
  abortSignal?: AbortSignal;
  /** 最大输出 token 数 */
  maxOutputTokens?: number;
  /** 温度 */
  temperature?: number;
}

export interface CallModelJsonOptions extends ModelCallCommonOptions {
  /** 调用目的，用于 debug */
  purpose?: "planner" | "generic";
}

export interface CallModelTextOptions extends ModelCallCommonOptions {
  purpose?: "compose" | "generic";
}

export interface StreamModelTextCallbacks {
  onChunk: (event: { chunk: string; fullContent: string }) => void;
  onFinish?: (fullContent: string) => void | Promise<void>;
  onError?: (error: Error) => void;
  onStreamStatus?: (event: {
    type: "reasoning-start" | "reasoning-delta" | "reasoning-end" | "text-start" | "text-delta" | "finish" | "error";
    delta?: string;
    fullContent?: string;
  }) => void;
}

export interface StreamModelTextOptions extends ModelCallCommonOptions {
  purpose?: "compose" | "generic";
}

// ═══════════════════════════════════════════════════════════════════
// 内部：ModelCallConfig — thinkingMode + 输出预算 唯一转换点
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_JSON_MAX_OUTPUT_TOKENS = 800;
const THINKING_MIN_OUTPUT_TOKENS = 4096;

interface BuildModelCallConfigInput {
  thinkingMode: ThinkingMode;
  controlPlaneThinkingEnabled: boolean;
  requestedMaxOutputTokens: number;
  purpose: string;
  mode: "json" | "text" | "stream";
}

interface BuildModelCallConfigOutput {
  providerOptions: Record<string, Record<string, unknown>> | undefined;
  effectiveMaxOutputTokens: number;
  debug: {
    inputThinkingMode: ThinkingMode;
    effectiveThinkingMode: ThinkingMode;
    controlPlaneThinkingEnabled: boolean;
    purpose: string;
    mode: "json" | "text" | "stream";
    hasThinkingParam: boolean;
    thinkingType: unknown;
    requestedMaxOutputTokens: number;
    effectiveMaxOutputTokens: number;
    adjustedForThinking: boolean;
  };
}

/**
 * 项目内唯一处理 thinkingMode → 请求体参数 + 输出预算的地方。
 *
 * 有效思考模式计算规则（仅属于模型调用配置层，非业务流程控制）：
 * - 输入框 thinkingMode 是本轮总开关；thinkingMode="off" 时 effectiveThinkingMode 永远为 "off"
 * - thinkingMode="on" 且 purpose === "planner"：再看 controlPlaneThinkingEnabled
 *   - true → effectiveThinkingMode = "on"
 *   - false → effectiveThinkingMode = "off"
 * - thinkingMode="on" 且非 planner：effectiveThinkingMode = "on"
 *
 * controlPlaneThinkingEnabled 只是输入框思考开启后的 Planner 子开关；
 * Planner / Composer / Tool 均不知道也不处理该设置。
 *
 * effectiveThinkingMode="on"  → { openai: { thinking: { type: "enabled" } } }，且输出预算不低于 4096
 * effectiveThinkingMode="off" → 不传任何参数，不调整预算
 *
 * 不依赖 provider-profile / model-capabilities 的多风格分支。
 */
function buildModelCallConfig(input: BuildModelCallConfigInput): BuildModelCallConfigOutput {
  const { thinkingMode, controlPlaneThinkingEnabled, requestedMaxOutputTokens, purpose, mode } = input;

  const effectiveThinkingMode: ThinkingMode =
    thinkingMode === "off"
      ? "off"
      : purpose === "planner"
        ? (controlPlaneThinkingEnabled ? "on" : "off")
        : "on";

  let providerOptions: Record<string, Record<string, unknown>> | undefined;
  if (effectiveThinkingMode === "on") {
    providerOptions = { openai: { thinking: { type: "enabled" } } };
  }

  let effectiveMaxOutputTokens = requestedMaxOutputTokens;
  let adjustedForThinking = false;
  if (effectiveThinkingMode === "on" && requestedMaxOutputTokens < THINKING_MIN_OUTPUT_TOKENS) {
    effectiveMaxOutputTokens = THINKING_MIN_OUTPUT_TOKENS;
    adjustedForThinking = true;
  }

  return {
    providerOptions,
    effectiveMaxOutputTokens,
    debug: {
      inputThinkingMode: thinkingMode,
      effectiveThinkingMode,
      controlPlaneThinkingEnabled,
      purpose,
      mode,
      hasThinkingParam: !!providerOptions,
      thinkingType: (providerOptions?.openai?.thinking as Record<string, unknown> | undefined)?.type ?? null,
      requestedMaxOutputTokens,
      effectiveMaxOutputTokens,
      adjustedForThinking,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 公开方法 1：callModelJson — Planner JSON 结构化调用
// ═══════════════════════════════════════════════════════════════════

/**
 * 调用模型获取 JSON 结构化输出。
 * Planner 使用此方法获取决策 JSON。
 *
 * Planner 的 reasoning 不展示、不保存、不进上下文。
 * Debug 只记录 reasoningChars / reasoningCount 安全统计。
 */
export async function callModelJson<T>(
  prompt: string,
  schema: ZodType<T>,
  thinkingMode: ThinkingMode,
  options: CallModelJsonOptions = {},
): Promise<T> {
  const kbSettings = await getKbSettings();

  const config = buildModelCallConfig({
    thinkingMode,
    controlPlaneThinkingEnabled: kbSettings.controlPlaneThinkingEnabled,
    requestedMaxOutputTokens: options.maxOutputTokens ?? DEFAULT_JSON_MAX_OUTPUT_TOKENS,
    purpose: options.purpose ?? "generic",
    mode: "json",
  });

  pushAgentDebugEvent("MODEL_REQUEST_FEATURES_SAFE", config.debug, "info");

  const llmOptions: LlmCallOptions = {
    abortSignal: options.abortSignal,
    purpose: options.purpose ?? "generic",
    maxOutputTokens: config.effectiveMaxOutputTokens,
    temperature: options.temperature ?? 0.1,
    chatModelSelection: options.chatModelSelection,
    providerOptions: config.providerOptions,
  };

  return _callLlmObject(prompt, schema, llmOptions);
}

// ═══════════════════════════════════════════════════════════════════
// 公开方法 2：callModelText — 普通文本调用
// ═══════════════════════════════════════════════════════════════════

/**
 * 调用模型获取纯文本输出。
 */
export async function callModelText(
  prompt: string,
  thinkingMode: ThinkingMode,
  options: CallModelTextOptions = {},
): Promise<string> {
  const kbSettings = await getKbSettings();

  const config = buildModelCallConfig({
    thinkingMode,
    controlPlaneThinkingEnabled: kbSettings.controlPlaneThinkingEnabled,
    requestedMaxOutputTokens: options.maxOutputTokens ?? 2048,
    purpose: options.purpose ?? "generic",
    mode: "text",
  });

  pushAgentDebugEvent("MODEL_REQUEST_FEATURES_SAFE", config.debug, "info");

  const llmOptions: LlmCallOptions = {
    abortSignal: options.abortSignal,
    purpose: options.purpose ?? "generic",
    maxOutputTokens: config.effectiveMaxOutputTokens,
    temperature: options.temperature,
    chatModelSelection: options.chatModelSelection,
    providerOptions: config.providerOptions,
  };

  const response = await _callLlm(prompt, llmOptions);
  return response.content;
}

// ═══════════════════════════════════════════════════════════════════
// 公开方法 3：streamModelText — 流式文本输出（Composer）
// ═══════════════════════════════════════════════════════════════════

/**
 * 流式调用模型获取文本输出。
 * Composer 使用此方法生成最终回答。
 *
 * thinkingMode="on" 且模型返回 reasoning 时，通过 callbacks.onStreamStatus
 * 传递 reasoning 事件供 Composer 展示/保存。
 * thinkingMode="off" 时，如果模型意外返回 reasoning，在接口层过滤，
 * 不转发给外部调用者，只记录安全 debug。
 */
export async function streamModelText(
  prompt: string,
  thinkingMode: ThinkingMode,
  callbacks: StreamModelTextCallbacks,
  options: StreamModelTextOptions = {},
): Promise<void> {
  const kbSettings = await getKbSettings();

  const config = buildModelCallConfig({
    thinkingMode,
    controlPlaneThinkingEnabled: kbSettings.controlPlaneThinkingEnabled,
    requestedMaxOutputTokens: options.maxOutputTokens ?? 4096,
    purpose: options.purpose ?? "compose",
    mode: "stream",
  });

  pushAgentDebugEvent("MODEL_REQUEST_FEATURES_SAFE", config.debug, "info");

  const effectiveThinkingMode = config.debug.effectiveThinkingMode;

  // 聚合统计被丢弃的 reasoning 事件（thinkingMode=off 时）
  let discardedReasoningEventCount = 0;
  let discardedReasoningDeltaCount = 0;
  let discardedReasoningChars = 0;

  function flushDiscardedReasoningDebug() {
    if (discardedReasoningEventCount > 0) {
      pushAgentDebugEvent("MODEL_REASONING_EVENTS_DISCARDED_SAFE", {
        discardedReasoningEventCount,
        discardedReasoningDeltaCount,
        discardedReasoningChars,
        hasDiscardedReasoning: true,
        purpose: config.debug.purpose,
        mode: config.debug.mode,
      }, "info");
      discardedReasoningEventCount = 0;
      discardedReasoningDeltaCount = 0;
      discardedReasoningChars = 0;
    }
  }

  // 包装 onStreamStatus：thinkingMode=off 时过滤 reasoning 事件
  const wrappedCallbacks: StreamModelTextCallbacks = {
    onChunk: callbacks.onChunk,
    onFinish: (content) => {
      flushDiscardedReasoningDebug();
      callbacks.onFinish?.(content);
    },
    onError: (error) => {
      flushDiscardedReasoningDebug();
      callbacks.onError?.(error);
    },
    onStreamStatus: (event) => {
      const isReasoningEvent =
        event.type === "reasoning-start" ||
        event.type === "reasoning-delta" ||
        event.type === "reasoning-end";

      if (isReasoningEvent && effectiveThinkingMode === "off") {
        discardedReasoningEventCount++;
        if (event.type === "reasoning-delta") {
          discardedReasoningDeltaCount++;
          discardedReasoningChars += event.delta?.length ?? 0;
        }
        if (event.type === "reasoning-end") {
          flushDiscardedReasoningDebug();
        }
        return;
      }

      callbacks.onStreamStatus?.(event);
    },
  };

  const llmOptions: LlmCallOptions = {
    abortSignal: options.abortSignal,
    purpose: options.purpose ?? "compose",
    maxOutputTokens: config.effectiveMaxOutputTokens,
    temperature: options.temperature ?? 0.3,
    chatModelSelection: options.chatModelSelection,
    providerOptions: config.providerOptions,
  };

  await _streamLlm(prompt, wrappedCallbacks, llmOptions, options.abortSignal);
}
