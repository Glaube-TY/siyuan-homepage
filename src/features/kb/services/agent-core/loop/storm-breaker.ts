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

export function buildGuardKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(stripRuntimeFields(args))}`;
}

export function digestText(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface DuplicateGuardInfo {
  firstStepIndex?: number;
  keyDigest: string;
}

export interface FailedCallInfo {
  errorCode: string;
  firstStepIndex?: number;
  keyDigest: string;
  count: number;
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

function buildActionKey(toolName: string, args: Record<string, unknown>): string {
  const cleanArgs = stripRuntimeFields(args);
  const nestedArgs = cleanArgs.args && typeof cleanArgs.args === "object" && !Array.isArray(cleanArgs.args)
    ? cleanArgs.args as Record<string, unknown>
    : undefined;
  const action = typeof cleanArgs.action === "string" ? cleanArgs.action : "";
  const innerAction = typeof nestedArgs?.action === "string" ? nestedArgs.action : "";
  return `${toolName}:action=${stableStringify(action)}:innerAction=${stableStringify(innerAction)}`;
}

function buildRawGuardKey(toolName: string, rawArguments: string): string {
  return `${toolName}:${stableStringify({ rawArguments })}`;
}

function buildReadGuardKey(toolName: string, args: Record<string, unknown>, readStateEpoch: number): string {
  return `${buildGuardKey(toolName, args)}:readStateEpoch=${readStateEpoch}`;
}

function shouldTrackSimilarReadOnlyTool(tool: NativeTool, effectiveReadOnly: boolean): boolean {
  if (effectiveReadOnly !== true) return false;
  if (BUSINESS_READ_TOOL_NAMES.has(tool.name)) return false;
  if (EXPLORATION_READ_TOOL_NAMES.has(tool.name)) return true;
  return tool.source === "mcp";
}

export class StormBreaker {
  private readonly successfulWriteCalls = new Set<string>();
  private readonly readCallHistory = new Set<string>();
  private readonly successfulWriteCallInfo = new Map<string, DuplicateGuardInfo>();
  private readonly readCallInfo = new Map<string, DuplicateGuardInfo>();
  private readonly failedCallHistory = new Map<string, FailedCallInfo>();
  private readonly failedCallByGuardKey = new Map<string, FailedCallInfo>();
  private readonly unknownToolHistory = new Set<string>();
  private readonly actionFingerprintCounts = new Map<string, number>();
  private trajectoryBlockCount = 0;
  private duplicateWriteBlockCount = 0;
  private duplicateReadBlockCount = 0;
  private lastInvalidActionKey: string | undefined;
  private consecutiveInvalidActionArgCount = 0;
  private repeatedInvalidActionArgsFatal = false;
  private readStateEpoch = 0;

  shouldBlockWrite(toolCall: AgentToolCall, args: Record<string, unknown>): boolean {
    const key = buildGuardKey(toolCall.name, args);
    return this.successfulWriteCalls.has(key);
  }

  getDuplicateWriteInfo(toolCall: AgentToolCall, args: Record<string, unknown>): DuplicateGuardInfo {
    const key = buildGuardKey(toolCall.name, args);
    return this.successfulWriteCallInfo.get(key) ?? { keyDigest: digestText(key) };
  }

  getDuplicateReadInfo(toolCall: AgentToolCall, args: Record<string, unknown>): DuplicateGuardInfo {
    const key = buildReadGuardKey(toolCall.name, args, this.readStateEpoch);
    return this.readCallInfo.get(key) ?? { keyDigest: digestText(key) };
  }

  getCallDigest(toolCall: AgentToolCall, args: Record<string, unknown>): string {
    return digestText(buildGuardKey(toolCall.name, args));
  }

  getPreviousFailedCall(toolCall: AgentToolCall, args: Record<string, unknown>): FailedCallInfo | undefined {
    return this.failedCallByGuardKey.get(buildGuardKey(toolCall.name, args));
  }

  getPreviousRawFailedCall(toolName: string, rawArguments: string): FailedCallInfo | undefined {
    return this.failedCallByGuardKey.get(buildRawGuardKey(toolName, rawArguments));
  }

  recordFailedCall(
    toolCall: AgentToolCall,
    args: Record<string, unknown>,
    errorCode: string,
    stepIndex?: number,
  ): FailedCallInfo {
    const guardKey = buildGuardKey(toolCall.name, args);
    const failureKey = `${guardKey}:error=${errorCode}`;
    const previous = this.failedCallHistory.get(failureKey);
    const info: FailedCallInfo = {
      errorCode,
      firstStepIndex: previous?.firstStepIndex ?? stepIndex,
      keyDigest: digestText(guardKey),
      count: (previous?.count ?? 0) + 1,
    };
    this.failedCallHistory.set(failureKey, info);
    this.failedCallByGuardKey.set(guardKey, info);

    if (errorCode === "invalid_action_args") {
      const actionKey = buildActionKey(toolCall.name, args);
      if (this.lastInvalidActionKey === actionKey) {
        this.consecutiveInvalidActionArgCount += 1;
      } else {
        this.lastInvalidActionKey = actionKey;
        this.consecutiveInvalidActionArgCount = 1;
      }
      if (this.consecutiveInvalidActionArgCount >= 2) {
        this.repeatedInvalidActionArgsFatal = true;
      }
    } else {
      this.lastInvalidActionKey = undefined;
      this.consecutiveInvalidActionArgCount = 0;
    }

    return info;
  }

  recordRawFailedCall(
    toolName: string,
    rawArguments: string,
    errorCode: string,
    stepIndex?: number,
  ): FailedCallInfo {
    const guardKey = buildRawGuardKey(toolName, rawArguments);
    const failureKey = `${guardKey}:error=${errorCode}`;
    const previous = this.failedCallHistory.get(failureKey);
    const info: FailedCallInfo = {
      errorCode,
      firstStepIndex: previous?.firstStepIndex ?? stepIndex,
      keyDigest: digestText(guardKey),
      count: (previous?.count ?? 0) + 1,
    };
    this.failedCallHistory.set(failureKey, info);
    this.failedCallByGuardKey.set(guardKey, info);
    this.lastInvalidActionKey = undefined;
    this.consecutiveInvalidActionArgCount = 0;
    return info;
  }

  recordDuplicateFailedCallBlock(info: FailedCallInfo): void {
    if (info.errorCode === "invalid_action_args") {
      this.repeatedInvalidActionArgsFatal = true;
    }
  }

  shouldFatalAfterRepeatedInvalidActionArgs(): boolean {
    return this.repeatedInvalidActionArgsFatal;
  }

  recordSuccessfulCall(): void {
    this.lastInvalidActionKey = undefined;
    this.consecutiveInvalidActionArgCount = 0;
  }

  recordDuplicateWriteBlock(): void {
    this.duplicateWriteBlockCount += 1;
  }

  shouldFatalAfterDuplicateWriteBlock(): boolean {
    return this.duplicateWriteBlockCount >= 2;
  }

  recordDuplicateReadBlock(): void {
    this.duplicateReadBlockCount += 1;
  }

  shouldFatalAfterDuplicateReadBlock(): boolean {
    return this.duplicateReadBlockCount >= 3;
  }

  markWriteSuccess(toolCall: AgentToolCall, args: Record<string, unknown>, stepIndex?: number): void {
    const key = buildGuardKey(toolCall.name, args);
    this.successfulWriteCalls.add(key);
    if (!this.successfulWriteCallInfo.has(key)) {
      this.successfulWriteCallInfo.set(key, { firstStepIndex: stepIndex, keyDigest: digestText(key) });
    }
    this.readStateEpoch += 1;
  }

  /**
   * Reserve a read-only tool call key BEFORE execution. Returns true if the
   * key is newly reserved (should execute), false if it was already reserved
   * (duplicate, should block). Atomic — concurrent calls with the same key
   * in a Promise.all batch will only get one reservation.
   */
  tryReserveRead(toolCall: AgentToolCall, args: Record<string, unknown>, stepIndex?: number): boolean {
    const key = buildReadGuardKey(toolCall.name, args, this.readStateEpoch);
    if (this.readCallHistory.has(key)) return false;
    this.readCallHistory.add(key);
    this.readCallInfo.set(key, { firstStepIndex: stepIndex, keyDigest: digestText(key) });
    return true;
  }

  /**
   * Lightweight trajectory guard for repeated similar exploration.
   * It only tracks read-only / external MCP-search style tools, never write tools.
   */
  shouldBlockSimilarTrajectory(
    tool: NativeTool,
    toolCall: AgentToolCall,
    args: Record<string, unknown>,
    effectiveReadOnly = tool.readOnly,
  ): boolean {
    if (!shouldTrackSimilarReadOnlyTool(tool, effectiveReadOnly)) return false;
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
