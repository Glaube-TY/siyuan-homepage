/**
 * OpenAI-compatible SSE 流式 JSON Planner.
 *
 * 职责：
 * - 使用 fetch + ReadableStream 读取 SSE 流
 * - 累加 content delta
 * - reasoning delta 只统计字符数，不保存全文
 * - 流结束后严格 JSON.parse 累加的 content
 * - idle timeout：收到 chunk 时重置计时器
 *
 * 不修改现有非流式路径。
 * 不从 reasoning 中提取 JSON。
 * 不解析 tool_calls。
 *
 * 注意：流式 Planner 没有总时长超时，只有无数据空闲超时。
 * 只要持续收到流式数据，就不会因为总耗时超过阈值而中断。
 */

import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";

export interface StreamJsonPlannerResultSuccess {
  success: true;
  content: string;
  reasoningChars: number;
  reasoningCount: number;
  /** Diagnostic fields (debug only, not for UI) */
  receivedDoneSignal: boolean;
  finishReason?: string;
  malformedLineCount: number;
}

export interface StreamJsonPlannerResultFailure {
  success: false;
  errorCode: string;
  message: string;
  reasoningChars?: number;
  /** Diagnostic fields (debug only, not for UI) */
  reasoningCount?: number;
  contentCharsSoFar?: number;
  receivedDoneSignal?: boolean;
  finishReason?: string;
  malformedLineCount?: number;
}

export type StreamJsonPlannerResult = StreamJsonPlannerResultSuccess | StreamJsonPlannerResultFailure;

export interface StreamJsonPlannerParams {
  endpoint: string;
  apiKey?: string;
  body: Record<string, unknown>;
  /** Idle timeout in ms (default 30000) */
  idleTimeoutMs?: number;
  /** External abort signal */
  abortSignal?: AbortSignal;
}

/**
 * 调用 OpenAI-compatible SSE 流式 JSON Planner。
 *
 * 返回累计的 content 字符串（不含 reasoning）。
 * 调用方负责 JSON.parse + schema validation。
 */
export async function streamOpenAICompatibleJsonPlanner(
  params: StreamJsonPlannerParams,
): Promise<StreamJsonPlannerResult> {
  const idleTimeoutMs = params.idleTimeoutMs ?? 30_000;
  const abortController = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    }, idleTimeoutMs);
  }

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  // Forward external abort with cleanup reference
  let externalAbortCleanup: (() => void) | null = null;
  if (params.abortSignal) {
    if (params.abortSignal.aborted) {
      abortController.abort();
    } else {
      const abortHandler = () => abortController.abort();
      params.abortSignal.addEventListener("abort", abortHandler, { once: true });
      externalAbortCleanup = () => params.abortSignal!.removeEventListener("abort", abortHandler);
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.apiKey) headers["Authorization"] = `Bearer ${params.apiKey}`;

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let receivedDoneSignal = false;
  let contentBuffer = "";
  let reasoningChars = 0;
  let reasoningCount = 0;
  let finishReason: string | undefined;
  let malformedLineCount = 0;

  /**
   * Unified debug event for all stream_json failure paths.
   * Only emits to debug/trace, never enters normal UI.
   */
  function emitStreamJsonFailureDebug(errorCode: string, extra?: Record<string, unknown>): void {
    pushAgentDebugEvent("STREAM_JSON_FAILED_SAFE", {
      errorCode,
      idleTimeoutMs,
      timeoutMode: "idle",
      contentCharsSoFar: contentBuffer?.length ?? 0,
      reasoningChars: reasoningChars ?? 0,
      reasoningCount: reasoningCount ?? 0,
      receivedDoneSignal: receivedDoneSignal ?? false,
      ...extra,
    }, "warn");
  }

  /**
   * Build a complete StreamJsonPlannerResultFailure with all diagnostic fields.
   * Every failure return path must use this helper so that callers (llm-client)
   * get consistent contentCharsSoFar, reasoningCount, receivedDoneSignal, etc.
   */
  function buildStreamJsonFailure(
    errorCode: string,
    message: string,
    extra?: Partial<StreamJsonPlannerResultFailure>,
  ): StreamJsonPlannerResultFailure {
    return {
      success: false,
      errorCode,
      message,
      reasoningChars: reasoningChars ?? 0,
      reasoningCount: reasoningCount ?? 0,
      contentCharsSoFar: contentBuffer?.length ?? 0,
      receivedDoneSignal: receivedDoneSignal ?? false,
      finishReason: finishReason ?? undefined,
      malformedLineCount: malformedLineCount ?? 0,
      ...extra,
    };
  }

  try {
    // Ensure stream: true in body
    const requestBody = { ...params.body, stream: true };

    pushAgentDebugEvent("STREAM_JSON_START_SAFE", {
      idleTimeoutMs,
      timeoutMode: "idle",
      plannerTransport: "stream_json",
    }, "info");

    resetIdleTimer();

    const response = await fetch(params.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    // HTTP error handling
    if (!response.ok) {
      clearIdleTimer();
      const statusCode = response.status;

      // Read provider error for debug only
      let providerErrorMessage = "";
      try {
        const errJson = await response.json();
        const text = errJson?.error?.message || `HTTP ${statusCode}`;
        providerErrorMessage = params.apiKey ? text.split(params.apiKey).join("***") : text;
      } catch { /* ignore */ }

      let errorCode: string;
      let errorMessage: string;
      if (statusCode === 401) { errorCode = "http_401"; errorMessage = "连接失败：当前 API Key 未通过鉴权。"; }
      else if (statusCode === 403) { errorCode = "http_403"; errorMessage = "连接失败：当前 API Key 没有调用该模型的权限。"; }
      else if (statusCode === 429) { errorCode = "http_429"; errorMessage = "请求过于频繁或额度受限，请稍后重试。"; }
      else if (statusCode >= 500) { errorCode = "http_5xx"; errorMessage = "服务商暂时无法完成请求，请稍后重试。"; }
      else { errorCode = "http_xxx"; errorMessage = "模型请求失败。"; }

      emitStreamJsonFailureDebug(errorCode, { httpStatus: statusCode, providerErrorMessage: providerErrorMessage.slice(0, 120) });
      return buildStreamJsonFailure(errorCode, errorMessage, { reasoningChars: 0, reasoningCount: 0, contentCharsSoFar: 0 });
    }

    // Check response body is readable
    if (!response.body) {
      clearIdleTimer();
      emitStreamJsonFailureDebug("network_error", { reason: "missing_response_body" });
      return buildStreamJsonFailure("network_error", "模型请求失败。", { reasoningChars: 0, reasoningCount: 0, contentCharsSoFar: 0 });
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;
    let toolCallsDetected = false;
    receivedDoneSignal = false;
    finishReason = undefined;
    malformedLineCount = 0;

    /**
     * Process a single SSE line. Returns true if the stream should stop
     * (DONE signal or tool_calls detected — caller should break/return).
     */
    function processSseLine(line: string): boolean {
      const trimmed = line.trim();
      if (!trimmed) return false;

      if (trimmed === "data: [DONE]") {
        receivedDoneSignal = true;
        return true; // signal done
      }

      if (!trimmed.startsWith("data: ")) return false;

      const jsonStr = trimmed.slice(6);

      try {
        const data = JSON.parse(jsonStr);

        const choices = data?.choices;
        if (!Array.isArray(choices) || choices.length === 0) return false;

        const delta = choices[0]?.delta;
        if (!delta) return false;

        // Content delta
        const contentDelta = delta.content;
        if (typeof contentDelta === "string" && contentDelta.length > 0) {
          contentBuffer += contentDelta;
        }

        // Reasoning delta — only count, don't save
        for (const key of ["reasoning_content", "reasoning", "thinking"]) {
          const val = delta[key];
          if (typeof val === "string" && val.length > 0) {
            reasoningChars += val.length;
            reasoningCount++;
          }
        }

        // Tool calls detected — fail closed
        if (delta.tool_calls) {
          toolCallsDetected = true;
          return true; // signal stop
        }

        // Finish reason
        const fr = choices[0]?.finish_reason;
        if (fr) {
          finishReason = fr;
        }

        return false;
      } catch {
        // Malformed SSE data line — count for debug, don't leak raw content
        malformedLineCount++;
        return false;
      }
    }

    while (!done) {
      const { done: chunkDone, value } = await reader.read();
      if (chunkDone) {
        done = true;
        break;
      }

      // Reset idle timer on any data
      resetIdleTimer();

      if (!value) continue;

      const decoded = decoder.decode(value, { stream: true });
      buffer += decoded;

      // Process complete SSE lines
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (processSseLine(line)) {
          done = true;
          if (toolCallsDetected) {
            clearIdleTimer();
          }
          break;
        }
      }
    }

    // Final flush: decoder may have buffered bytes that haven't been emitted
    const finalChunk = decoder.decode();
    if (finalChunk) {
      buffer += finalChunk;
      // Process any remaining complete lines in buffer
      const remainingLines = buffer.split("\n");
      for (const line of remainingLines) {
        if (processSseLine(line)) {
          break;
        }
      }
    } else if (buffer.trim()) {
      // No final flush bytes but buffer still has content (last line without newline)
      if (processSseLine(buffer)) {
        // handled
      }
    }

    if (malformedLineCount > 0) {
      pushAgentDebugEvent("STREAM_JSON_MALFORMED_SSE_LINES_SAFE", {
        malformedLineCount,
        providerType: "openai_compatible_stream",
      }, "info");
    }

    clearIdleTimer();

    // Tool calls detected during stream — fail closed
    if (toolCallsDetected) {
      emitStreamJsonFailureDebug("native_tool_calls_not_supported_here", { finishReason: finishReason ?? null, malformedLineCount });
      return buildStreamJsonFailure("native_tool_calls_not_supported_here", "模型返回了当前模式不支持的内容。");
    }

    // Process finish_reason
    if (finishReason === "length") {
      emitStreamJsonFailureDebug("output_truncated", { finishReason, malformedLineCount });
      return buildStreamJsonFailure("output_truncated", "模型输出被截断。");
    }
    if (finishReason === "content_filter") {
      emitStreamJsonFailureDebug("content_filtered", { finishReason, malformedLineCount });
      return buildStreamJsonFailure("content_filtered", "模型输出因安全策略被过滤。");
    }
    if (finishReason === "tool_calls") {
      emitStreamJsonFailureDebug("native_tool_calls_not_supported_here", { finishReason, malformedLineCount });
      return buildStreamJsonFailure("native_tool_calls_not_supported_here", "模型返回了当前模式不支持的内容。");
    }

    // Normal stop or other finish
    const trimmedContent = contentBuffer.trim();
    if (!trimmedContent) {
      if (reasoningCount > 0 && reasoningChars > 0) {
        emitStreamJsonFailureDebug("reasoning_only_control_plane", { finishReason: finishReason ?? null, malformedLineCount });
        return buildStreamJsonFailure("reasoning_only_control_plane", "模型没有返回可执行内容。");
      }
      emitStreamJsonFailureDebug("empty_content", { finishReason: finishReason ?? null, malformedLineCount });
      return buildStreamJsonFailure("empty_content", "模型没有返回可执行内容。");
    }

    pushAgentDebugEvent("STREAM_JSON_RESULT_SAFE", {
      contentChars: contentBuffer.length,
      reasoningChars,
      reasoningCount,
      receivedDoneSignal,
      finishReason: finishReason ?? null,
      malformedLineCount,
      idleTimeoutMs,
      timeoutMode: "idle",
    }, "info");

    return {
      success: true,
      content: trimmedContent,
      reasoningChars,
      reasoningCount,
      receivedDoneSignal,
      finishReason: finishReason ?? undefined,
      malformedLineCount,
    };
  } catch (error: any) {
    if (error?.name === "AbortError" || abortController.signal.aborted) {
      // Distinguish between external abort and idle timeout
      if (params.abortSignal?.aborted) {
        emitStreamJsonFailureDebug("user_aborted");
        return buildStreamJsonFailure("user_aborted", "用户取消了操作。");
      }
      emitStreamJsonFailureDebug("stream_idle_timeout");
      return buildStreamJsonFailure("stream_idle_timeout", "模型在设定时间内没有继续返回内容。");
    }

    emitStreamJsonFailureDebug("network_error", {
      errorName: error?.name ?? "unknown",
      sanitizedMessage: String(error?.message ?? error).slice(0, 120),
    });
    return buildStreamJsonFailure("network_error", "网络请求失败。");
  } finally {
    clearIdleTimer();
    externalAbortCleanup?.();
    // Best-effort cancel reader if stream didn't end with normal [DONE]
    if (reader && !receivedDoneSignal) {
      try { reader.cancel(); } catch { /* best-effort */ }
    }
  }
}
