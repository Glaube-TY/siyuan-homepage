/**
 * 模型连接与 native Agent 工具调用兼容性测试。
 */

import { generateText } from "ai";
import type { KbChatModelConfig, KbChatProviderConfig, ProviderNativeAgentCompatibility } from "../../types/settings";
import {
  createAssistantMessage,
  createSystemMessage,
  createToolMessage,
  createUserMessage,
  type AgentToolCall,
} from "../agent-core/messages/agent-message";
import { createProviderAdapterForKbModel } from "../agent-core/providers/agent-provider-factory";
import type { ProviderAdapter } from "../agent-core/providers/provider-adapter";
import type { NativeTool } from "../agent-core/tools/native-tool";
import { createChatModelFromProvider, normalizeText } from "./model-provider-factory";
import { resolveModelTemperatureForRequest, resolveProviderProfile } from "./provider-profile";

export interface ModelConnectionTestResult {
  success: boolean;
  severity?: "success" | "warning" | "error";
  message: string;
  elapsedMs?: number;
}

export interface ProviderNativeAgentCompatibilityTestResult {
  status: "success" | "timeout" | "no_tool_call" | "no_tool_result_continuation" | "error";
  message: string;
  elapsedMs: number;
  nativeToolCalls?: boolean;
  streamingToolCalls?: boolean;
  toolResultContinuation?: boolean;
  reasoningDelta?: boolean;
}

function sanitizeErrorMessage(message: string, apiKey?: string): string {
  let sanitized = message;
  if (apiKey) sanitized = sanitized.split(apiKey).join("***");
  return sanitized.replace(/[a-zA-Z0-9_-]{20,}/g, "***");
}

function validateModelConfig(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig,
): ModelConnectionTestResult | undefined {
  if (provider.enabled === false) return { success: false, severity: "error", message: "该提供商已禁用" };
  if (modelConfig.enabled === false) return { success: false, severity: "error", message: "该模型已禁用" };
  if (!normalizeText(modelConfig.id)) return { success: false, severity: "error", message: "模型 ID 不能为空" };
  if (!normalizeText(provider.apiKey)) {
    return { success: false, severity: "error", message: "API Key 不能为空" };
  }
  if (provider.type === "openai-compatible" && !normalizeText(provider.baseUrl)) {
    return { success: false, severity: "error", message: "Base URL 不能为空，通常应填写到 /v1" };
  }
  return undefined;
}

export async function testChatModelConnection(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig,
): Promise<ModelConnectionTestResult> {
  const invalid = validateModelConfig(provider, modelConfig);
  if (invalid) return invalid;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 20000);
  const startTime = Date.now();

  try {
    const model = createChatModelFromProvider(provider, modelConfig);
    let mergedCompatibility: ProviderNativeAgentCompatibility | undefined;
    try {
      const profile = resolveProviderProfile(provider.type, {
        providerNativeAgentCompatibility: provider.providerNativeAgentCompatibility,
        modelNativeAgentCompatibility: modelConfig.providerNativeAgentCompatibility,
      });
      mergedCompatibility = profile.providerNativeAgentCompatibility;
    } catch {
      mergedCompatibility = undefined;
    }

    const temperature = resolveModelTemperatureForRequest({
      providerType: provider.type,
      modelId: modelConfig.id,
      modelConfigTemperature: modelConfig.temperature,
      providerNativeAgentCompatibility: mergedCompatibility,
      fallbackTemperature: 0,
    });

    const options: Parameters<typeof generateText>[0] = {
      model,
      prompt: "你是连接测试助手。请只输出 OK 两个字母，不要解释。",
      maxOutputTokens: 128,
      abortSignal: abortController.signal,
    };
    if (temperature !== undefined) options.temperature = temperature;

    const result = await generateText(options);
    const elapsedMs = Date.now() - startTime;
    if (result.text?.trim()) {
      return {
        success: true,
        severity: "success",
        message: `连接成功，模型返回正常，用时 ${elapsedMs} ms。`,
        elapsedMs,
      };
    }
    return {
      success: true,
      severity: "warning",
      message: "连接成功，但本次轻量测试未返回正文。若正常对话可用可暂时忽略。",
      elapsedMs,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    if (abortController.signal.aborted) {
      return {
        success: false,
        severity: "error",
        message: "连接超时（20 秒），请检查网络或模型服务是否可用。",
        elapsedMs,
      };
    }
    return {
      success: false,
      severity: "error",
      message: `连接失败：${sanitizeErrorMessage(error instanceof Error ? error.message : String(error), provider.apiKey)}`,
      elapsedMs,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

const ECHO_PROBE_TOOL: NativeTool = {
  name: "echo_probe",
  title: "Echo Probe",
  description: "A safe read-only probe tool for native Agent compatibility tests. Echoes a short message.",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Short probe message.",
      },
    },
    required: ["message"],
    additionalProperties: false,
  },
  readOnly: true,
  parallelSafe: true,
  riskLevel: "low",
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true, canWrite: false, requiresConfirmation: false },
  async execute(args) {
    const message = typeof args.message === "string" ? args.message : "";
    return {
      ok: true,
      content: JSON.stringify({ ok: true, toolName: "echo_probe", data: { message } }),
      summary: "echo_probe success",
      data: { message },
    };
  },
};

async function collectProbeFirstPass(params: {
  provider: ProviderAdapter;
  abortSignal: AbortSignal;
}): Promise<{
  text: string;
  reasoningDelta: boolean;
  streamingToolCalls: boolean;
  toolCall?: AgentToolCall;
}> {
  let text = "";
  let reasoningDelta = false;
  let streamingToolCalls = false;
  let toolCall: AgentToolCall | undefined;

  for await (const event of params.provider.streamChat({
    messages: [
      createSystemMessage("You are testing native tool calls. Call echo_probe with {\"message\":\"ping\"}. Do not answer before calling the tool."),
      createUserMessage("Run the echo_probe tool with message ping."),
    ],
    tools: [ECHO_PROBE_TOOL],
    abortSignal: params.abortSignal,
  })) {
    if (event.type === "text_delta") text += event.delta;
    if (event.type === "reasoning_delta") reasoningDelta = true;
    if (event.type === "tool_call_delta") streamingToolCalls = true;
    if (event.type === "tool_call_done") toolCall = event.toolCall;
  }

  return { text, reasoningDelta, streamingToolCalls, toolCall };
}

async function collectProbeContinuation(params: {
  provider: ProviderAdapter;
  abortSignal: AbortSignal;
  firstPassText: string;
  toolCall: AgentToolCall;
}): Promise<{
  text: string;
  reasoningDelta: boolean;
}> {
  let text = "";
  let reasoningDelta = false;
  const toolResultContent = JSON.stringify({
    ok: true,
    toolName: "echo_probe",
    data: { message: "ping" },
  });

  for await (const event of params.provider.streamChat({
    messages: [
      createSystemMessage("You are testing native tool calls. After the tool result, answer with ordinary assistant text."),
      createUserMessage("Run the echo_probe tool with message ping."),
      createAssistantMessage({
        content: params.firstPassText,
        toolCalls: [params.toolCall],
      }),
      createToolMessage({
        toolCallId: params.toolCall.id,
        name: params.toolCall.name,
        content: toolResultContent,
      }),
    ],
    tools: [ECHO_PROBE_TOOL],
    abortSignal: params.abortSignal,
  })) {
    if (event.type === "text_delta") text += event.delta;
    if (event.type === "reasoning_delta") reasoningDelta = true;
  }

  return { text, reasoningDelta };
}

export async function testProviderNativeAgentCompatibility(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig,
): Promise<ProviderNativeAgentCompatibilityTestResult> {
  const startTime = Date.now();
  const invalid = validateModelConfig(provider, modelConfig);
  if (invalid) {
    return { status: "error", message: invalid.message, elapsedMs: 0 };
  }

  const profile = resolveProviderProfile(provider.type, {
    providerNativeAgentCompatibility: provider.providerNativeAgentCompatibility,
    modelNativeAgentCompatibility: modelConfig.providerNativeAgentCompatibility,
  });
  const timeoutMs = Math.max(30000, Math.min(300000, profile.providerRequestTimeoutMs));
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const adapter = createProviderAdapterForKbModel({
      provider,
      model: modelConfig,
      thinkingMode: "off",
      agentThinkingEnabled: false,
    });

    if (!adapter.capabilities.nativeToolCalls) {
      return {
        status: "no_tool_call",
        message: "该模型适配器未声明支持 native tool calls，不能进入 Agent 模式。",
        elapsedMs: Date.now() - startTime,
        nativeToolCalls: false,
      };
    }

    const first = await collectProbeFirstPass({
      provider: adapter,
      abortSignal: abortController.signal,
    });

    if (!first.toolCall) {
      return {
        status: "no_tool_call",
        message: "模型未返回标准工具调用，不能进入 Agent 模式。",
        elapsedMs: Date.now() - startTime,
        nativeToolCalls: false,
        streamingToolCalls: first.streamingToolCalls,
        reasoningDelta: first.reasoningDelta,
      };
    }

    const continuation = await collectProbeContinuation({
      provider: adapter,
      abortSignal: abortController.signal,
      firstPassText: first.text,
      toolCall: first.toolCall,
    });

    const elapsedMs = Date.now() - startTime;
    if (!continuation.text.trim()) {
      return {
        status: "no_tool_result_continuation",
        message: "模型能返回工具调用，但在工具结果后没有继续生成普通 assistant 文本。",
        elapsedMs,
        nativeToolCalls: true,
        streamingToolCalls: first.streamingToolCalls,
        toolResultContinuation: false,
        reasoningDelta: first.reasoningDelta || continuation.reasoningDelta,
      };
    }

    return {
      status: "success",
      message: `Agent 工具调用兼容性通过：模型能调用工具并在工具结果后继续回答，用时 ${elapsedMs} ms。`,
      elapsedMs,
      nativeToolCalls: true,
      streamingToolCalls: first.streamingToolCalls,
      toolResultContinuation: true,
      reasoningDelta: first.reasoningDelta || continuation.reasoningDelta,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    if (abortController.signal.aborted) {
      return {
        status: "timeout",
        message: "模型没有在设定时间内完成 native tool call 测试。",
        elapsedMs,
      };
    }
    return {
      status: "error",
      message: `测试失败：${sanitizeErrorMessage(error instanceof Error ? error.message : String(error), provider.apiKey)}`,
      elapsedMs,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
