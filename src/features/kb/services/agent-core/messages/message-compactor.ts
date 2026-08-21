import type { AgentMessage, AgentToolMessage } from "./agent-message";
import { normalizeToolCallMessages } from "./message-normalizer";
import { parseToolResultContentEnvelope } from "../tools/tool-execution-result";
import {
  estimateAgentMessagesTokens,
  estimateTextTokensConservative,
  DEFAULT_MAX_CONTEXT_TOKENS,
  RUNTIME_TOOL_RESULT_MAX_CHARS,
  resolveRuntimeObservationBudget,
} from "../../../types/context-usage";

export interface MessageCompactionOptions {
  maxToolContentChars?: number;
  maxToolResultTokens?: number;
  maxObservationTokens?: number;
  maxInputTokens?: number;
  resolveCallReadOnly?: ToolCallReadOnlyResolver;
}

const DEFAULT_MAX_TOOL_CONTENT_CHARS = RUNTIME_TOOL_RESULT_MAX_CHARS;
const DEFAULT_MAX_TOOL_RESULT_TOKENS = resolveRuntimeObservationBudget(DEFAULT_MAX_CONTEXT_TOKENS);
const DEFAULT_MAX_OBSERVATION_TOKENS = resolveRuntimeObservationBudget(DEFAULT_MAX_CONTEXT_TOKENS);

/** NativeTool/contract safety projected into the message compactor. */
export type ToolCallReadOnlyResolver = (
  toolName: string,
  args?: Record<string, unknown>,
) => boolean | undefined;

interface ResolvedToolOperation {
  action: string;
  innerAction?: string;
  args: Record<string, unknown>;
}

function collectToolCallArgs(messages: readonly AgentMessage[]): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      try {
        const parsed = JSON.parse(call.arguments);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          result.set(call.id, parsed as Record<string, unknown>);
        }
      } catch { /* 参数损坏时按未知、高敏结果压缩。 */ }
    }
  }
  return result;
}

function resolveToolOperation(rawArgs?: Record<string, unknown>): ResolvedToolOperation {
  const outer = rawArgs ?? {};
  const nested = outer.args && typeof outer.args === "object" && !Array.isArray(outer.args)
    ? outer.args as Record<string, unknown>
    : outer;
  const action = typeof outer.action === "string" ? outer.action : "unknown";
  const innerAction = nested !== outer && typeof nested.action === "string" ? nested.action : undefined;
  return { action, innerAction, args: nested };
}

function digestSafeText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  let hash = 0x811c9dc5;
  for (const char of value.trim()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function unwrapToolPayload(parsed: Record<string, any>): Record<string, any> {
  const data = asRecord(parsed.data);
  return asRecord(data.result ?? data.content ?? parsed.result ?? data ?? parsed);
}

function safeStrings(value: unknown, max = 5, maxChars = 120): string[] {
  const items = Array.isArray(value) ? value : (typeof value === "string" ? [value] : []);
  return [...new Set(items.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
    .slice(0, max)
    .map((item) => sanitizeToolResultString(item, maxChars));
}

function isWriteCall(
  message: AgentToolMessage,
  rawArgs: Record<string, unknown> | undefined,
  resolveCallReadOnly: ToolCallReadOnlyResolver | undefined,
): boolean {
  // Without the live registry, unknown calls stay on the safe write path so a
  // successful mutation is never discarded as an ordinary observation.
  return resolveCallReadOnly?.(message.name, rawArgs) !== true;
}

const MAX_HOMEPAGE_LIST_OUTPUT_CHARS = 11_000;
const MAX_HOMEPAGE_DEGRADED_WIDGET_SUMMARIES = 8;
const HOMEPAGE_WIDGET_FIELDS = ["widgetId", "type", "index", "sectionId", "configRevision", "subtool", "resolutionStatus"] as const;

function safeOptionalString(value: unknown, maxChars = 120): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) return undefined;
  return sanitizeToolResultString(value, maxChars);
}

function finiteNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const MAX_SAFE_CONFIG_PREVIEW_CHARS = 4_000;

function compactSafeConfig(value: unknown, previewChars = MAX_SAFE_CONFIG_PREVIEW_CHARS): Record<string, unknown> {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { safeConfigPreview: "[配置无法安全序列化]", safeConfigTruncated: true };
  }
  const safePreviewChars = Math.max(3, previewChars);
  if (serialized === undefined || serialized.length > safePreviewChars) {
    return {
      safeConfigPreview: sanitizeToolResultString(
        serialized?.slice(0, safePreviewChars) ?? "[配置不可用]",
        safePreviewChars,
      ),
      safeConfigTruncated: true,
    };
  }
  return { safeConfig: value, safeConfigTruncated: false };
}

function compactEditableConfig(
  value: unknown,
  previewChars = MAX_SAFE_CONFIG_PREVIEW_CHARS,
): Record<string, unknown> {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return { editableConfig: {}, editableConfigTruncated: false };
  let truncated = false;
  const projected: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === "string") {
      if (val.length > previewChars) {
        projected[key] = `${val.slice(0, previewChars)}... [已截断]`;
        truncated = true;
      } else {
        projected[key] = val;
      }
    } else if (typeof val === "number" || typeof val === "boolean" || val === null) {
      projected[key] = val;
    } else if (Array.isArray(val)) {
      projected[key] = val.slice(0, 20);
      if (val.length > 20) truncated = true;
    } else {
      projected[key] = val;
    }
  }
  return {
    editableConfig: projected,
    editableConfigTruncated: truncated,
  };
}

function compactBusinessCapability(value: unknown): Record<string, unknown> | null {
  const capability = asRecord(value);
  if (Object.keys(capability).length === 0) return null;
  const operations = Array.isArray(capability.operations) ? capability.operations : [];
  return {
    toolName: safeOptionalString(capability.toolName, 64) ?? null,
    subtool: safeOptionalString(capability.subtool, 64) ?? null,
    operationCount: operations.length,
    ...(typeof capability.supported === "boolean" ? { supported: capability.supported } : {}),
    ...(typeof capability.reusedExistingTool === "boolean" ? { reusedExistingTool: capability.reusedExistingTool } : {}),
    ...(typeof capability.reason === "string" ? { reason: safeOptionalString(capability.reason, 120) } : {}),
  };
}

function compactHomepageWidgetRow(value: unknown): unknown[] {
  const widget = asRecord(value);
  const capability = asRecord(widget.businessCapability);
  return [
    safeOptionalString(widget.widgetId, 64) ?? null,
    safeOptionalString(widget.type, 64) ?? null,
    finiteNumberOrNull(widget.index) ?? null,
    safeOptionalString(widget.sectionId, 64) ?? null,
    finiteNumberOrNull(widget.configRevision) ?? null,
    safeOptionalString(capability.subtool, 64) ?? null,
    widget.resolutionStatus === "resolved" ? null : safeOptionalString(widget.resolutionStatus) ?? null,
  ];
}

function homepageWidgetResolvedType(value: unknown): string | undefined {
  const widget = asRecord(value);
  if (widget.resolutionStatus !== "resolved" || typeof widget.type !== "string" || !widget.type.trim()) {
    return undefined;
  }
  return widget.type.trim();
}

function homepageListPayload(
  base: Record<string, unknown>,
  payload: Record<string, any>,
  widgets: unknown[],
  projectedWidgets: unknown[],
  coverageMode: "all_instances" | "one_per_type",
  distinctResolvedTypeCount: number,
  degradedWidgetCount: number,
  resolvedWidgetCount: number,
  returnedDegradedWidgetCount: number,
): Record<string, unknown> {
  return {
    ...base,
    status: safeOptionalString(payload.status) ?? "ok",
    surface: safeOptionalString(payload.surface),
    layoutRevision: finiteNumberOrNull(payload.layoutRevision),
    widgetCount: widgets.length,
    totalWidgetCount: widgets.length,
    distinctResolvedTypeCount,
    resolvedWidgetCount,
    degradedWidgetCount,
    returnedWidgetCount: projectedWidgets.length,
    returnedDegradedWidgetCount,
    omittedDuplicateWidgetCount: coverageMode === "one_per_type" ? Math.max(0, resolvedWidgetCount - distinctResolvedTypeCount) : 0,
    omittedDegradedWidgetCount: coverageMode === "one_per_type" ? Math.max(0, degradedWidgetCount - returnedDegradedWidgetCount) : 0,
    truncated: projectedWidgets.length < widgets.length,
    coverageMode,
    widgetFields: [...HOMEPAGE_WIDGET_FIELDS],
    widgets: projectedWidgets,
    ...(coverageMode === "all_instances" ? { warnings: safeStrings(payload.warnings, 3) } : {}),
    note: coverageMode === "one_per_type"
      ? "Homepage component representatives use widgetFields order."
      : "Homepage component list result compacted for storage.",
  };
}

function compactHomepageInstanceList(
  base: Record<string, unknown>,
  payload: Record<string, any>,
): string {
  const widgets = Array.isArray(payload.widgets) ? payload.widgets : undefined;
  if (!widgets) {
    return JSON.stringify({
      ...base,
      status: "shape_error",
      surface: safeOptionalString(payload.surface),
      layoutRevision: finiteNumberOrNull(payload.layoutRevision),
      widgetCount: null,
      returnedWidgetCount: null,
      truncated: false,
      shapeWarning: "homepage_components.instance.list 返回缺少 widgets 数组，无法判定主页实例数量。",
      note: "Homepage component list shape error; widgetCount is unknown.",
    });
  }

  const records = widgets.map(asRecord);
  const resolvedTypes = new Set(records.map(homepageWidgetResolvedType).filter((type): type is string => !!type));
  const resolvedWidgetCount = records.filter((widget) => homepageWidgetResolvedType(widget) !== undefined).length;
  const degradedWidgetCount = widgets.length - resolvedWidgetCount;
  const allContent = JSON.stringify(homepageListPayload(
    base,
    payload,
    widgets,
    records.map(compactHomepageWidgetRow),
    "all_instances",
    resolvedTypes.size,
    degradedWidgetCount,
    resolvedWidgetCount,
    degradedWidgetCount,
  ));
  if (allContent.length <= MAX_HOMEPAGE_LIST_OUTPUT_CHARS) return allContent;

  const seenTypes = new Set<string>();
  const resolvedRepresentatives: Array<{ order: number; row: unknown[] }> = [];
  const degradedCandidates: Array<{ order: number; row: unknown[] }> = [];
  records.forEach((widget, order) => {
    const layoutOrder = finiteNumberOrNull(widget.index) ?? order;
    const type = homepageWidgetResolvedType(widget);
    if (type) {
      if (seenTypes.has(type)) return;
      seenTypes.add(type);
      resolvedRepresentatives.push({ order: layoutOrder, row: compactHomepageWidgetRow(widget) });
      return;
    }
    if (degradedCandidates.length < MAX_HOMEPAGE_DEGRADED_WIDGET_SUMMARIES) {
      degradedCandidates.push({ order: layoutOrder, row: compactHomepageWidgetRow(widget) });
    }
  });
  const serializeRepresentatives = (projectedWidgets: unknown[], returnedDegradedWidgetCount: number) => JSON.stringify(homepageListPayload(
    base,
    payload,
    widgets,
    projectedWidgets,
    "one_per_type",
    resolvedTypes.size,
    degradedWidgetCount,
    resolvedWidgetCount,
    returnedDegradedWidgetCount,
  ));
  let returnedDegradedWidgetCount = 0;
  let acceptedRepresentatives = resolvedRepresentatives;
  let representativeContent = serializeRepresentatives(
    acceptedRepresentatives.map(({ row }) => row),
    returnedDegradedWidgetCount,
  );
  for (const candidate of degradedCandidates) {
    const nextRepresentatives = [...acceptedRepresentatives, candidate].sort((left, right) => left.order - right.order);
    const candidateContent = serializeRepresentatives(
      nextRepresentatives.map(({ row }) => row),
      returnedDegradedWidgetCount + 1,
    );
    if (candidateContent.length > MAX_HOMEPAGE_LIST_OUTPUT_CHARS) continue;
    acceptedRepresentatives = nextRepresentatives;
    returnedDegradedWidgetCount += 1;
    representativeContent = candidateContent;
  }
  return representativeContent;
}

function compactHomepageInstanceGet(
  base: Record<string, unknown>,
  payload: Record<string, any>,
  action: string,
): string {
  const routeSubtool = action.endsWith(".instance.get")
    ? action.slice(0, -".instance.get".length)
    : undefined;
  const sourceFieldItems = (value: unknown): string[] => {
    const items = Array.isArray(value) ? value : (typeof value === "string" ? [value] : []);
    return items.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  };
  const build = (fieldLimit: number, fieldChars: number, previewChars: number): string => {
    const fieldSummary = (value: unknown) => {
      const totalCount = sourceFieldItems(value).length;
      const items = safeStrings(value, fieldLimit, fieldChars);
      return {
        items,
        totalCount,
        returnedCount: items.length,
        omittedCount: Math.max(0, totalCount - items.length),
      };
    };
    const editable = fieldSummary(payload.editableFields);
    const readOnly = fieldSummary(payload.readOnlyFields);
    const unsupported = fieldSummary(payload.unsupportedFields);
    return JSON.stringify({
      ...base,
      ...(routeSubtool ? { routeSubtool: safeOptionalString(routeSubtool, 64) } : {}),
      status: safeOptionalString(payload.status, 64) ?? "ok",
      surface: safeOptionalString(payload.surface, 64),
      layoutRevision: finiteNumberOrNull(payload.layoutRevision),
      widgetId: safeOptionalString(payload.widgetId, 64),
      resolutionStatus: safeOptionalString(payload.resolutionStatus, 64),
      type: safeOptionalString(payload.type, 64),
      label: safeOptionalString(payload.label, 64),
      configRevision: finiteNumberOrNull(payload.configRevision),
      layoutIndex: finiteNumberOrNull(payload.layoutIndex),
      sectionId: safeOptionalString(payload.sectionId, 64),
      sectionName: safeOptionalString(payload.sectionName, 64),
      editableFields: editable.items,
      editableFieldsTotalCount: editable.totalCount,
      editableFieldsReturnedCount: editable.returnedCount,
      editableFieldsOmittedCount: editable.omittedCount,
      redactedEditableFields: safeStrings(payload.redactedEditableFields, 10, 64),
      readOnlyFields: readOnly.items,
      readOnlyFieldsTotalCount: readOnly.totalCount,
      readOnlyFieldsReturnedCount: readOnly.returnedCount,
      readOnlyFieldsOmittedCount: readOnly.omittedCount,
      unsupportedFields: unsupported.items,
      unsupportedFieldsTotalCount: unsupported.totalCount,
      unsupportedFieldsReturnedCount: unsupported.returnedCount,
      unsupportedFieldsOmittedCount: unsupported.omittedCount,
      fieldsTruncated: editable.omittedCount > 0 || readOnly.omittedCount > 0 || unsupported.omittedCount > 0,
      businessCapability: compactBusinessCapability(payload.businessCapability),
      ...compactEditableConfig(payload.editableConfig ?? null, Math.min(1_000, previewChars)),
      ...compactSafeConfig(payload.safeConfig ?? null, previewChars),
      warnings: safeStrings(payload.warnings, 3, 64),
      note: "Homepage component instance result compacted for storage.",
    });
  };

  let fieldLimit = 20;
  let fieldChars = 64;
  let previewChars = Math.min(2_000, MAX_SAFE_CONFIG_PREVIEW_CHARS);
  let result = build(fieldLimit, fieldChars, previewChars);
  while ((result.length > MAX_HOMEPAGE_LIST_OUTPUT_CHARS || estimateTextTokensConservative(result) > 2_500) && (previewChars > 3 || fieldLimit > 0)) {
    if (previewChars > 256) previewChars = Math.max(256, Math.floor(previewChars / 2));
    else if (fieldLimit > 0) fieldLimit -= 1;
    else previewChars = Math.max(3, Math.floor(previewChars / 2));
    result = build(fieldLimit, fieldChars, previewChars);
  }
  return result;
}

function actionAwareStorageContent(
  message: AgentToolMessage,
  rawArgs?: Record<string, unknown>,
  resolveCallReadOnly?: ToolCallReadOnlyResolver,
): string {
  const operation = resolveToolOperation(rawArgs);
  const parsed = asRecord(parseToolResultContentEnvelope(message.content));
  const payload = unwrapToolPayload(parsed);
  const ok = parsed.ok === true || payload.ok === true || payload.status === "success";
  const base = {
    ok,
    action: operation.action,
    ...(operation.innerAction ? { innerAction: operation.innerAction } : {}),
  };

  if (!ok) {
    const error = asRecord(parsed.error);
    const details = asRecord(parsed.details ?? error.details ?? payload.details);
    const diagnostic = (value: unknown, maxChars: number) => (
      typeof value === "string" ? sanitizeToolResultString(value, maxChars) || undefined : undefined
    );
    return JSON.stringify({
      ...base,
      status: "failed",
      errorCode: diagnostic(parsed.errorCode ?? parsed.code ?? error.code ?? payload.reasonCode, 80),
      message: diagnostic(parsed.message ?? error.message ?? payload.message, 240),
      hint: diagnostic(parsed.hint ?? error.hint ?? details.hint, 240),
      requestedToolName: diagnostic(details.requestedToolName ?? payload.requestedToolName, 120),
      requestedActionName: diagnostic(details.requestedActionName ?? payload.requestedActionName, 120),
      suggestedToolName: diagnostic(details.suggestedToolName ?? payload.suggestedToolName, 120),
      suggestedActionName: diagnostic(details.suggestedActionName ?? payload.suggestedActionName, 120),
      note: "Failed tool result compacted for storage.",
    });
  }

  const isWrite = isWriteCall(message, rawArgs, resolveCallReadOnly);
  if (isWrite) {
    const target = asRecord(payload.target);
    return JSON.stringify({
      ...base,
      status: payload.status ?? (ok ? "success" : "failed"),
      requestedCount: payload.requestedCount,
      affectedCount: payload.affectedCount ?? payload.deletedCount,
      targetDocIds: safeStrings(payload.targetDocIds ?? target.docId ?? operation.args.docIds ?? operation.args.docId),
      targetBlockIds: safeStrings(payload.targetBlockIds ?? target.blockId ?? operation.args.blockIds ?? operation.args.blockId),
      targetTitles: safeStrings(payload.targetTitles ?? target.title ?? operation.args.title),
      reasonCode: sanitizeToolResultString(String(payload.reasonCode ?? parsed.errorCode ?? parsed.code ?? ""), 80) || undefined,
      verificationStatus: payload.verificationStatus ?? asRecord(payload.verification).status,
      note: "Write result compacted for storage.",
    });
  }

  if (message.name === "homepage_components") {
    const action = operation.action;
    const nestedAction = operation.innerAction;
    if (action === "instance.list" || nestedAction === "instance.list") {
      return compactHomepageInstanceList(base, payload);
    }
    if (action === "instance.get" || action.endsWith(".instance.get") || nestedAction === "instance.get") {
      return compactHomepageInstanceGet(base, payload, action);
    }
  }

  const items = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload.candidates)
        ? payload.candidates
        : Array.isArray(payload.tasks)
          ? payload.tasks
          : Array.isArray(payload.records)
            ? payload.records
            : [];
  return JSON.stringify({
    ...base,
    queryDigest: digestSafeText(operation.args.query),
    itemCount: payload.totalCount ?? payload.returnedCandidateCount ?? items.length,
    docIds: safeStrings(items.map((item: any) => item?.docId ?? item?.sourceDocId ?? item?.rootId)),
    blockIds: safeStrings(items.map((item: any) => item?.blockId ?? item?.headingBlockId)),
    titles: safeStrings(items.map((item: any) => item?.title ?? item?.taskname ?? item?.docTitle)),
    note: "Read result compacted for storage.",
  });
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.max(0, maxChars - head - 80);
  return `${text.slice(0, head)}\n...[compact: middle omitted]...\n${text.slice(-tail)}`;
}

function truncateTextToTokens(text: string, maxTokens: number): string {
  if (estimateTextTokensConservative(text) <= maxTokens) return text;
  const codePoints = [...text];
  const marker = "\n...[compact: token budget]...";
  let low = 0;
  let high = codePoints.length;
  let best = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${codePoints.slice(0, middle).join("")}${marker}`;
    if (estimateTextTokensConservative(candidate) <= maxTokens) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (best) return best;
  for (const point of codePoints) {
    const candidate = `${point}${marker}`;
    if (estimateTextTokensConservative(candidate) <= maxTokens) return candidate;
  }
  return "";
}

function capToolResultContent(content: string, maxChars: number, maxTokens: number): string {
  const tokenCapped = truncateTextToTokens(content, Math.max(1, maxTokens));
  return tokenCapped.length > maxChars ? truncateText(tokenCapped, maxChars) : tokenCapped;
}

const SENSITIVE_STRING_KEYS = ["api_key", "apikey", "secret", "token", "password", "authorization"];

function sanitizeToolResultString(value: string, maxChars: number): string {
  let sanitized = value.trim();

  // Redact absolute/internal paths
  sanitized = sanitized.replace(/\b[a-zA-Z]:[\\/](?:[^\\/\s]+[\\/])*[^\\/\s]*\b/g, "[path]");
  // Unix-like absolute paths: only match after start/whitespace/punctuation to avoid URLs like https://example.com/path
  sanitized = sanitized.replace(/(^|[\s(\[\{"'=,;:])(\/[^/\s]+(?:\/[^/\s]+)*\/?)/g, "$1[path]");

  // Redact Authorization: Bearer <token> before generic key=value patterns
  sanitized = sanitized.replace(/\b(Authorization)\s*:\s*(Bearer\s+[^\s,]+)/gi, "$1: [redacted]");

  // Redact sensitive key=value patterns
  const pattern = new RegExp(`\\b(${SENSITIVE_STRING_KEYS.join("|")})\\s*[:=]\\s*[^\\s&,"]+`, "gi");
  sanitized = sanitized.replace(pattern, "$1=[redacted]");

  if (sanitized.length > maxChars) {
    sanitized = `${sanitized.slice(0, maxChars - 3)}...`;
  }
  return sanitized;
}

/**
 * Storage-safe compaction applied to every tool message before persistence.
 * Always runs regardless of content length.
 */
function storageCompactToolMessage(
  message: AgentToolMessage,
  rawArgs?: Record<string, unknown>,
  options: Pick<MessageCompactionOptions, "resolveCallReadOnly" | "maxToolContentChars" | "maxToolResultTokens"> = {},
): AgentToolMessage {
  const maxChars = options.maxToolContentChars ?? DEFAULT_MAX_TOOL_CONTENT_CHARS;
  const maxTokens = options.maxToolResultTokens ?? DEFAULT_MAX_TOOL_RESULT_TOKENS;
  return {
    ...message,
    content: capToolResultContent(
      actionAwareStorageContent(message, rawArgs, options.resolveCallReadOnly),
      maxChars,
      maxTokens,
    ),
  };
}

function compactToolMessage(
  message: AgentToolMessage,
  maxChars: number,
  maxTokens: number,
  rawArgs?: Record<string, unknown>,
  resolveCallReadOnly?: ToolCallReadOnlyResolver,
): AgentToolMessage {
  if (
    message.content.length <= maxChars
    && estimateTextTokensConservative(message.content) <= maxTokens
  ) return message;
  return {
    ...message,
    content: capToolResultContent(
      actionAwareStorageContent(message, rawArgs, resolveCallReadOnly),
      maxChars,
      maxTokens,
    ),
  };
}

function toolObservationTokens(messages: readonly AgentMessage[]): number {
  return messages.reduce((total, message) => total + (
    message.role === "tool" ? estimateTextTokensConservative(message.content) + 8 : 0
  ), 0);
}

function compactToolObservations(
  messages: readonly AgentMessage[],
  maxObservationTokens: number,
  maxChars: number,
  maxResultTokens: number,
  resolveCallReadOnly?: ToolCallReadOnlyResolver,
): AgentMessage[] {
  const result = [...messages];
  if (toolObservationTokens(result) <= maxObservationTokens) return result;
  const args = collectToolCallArgs(result);
  const toolIndexes = result
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "tool")
    .sort((left, right) => {
      const leftReadOnly = !isWriteCall(left.message as AgentToolMessage, args.get((left.message as AgentToolMessage).toolCallId), resolveCallReadOnly);
      const rightReadOnly = !isWriteCall(right.message as AgentToolMessage, args.get((right.message as AgentToolMessage).toolCallId), resolveCallReadOnly);
      return Number(rightReadOnly) - Number(leftReadOnly) || left.index - right.index;
    })
    .map(({ index }) => index);

  for (const index of toolIndexes) {
    if (toolObservationTokens(result) <= maxObservationTokens) break;
    const message = result[index];
    if (message.role !== "tool") continue;
    const compacted = actionAwareStorageContent(message, args.get(message.toolCallId), resolveCallReadOnly);
    result[index] = {
      ...message,
      content: capToolResultContent(compacted, maxChars, maxResultTokens),
    };
  }

  for (let position = 0; position < toolIndexes.length; position += 1) {
    if (toolObservationTokens(result) <= maxObservationTokens) break;
    const index = toolIndexes[position];
    const message = result[index];
    if (message.role !== "tool") continue;
    const currentTokens = estimateTextTokensConservative(message.content);
    const otherTokens = toolObservationTokens(result) - currentTokens - 8;
    const remaining = Math.max(1, toolIndexes.length - position);
    const allowed = Math.max(1, Math.floor((maxObservationTokens - otherTokens) / remaining));
    result[index] = {
      ...message,
      content: truncateTextToTokens(message.content, allowed),
    };
  }
  return result;
}

/**
 * Compact oversized tool results while preserving the complete turn history
 * and tool-call/tool-result pairing.
 *
 * Rules:
 * - Safety comes from the live NativeTool/contract resolver.
 * - Ensure no orphan role=tool messages survive (via normalizeToolCallMessages)
 */
export function compactAgentMessages(
  messages: readonly AgentMessage[],
  options: MessageCompactionOptions = {},
): AgentMessage[] {
  const maxToolContentChars = options.maxToolContentChars ?? DEFAULT_MAX_TOOL_CONTENT_CHARS;
  const maxToolResultTokens = options.maxToolResultTokens ?? DEFAULT_MAX_TOOL_RESULT_TOKENS;
  const maxObservationTokens = options.maxObservationTokens ?? DEFAULT_MAX_OBSERVATION_TOKENS;

  const argsByToolCallId = collectToolCallArgs(messages);
  const withCompactTools = messages.map((message) =>
    message.role === "tool"
      ? compactToolMessage(
          message,
          maxToolContentChars,
          maxToolResultTokens,
          argsByToolCallId.get(message.toolCallId),
          options.resolveCallReadOnly,
        )
      : message,
  );

  let result = normalizeToolCallMessages(withCompactTools, { preserveUnmatchedToolCalls: true });
  const maxInputTokens = options.maxInputTokens;
  const nonToolTokens = estimateAgentMessagesTokens(result.filter((message) => message.role !== "tool"));
  const observationBudget = maxInputTokens
    ? Math.max(1, Math.min(maxObservationTokens, maxInputTokens - nonToolTokens))
    : maxObservationTokens;
  result = compactToolObservations(
    result,
    observationBudget,
    maxToolContentChars,
    maxToolResultTokens,
    options.resolveCallReadOnly,
  );
  return result;
}

/**
 * Storage-level compaction for persisted AgentSession messages.
 *
 * - Always applies storage-safe tool compaction (regardless of content length).
 * - Preserves valid assistant tool_calls / role=tool pairing.
 */
export function compactAgentSessionMessagesForStorage(
  messages: readonly AgentMessage[],
  options: Pick<MessageCompactionOptions, "resolveCallReadOnly" | "maxToolContentChars" | "maxToolResultTokens" | "maxObservationTokens"> = {},
): AgentMessage[] {
  const argsByToolCallId = collectToolCallArgs(messages);
  const withStorageSafeTools = messages.map((message) =>
    message.role === "tool"
      ? storageCompactToolMessage(message, argsByToolCallId.get(message.toolCallId), options)
      : message,
  );
  const normalized = normalizeToolCallMessages(withStorageSafeTools, { preserveUnmatchedToolCalls: true });
  return compactToolObservations(
    normalized,
    options.maxObservationTokens ?? DEFAULT_MAX_OBSERVATION_TOKENS,
    options.maxToolContentChars ?? DEFAULT_MAX_TOOL_CONTENT_CHARS,
    options.maxToolResultTokens ?? DEFAULT_MAX_TOOL_RESULT_TOKENS,
    options.resolveCallReadOnly,
  );
}
