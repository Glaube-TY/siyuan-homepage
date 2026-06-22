import type { NativeTool } from "../tools/native-tool";
import type { ToolPermissionPreview } from "./tool-preview";

const HIGH_RISK_NAMES = new Set([
  "delete_doc",
  "delete_blocks",
  "replace_doc_content",
  "edit_global_memory",
]);

const SAFE_ARG_KEYS = new Set([
  "docId",
  "docIds",
  "blockId",
  "blockIds",
  "targetId",
  "title",
  "name",
  "mode",
  "period",
  "taskId",
  "completed",
  "taskname",
  "categoryTitle",
  "priority",
  "startDate",
  "deadline",
]);

function compactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(compactValue);
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }
  return "[object]";
}

function buildEditGlobalMemoryPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const memory = typeof args.memory === "string" ? args.memory : "";
  const normalized = memory.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const memoryChars = normalized.length;
  const memoryLineCount = normalized ? normalized.split("\n").filter((l) => l.trim()).length : 0;

  const previewParts: string[] = [];
  if (!normalized) {
    previewParts.push("将清空全局记忆");
  } else {
    previewParts.push(`将全量替换全局记忆`);
    previewParts.push(`新记忆：${memoryChars} 字符，${memoryLineCount} 条`);
    const preview = normalized.length > 400 ? `${normalized.slice(0, 397)}...` : normalized;
    previewParts.push(`预览：${preview}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "high",
    argsPreview: { memory: memoryChars > 0 ? `(${memoryChars} 字符)` : "(清空)" },
    summary: previewParts.join("\n"),
  };
}

function buildUpdateAttributeViewCellPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const databaseId = typeof args.databaseId === "string" ? args.databaseId : "";
  const rowId = typeof args.rowId === "string" ? args.rowId : "";
  const keyId = typeof args.keyId === "string" ? args.keyId : "";
  const valueText = typeof args.valueText === "string" ? args.valueText : "";
  const valueTypeHint = typeof args.valueTypeHint === "string" ? args.valueTypeHint : "";
  const expectedFieldName = typeof args.expectedFieldName === "string" ? args.expectedFieldName : "";
  const updates = Array.isArray(args.updates) ? args.updates : [];
  const aiSummary = typeof args.summary === "string" ? args.summary : "";

  const argsPreview: Record<string, unknown> = { databaseId };
  const parts: string[] = [];

  if (aiSummary) {
    parts.push(`AI 说明：${aiSummary}`);
  }
  parts.push(`数据库：${databaseId}`);

  // 批量模式
  if (updates.length > 0) {
    parts.push(`操作：批量更新数据库单元格`);
    parts.push(`更新数量：${updates.length} 项`);
    argsPreview.updateCount = updates.length;

    // 显示前 5 条更新预览
    const previewItems = updates.slice(0, 5);
    for (let i = 0; i < previewItems.length; i++) {
      const item = previewItems[i];
      if (item && typeof item === "object") {
        const itemRowId = typeof item.rowId === "string" ? item.rowId : "";
        const itemKeyId = typeof item.keyId === "string" ? item.keyId : "";
        const itemValueText = typeof item.valueText === "string" ? item.valueText : "";
        const displayValue = itemValueText.length > 50 ? `${itemValueText.slice(0, 47)}...` : itemValueText;
        parts.push(`[${i + 1}] rowId=${itemRowId}, keyId=${itemKeyId}, value=${displayValue}`);
      }
    }

    if (updates.length > 5) {
      parts.push(`...还有 ${updates.length - 5} 项`);
    }
  } else {
    // 单个模式
    parts.push(`操作：更新数据库单元格`);
    argsPreview.rowId = rowId;
    argsPreview.keyId = keyId;
    parts.push(`条目 ID：${rowId}`);
    parts.push(`字段 ID：${keyId}`);
    if (expectedFieldName) {
      argsPreview.expectedFieldName = expectedFieldName;
      parts.push(`字段名：${expectedFieldName}`);
    }
    if (valueTypeHint) {
      argsPreview.valueTypeHint = valueTypeHint;
      parts.push(`值类型：${valueTypeHint}`);
    }
    const displayValue = valueText.length > 200 ? `${valueText.slice(0, 197)}...` : valueText;
    argsPreview.valueText = displayValue;
    parts.push(`新值：${displayValue}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildAddAttributeViewKeyPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const databaseId = typeof args.databaseId === "string" ? args.databaseId : "";
  const keyName = typeof args.keyName === "string" ? args.keyName : "";
  const keyType = typeof args.keyType === "string" ? args.keyType : "text";
  const previousKeyId = typeof args.previousKeyId === "string" ? args.previousKeyId : "";
  const aiSummary = typeof args.summary === "string" ? args.summary : "";

  const argsPreview: Record<string, unknown> = { databaseId, keyName, keyType };
  const parts: string[] = ["操作：新增数据库字段"];

  if (aiSummary) {
    parts.push(`AI 说明：${aiSummary}`);
  }
  parts.push(`数据库：${databaseId}`);
  parts.push(`字段名：${keyName}`);
  parts.push(`字段类型：${keyType}`);
  if (previousKeyId) {
    argsPreview.previousKeyId = previousKeyId;
    parts.push(`插入位置：${previousKeyId} 之后`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildAddAttributeViewRowsPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const databaseId = typeof args.databaseId === "string" ? args.databaseId : "";
  const databaseBlockId = typeof args.databaseBlockId === "string" ? args.databaseBlockId : "";
  const blockIds = Array.isArray(args.blockIds) ? args.blockIds : [];
  const detachedRows = Array.isArray(args.detachedRows) ? args.detachedRows : [];
  const defaultValues = args.defaultValues && typeof args.defaultValues === "object" ? args.defaultValues as Record<string, unknown> : {};
  const viewID = typeof args.viewID === "string" ? args.viewID : "";
  const groupID = typeof args.groupID === "string" ? args.groupID : "";
  const previousID = typeof args.previousID === "string" ? args.previousID : "";
  const ignoreDefaultFill = typeof args.ignoreDefaultFill === "boolean" ? args.ignoreDefaultFill : false;
  const aiSummary = typeof args.summary === "string" ? args.summary : "";

  const argsPreview: Record<string, unknown> = { databaseId };
  const parts: string[] = ["操作：添加数据库条目"];

  if (aiSummary) {
    parts.push(`AI 说明：${aiSummary}`);
  }
  parts.push(`数据库：${databaseId}`);

  if (databaseBlockId) {
    argsPreview.databaseBlockId = databaseBlockId;
    parts.push(`数据库块 ID：${databaseBlockId}`);
  }

  if (blockIds.length > 0) {
    argsPreview.blockIdCount = blockIds.length;
    parts.push(`绑定块数量：${blockIds.length}`);
  }

  if (detachedRows.length > 0) {
    argsPreview.detachedRowCount = detachedRows.length;
    parts.push(`新增脱离块条目：${detachedRows.length} 条`);
    // 标题预览，最多 5 条
    const titles = detachedRows
      .slice(0, 5)
      .map((r: any) => typeof r?.title === "string" ? r.title : "")
      .filter(Boolean);
    if (titles.length > 0) {
      parts.push(`标题预览：${titles.join("、")}`);
    }
    // 字段预览
    const firstRow = detachedRows[0];
    if (firstRow && typeof firstRow === "object" && firstRow.values) {
      const fieldNames = Object.keys(firstRow.values);
      if (fieldNames.length > 0) {
        parts.push(`字段：${fieldNames.join("、")}`);
      }
    }
  }

  if (viewID) {
    argsPreview.viewID = viewID;
    parts.push(`视图 ID：${viewID}`);
  }
  if (groupID) {
    argsPreview.groupID = groupID;
  }
  if (previousID) {
    argsPreview.previousID = previousID;
  }
  if (ignoreDefaultFill) {
    argsPreview.ignoreDefaultFill = true;
  }

  if (Object.keys(defaultValues).length > 0) {
    const fieldNames = Object.keys(defaultValues);
    argsPreview.defaultFieldCount = fieldNames.length;
    parts.push(`默认值字段：${fieldNames.join("、")}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildRemoveAttributeViewKeyPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const databaseId = typeof args.databaseId === "string" ? args.databaseId : "";
  const keyId = typeof args.keyId === "string" ? args.keyId : "";
  const removeRelationDest = typeof args.removeRelationDest === "boolean" ? args.removeRelationDest : false;
  const expectedKeyName = typeof args.expectedKeyName === "string" ? args.expectedKeyName : "";
  const aiSummary = typeof args.summary === "string" ? args.summary : "";

  const argsPreview: Record<string, unknown> = { databaseId, keyId, removeRelationDest };
  const parts: string[] = ["操作：删除数据库字段"];

  if (aiSummary) {
    parts.push(`AI 说明：${aiSummary}`);
  }
  parts.push(`数据库：${databaseId}`);
  parts.push(`字段 ID：${keyId}`);
  if (expectedKeyName) {
    argsPreview.expectedKeyName = expectedKeyName;
    parts.push(`字段名：${expectedKeyName}`);
  }
  parts.push(`删除关联目标：${removeRelationDest ? "是" : "否"}`);
  parts.push("警告：删除字段会移除该字段及其所有值。");

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "high",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildRemoveAttributeViewRowsPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const databaseId = typeof args.databaseId === "string" ? args.databaseId : "";
  const rowIds = Array.isArray(args.rowIds) ? args.rowIds : [];
  const expectedTitles = Array.isArray(args.expectedTitles) ? args.expectedTitles : [];
  const aiSummary = typeof args.summary === "string" ? args.summary : "";

  const argsPreview: Record<string, unknown> = { databaseId, rowCount: rowIds.length };
  const parts: string[] = ["操作：删除数据库条目"];

  if (aiSummary) {
    parts.push(`AI 说明：${aiSummary}`);
  }
  parts.push(`数据库：${databaseId}`);
  parts.push(`删除数量：${rowIds.length} 条`);

  // 显示 rowId 预览，最多 5 个
  const rowIdPreview = rowIds.slice(0, 5).map((id) => typeof id === "string" ? id : "").filter(Boolean);
  if (rowIdPreview.length > 0) {
    argsPreview.rowIds = rowIdPreview;
    parts.push(`条目 ID 预览：${rowIdPreview.join("、")}`);
  }

  // 显示标题预览
  if (expectedTitles.length > 0) {
    const titlePreview = expectedTitles.slice(0, 5).filter(Boolean);
    if (titlePreview.length > 0) {
      argsPreview.expectedTitles = titlePreview;
      parts.push(`标题预览：${titlePreview.join("、")}`);
    }
  }

  parts.push("警告：删除条目会移除该条目及其所有字段值。");

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "high",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildClearAttributeViewCellPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const databaseId = typeof args.databaseId === "string" ? args.databaseId : "";
  const rowId = typeof args.rowId === "string" ? args.rowId : "";
  const keyId = typeof args.keyId === "string" ? args.keyId : "";
  const expectedFieldName = typeof args.expectedFieldName === "string" ? args.expectedFieldName : "";
  const aiSummary = typeof args.summary === "string" ? args.summary : "";

  const argsPreview: Record<string, unknown> = { databaseId, rowId, keyId };
  const parts: string[] = ["操作：清空数据库单元格"];

  if (aiSummary) {
    parts.push(`AI 说明：${aiSummary}`);
  }
  parts.push(`数据库：${databaseId}`);
  parts.push(`条目 ID：${rowId}`);
  parts.push(`字段 ID：${keyId}`);
  if (expectedFieldName) {
    argsPreview.expectedFieldName = expectedFieldName;
    parts.push(`字段名：${expectedFieldName}`);
  }
  parts.push("清空会写入该字段类型的空值/默认空值。");
  parts.push("警告：清空后该单元格值将被重置。");

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

const TASK_DIARY_WRITE_TOOLS = new Set([
  "manage_diary_structure",
  "manage_diary_task",
  "manage_diary_record",
  "manage_diary_review",
]);

function buildManageDiaryStructurePreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const operation = typeof args.operation === "string" ? args.operation : "unknown";

  if (operation === "ensure_today") {
    return {
      toolName: tool.name,
      title: tool.title,
      readOnly: false,
      risk: "medium",
      argsPreview: { operation },
      summary: "将确保今日日记存在；如不存在，将按强化日记设置创建。",
    };
  }

  const period = typeof args.period === "string" ? args.period : "day";
  const date = typeof args.date === "string" ? args.date : undefined;
  const docId = typeof args.docId === "string" ? args.docId : undefined;

  const argsPreview: Record<string, unknown> = { operation, period };
  const parts: string[] = [`操作：补充模板`, `周期：${period}`];

  if (date) {
    argsPreview.date = date;
    parts.push(`日期：${date}`);
  } else {
    parts.push("日期：默认今天");
  }
  if (docId) {
    argsPreview.docId = docId;
    parts.push(`文档：${docId}`);
  }
  parts.push("模板来自强化日记设置，不接受 AI 模板正文。");

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildManageDiaryReviewPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const operation = typeof args.operation === "string" ? args.operation : "unknown";
  const docId = typeof args.docId === "string" ? args.docId : "";
  const period = typeof args.period === "string" ? args.period : "";
  const status = typeof args.status === "string" ? args.status : undefined;
  const fields = Array.isArray(args.fields) ? args.fields : [];

  const argsPreview: Record<string, unknown> = { operation, docId, period };
  const parts: string[] = [`文档：${docId}`, `周期：${period}`];

  switch (operation) {
    case "save_content": {
      const fieldCount = fields.length;
      const labels: string[] = [];
      const contentParts: string[] = [];
      for (const f of fields.slice(0, 10)) {
        if (f && typeof f === "object") {
          const label = typeof (f as Record<string, unknown>).label === "string" ? (f as Record<string, unknown>).label as string : "";
          const content = typeof (f as Record<string, unknown>).content === "string" ? (f as Record<string, unknown>).content as string : "";
          if (label) labels.push(label);
          if (content) contentParts.push(content);
        }
      }
      argsPreview.fieldCount = fieldCount;
      argsPreview.fields = `(${fieldCount} 个字段)`;
      parts.push(`字段数量：${fieldCount}`);
      if (labels.length > 0) parts.push(`字段：${labels.join("、")}`);
      const allContent = contentParts.join("\n");
      if (allContent) {
        const preview = allContent.length > 200 ? `${allContent.slice(0, 197)}...` : allContent;
        parts.push(`内容预览：${preview}`);
      }
      break;
    }
    case "set_status": {
      if (status) {
        argsPreview.status = status;
        const statusLabel = status === "completed" ? "完成" : status === "pending" ? "未完成" : "跳过";
        parts.push(`状态：${statusLabel}`);
      }
      break;
    }
    default:
      parts.push(`未知操作：${operation}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildManageDiaryTaskPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const operation = typeof args.operation === "string" ? args.operation : "unknown";
  const target = args.target && typeof args.target === "object" ? args.target as Record<string, unknown> : undefined;
  const task = args.task && typeof args.task === "object" ? args.task as Record<string, unknown> : undefined;
  const blockId = typeof target?.blockId === "string" ? target.blockId : undefined;
  const taskId = typeof target?.taskId === "string" ? target.taskId : undefined;
  const completed = typeof args.completed === "boolean" ? args.completed : undefined;
  const postponeTo = typeof args.postponeTo === "string" ? args.postponeTo : undefined;
  const deleteMode = typeof args.deleteMode === "string" ? args.deleteMode : "log";
  const clearFields = Array.isArray(args.clearFields) ? args.clearFields : [];

  const priorityLabel = (p: unknown): string => {
    const n = typeof p === "number" ? p : 0;
    return n >= 1 && n <= 4 ? `${n}（${"❗".repeat(n)}）` : "";
  };

  const argsPreview: Record<string, unknown> = { operation };
  const parts: string[] = [];

  switch (operation) {
    case "create": {
      const taskname = typeof task?.taskname === "string" ? task.taskname : "";
      argsPreview.taskname = taskname.length > 80 ? `${taskname.slice(0, 77)}...` : taskname;
      parts.push(`新增任务：${argsPreview.taskname}`);
      if (typeof task?.priority === "number") parts.push(`优先级：${priorityLabel(task.priority)}`);
      if (typeof task?.deadline === "string") parts.push(`截止：${task.deadline}`);
      break;
    }
    case "migrate": {
      if (blockId) argsPreview.blockId = blockId;
      if (taskId) argsPreview.taskId = taskId;
      parts.push(`迁移任务 ${blockId || taskId} 到今日日记`);
      parts.push("将按强化日记工作台的迁移任务流程执行。");
      break;
    }
    case "set_status": {
      if (blockId) argsPreview.blockId = blockId;
      if (taskId) argsPreview.taskId = taskId;
      argsPreview.completed = completed;
      parts.push(completed ? "标记任务完成" : "标记任务未完成");
      break;
    }
    case "update": {
      if (blockId) argsPreview.blockId = blockId;
      if (taskId) argsPreview.taskId = taskId;
      const fields = task ? Object.keys(task).join("、") : "";
      if (fields) parts.push(`更新字段：${fields}`);
      if (typeof task?.priority === "number") parts.push(`优先级：${priorityLabel(task.priority)}`);
      if (clearFields.length > 0) parts.push(`清空字段：${clearFields.join("、")}`);
      if (!fields && clearFields.length === 0) parts.push("无变更");
      break;
    }
    case "postpone": {
      if (blockId) argsPreview.blockId = blockId;
      if (taskId) argsPreview.taskId = taskId;
      argsPreview.postponeTo = postponeTo;
      parts.push(`推迟任务到${postponeTo === "next_week" ? "下周" : "明天"}`);
      break;
    }
    case "delete": {
      if (blockId) argsPreview.blockId = blockId;
      if (taskId) argsPreview.taskId = taskId;
      argsPreview.deleteMode = deleteMode;
      parts.push(`删除任务（${deleteMode === "log" ? "记录日志后删除" : "直接删除"}）`);
      break;
    }
    default:
      parts.push(`未知操作：${operation}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: operation === "delete" ? "high" : "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildManageDiaryRecordPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const operation = typeof args.operation === "string" ? args.operation : "unknown";
  const target = args.target && typeof args.target === "object" ? args.target as Record<string, unknown> : undefined;
  const recordId = typeof target?.recordId === "string" ? target.recordId : undefined;
  const headingBlockId = typeof target?.headingBlockId === "string" ? target.headingBlockId : undefined;
  const date = typeof target?.date === "string" ? target.date : "默认今天";
  const categoryTitle = typeof args.categoryTitle === "string" ? args.categoryTitle : undefined;
  const content = typeof args.content === "string" ? args.content : undefined;

  const argsPreview: Record<string, unknown> = { operation };
  const parts: string[] = [];

  switch (operation) {
    case "add": {
      if (categoryTitle) {
        argsPreview.categoryTitle = categoryTitle;
        parts.push(`分类：${categoryTitle}`);
      }
      if (content) {
        const preview = content.length > 200 ? `${content.slice(0, 197)}...` : content;
        argsPreview.content = `(${content.length} 字)`;
        parts.push(`内容预览：${preview}`);
      }
      break;
    }
    case "update": {
      if (recordId) argsPreview.recordId = recordId;
      if (headingBlockId) argsPreview.headingBlockId = headingBlockId;
      argsPreview.date = date;
      parts.push(`修改记录 ${recordId || headingBlockId}（${date}）`);
      if (content) {
        const preview = content.length > 200 ? `${content.slice(0, 197)}...` : content;
        argsPreview.content = `(${content.length} 字)`;
        parts.push(`新内容预览：${preview}`);
      }
      break;
    }
    case "delete": {
      if (recordId) argsPreview.recordId = recordId;
      if (headingBlockId) argsPreview.headingBlockId = headingBlockId;
      argsPreview.date = date;
      parts.push(`删除记录 ${recordId || headingBlockId}（${date}）`);
      break;
    }
    default:
      parts.push(`未知操作：${operation}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: operation === "delete" ? "high" : "medium",
    argsPreview,
    summary: parts.join("\n"),
  };
}

function buildGenericTaskDiaryWritePreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const parts: string[] = [];
  const argsPreview: Record<string, unknown> = {};

  const taskname = typeof args.taskname === "string" ? args.taskname : undefined;
  const period = typeof args.period === "string" ? args.period : undefined;
  const docId = typeof args.docId === "string" ? args.docId : undefined;
  const blockId = typeof args.blockId === "string" ? args.blockId : undefined;
  const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
  const completed = typeof args.completed === "boolean" ? args.completed : undefined;
  const categoryTitle = typeof args.categoryTitle === "string" ? args.categoryTitle : undefined;
  const content = typeof args.content === "string" ? args.content : undefined;

  if (taskname) {
    argsPreview.taskname = taskname.length > 80 ? `${taskname.slice(0, 77)}...` : taskname;
    parts.push(`任务：${argsPreview.taskname}`);
  }
  if (period) {
    argsPreview.period = period;
    parts.push(`周期：${period}`);
  }
  if (docId) {
    argsPreview.docId = docId;
    parts.push(`文档：${docId}`);
  }
  if (blockId) {
    argsPreview.blockId = blockId;
  }
  if (taskId) {
    argsPreview.taskId = taskId;
  }
  if (completed !== undefined) {
    argsPreview.completed = completed;
    parts.push(completed ? "标记完成" : "标记未完成");
  }
  if (categoryTitle) {
    argsPreview.categoryTitle = categoryTitle;
    parts.push(`分类：${categoryTitle}`);
  }
  if (content) {
    const preview = content.length > 200 ? `${content.slice(0, 197)}...` : content;
    argsPreview.content = `(${content.length} 字)`;
    parts.push(`内容预览：${preview}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: parts.length > 0 ? parts.join("\n") : undefined,
  };
}

export function buildToolPermissionPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  if (tool.name === "edit_global_memory") {
    return buildEditGlobalMemoryPreview(tool, args);
  }

  if (tool.name === "update_attribute_view_cell") {
    return buildUpdateAttributeViewCellPreview(tool, args);
  }
  if (tool.name === "add_attribute_view_key") {
    return buildAddAttributeViewKeyPreview(tool, args);
  }
  if (tool.name === "add_attribute_view_rows") {
    return buildAddAttributeViewRowsPreview(tool, args);
  }
  if (tool.name === "remove_attribute_view_key") {
    return buildRemoveAttributeViewKeyPreview(tool, args);
  }
  if (tool.name === "remove_attribute_view_rows") {
    return buildRemoveAttributeViewRowsPreview(tool, args);
  }
  if (tool.name === "clear_attribute_view_cell") {
    return buildClearAttributeViewCellPreview(tool, args);
  }

  if (tool.name === "manage_diary_structure") {
    return buildManageDiaryStructurePreview(tool, args);
  }
  if (tool.name === "manage_diary_review") {
    return buildManageDiaryReviewPreview(tool, args);
  }
  if (tool.name === "manage_diary_task") {
    return buildManageDiaryTaskPreview(tool, args);
  }
  if (tool.name === "manage_diary_record") {
    return buildManageDiaryRecordPreview(tool, args);
  }
  if (TASK_DIARY_WRITE_TOOLS.has(tool.name)) {
    return buildGenericTaskDiaryWritePreview(tool, args);
  }

  const argsPreview: Record<string, unknown> = {};
  const safeParts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (SAFE_ARG_KEYS.has(key)) {
      argsPreview[key] = compactValue(value);
      safeParts.push(`${key}=${compactValue(value)}`);
    }
  }
  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: tool.readOnly,
    risk: tool.readOnly ? "low" : HIGH_RISK_NAMES.has(tool.name) ? "high" : "medium",
    argsPreview,
    summary: safeParts.length > 0 ? safeParts.join(", ") : undefined,
  };
}

