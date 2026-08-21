import {
  findAggregateActionMeta,
  findAggregateToolMeta,
} from "../tools/aggregate/aggregate-tool-metadata";

const AGGREGATE_TOOL_DISPLAY_NAMES: Record<string, string> = {
  siyuan_kb: "使用知识库",
  diary_task: "处理日记任务",
  siyuan_database: "操作数据库",
  siyuan_doc_edit: "编辑文档",
  siyuan_tree: "管理文档树",
  siyuan_meta: "管理标签书签",
  siyuan_asset: "处理资源文件",
  siyuan_riff: "管理闪卡",
  homepage_manage: "管理主页",
  homepage_components: "管理主页组件",
  temporary_workbench: "整理临时工作台",
  skill_manage: "管理能力包",
  mcp_manage: "管理扩展工具",
  notebrain_file: "处理工作文件",
  web_fetch: "访问网页",
  memory_manage: "记忆中枢",
  agent_tool_help: "查看工具说明",
};

const ACTION_DISPLAY_OVERRIDES: Record<string, string> = {
  "mcp_manage:list_servers": "列出扩展服务",
  "mcp_manage:save_server": "保存扩展服务",
  "mcp_manage:delete_server": "删除扩展服务",
  "mcp_manage:call_tool": "调用已连接工具",
  "web_fetch:http_get": "读取网络数据",
  "web_fetch:http_post": "提交网络数据",
  "agent_tool_help:list_actions": "列出工具操作",
  "agent_tool_help:describe_action": "说明工具操作",
};

const ARG_LABELS: Record<string, string> = {
  action: "调用动作",
  toolName: "目标工具",
  actionName: "目标操作",
  query: "关键词",
  keyword: "关键词",
  limit: "数量",
  docIds: "文档",
  docIdsCount: "文档数量",
  blockIds: "内容块",
  blockIdsCount: "内容块数量",
  idsCount: "对象数量",
  maxChars: "最大字数",
  view: "查看范围",
  maxDepth: "层级",
  rootDocId: "根文档",
  centerDocId: "中心文档",
  notebookId: "笔记本",
  docId: "文档",
  markdownChars: "正文字数",
  contentChars: "内容字数",
  valueTextChars: "文本字数",
  title: "标题",
  blockId: "内容块",
  includeTags: "包含标签",
  includeLinkedDocs: "包含关联文档",
  url: "目标网站",
  chunkIndex: "分段序号",
  chunkChars: "分段大小",
  chunkCount: "分段数量",
};

const VIEW_LABELS: Record<string, string> = {
  notebooks: "笔记本",
  notebook_roots: "笔记本根文档",
  children: "子文档",
  subtree: "文档子树",
  neighborhood: "相关文档",
  list: "列表",
};

function getActionName(argsPreview: Record<string, unknown> | undefined): string | undefined {
  const value = argsPreview?.action;
  return typeof value === "string" && value ? value : undefined;
}

export function formatToolDisplayName(
  toolName: string | undefined,
  argsPreview?: Record<string, unknown>,
): string {
  if (!toolName) return "调用扩展工具";

  const actionName = getActionName(argsPreview);
  if (actionName) {
    const override = ACTION_DISPLAY_OVERRIDES[`${toolName}:${actionName}`];
    if (override) return override;

    const actionMeta = findAggregateActionMeta(toolName, actionName);
    if (actionMeta?.title) return actionMeta.title;
  }

  const aggregateFallback = AGGREGATE_TOOL_DISPLAY_NAMES[toolName];
  if (aggregateFallback) return aggregateFallback;

  const aggregateMeta = findAggregateToolMeta(toolName);
  if (aggregateMeta?.title) return aggregateMeta.title;

  return toolName;
}

function compactPlainText(value: string, maxChars = 48): string | undefined {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (/[{}\[\]`\\]/.test(text)) return "已指定";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function formatWebsite(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname || "已指定";
  } catch {
    return "已指定";
  }
}

function formatArgValue(key: string, value: unknown): string | undefined {
  if (value == null) return undefined;
  if ((key === "action" || key === "toolName" || key === "actionName") && typeof value === "string") {
    return compactPlainText(value, 80);
  }
  if ((key === "query" || key === "keyword") && typeof value === "string") {
    const compact = compactPlainText(value);
    return compact ? `“${compact}”` : undefined;
  }
  if (key === "title" && typeof value === "string") return compactPlainText(value);
  if (key === "docIds" && Array.isArray(value)) return `${value.length} 个文档`;
  if (key === "docIdsCount" && typeof value === "number") return `${value} 个文档`;
  if (key === "blockIds" && Array.isArray(value)) return `${value.length} 个内容块`;
  if (key === "blockIdsCount" && typeof value === "number") return `${value} 个内容块`;
  if (key === "idsCount" && typeof value === "number") return `${value} 个`;
  if (key === "view" && typeof value === "string") return VIEW_LABELS[value] ?? "已指定";
  if (key === "maxDepth" && typeof value === "number") return `${value} 层`;
  if (key === "limit" && typeof value === "number") return `${value}`;
  if (key === "maxChars" && typeof value === "number") return `${value}`;
  if (key === "markdownChars" || key === "contentChars" || key === "valueTextChars") {
    return typeof value === "number" ? `${value} 字符` : undefined;
  }
  if (key === "rootDocId" || key === "centerDocId" || key === "notebookId" || key === "docId" || key === "blockId") {
    return "已指定";
  }
  if (key === "includeTags" || key === "includeLinkedDocs") return value ? "是" : "否";
  if (key === "url" && typeof value === "string") return formatWebsite(value);
  if (key === "chunkIndex" && typeof value === "number") return `第 ${value} 段`;
  if (key === "chunkChars" && typeof value === "number") return `${value} 字符`;
  if (key === "chunkCount" && typeof value === "number") return `${value} 段`;
  return undefined;
}

export function formatToolArgsPreview(argsPreview: Record<string, unknown> | undefined): string {
  const parts = Object.entries(argsPreview ?? {})
    .map(([key, value]) => {
      const label = ARG_LABELS[key];
      const formatted = label ? formatArgValue(key, value) : undefined;
      return label && formatted ? `${label}：${formatted}` : "";
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join("；") : "已准备必要信息。";
}

function safeToolSummary(summary: string | undefined, toolName: string | undefined): string | undefined {
  const text = summary?.replace(/\s+/g, " ").trim();
  if (!text || text.length > 160) return undefined;
  if (toolName && text === toolName) return undefined;
  return text;
}

export function formatToolResultSummary(
  displayName: string,
  outputSummary: string | undefined,
  toolName?: string,
): string {
  return safeToolSummary(outputSummary, toolName) ?? `${displayName}已完成。`;
}

export function formatToolFailureSummary(
  displayName: string,
  outputSummary: string | undefined,
  toolName?: string,
  errorCode?: string,
): string {
  const safeSummary = safeToolSummary(outputSummary, toolName);
  if (safeSummary) return safeSummary;
  if (errorCode === "invalid_action_args" || errorCode === "invalid_args" || errorCode === "invalid_tool_arguments") {
    return `${displayName}参数不符合要求。`;
  }
  if (errorCode === "duplicate_failed_call_blocked" || errorCode === "duplicate_read_call_blocked") {
    return `${displayName}重复调用已停止。`;
  }
  if (errorCode === "user_rejected" || errorCode === "user_aborted") {
    return `${displayName}已取消。`;
  }
  return `${displayName}未完成，请调整请求后重试。`;
}

export interface WorkbenchProcessStepStatsInput {
  isToolExecution?: boolean;
  ok?: boolean;
  running?: boolean;
}

export interface WorkbenchProcessState {
  isGenerating: boolean;
  isComplete: boolean;
  doneStatus?: "answer_ready" | "failed" | "cancelled";
}

interface WorkbenchTerminalEventInput {
  type: string;
  status?: "answer_ready" | "failed" | "cancelled";
  code?: string;
  answer?: string;
  message?: string;
}

export function resolveWorkbenchFinalStatus(
  events: readonly WorkbenchTerminalEventInput[],
): "answer_ready" | "failed" | "cancelled" | undefined {
  const pseudoToolMarkupBlocked = events.some((event) =>
    event.type === "error" && event.code === "pseudo_tool_markup_blocked",
  );
  if (pseudoToolMarkupBlocked) return "failed";

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "done") return event.status;
  }
  return undefined;
}

export function formatWorkbenchProcessStats(
  steps: readonly WorkbenchProcessStepStatsInput[],
  state: WorkbenchProcessState,
): string {
  const toolSteps = steps.filter((step) => step.isToolExecution === true);
  const total = toolSteps.length;
  const succeeded = toolSteps.filter((step) => step.ok === true).length;
  const failed = toolSteps.filter((step) => step.ok === false).length;
  const running = toolSteps.filter((step) => step.running === true).length;

  let outcome: string;
  if (state.isGenerating || running > 0) {
    outcome = "执行中";
  } else if (state.doneStatus === "failed") {
    outcome = "最终失败";
  } else if (state.doneStatus === "cancelled") {
    outcome = "已取消";
  } else if (state.doneStatus === "answer_ready" && total === 0) {
    outcome = "回答已完成（未执行工具）";
  } else if (state.doneStatus === "answer_ready" && failed === 0 && succeeded === total) {
    outcome = "最终成功";
  } else if (total > 0 && failed === total) {
    outcome = "最终失败";
  } else if (total > 0 && failed > 0) {
    outcome = "部分工具失败";
  } else if (!state.isComplete) {
    outcome = "已停止";
  } else {
    outcome = failed > 0 && succeeded === 0 ? "最终失败" : "最终成功";
  }

  if (total === 0) return outcome;
  return `工具 ${total} 次 · 成功 ${succeeded} · 失败 ${failed} · ${outcome}`;
}
