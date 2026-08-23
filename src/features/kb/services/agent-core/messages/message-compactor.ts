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
const MAX_DIARY_OUTPUT_CHARS = 7_000;
const MAX_DIARY_OUTPUT_TOKENS = 2_800;
const MAX_HOMEPAGE_DEGRADED_WIDGET_SUMMARIES = 8;
const HOMEPAGE_WIDGET_FIELDS = ["widgetId", "type", "index", "sectionId", "configRevision", "subtool", "resolutionStatus"] as const;

function isWithinDiaryBudget(text: string): boolean {
  return text.length <= MAX_DIARY_OUTPUT_CHARS && estimateTextTokensConservative(text) <= MAX_DIARY_OUTPUT_TOKENS;
}

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

const MAX_DATABASE_ROW_CHARS = 320;
const MAX_DATABASE_SCHEMA_KEYS = 40;

const SENSITIVE_FIELD_PATTERN = /(^|[_-])(password|passwd|pwd|secret|token|bearer|authorization|api[_-]?key|credential|cookie|private[_-]?key)([_-]|$)/i;

function isSensitiveToolField(key: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/\s+/g, "_"));
}

/** 结构化值统一在序列化前按字段与字符串语义脱敏。 */
function deepSanitizeToolValue(value: unknown, fieldName?: string): unknown {
  if (fieldName && isSensitiveToolField(fieldName)) return "[redacted]";
  if (typeof value === "string") return sanitizeToolStringValue(value);
  if (Array.isArray(value)) return value.map((item) => deepSanitizeToolValue(item));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = deepSanitizeToolValue(item, key);
    }
    return out;
  }
  return value;
}

/** 预算内的工具消息也必须经过同一安全边界。 */
function sanitizeToolMessageStrings(message: AgentToolMessage): AgentToolMessage {
  if (typeof message.content !== "string" || !message.content.trim()) return message;
  const parsed = parseToolResultContentEnvelope(message.content);
  if (!parsed) return { ...message, content: sanitizeToolStringValue(message.content) };
  try {
    return { ...message, content: JSON.stringify(deepSanitizeToolValue(parsed)) };
  } catch {
    return { ...message, content: sanitizeToolStringValue(message.content) };
  }
}

/** 有界且始终脱敏的序列化预览：短内容也必须先过同一字符串安全边界。 */
function boundedJsonValue(value: unknown, maxChars: number): string | undefined {
  if (value === undefined) return undefined;
  let serialized: string;
  try {
    serialized = JSON.stringify(deepSanitizeToolValue(value)) ?? "";
  } catch {
    return undefined;
  }
  return serialized.length > maxChars
    ? `${serialized.slice(0, Math.max(0, maxChars - 3))}...`
    : serialized;
}

function extractPrimaryKeyValueTexts(source: unknown, limit: number): string[] {
  const container = asRecord(source);
  const values = Array.isArray(source)
    ? source
    : Array.isArray(container.values)
      ? container.values
      : Array.isArray(container.data)
        ? container.data
        : [];
  const texts = values
    .map((item: any) => typeof item === "string" ? item : sanitizeToolResultString(asRecord(item).text ?? asRecord(item).value, 100))
    .filter((text): text is string => !!text);
  return [...new Set(texts)].slice(0, limit);
}

function compactSiyuanDatabaseRow(row: Record<string, any>, maxChars: number): Record<string, unknown> {
  const cells = asRecord(row.cells);
  const cellEntries = Object.entries(cells)
    .map(([name, cell]) => ({ name: sanitizeToolResultString(name, 40), text: sanitizeToolResultString(asRecord(cell).text, 80) }))
    .filter((cell) => cell.text);
  const projected: Record<string, unknown> = {
    rowId: safeOptionalString(row.rowId, 64),
    ...(row.boundBlockId ? { boundBlockId: safeOptionalString(row.boundBlockId, 64) } : {}),
    title: safeOptionalString(row.title, 160),
    cellNames: cellEntries.slice(0, 12).map((cell) => cell.name),
    primaryText: cellEntries[0]?.text,
  };
  return JSON.stringify(projected).length <= maxChars
    ? projected
    : { rowId: projected.rowId, title: projected.title, truncated: true };
}

/** 主字段判定复用生产语义：优先 type==="block"，否则回退第一字段。 */
function resolveDatabasePrimaryKey(schemaKeys: Array<Record<string, unknown>>): Record<string, string> | undefined {
  const chosen = schemaKeys.find((key) => safeOptionalString(key.type) === "block") ?? schemaKeys[0];
  if (!chosen) return undefined;
  const keyId = safeOptionalString(chosen.keyId, 64);
  const name = safeOptionalString(chosen.name, 64);
  if (!keyId || !name) return undefined;
  return { keyId, name, type: safeOptionalString(chosen.type, 24) ?? "text" };
}

/**
 * siyuan_database 只读结果的有界领域投影：
 * 保留数据库/当前视图身份、视图类型、字段 schema、行数与行代表（含标题），
 * extra_read.filter_sort/primary_key_values 保留完整筛选排序与主键值。
 * 未识别形态不伪装成空集合，而是给出明确的 shape_unknown 状态与安全预览。
 */
function compactSiyuanDatabasePayload(
  base: Record<string, unknown>,
  payload: Record<string, any>,
): string {
  const innerAction = typeof payload.action === "string" ? payload.action : undefined;
  const database = asRecord(payload.database);
  const views = Array.isArray(database.views) ? database.views.map(asRecord) : [];
  const requestedViewId = safeOptionalString(payload.viewId);
  const currentView = requestedViewId
    ? views.find((view) => safeOptionalString(view.viewId ?? view.id) === requestedViewId) ?? {}
    : {};
  const schemaKeys = Array.isArray(payload.schema) ? payload.schema.map(asRecord) : [];
  const rowsSource = Array.isArray(payload.rows) ? payload.rows.map(asRecord) : [];

  const build = (rowLimit: number, rowChars: number): string => {
    const projectedRows = rowsSource.slice(0, rowLimit).map((row) => compactSiyuanDatabaseRow(row, rowChars));
    const record: Record<string, unknown> = {
      ...base,
      ...(innerAction ? { innerAction } : {}),
      databaseId: safeOptionalString(database.databaseId ?? database.id, 64),
      databaseName: safeOptionalString(database.name, 120),
      currentViewId: safeOptionalString(payload.viewId, 64),
      currentViewName: safeOptionalString(currentView.name, 120),
      currentViewType: safeOptionalString(currentView.type ?? currentView.viewType, 32),
      rowCount: finiteNumberOrNull(payload.rowCount),
      returnedRowCount: projectedRows.length,
      truncated: payload.truncated === true || rowsSource.length > projectedRows.length,
      primaryKey: resolveDatabasePrimaryKey(schemaKeys),
      schemaKeys: schemaKeys.slice(0, MAX_DATABASE_SCHEMA_KEYS).map((key) => ({
        keyId: safeOptionalString(key.keyId, 64),
        name: safeOptionalString(key.name, 64),
        type: safeOptionalString(key.type, 24),
      })),
      warnings: safeStrings(payload.warnings, 3, 80),
      note: "siyuan_database read result compacted for storage.",
    };
    if (projectedRows.length > 0) record.rows = projectedRows;
    if (innerAction === "filter_sort") {
      const sanitizedRules = deepSanitizeToolValue(payload.data);
      const serializedRules = JSON.stringify(sanitizedRules ?? null) ?? "";
      record.filterSort = serializedRules.length <= 1_500
        ? sanitizedRules
        : boundedJsonValue(payload.data, 1_500);
    }
    if (innerAction === "primary_key_values") {
      const texts = extractPrimaryKeyValueTexts(payload.data, 60);
      if (texts.length > 0) {
        record.primaryKeyValues = texts;
        record.primaryKeyTruncated = texts.length >= 60;
      } else {
        record.primaryKeyValueShapeUnknown = true;
        record.primaryKeyPreview = boundedJsonValue(payload.data, 400);
      }
    }
    return JSON.stringify(record);
  };

  const hasRecognizedStructure =
    rowsSource.length > 0
    || schemaKeys.length > 0
    || views.length > 0
    || finiteNumberOrNull(payload.rowCount) !== undefined
    || !!safeOptionalString(payload.databaseId, 64)
    || innerAction === "filter_sort"
    || innerAction === "primary_key_values";

  if (!hasRecognizedStructure) {
    return JSON.stringify({
      ...base,
      status: "compacted_shape_unknown",
      preview: boundedJsonValue(payload, 600),
      note: "siyuan_database result structure not recognized; raw projection withheld to avoid fake empty counts.",
    });
  }

  let rowLimit = 50;
  let output = build(rowLimit, MAX_DATABASE_ROW_CHARS);
  while (output.length > MAX_HOMEPAGE_LIST_OUTPUT_CHARS && rowLimit > 0) {
    rowLimit = rowLimit > 8 ? Math.max(8, Math.floor(rowLimit / 2)) : 0;
    output = build(rowLimit, rowLimit === 0 ? 0 : MAX_DATABASE_ROW_CHARS);
  }
  return output;
}

const AGENDA_TASK_FIELDS = [
  "taskId",
  "blockId",
  "taskname",
  "completed",
  "priority",
  "startDate",
  "deadline",
  "sourceDate",
  "sourceDocId",
  "sourceDocTitle",
  "isTodayTask",
  "isOverdue",
  "shouldMigrate",
] as const;

function compactAgendaTaskRow(taskRaw: unknown): unknown[] {
  const t = asRecord(taskRaw);
  return [
    safeOptionalString(t.taskId, 64) ?? null,
    safeOptionalString(t.blockId, 64) ?? null,
    safeOptionalString(t.taskname, 160) ?? "",
    typeof t.completed === "boolean" ? t.completed : false,
    safeOptionalString(t.priority, 16) ?? "",
    safeOptionalString(t.startDate, 32) ?? null,
    safeOptionalString(t.deadline, 32) ?? null,
    safeOptionalString(t.sourceDate, 32) ?? null,
    safeOptionalString(t.sourceDocId, 64) ?? null,
    safeOptionalString(t.sourceDocTitle, 120) ?? null,
    typeof t.isTodayTask === "boolean" ? t.isTodayTask : false,
    typeof t.isOverdue === "boolean" ? t.isOverdue : false,
    typeof t.shouldMigrate === "boolean" ? t.shouldMigrate : false,
  ];
}

const AGENDA_RECORD_FIELDS = [
  "recordId",
  "date",
  "docId",
  "docTitle",
  "categoryTitle",
  "headingTitle",
  "timeText",
  "content",
  "headingBlockId",
] as const;

function compactAgendaRecordRow(recRaw: unknown, maxContentChars = 120): unknown[] {
  const r = asRecord(recRaw);
  return [
    safeOptionalString(r.recordId, 64) ?? null,
    safeOptionalString(r.date, 32) ?? null,
    safeOptionalString(r.docId, 64) ?? null,
    safeOptionalString(r.docTitle, 120) ?? null,
    safeOptionalString(r.categoryTitle, 60) ?? "",
    safeOptionalString(r.headingTitle, 120) ?? "",
    safeOptionalString(r.timeText, 32) ?? "",
    sanitizeToolResultString(String(r.content ?? ""), maxContentChars),
    safeOptionalString(r.headingBlockId, 64) ?? null,
  ];
}

const AGENDA_DOC_FIELDS = [
  "period",
  "date",
  "docId",
  "title",
  "exists",
  "status",
  "rangeStart",
  "rangeEnd",
  "markdownPreview",
  "truncated",
] as const;

function compactAgendaDocRow(docRaw: unknown, maxPreviewChars = 160): unknown[] {
  const d = asRecord(docRaw);
  const range = asRecord(d.range);
  return [
    safeOptionalString(d.period, 16) ?? "day",
    safeOptionalString(d.date, 32) ?? "",
    safeOptionalString(d.docId, 64) ?? null,
    safeOptionalString(d.title, 120) ?? null,
    typeof d.exists === "boolean" ? d.exists : false,
    safeOptionalString(d.status, 32) ?? "not_created",
    safeOptionalString(range.start, 32) ?? null,
    safeOptionalString(range.end, 32) ?? null,
    d.markdownPreview ? sanitizeToolResultString(String(d.markdownPreview), maxPreviewChars) : null,
    typeof d.truncated === "boolean" ? d.truncated : false,
  ];
}

function compactDiaryQueryTasks(
  base: Record<string, unknown>,
  payload: Record<string, any>,
  args: Record<string, unknown>,
): string {
  const tasksRaw = Array.isArray(payload.tasks)
    ? payload.tasks
    : Array.isArray(payload.items) ? payload.items : [];
  const totalMatched = finiteNumberOrNull(payload.totalMatched) ?? finiteNumberOrNull(payload.totalCount) ?? tasksRaw.length;
  const returned = finiteNumberOrNull(payload.returned) ?? tasksRaw.length;

  const build = (taskLimit: number) => {
    const projectedTasks = tasksRaw.slice(0, taskLimit).map(compactAgendaTaskRow);
    const omittedTaskCount = Math.max(0, tasksRaw.length - projectedTasks.length);
    return JSON.stringify({
      ...base,
      queryScope: safeOptionalString(args.scope, 32),
      queryDate: safeOptionalString(args.date, 32),
      queryStartDate: safeOptionalString(args.startDate, 32),
      queryEndDate: safeOptionalString(args.endDate, 32),
      queryStatus: safeOptionalString(args.status, 32),
      queryLimit: finiteNumberOrNull(args.limit),
      ...(args.keyword ? { keywordDigest: digestSafeText(args.keyword) } : {}),
      ...(Array.isArray(args.tags) ? { queryTags: safeStrings(args.tags, 10, 32) } : {}),
      date: safeOptionalString(payload.date, 32),
      totalMatched,
      returned,
      returnedTaskCount: projectedTasks.length,
      omittedTaskCount,
      truncated: omittedTaskCount > 0 || (typeof payload.truncated === "boolean" ? payload.truncated : false),
      taskFields: [...AGENDA_TASK_FIELDS],
      tasks: projectedTasks,
      note: "diary_task.query_tasks result compacted for storage.",
    });
  };

  let taskLimit = Math.min(100, tasksRaw.length);
  let result = build(taskLimit);
  while (!isWithinDiaryBudget(result) && taskLimit > 5) {
    taskLimit = Math.max(5, Math.floor(taskLimit * 0.75));
    result = build(taskLimit);
  }
  while (!isWithinDiaryBudget(result) && taskLimit > 1) {
    taskLimit = Math.max(1, taskLimit - 1);
    result = build(taskLimit);
  }
  return result;
}

function compactDiaryQueryRecords(
  base: Record<string, unknown>,
  payload: Record<string, any>,
  args: Record<string, unknown>,
): string {
  const recordsRaw = Array.isArray(payload.records)
    ? payload.records
    : Array.isArray(payload.items) ? payload.items : [];
  const totalMatched = finiteNumberOrNull(payload.totalMatched) ?? finiteNumberOrNull(payload.totalCount) ?? recordsRaw.length;
  const returned = finiteNumberOrNull(payload.returned) ?? recordsRaw.length;

  const build = (recordLimit: number, maxContentChars: number) => {
    const projectedRecords = recordsRaw.slice(0, recordLimit).map((r) => compactAgendaRecordRow(r, maxContentChars));
    const omittedRecordCount = Math.max(0, recordsRaw.length - projectedRecords.length);
    return JSON.stringify({
      ...base,
      queryDate: safeOptionalString(args.date, 32),
      queryStartDate: safeOptionalString(args.startDate, 32),
      queryEndDate: safeOptionalString(args.endDate, 32),
      queryCategory: safeOptionalString(args.category, 60),
      ...(args.keyword ? { keywordDigest: digestSafeText(args.keyword) } : {}),
      queryLimit: finiteNumberOrNull(args.limit),
      date: safeOptionalString(payload.date, 32),
      startDate: safeOptionalString(payload.startDate, 32),
      endDate: safeOptionalString(payload.endDate, 32),
      totalMatched,
      returned,
      returnedRecordCount: projectedRecords.length,
      omittedRecordCount,
      truncated: omittedRecordCount > 0 || (typeof payload.truncated === "boolean" ? payload.truncated : false),
      recordFields: [...AGENDA_RECORD_FIELDS],
      records: projectedRecords,
      note: "diary_task.query_records result compacted for storage.",
    });
  };

  let recordLimit = Math.min(60, recordsRaw.length);
  let contentChars = 120;
  let result = build(recordLimit, contentChars);
  while (!isWithinDiaryBudget(result) && (recordLimit > 5 || contentChars > 40)) {
    if (contentChars > 40) contentChars = Math.max(40, Math.floor(contentChars * 0.75));
    else recordLimit = Math.max(5, Math.floor(recordLimit * 0.75));
    result = build(recordLimit, contentChars);
  }
  while (!isWithinDiaryBudget(result) && (recordLimit > 1 || contentChars > 20)) {
    if (contentChars > 20) contentChars = Math.max(20, Math.floor(contentChars * 0.8));
    else recordLimit = Math.max(1, recordLimit - 1);
    result = build(recordLimit, contentChars);
  }
  return result;
}

function compactDiaryFindDocs(
  base: Record<string, unknown>,
  payload: Record<string, any>,
  args: Record<string, unknown>,
): string {
  const docsRaw = Array.isArray(payload.docs)
    ? payload.docs
    : Array.isArray(payload.items) ? payload.items : [];
  const returned = finiteNumberOrNull(payload.returned) ?? docsRaw.length;
  const totalChecked = finiteNumberOrNull(payload.totalChecked) ?? docsRaw.length;

  const build = (docLimit: number, maxPreviewChars: number) => {
    const projectedDocs = docsRaw.slice(0, docLimit).map((d) => compactAgendaDocRow(d, maxPreviewChars));
    const omittedDocCount = Math.max(0, docsRaw.length - projectedDocs.length);
    return JSON.stringify({
      ...base,
      queryPeriod: safeOptionalString(args.period, 16),
      queryDate: safeOptionalString(args.date, 32),
      queryStartDate: safeOptionalString(args.startDate, 32),
      queryEndDate: safeOptionalString(args.endDate, 32),
      queryIncludeMarkdown: typeof args.includeMarkdown === "boolean" ? args.includeMarkdown : undefined,
      period: safeOptionalString(payload.period, 16),
      date: safeOptionalString(payload.date, 32),
      startDate: safeOptionalString(payload.startDate, 32),
      endDate: safeOptionalString(payload.endDate, 32),
      totalChecked,
      returned,
      returnedDocCount: projectedDocs.length,
      omittedDocCount,
      truncated: omittedDocCount > 0 || (typeof payload.truncated === "boolean" ? payload.truncated : false),
      docFields: [...AGENDA_DOC_FIELDS],
      docs: projectedDocs,
      warnings: safeStrings(payload.warnings, 3, 100),
      note: "diary_task.find_docs result compacted for storage.",
    });
  };

  let docLimit = Math.min(50, docsRaw.length);
  let previewChars = 160;
  let result = build(docLimit, previewChars);
  while (!isWithinDiaryBudget(result) && (docLimit > 5 || previewChars > 40)) {
    if (previewChars > 40) previewChars = Math.max(40, Math.floor(previewChars * 0.75));
    else docLimit = Math.max(5, Math.floor(docLimit * 0.75));
    result = build(docLimit, previewChars);
  }
  while (!isWithinDiaryBudget(result) && (docLimit > 1 || previewChars > 20)) {
    if (previewChars > 20) previewChars = Math.max(20, Math.floor(previewChars * 0.8));
    else docLimit = Math.max(1, docLimit - 1);
    result = build(docLimit, previewChars);
  }
  return result;
}

interface OverviewCompactionLevel {
  itemLimit: number;
  recordContentChars: number;
  notifDescChars: number;
  carryoverContentChars: number;
  carryoverLinesCount: number;
  carryoverLineChars: number;
}

const OVERVIEW_COMPACTION_LEVELS: readonly OverviewCompactionLevel[] = [
  { itemLimit: 20, recordContentChars: 80, notifDescChars: 120, carryoverContentChars: 100, carryoverLinesCount: 5, carryoverLineChars: 60 },
  { itemLimit: 10, recordContentChars: 60, notifDescChars: 100, carryoverContentChars: 80, carryoverLinesCount: 4, carryoverLineChars: 50 },
  { itemLimit: 5, recordContentChars: 50, notifDescChars: 80, carryoverContentChars: 60, carryoverLinesCount: 3, carryoverLineChars: 40 },
  { itemLimit: 3, recordContentChars: 40, notifDescChars: 60, carryoverContentChars: 40, carryoverLinesCount: 2, carryoverLineChars: 30 },
  { itemLimit: 2, recordContentChars: 30, notifDescChars: 40, carryoverContentChars: 30, carryoverLinesCount: 1, carryoverLineChars: 30 },
  { itemLimit: 1, recordContentChars: 30, notifDescChars: 30, carryoverContentChars: 30, carryoverLinesCount: 1, carryoverLineChars: 30 },
  { itemLimit: 1, recordContentChars: 20, notifDescChars: 20, carryoverContentChars: 20, carryoverLinesCount: 0, carryoverLineChars: 0 },
];

function compactDiaryOverview(
  base: Record<string, unknown>,
  payload: Record<string, any>,
  args: Record<string, unknown>,
): string {
  const summary = asRecord(payload.summary);
  const todayDiary = asRecord(payload.todayDiary);
  const limitsRaw = asRecord(payload.limits);
  const countsRaw = asRecord(payload.counts);
  const tasksRaw = Array.isArray(payload.tasks) ? payload.tasks : undefined;
  const recordsRaw = Array.isArray(payload.records) ? payload.records : undefined;
  const projectsRaw = Array.isArray(payload.projects) ? payload.projects : undefined;
  const notificationsRaw = Array.isArray(payload.notifications) ? payload.notifications : undefined;
  const reviewsRaw = Array.isArray(payload.reviews) ? payload.reviews : undefined;
  const carryoverRaw = Array.isArray(payload.carryoverPlans) ? payload.carryoverPlans : undefined;

  const limits = Object.keys(limitsRaw).length > 0 ? {
    tasks: finiteNumberOrNull(limitsRaw.tasks),
    records: finiteNumberOrNull(limitsRaw.records),
    projects: finiteNumberOrNull(limitsRaw.projects),
    notifications: finiteNumberOrNull(limitsRaw.notifications),
    reviews: finiteNumberOrNull(limitsRaw.reviews),
    carryoverPlans: finiteNumberOrNull(limitsRaw.carryoverPlans),
  } : undefined;

  const counts = Object.keys(countsRaw).length > 0 ? {
    tasksTotal: finiteNumberOrNull(countsRaw.tasksTotal),
    tasksReturned: finiteNumberOrNull(countsRaw.tasksReturned),
    tasksTruncated: typeof countsRaw.tasksTruncated === "boolean" ? countsRaw.tasksTruncated : undefined,
    recordsTotal: finiteNumberOrNull(countsRaw.recordsTotal),
    recordsReturned: finiteNumberOrNull(countsRaw.recordsReturned),
    recordsTruncated: typeof countsRaw.recordsTruncated === "boolean" ? countsRaw.recordsTruncated : undefined,
    projectsTotal: finiteNumberOrNull(countsRaw.projectsTotal),
    projectsReturned: finiteNumberOrNull(countsRaw.projectsReturned),
    projectsTruncated: typeof countsRaw.projectsTruncated === "boolean" ? countsRaw.projectsTruncated : undefined,
    notificationsTotal: finiteNumberOrNull(countsRaw.notificationsTotal),
    notificationsReturned: finiteNumberOrNull(countsRaw.notificationsReturned),
    notificationsTruncated: typeof countsRaw.notificationsTruncated === "boolean" ? countsRaw.notificationsTruncated : undefined,
    reviewsTotal: finiteNumberOrNull(countsRaw.reviewsTotal),
    reviewsReturned: finiteNumberOrNull(countsRaw.reviewsReturned),
    reviewsTruncated: typeof countsRaw.reviewsTruncated === "boolean" ? countsRaw.reviewsTruncated : undefined,
    carryoverPlansTotal: finiteNumberOrNull(countsRaw.carryoverPlansTotal),
    carryoverPlansReturned: finiteNumberOrNull(countsRaw.carryoverPlansReturned),
    carryoverPlansTruncated: typeof countsRaw.carryoverPlansTruncated === "boolean" ? countsRaw.carryoverPlansTruncated : undefined,
  } : undefined;

  const build = (level: OverviewCompactionLevel) => {
    const record: Record<string, unknown> = {
      ...base,
      queryDate: safeOptionalString(args.date, 32),
      queryInclude: Array.isArray(args.include) ? safeStrings(args.include, 10, 32) : undefined,
      date: safeOptionalString(payload.date, 32),
      todayDiaryExists: typeof payload.todayDiaryExists === "boolean" ? payload.todayDiaryExists : undefined,
      ...(payload.todayDiary ? {
        todayDiary: {
          docId: safeOptionalString(todayDiary.docId, 64),
          title: safeOptionalString(todayDiary.title, 120),
          date: safeOptionalString(todayDiary.date, 32),
        },
      } : {}),
      templateValid: typeof payload.templateValid === "boolean" ? payload.templateValid : undefined,
      missingSections: safeStrings(payload.missingSections, 10, 60),
      summary: {
        templateValid: typeof summary.templateValid === "boolean" ? summary.templateValid : payload.templateValid,
        missing: safeStrings(summary.missing ?? payload.missingSections, 10, 60),
        newTaskCount: finiteNumberOrNull(summary.newTaskCount),
        migratedTaskCount: finiteNumberOrNull(summary.migratedTaskCount),
        quickRecordCount: finiteNumberOrNull(summary.quickRecordCount),
        projectCount: finiteNumberOrNull(summary.projectCount),
      },
      limits,
      counts,
      note: sanitizeToolResultString(payload.note ? String(payload.note) : "diary_task.overview result compacted for storage.", 200),
    };

    if (tasksRaw) {
      const slice = tasksRaw.slice(0, level.itemLimit);
      record.taskFields = [...AGENDA_TASK_FIELDS];
      record.tasks = slice.map(compactAgendaTaskRow);
      record.retainedTaskCount = slice.length;
      if (tasksRaw.length > slice.length) {
        record.omittedTaskCount = tasksRaw.length - slice.length;
        record.compactionTasksTruncated = true;
      }
    }
    if (recordsRaw) {
      const slice = recordsRaw.slice(0, level.itemLimit);
      record.recordFields = [...AGENDA_RECORD_FIELDS];
      record.records = slice.map((r) => compactAgendaRecordRow(r, level.recordContentChars));
      record.retainedRecordCount = slice.length;
      if (recordsRaw.length > slice.length) {
        record.omittedRecordCount = recordsRaw.length - slice.length;
        record.compactionRecordsTruncated = true;
      }
    }
    if (projectsRaw) {
      const slice = projectsRaw.slice(0, level.itemLimit);
      record.projects = slice.map((p: any) => ({
        name: safeOptionalString(p.name, 60),
        taskCount: finiteNumberOrNull(p.taskCount),
        openTaskCount: finiteNumberOrNull(p.openTaskCount),
        todayTaskCount: finiteNumberOrNull(p.todayTaskCount),
        overdueTaskCount: finiteNumberOrNull(p.overdueTaskCount),
        healthStatus: safeOptionalString(p.healthStatus, 32),
        healthLabel: safeOptionalString(p.healthLabel, 32),
      }));
      record.retainedProjectCount = slice.length;
      if (projectsRaw.length > slice.length) {
        record.omittedProjectCount = projectsRaw.length - slice.length;
        record.compactionProjectsTruncated = true;
      }
    }
    if (notificationsRaw) {
      const slice = notificationsRaw.slice(0, level.itemLimit);
      record.notifications = slice.map((n: any) => ({
        id: safeOptionalString(n.id, 64),
        type: safeOptionalString(n.type, 32),
        level: safeOptionalString(n.level, 16),
        title: safeOptionalString(n.title, 120),
        description: safeOptionalString(n.description, level.notifDescChars),
      }));
      record.retainedNotificationCount = slice.length;
      if (notificationsRaw.length > slice.length) {
        record.omittedNotificationCount = notificationsRaw.length - slice.length;
        record.compactionNotificationsTruncated = true;
      }
    }
    if (reviewsRaw) {
      const slice = reviewsRaw.slice(0, level.itemLimit);
      record.reviews = slice.map((rv: any) => ({
        period: safeOptionalString(rv.period, 16),
        title: safeOptionalString(rv.title, 60),
        status: safeOptionalString(rv.status, 32),
        statusLabel: safeOptionalString(rv.statusLabel, 32),
        targetDate: safeOptionalString(rv.targetDate, 32),
      }));
      record.retainedReviewCount = slice.length;
      if (reviewsRaw.length > slice.length) {
        record.omittedReviewCount = reviewsRaw.length - slice.length;
        record.compactionReviewsTruncated = true;
      }
    }
    if (carryoverRaw) {
      const slice = carryoverRaw.slice(0, level.itemLimit);
      record.carryoverPlans = slice.map((cp: any) => {
        const rawLines = Array.isArray(cp.lines) ? cp.lines : [];
        const lines = level.carryoverLinesCount > 0
          ? safeStrings(rawLines.slice(0, level.carryoverLinesCount), level.carryoverLinesCount, level.carryoverLineChars)
          : undefined;
        return {
          period: safeOptionalString(cp.period, 16),
          periodLabel: safeOptionalString(cp.periodLabel, 32),
          sourceLabel: safeOptionalString(cp.sourceLabel, 60),
          sourceDateOrRange: safeOptionalString(cp.sourceDateOrRange, 32),
          fieldLabel: safeOptionalString(cp.fieldLabel, 60),
          content: sanitizeToolResultString(String(cp.content ?? ""), level.carryoverContentChars),
          lines,
          docId: safeOptionalString(cp.docId, 64),
        };
      });
      record.retainedCarryoverCount = slice.length;
      if (carryoverRaw.length > slice.length) {
        record.omittedCarryoverCount = carryoverRaw.length - slice.length;
        record.compactionCarryoverTruncated = true;
      }
    }

    return JSON.stringify(record);
  };

  let result = build(OVERVIEW_COMPACTION_LEVELS[0]);
  for (let i = 1; i < OVERVIEW_COMPACTION_LEVELS.length && !isWithinDiaryBudget(result); i++) {
    result = build(OVERVIEW_COMPACTION_LEVELS[i]);
  }
  return result;
}

function isDiaryReadOnlyTool(message: AgentToolMessage, operation: ResolvedToolOperation): boolean {
  const toolName = message.name;
  const action = operation.innerAction || operation.action;
  if (toolName === "diary_task") {
    return ["overview", "query_tasks", "query_records", "find_docs"].includes(action);
  }
  return (
    toolName === "query_tasks"
    || toolName === "query_diary_records"
    || toolName === "find_diary_docs"
    || toolName === "get_daily_workspace_overview"
  );
}

function resolveDiaryReadOnlyAction(message: AgentToolMessage, operation: ResolvedToolOperation): string {
  const toolName = message.name;
  if (toolName === "query_tasks") return "query_tasks";
  if (toolName === "query_diary_records") return "query_records";
  if (toolName === "find_diary_docs") return "find_docs";
  if (toolName === "get_daily_workspace_overview") return "overview";
  return operation.innerAction || operation.action;
}

function compactDiaryReadOnlyPayload(
  base: Record<string, unknown>,
  payload: Record<string, any>,
  action: string,
  args: Record<string, unknown>,
): string {
  if (action === "query_tasks") {
    return compactDiaryQueryTasks(base, payload, args);
  }
  if (action === "query_records") {
    return compactDiaryQueryRecords(base, payload, args);
  }
  if (action === "find_docs") {
    return compactDiaryFindDocs(base, payload, args);
  }
  if (action === "overview") {
    return compactDiaryOverview(base, payload, args);
  }
  return JSON.stringify({
    ...base,
    status: "compacted_unknown_action",
    action: sanitizeToolResultString(action, 60),
    note: "Unrecognized diary read action compacted.",
  });
}

function compactAgentToolHelpPayload(
  payload: Record<string, any>,
  helpAction: string,
): string {
  const fieldsByAction: Record<string, readonly string[]> = {
    list_tools: ["tools"],
    describe_tool: ["name", "title", "description", "readOnly", "requiresConfirmation", "actionCount", "boundary", "argsSchema", "inputHint", "examples", "notes", "note", "actions", "activation"],
    list_actions: ["toolName", "actions", "note", "activation"],
    describe_action: ["toolName", "toolTitle", "action", "title", "description", "readOnly", "requiresConfirmation", "required", "boundary", "argsUsage", "argsSchema", "outputSchema", "resultEnvelope", "inputHint", "examples", "notes", "hasActions", "activation", "requestedToolName", "requestedActionName", "publicRoute", "note"],
    list_custom_skills: ["total", "skills"],
    describe_custom_skill: ["id", "title", "description", "sourceType", "source", "trusted", "riskLevel", "tags", "triggers", "requiredEnvVars", "entryFile", "content", "truncated", "chars"],
  };
  const projected: Record<string, unknown> = {
    ok: true,
    helpAction,
    compactionNote: "agent_tool_help result compacted for storage.",
  };
  for (const field of fieldsByAction[helpAction] ?? []) {
    if (payload[field] !== undefined) projected[field] = deepSanitizeToolValue(payload[field], field);
  }
  return JSON.stringify(projected);
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
    const nestedError = asRecord(payload.error);
    const details = asRecord(parsed.details ?? error.details ?? nestedError.details ?? payload.details);
    const diagnostic = (value: unknown, maxChars: number) => (
      typeof value === "string" ? sanitizeToolResultString(value, maxChars) || undefined : undefined
    );
    return JSON.stringify({
      ...base,
      status: "failed",
      errorCode: diagnostic(parsed.errorCode ?? parsed.code ?? error.code ?? nestedError.code ?? payload.reasonCode, 80),
      message: diagnostic(parsed.message ?? error.message ?? nestedError.message ?? payload.message, 240),
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

  if (message.name === "siyuan_database") {
    return compactSiyuanDatabasePayload(base, payload);
  }

  if (isDiaryReadOnlyTool(message, operation)) {
    const diaryAction = resolveDiaryReadOnlyAction(message, operation);
    return compactDiaryReadOnlyPayload(base, payload, diaryAction, operation.args);
  }

  if (message.name === "agent_tool_help") {
    return compactAgentToolHelpPayload(payload, operation.action);
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
            : undefined;
  const itemCount = payload.totalCount ?? payload.returnedCandidateCount ?? payload.itemCount;
  if (!items && itemCount === undefined) {
    return JSON.stringify({
      ...base,
      status: "compacted_shape_unknown",
      preview: boundedJsonValue(payload, 600),
      note: "Read result structure not recognized; raw projection withheld to avoid fake empty counts.",
    });
  }
  return JSON.stringify({
    ...base,
    queryDigest: digestSafeText(operation.args.query),
    itemCount: itemCount ?? items?.length ?? 0,
    docIds: safeStrings(items?.map((item: any) => item?.docId ?? item?.sourceDocId ?? item?.rootId)),
    blockIds: safeStrings(items?.map((item: any) => item?.blockId ?? item?.headingBlockId)),
    titles: safeStrings(items?.map((item: any) => item?.title ?? item?.taskname ?? item?.docTitle)),
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

const SENSITIVE_STRING_KEYS = [
  "api[_-]?key", "apikey", "secret", "token", "password", "passwd", "pwd",
  "authorization", "bearer", "cookie", "credential", "private[_-]?key",
];

function sanitizeToolStringValue(value: string): string {
  let sanitized = value;
  sanitized = sanitized.replace(/(\bhttps?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@");
  sanitized = sanitized.replace(/\b[a-zA-Z]:[\\/](?:[^\\/\s]+[\\/])*[^\\/\s]*\b/g, "[path]");
  sanitized = sanitized.replace(
    /(^|[\s(\[{"'=,;:])(\/(?:Users|home|root|mnt|data|var|opt|tmp)(?=\/|$)(?:\/[^\s,;)\]}"']*)?)/g,
    "$1[path]",
  );
  sanitized = sanitized.replace(/\b(Authorization)\s*:\s*(Bearer\s+[^\s,]+)/gi, "$1: [redacted]");
  sanitized = sanitized.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  const pattern = new RegExp("\\b(" + SENSITIVE_STRING_KEYS.join("|") + ")\\s*[:=]\\s*[^\\s&,\"]+", "gi");
  return sanitized.replace(pattern, "$1=[redacted]");
}

function sanitizeToolResultString(value: string, maxChars: number): string {
  let sanitized = sanitizeToolStringValue(value).trim();

  if (sanitized.length > maxChars) {
    sanitized = maxChars > 3 ? `${sanitized.slice(0, maxChars - 3)}...` : sanitized.slice(0, Math.max(0, maxChars));
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
  ) return sanitizeToolMessageStrings(message);
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
