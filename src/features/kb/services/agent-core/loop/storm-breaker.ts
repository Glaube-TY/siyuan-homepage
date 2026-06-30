import type { AgentToolCall } from "../messages/agent-message";
import type { NativeTool } from "../tools/native-tool";

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

/** Strip runtime-injected temporary fields (keys starting with _) before generating the guard key. */
function stripRuntimeFields(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!key.startsWith("_")) out[key] = value;
  }
  return out;
}

function buildGuardKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(stripRuntimeFields(args))}`;
}

const TARGET_KEYS = [
  "docId",
  "docIds",
  "blockId",
  "blockIds",
  "targetId",
  "databaseId",
  "keyId",
  "path",
  "url",
  "serverId",
];

const EXPLORATION_READ_TOOL_NAMES = new Set([
  "search_scope",
  "read_docs",
  "read_doc_blocks",
  "web_search",
  "web_read_page",
  "web_http_get",
  "siyuan_search_extra",
  "find_attribute_view_rows",
]);

const BUSINESS_READ_TOOL_NAMES = new Set([
  "get_daily_workspace_overview",
  "query_tasks",
  "list_items_by_time",
  "get_doc_info",
  "query_diary_records",
  "find_diary_docs",
]);

function buildActionFingerprint(toolName: string, args: Record<string, unknown>): string {
  const cleanArgs = stripRuntimeFields(args);
  const action = cleanArgs.action ?? cleanArgs.operation ?? "";
  const keySet = Object.keys(cleanArgs).sort().join(",");
  const targets: Record<string, unknown> = {};
  for (const key of TARGET_KEYS) {
    if (cleanArgs[key] !== undefined) targets[key] = cleanArgs[key];
  }
  return `${toolName}:action=${stableStringify(action)}:keys=${keySet}:targets=${stableStringify(targets)}`;
}

function shouldTrackSimilarReadOnlyTool(tool: NativeTool): boolean {
  if (tool.readOnly !== true) return false;
  if (BUSINESS_READ_TOOL_NAMES.has(tool.name)) return false;
  if (EXPLORATION_READ_TOOL_NAMES.has(tool.name)) return true;
  return tool.source === "mcp";
}

export class StormBreaker {
  private readonly successfulWriteCalls = new Set<string>();
  private readonly readCallHistory = new Set<string>();
  private readonly unknownToolHistory = new Set<string>();
  private readonly actionFingerprintCounts = new Map<string, number>();
  private trajectoryBlockCount = 0;

  shouldBlockWrite(toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    const key = buildGuardKey(toolCall.name, args);
    return this.successfulWriteCalls.has(key);
  }

  markWriteSuccess(toolCall: AgentToolCall, args: Record<string, unknown>): void {
    const key = buildGuardKey(toolCall.name, args);
    this.successfulWriteCalls.add(key);
  }

  /**
   * Reserve a read-only tool call key BEFORE execution. Returns true if the
   * key is newly reserved (should execute), false if it was already reserved
   * (duplicate, should block). Atomic — concurrent calls with the same key
   * in a Promise.all batch will only get one reservation.
   */
  tryReserveRead(toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    const key = buildGuardKey(toolCall.name, args);
    if (this.readCallHistory.has(key)) return false;
    this.readCallHistory.add(key);
    return true;
  }

  /**
   * Lightweight trajectory guard for repeated similar exploration.
   * It only tracks read-only / external MCP-search style tools, never write tools.
   */
  shouldBlockSimilarTrajectory(tool: NativeTool, toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    if (!shouldTrackSimilarReadOnlyTool(tool)) return false;
    const fingerprint = buildActionFingerprint(toolCall.name, args);
    const count = this.actionFingerprintCounts.get(fingerprint) ?? 0;
    if (count >= 3) return true;
    this.actionFingerprintCounts.set(fingerprint, count + 1);
    return false;
  }

  recordTrajectoryBlock(): void {
    this.trajectoryBlockCount += 1;
  }

  shouldFatalAfterTrajectoryBlock(): boolean {
    return this.trajectoryBlockCount >= 2;
  }

  /**
   * Returns true if this unknown tool name has been seen before in this turn.
   * First occurrence returns false and records the name.
   */
  tryRecordUnknownTool(toolName: string): boolean {
    if (this.unknownToolHistory.has(toolName)) return true;
    this.unknownToolHistory.add(toolName);
    return false;
  }
}
