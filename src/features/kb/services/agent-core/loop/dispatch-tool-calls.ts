import { createToolMessage, type AgentToolCall, type AgentToolMessage } from "../messages/agent-message";
import { parseToolCallArguments } from "../messages/tool-call-message";
import type { ToolConfirmationBridge } from "../permissions/confirmation-bridge";
import { DefaultToolPermissionGate } from "../permissions/tool-permission-gate";
import type { NativeToolRegistry } from "../tools/native-tool-registry";
import { NativeToolExecutor } from "../tools/tool-executor";
import { createToolExecutionFailure, parseToolResultContentEnvelope } from "../tools/tool-execution-result";
import type { NativeTool, ToolArgsValidationResult, ToolExecutionContext } from "../tools/native-tool";
import type { AgentStreamEvent } from "./stream-event";
import { digestText, StormBreaker, type FailedCallInfo } from "./storm-breaker";

export interface DispatchToolCallsResult {
  toolMessages: AgentToolMessage[];
  stepCount: number;
  /** When set, the loop should stop immediately (e.g. repeated unknown tool). */
  fatalErrorCode?: string;
  fatalErrorMessage?: string;
}

/** Deprecated database tool names → migration hint for the model. */
const DEPRECATED_TOOL_HINTS: Record<string, string> = {
  read_attribute_view_stats:
    "read_attribute_view_stats 已废弃。请使用 read_attribute_view 读取 schema/rows 后自行分析统计。",
  batch_update_attribute_view_cells:
    "batch_update_attribute_view_cells 已合并进 update_attribute_view_cell。批量更新请使用 update_attribute_view_cell 的 updates[] 参数。",
  get_attribute_view_item_ids_by_bound_ids:
    "get_attribute_view_item_ids_by_bound_ids 不是可见工具，ID 映射由工具内部自动处理。请先用 read_attribute_view 或 find_attribute_view_rows 定位行。",
  get_attribute_view_bound_block_ids_by_item_ids:
    "get_attribute_view_bound_block_ids_by_item_ids 不是可见工具，ID 映射由工具内部自动处理。请先用 read_attribute_view 或 find_attribute_view_rows 定位行。",
  read_candidate_docs:
    "read_candidate_docs 已废弃。请使用 search_scope + read_docs 两步完成文档阅读。",
};

function buildUnknownToolHint(toolName: string): string {
  const hint = DEPRECATED_TOOL_HINTS[toolName];
  if (hint) return hint;
  return `Tool is not registered: ${toolName}`;
}

const SENSITIVE_KEY_PATTERN = /(^|[_-])(token|api[_-]?key|apikey|secret|password|authorization|bearer|cookie|credential|private[_-]?key)([_-]|$)/i;
const SENSITIVE_QUERY_KEY_PATTERN = /^(token|key|api[_-]?key|apikey|secret|password|authorization|bearer|cookie|credential|private[_-]?key)$/i;
const LOCAL_PATH_PATTERN = /([A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*|\/(?:home|mnt\/data|data|workspace|Users|var|tmp|opt|root)(?:\/[^\s"'`<>]*)?)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>]+/gi;
const LONG_TEXT_ARG_KEYS = new Set(["markdown", "content", "valueText"]);
const RETRY_TRACKED_FAILURE_CODES = new Set([
  "invalid_tool_arguments",
  "invalid_action_args",
  "invalid_args",
  "siyuan_api_failed",
  "write_operation_failed",
]);

function redactUrlQuery(urlText: string): string {
  try {
    const url = new URL(urlText);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString().replace(/%5BREDACTED%5D/gi, "[REDACTED]");
  } catch {
    return urlText.replace(/([?&])([^=\s&]+)=([^&\s]+)/g, (match, prefix: string, key: string) => (
      SENSITIVE_QUERY_KEY_PATTERN.test(key) ? `${prefix}${key}=[REDACTED]` : match
    ));
  }
}

function redactPreviewText(value: string, max = 120): string {
  const protectedUrls: string[] = [];
  let text = value
    .replace(URL_PATTERN, (match) => {
      const index = protectedUrls.push(redactUrlQuery(match)) - 1;
      return `__NB_URL_${index}__`;
    })
    .replace(/Authorization\s*:\s*Bearer\s+[^\s,;"']+/gi, "Authorization: [REDACTED]")
    .replace(/\b(token|api_key|apikey|password|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [REDACTED]")
    .replace(LOCAL_PATH_PATTERN, "[path]");

  text = text.replace(/__NB_URL_(\d+)__/g, (_, rawIndex: string) => protectedUrls[Number(rawIndex)] ?? "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

const AGGREGATE_SAFE_ARG_KEYS = new Set([
  "action",
  "docId",
  "blockId",
  "id",
  "path",
  "title",
  "position",
  "marker",
  "notebookId",
  "notebook",
  "previousID",
  "parentID",
  "targetPath",
]);

function appendSafePreviewValue(out: Record<string, unknown>, key: string, value: unknown, nested = false): void {
  if (SENSITIVE_KEY_PATTERN.test(key) || value == null) {
    if (SENSITIVE_KEY_PATTERN.test(key)) out[key] = "[REDACTED]";
    return;
  }
  if (key === "action" && typeof value === "string") {
    out[nested ? "innerAction" : "action"] = redactPreviewText(value, 80);
    return;
  }
  if (LONG_TEXT_ARG_KEYS.has(key) && typeof value === "string") {
    out[`${key}Chars`] = value.length;
    out[`${key}Digest`] = digestText(value);
    return;
  }
  if ((key === "docIds" || key === "blockIds" || key === "ids") && Array.isArray(value)) {
    out[`${key}Count`] = value.length;
    return;
  }
  if (!AGGREGATE_SAFE_ARG_KEYS.has(key)) return;
  if (typeof value === "string") {
    if (key === "docId" || key === "blockId" || key === "id" || key === "notebookId" || key === "notebook" || key === "previousID" || key === "parentID") {
      out[key] = "已指定";
    } else {
      out[key] = redactPreviewText(value, 120);
    }
  } else if (typeof value === "number" || typeof value === "boolean") {
    out[key] = value;
  }
}

function argsPreview(args: Record<string, unknown>, argsDigest?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === "args" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        appendSafePreviewValue(out, innerKey, innerValue, true);
      }
      continue;
    }
    const previewSizeBefore = Object.keys(out).length;
    appendSafePreviewValue(out, key, value);
    if (Object.keys(out).length > previewSizeBefore) {
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (typeof value === "string") {
      out[key] = redactPreviewText(value);
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 8).map((item) => (
        typeof item === "string"
          ? redactPreviewText(item)
          : typeof item === "number" || typeof item === "boolean" || item == null
            ? item
            : "[object]"
      ));
      if (value.length > 8) {
        (out[key] as unknown[]).push(`...还有 ${value.length - 8} 项`);
      }
    } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
      out[key] = value;
    } else if (typeof value === "object") {
      out[key] = "[object]";
    }
  }
  if (argsDigest) {
    out.argsDigest = argsDigest;
  }
  return out;
}

function actionLabel(args: Record<string, unknown>): string | undefined {
  const outer = typeof args.action === "string" ? args.action : undefined;
  const nestedArgs = args.args && typeof args.args === "object" && !Array.isArray(args.args)
    ? args.args as Record<string, unknown>
    : undefined;
  const inner = typeof nestedArgs?.action === "string" ? nestedArgs.action : undefined;
  if (outer && inner) return `${outer}.${inner}`;
  return outer;
}

function duplicateDetails(
  duplicateKind: "read" | "write",
  args: Record<string, unknown>,
  info: { firstStepIndex?: number; keyDigest: string },
): Record<string, unknown> {
  return {
    duplicateKind,
    action: actionLabel(args),
    firstStepIndex: info.firstStepIndex,
    argsDigest: info.keyDigest,
    keyDigest: info.keyDigest,
    argsPreview: argsPreview(args, info.keyDigest),
  };
}

function duplicateArgsPreview(args: Record<string, unknown>, info: { firstStepIndex?: number; keyDigest: string }): Record<string, unknown> {
  const preview = argsPreview(args, info.keyDigest);
  if (info.firstStepIndex !== undefined) {
    preview.firstStepIndex = info.firstStepIndex;
  }
  return preview;
}

function duplicateFailedDetails(args: Record<string, unknown>, info: FailedCallInfo): Record<string, unknown> {
  return {
    duplicateKind: "failed_call",
    action: actionLabel(args),
    firstStepIndex: info.firstStepIndex,
    previousErrorCode: info.errorCode,
    argsDigest: info.keyDigest,
    keyDigest: info.keyDigest,
    argsPreview: duplicateArgsPreview(args, info),
  };
}

function duplicateRawFailedDetails(rawArguments: string, info: FailedCallInfo): Record<string, unknown> {
  return {
    duplicateKind: "failed_call",
    firstStepIndex: info.firstStepIndex,
    previousErrorCode: info.errorCode,
    argsDigest: info.keyDigest,
    keyDigest: info.keyDigest,
    rawArgumentsChars: rawArguments.length,
  };
}

function isRetryTrackedFailureCode(code: string | undefined): code is string {
  return !!code && RETRY_TRACKED_FAILURE_CODES.has(code);
}

/**
 * Finish a tool call with a failure result. Ensures both
 * a role=tool message AND a `tool_result` UI event are emitted.
 */
function finishToolFailure(params: {
  call: AgentToolCall;
  toolName: string;
  code: string;
  message: string;
  recoverable?: boolean;
  field?: string;
  hint?: string;
  expected?: string;
  received?: string;
  details?: unknown;
  argsPreview?: Record<string, unknown>;
  stepIndex: number;
  startedAt: number;
  onEvent?: (event: AgentStreamEvent) => void;
}): AgentToolMessage {
  const failure = createToolExecutionFailure({
    toolName: params.toolName,
    code: params.code,
    message: params.message,
    recoverable: params.recoverable ?? true,
    field: params.field,
    hint: params.hint,
    expected: params.expected,
    received: params.received,
    details: params.details,
  });
  params.onEvent?.({
    type: "tool_result",
    stepIndex: params.stepIndex,
    toolCallId: params.call.id,
    toolName: params.toolName,
    result: failure,
    argsPreview: params.argsPreview,
    durationMs: Date.now() - params.startedAt,
  });
  return createToolMessage({
    toolCallId: params.call.id,
    name: params.toolName,
    content: failure.content,
  });
}

async function executeOne(params: {
  call: AgentToolCall;
  registry: NativeToolRegistry;
  executor: NativeToolExecutor;
  bridge: ToolConfirmationBridge;
  autoAllowedToolNames?: string[];
  stormBreaker: StormBreaker;
  ctx: ToolExecutionContext;
  stepIndex: number;
  onEvent?: (event: AgentStreamEvent) => void;
}): Promise<AgentToolMessage> {
  const startedAt = Date.now();

  // Parse arguments
  const parsed = parseToolCallArguments(params.call);
  if (parsed.ok === false) {
    const previousFailure = params.stormBreaker.getPreviousRawFailedCall(params.call.name, params.call.arguments);
    if (previousFailure?.errorCode === "invalid_tool_arguments") {
      params.stormBreaker.recordDuplicateFailedCallBlock(previousFailure);
      return finishToolFailure({
        call: params.call,
        toolName: params.call.name,
        code: "duplicate_failed_call_blocked",
        message: "同一失败调用已出现过，请不要同参重试，先使用 agent_tool_help.describe_action 或基于已有结果总结。",
        details: duplicateRawFailedDetails(params.call.arguments, previousFailure),
        argsPreview: {
          argsDigest: previousFailure.keyDigest,
          firstStepIndex: previousFailure.firstStepIndex,
          rawArgumentsChars: params.call.arguments.length,
        },
        stepIndex: params.stepIndex,
        startedAt,
        onEvent: params.onEvent,
      });
    }
    const failureInfo = params.stormBreaker.recordRawFailedCall(
      params.call.name,
      params.call.arguments,
      "invalid_tool_arguments",
      params.stepIndex,
    );
    return finishToolFailure({
      call: params.call,
      toolName: params.call.name,
      code: "invalid_tool_arguments",
      message: parsed.message,
      details: {
        argsDigest: failureInfo.keyDigest,
      },
      argsPreview: {
        argsDigest: failureInfo.keyDigest,
        rawArgumentsChars: params.call.arguments.length,
      },
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  // Check tool exists
  const tool = params.registry.get(params.call.name);
  if (!tool) {
    const isRepeated = params.stormBreaker.tryRecordUnknownTool(params.call.name);
    const code = isRepeated ? "repeated_unknown_tool" : "unknown_tool";
    const message = isRepeated
      ? `该工具当前未注册（${params.call.name}）。不要再次调用同名工具。请使用 mcp_manage.list_tools 查看实际可用工具名，或根据已知工具回答。`
      : buildUnknownToolHint(params.call.name);
    return finishToolFailure({
      call: params.call,
      toolName: params.call.name,
      code,
      message,
      recoverable: false,
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }
  const effectiveReadOnly = tool.isReadOnlyCall?.(parsed.args) ?? tool.readOnly;

  const previousFailure = params.stormBreaker.getPreviousFailedCall(params.call, parsed.args);
  if (previousFailure) {
    params.stormBreaker.recordDuplicateFailedCallBlock(previousFailure);
    return finishToolFailure({
      call: params.call,
      toolName: tool.name,
      code: "duplicate_failed_call_blocked",
      message: "同一失败调用已出现过，请不要同参重试，先使用 agent_tool_help.describe_action 或基于已有结果总结。",
      details: duplicateFailedDetails(parsed.args, previousFailure),
      argsPreview: duplicateArgsPreview(parsed.args, previousFailure),
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  // Storm breaker: duplicate write check
  if (!effectiveReadOnly && params.stormBreaker.shouldBlockWrite(params.call, parsed.args)) {
    params.stormBreaker.recordDuplicateWriteBlock();
    const duplicateInfo = params.stormBreaker.getDuplicateWriteInfo(params.call, parsed.args);
    const preview = duplicateArgsPreview(parsed.args, duplicateInfo);
    return finishToolFailure({
      call: params.call,
      toolName: tool.name,
      code: "duplicate_write_call_blocked",
      message: "The runtime blocked a duplicate write call in the same agent turn.",
      details: duplicateDetails("write", parsed.args, duplicateInfo),
      argsPreview: preview,
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  // Storm breaker: duplicate read check — same tool + same args in one turn.
  // tryReserveRead atomically checks AND reserves before execution, so
  // concurrent calls in the same Promise.all batch cannot both pass.
  if (effectiveReadOnly && !params.stormBreaker.tryReserveRead(params.call, parsed.args, params.stepIndex)) {
    params.stormBreaker.recordDuplicateReadBlock();
    const duplicateInfo = params.stormBreaker.getDuplicateReadInfo(params.call, parsed.args);
    const preview = duplicateArgsPreview(parsed.args, duplicateInfo);
    return finishToolFailure({
      call: params.call,
      toolName: tool.name,
      code: "duplicate_read_call_blocked",
      message: "本轮同一工具同一参数已调用过，请使用前一次结果回答，不要重复调用。",
      details: duplicateDetails("read", parsed.args, duplicateInfo),
      argsPreview: preview,
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  if (params.stormBreaker.shouldBlockSimilarTrajectory(tool, params.call, parsed.args, effectiveReadOnly)) {
    params.stormBreaker.recordTrajectoryBlock();
    return finishToolFailure({
      call: params.call,
      toolName: tool.name,
      code: "trajectory_repetition_detected",
      message: "你正在重复相似探索。请停止继续调用相似工具，基于已有结果总结，或明确换策略/缩小范围。",
      recoverable: true,
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  // Emit tool_start
  params.onEvent?.({
    type: "tool_start",
    stepIndex: params.stepIndex,
    toolCallId: params.call.id,
    toolName: tool.name,
    argsPreview: argsPreview(parsed.args, params.stormBreaker.getCallDigest(params.call, parsed.args)),
    readOnly: effectiveReadOnly,
    startedAt,
  });

  if (tool.preflightValidate) {
    let validation: ToolArgsValidationResult;
    try {
      validation = await tool.preflightValidate(parsed.args);
    } catch (err) {
      const failureInfo = params.stormBreaker.recordFailedCall(
        params.call,
        parsed.args,
        "invalid_args",
        params.stepIndex,
      );
      if (failureInfo.count > 1) {
        return finishToolFailure({
          call: params.call,
          toolName: tool.name,
          code: "duplicate_failed_call_blocked",
          message: "同一失败调用已出现过，请不要同参重试，先使用 agent_tool_help.describe_action 或基于已有结果总结。",
          details: duplicateFailedDetails(parsed.args, failureInfo),
          argsPreview: duplicateArgsPreview(parsed.args, failureInfo),
          stepIndex: params.stepIndex,
          startedAt,
          onEvent: params.onEvent,
        });
      }
      return finishToolFailure({
        call: params.call,
        toolName: tool.name,
        code: "invalid_args",
        message: err instanceof Error ? err.message : "参数校验失败。",
        recoverable: true,
        argsPreview: argsPreview(parsed.args, failureInfo.keyDigest),
        stepIndex: params.stepIndex,
        startedAt,
        onEvent: params.onEvent,
      });
    }

    if (validation.ok === false) {
      const failureCode = validation.error?.code ?? "invalid_args";
      const failureInfo = params.stormBreaker.recordFailedCall(
        params.call,
        parsed.args,
        failureCode,
        params.stepIndex,
      );
      if (failureInfo.count > 1) {
        return finishToolFailure({
          call: params.call,
          toolName: tool.name,
          code: "duplicate_failed_call_blocked",
          message: "同一失败调用已出现过，请不要同参重试，先使用 agent_tool_help.describe_action 或基于已有结果总结。",
          details: duplicateFailedDetails(parsed.args, failureInfo),
          argsPreview: duplicateArgsPreview(parsed.args, failureInfo),
          stepIndex: params.stepIndex,
          startedAt,
          onEvent: params.onEvent,
        });
      }
      return finishToolFailure({
        call: params.call,
        toolName: tool.name,
        code: failureCode,
        message: validation.error?.message ?? "参数校验失败。",
        recoverable: true,
        details: validation.error?.details,
        argsPreview: argsPreview(parsed.args, failureInfo.keyDigest),
        stepIndex: params.stepIndex,
        startedAt,
        onEvent: params.onEvent,
      });
    }
  }

  // For write tools: call preview, then emit permission_required, then await bridge
  if (!effectiveReadOnly) {
    const gate = new DefaultToolPermissionGate(params.bridge, params.autoAllowedToolNames);
    const permission = await gate.check({
      tool,
      args: parsed.args,
      onPermissionRequired: (preview) => {
        params.onEvent?.({
          type: "permission_required",
          stepIndex: params.stepIndex,
          toolCallId: params.call.id,
          preview,
        });
      },
    });

    if (permission.decision.type === "deny") {
      params.onEvent?.({
        type: "permission_resolved",
        stepIndex: params.stepIndex,
        toolCallId: params.call.id,
        approved: false,
        reason: permission.decision.reason,
      });
      const isUserCancellation = permission.decision.reasonCode === undefined;
      return finishToolFailure({
        call: params.call,
        toolName: tool.name,
        code: isUserCancellation ? "user_rejected" : permission.decision.reasonCode,
        message: permission.decision.reason ?? "用户拒绝执行该操作。",
        stepIndex: params.stepIndex,
        startedAt,
        onEvent: params.onEvent,
      });
    }

    // Inject confirmationId into args for executeConfirmed path
    if (permission.preview.confirmationId) {
      parsed.args = { ...parsed.args, _confirmationId: permission.preview.confirmationId };
    }

    params.onEvent?.({
      type: "permission_resolved",
      stepIndex: params.stepIndex,
      toolCallId: params.call.id,
      approved: true,
    });
  }

  // User-aborted check
  if (params.ctx.abortSignal?.aborted) {
    return finishToolFailure({
      call: params.call,
      toolName: tool.name,
      code: "user_aborted",
      message: "User aborted the operation.",
      recoverable: false,
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  // Execute tool
  const result = await params.executor.execute({
    tool,
    args: parsed.args,
    ctx: params.ctx,
  });
  const durationMs = Date.now() - startedAt;

  // Mark successful writes for duplicate guard
  if (result.ok) {
    params.stormBreaker.recordSuccessfulCall();
  }
  if (!effectiveReadOnly && result.ok) {
    params.stormBreaker.markWriteSuccess(params.call, parsed.args, params.stepIndex);
  }
  const resultErrorCode = result.ok ? undefined : result.errorCode ?? result.code;
  const resultArgsDigest = params.stormBreaker.getCallDigest(params.call, parsed.args);
  if (isRetryTrackedFailureCode(resultErrorCode)) {
    params.stormBreaker.recordFailedCall(params.call, parsed.args, resultErrorCode, params.stepIndex);
  }

  // Emit tool_result for all outcomes
  params.onEvent?.({
    type: "tool_result",
    stepIndex: params.stepIndex,
    toolCallId: params.call.id,
    toolName: tool.name,
    result,
    durationMs,
    argsPreview: result.ok ? undefined : argsPreview(parsed.args, resultArgsDigest),
  });

  return createToolMessage({
    toolCallId: params.call.id,
    name: tool.name,
    content: result.content,
  });
}

function canRunReadBatch(registry: NativeToolRegistry, calls: readonly AgentToolCall[]): boolean {
  if (calls.length === 0) return false;
  return calls.every((call) => {
    const tool = registry.get(call.name);
    return tool?.readOnly === true && tool.parallelSafe === true;
  });
}

export async function dispatchToolCalls(params: {
  calls: readonly AgentToolCall[];
  registry: NativeToolRegistry;
  ctx: ToolExecutionContext;
  stepOffset?: number;
  bridge: ToolConfirmationBridge;
  autoAllowedToolNames?: string[];
  stormBreaker?: StormBreaker;
  onEvent?: (event: AgentStreamEvent) => void;
}): Promise<DispatchToolCallsResult> {
  const executor = new NativeToolExecutor();
  const stormBreaker = params.stormBreaker ?? new StormBreaker();
  const toolMessages: AgentToolMessage[] = new Array(params.calls.length);
  let cursor = 0;

  while (cursor < params.calls.length) {
    const current = params.calls[cursor];
    const currentTool: NativeTool | undefined = params.registry.get(current.name);
    const readBatch: AgentToolCall[] = [];

    // Only batch consecutive readOnly + parallelSafe tools
    if (currentTool?.readOnly && currentTool.parallelSafe === true) {
      let scan = cursor;
      while (scan < params.calls.length) {
        const candidate = params.calls[scan];
        if (!canRunReadBatch(params.registry, [candidate])) break;
        readBatch.push(candidate);
        scan++;
      }
    }

    if (readBatch.length > 1) {
      const results = await Promise.all(readBatch.map((call, index) => executeOne({
        call,
        registry: params.registry,
        executor,
        bridge: params.bridge,
        autoAllowedToolNames: params.autoAllowedToolNames,
        stormBreaker,
        ctx: params.ctx,
        stepIndex: (params.stepOffset ?? 0) + cursor + index + 1,
        onEvent: params.onEvent,
      })));
      for (let i = 0; i < results.length; i++) {
        toolMessages[cursor + i] = results[i];
      }
      cursor += readBatch.length;
      continue;
    }

    toolMessages[cursor] = await executeOne({
      call: current,
      registry: params.registry,
      executor,
      bridge: params.bridge,
      autoAllowedToolNames: params.autoAllowedToolNames,
      stormBreaker,
      ctx: params.ctx,
      stepIndex: (params.stepOffset ?? 0) + cursor + 1,
      onEvent: params.onEvent,
    });
    cursor++;
  }

  // Check if any tool result is a repeated_unknown_tool → fatal
  for (const msg of toolMessages) {
    if (!msg) continue;
    const content = parseToolResultContentEnvelope(msg.content);
    if (content?.code === "repeated_unknown_tool") {
      return {
        toolMessages,
        stepCount: params.calls.length,
        fatalErrorCode: "repeated_unknown_tool",
        fatalErrorMessage: "模型重复调用了未注册工具，本轮已停止。请先使用 mcp_manage.list_tools 查看实际可用工具名。",
      };
    }
    if (content?.code === "trajectory_repetition_detected" && stormBreaker.shouldFatalAfterTrajectoryBlock()) {
      return {
        toolMessages,
        stepCount: params.calls.length,
        fatalErrorCode: "trajectory_repetition_detected",
        fatalErrorMessage: "模型多次重复相似探索，本轮已停止，请缩小范围或总结已有结果。",
      };
    }
    if (content?.code === "duplicate_write_call_blocked" && stormBreaker.shouldFatalAfterDuplicateWriteBlock()) {
      return {
        toolMessages,
        stepCount: params.calls.length,
        fatalErrorCode: "duplicate_write_call_blocked",
        fatalErrorMessage: "模型在同一轮重复请求已被拦截的写操作，本轮已停止，请基于已有结果总结。",
      };
    }
    if (content?.code === "duplicate_read_call_blocked" && stormBreaker.shouldFatalAfterDuplicateReadBlock()) {
      return {
        toolMessages,
        stepCount: params.calls.length,
        fatalErrorCode: "duplicate_read_call_blocked",
        fatalErrorMessage: "模型在同一轮重复请求已拦截的只读调用，本轮已停止，请基于已有结果总结。",
      };
    }
    if (content?.code === "duplicate_failed_call_blocked") {
      return {
        toolMessages,
        stepCount: params.calls.length,
        fatalErrorCode: "duplicate_failed_call_blocked",
        fatalErrorMessage: "模型重复提交了已失败的同一工具同一参数，本轮已停止，请基于已有结果总结失败原因。",
      };
    }
    if (content?.code === "invalid_action_args" && stormBreaker.shouldFatalAfterRepeatedInvalidActionArgs()) {
      return {
        toolMessages,
        stepCount: params.calls.length,
        fatalErrorCode: "repeated_invalid_action_args",
        fatalErrorMessage: "模型在同一工具 action 上反复提交无效参数，本轮已停止。请先使用 agent_tool_help.describe_action 查看参数说明，或基于已有结果总结失败原因。",
      };
    }
  }

  return {
    toolMessages,
    stepCount: params.calls.length,
  };
}
