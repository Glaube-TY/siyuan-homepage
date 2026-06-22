import { createToolMessage, type AgentToolCall, type AgentToolMessage } from "../messages/agent-message";
import { parseToolCallArguments } from "../messages/tool-call-message";
import type { ToolConfirmationBridge } from "../permissions/confirmation-bridge";
import { DefaultToolPermissionGate } from "../permissions/tool-permission-gate";
import type { NativeToolRegistry } from "../tools/native-tool-registry";
import { NativeToolExecutor } from "../tools/tool-executor";
import { createToolExecutionFailure } from "../tools/tool-execution-result";
import type { NativeTool, ToolExecutionContext } from "../tools/native-tool";
import type { AgentStreamEvent } from "./stream-event";
import { StormBreaker } from "./storm-breaker";

export interface DispatchToolCallsResult {
  toolMessages: AgentToolMessage[];
  stepCount: number;
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

function argsPreview(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      out[key] = value.length > 120 ? `${value.slice(0, 117)}...` : value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 10);
    } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
      out[key] = value;
    }
  }
  return out;
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
  stepIndex: number;
  startedAt: number;
  onEvent?: (event: AgentStreamEvent) => void;
}): AgentToolMessage {
  const failure = createToolExecutionFailure({
    toolName: params.toolName,
    code: params.code,
    message: params.message,
    recoverable: params.recoverable ?? true,
  });
  params.onEvent?.({
    type: "tool_result",
    stepIndex: params.stepIndex,
    toolCallId: params.call.id,
    toolName: params.toolName,
    result: failure,
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
    return finishToolFailure({
      call: params.call,
      toolName: params.call.name,
      code: "invalid_tool_arguments",
      message: parsed.message,
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  // Check tool exists
  const tool = params.registry.get(params.call.name);
  if (!tool) {
    return finishToolFailure({
      call: params.call,
      toolName: params.call.name,
      code: "unknown_tool",
      message: buildUnknownToolHint(params.call.name),
      recoverable: false,
      stepIndex: params.stepIndex,
      startedAt,
      onEvent: params.onEvent,
    });
  }

  // Storm breaker: duplicate write check
  if (!tool.readOnly && params.stormBreaker.shouldBlockWrite(params.call, parsed.args)) {
    return finishToolFailure({
      call: params.call,
      toolName: tool.name,
      code: "duplicate_write_call_blocked",
      message: "The runtime blocked a duplicate write call in the same agent turn.",
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
    argsPreview: argsPreview(parsed.args),
    readOnly: tool.readOnly,
    startedAt,
  });

  // For write tools: call preview, then emit permission_required, then await bridge
  if (!tool.readOnly) {
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
      return finishToolFailure({
        call: params.call,
        toolName: tool.name,
        code: "user_rejected",
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
  if (!tool.readOnly && result.ok) {
    params.stormBreaker.markWriteSuccess(params.call, parsed.args);
  }

  // Emit tool_result for all outcomes
  params.onEvent?.({
    type: "tool_result",
    stepIndex: params.stepIndex,
    toolCallId: params.call.id,
    toolName: tool.name,
    result,
    durationMs,
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

  return {
    toolMessages,
    stepCount: params.calls.length,
  };
}
