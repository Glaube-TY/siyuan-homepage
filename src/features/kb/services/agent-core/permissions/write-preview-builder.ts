import type { NativeTool } from "../tools/native-tool";
import type { ToolPermissionPreview } from "./tool-preview";

/** Header keys whose values must be redacted in logs/debug/permission previews. */
const SENSITIVE_HEADER_KEYS = new Set([
  "authorization", "cookie", "x-api-key", "x-auth-token", "x-token",
  "api-key", "apikey", "token", "secret", "x-secret", "password",
  "access-token", "access_token", "bearer", "credential", "private_key",
  "x-api-secret", "api_secret",
]);

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

function buildRunNotebrainCommandPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const command = typeof args.command === "string" ? args.command : "";
  const cwd = typeof args.cwd === "string" && args.cwd.trim() ? args.cwd.trim() : ".";
  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;
  const maxOutputChars = typeof args.maxOutputChars === "number" ? args.maxOutputChars : undefined;
  const riskLevel = typeof args.riskLevel === "string" ? args.riskLevel : (args as any)?.riskLevel;
  const riskReasons = Array.isArray((args as any)?.riskReasons) ? (args as any).riskReasons as string[] : [];
  const riskCategories = Array.isArray((args as any)?.riskCategories) ? (args as any).riskCategories as string[] : [];
  const strictMode = (args as any)?.strictWorkspaceMode !== false;
  const hardDeny = (args as any)?.hardDeny === true;

  const parts = [
    "不是系统级沙箱，仅限制 cwd 为 notebrain/projects/default；命令本身仍可能读取系统信息、环境变量或访问绝对路径。",
    `命令：${command}`,
    `cwd：${cwd}`,
    strictMode ? "严格模式：开启" : "严格模式：关闭",
  ];

  if (riskLevel) parts.push(`风险等级：${riskLevel === "high" ? "⚠ 高风险" : riskLevel === "medium" ? "中风险" : "低风险"}`);
  for (const reason of riskReasons) {
    parts.push(`⚠ ${reason}`);
  }

  // Category-specific impact statements
  if (riskCategories.includes("system_info")) parts.push("可能读取系统信息（systeminfo/wmic/ipconfig/whoami 等）");
  if (riskCategories.includes("absolute_path") || riskCategories.includes("parent_path")) parts.push("可能访问工作区外路径");
  if (riskCategories.includes("file_ops")) parts.push("可能修改或删除文件");
  if (riskCategories.includes("network")) parts.push("可能发起外部网络请求");

  if (hardDeny) {
    parts.push("⛔ 严格模式下已拒绝：不进入确认执行。");
  }

  if (timeoutMs) parts.push(`timeout：${timeoutMs}ms`);
  if (maxOutputChars) parts.push(`输出预览上限：${maxOutputChars} 字符`);
  parts.push("命令不支持交互式 TTY 或后台常驻进程，执行日志会写入 notebrain/logs/commands。");

  return {
    toolName: tool.name,
    title: `执行本地命令${riskLevel === "high" ? " ⚠ 高风险" : ""}`,
    readOnly: false,
    risk: "high",
    argsPreview: { command, cwd, timeoutMs, maxOutputChars, riskLevel, riskReasons, riskCategories, strictMode, hardDeny },
    summary: parts.join("\n"),
  };
}

function buildSkillInstallPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const source = typeof args.source === "string" ? args.source : "";
  const targetSkillId = typeof args.targetSkillId === "string" ? args.targetSkillId : "(自动生成)";
  return {
    toolName: tool.name,
    title: "安装外部 Skill",
    readOnly: false,
    risk: "medium",
    argsPreview: { source, targetSkillId },
    summary: [
      `来源：${source}`,
      `目标：notebrain/skills/installed/${targetSkillId}`,
      "将下载/解压 Skill 包、写入 notebrain 工作区并更新 skills/index.json。",
      "如 Skill 需要 API Key 或环境变量，安装后只提示用户配置，不会自动搜索隐私信息。",
    ].join("\n"),
  };
}

function buildSkillMaintenancePreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const id = typeof args.id === "string" ? args.id : "";
  const isReindex = tool.name === "skill_reindex";
  return {
    toolName: tool.name,
    title: isReindex ? "重建外部 Skill 索引" : "停用外部 Skill",
    readOnly: false,
    risk: "medium",
    argsPreview: isReindex ? {} : { id },
    summary: isReindex
      ? "将扫描 notebrain/skills/installed 下的 SKILL.md，并重写 notebrain/skills/index.json。"
      : `将把 Skill ${id} 标记为 disabled，不会永久删除文件。`,
  };
}

function buildNotebrainFileWritePreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const path = typeof args.path === "string" ? args.path : "";
  const content = typeof args.content === "string" ? args.content : "";
  const isDelete = tool.name === "delete_notebrain_path";
  return {
    toolName: tool.name,
    title: isDelete ? "删除 Notebrain 路径" : "写入 Notebrain 文件",
    readOnly: false,
    risk: isDelete ? "high" : "medium",
    argsPreview: isDelete ? { path } : { path, chars: content.length },
    summary: isDelete
      ? `将删除 notebrain 工作区内路径：${path}`
      : `将写入 notebrain 工作区内文件：${path}\n内容长度：${content.length} 字符`,
  };
}

function buildMcpToolPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const meta = (tool as NativeTool & { meta?: Record<string, unknown> }).meta;
  const serverId = typeof meta?.serverId === "string" ? meta.serverId : "";
  const originalName = typeof meta?.originalName === "string" ? meta.originalName : tool.name;
  return {
    toolName: tool.name,
    title: "调用 MCP 工具",
    readOnly: false,
    risk: tool.riskLevel ?? "medium",
    argsPreview: {
      serverId,
      toolName: originalName,
      argumentsPreview: compactValue(args),
    },
    summary: [
      `MCP Server：${serverId}`,
      `MCP 工具：${originalName}`,
      "外部 MCP annotations 不作为完全可信依据，默认按中风险确认。",
    ].join("\n"),
  };
}

function buildMcpManagementPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  if (tool.name === "mcp_save_server") {
    const server = args.server && typeof args.server === "object" ? args.server as Record<string, unknown> : {};
    const id = typeof server.id === "string" ? server.id : "";
    const transport = typeof server.transport === "string" ? server.transport : "";
    const title = typeof server.title === "string" ? server.title : id;
    const endpoint = transport === "stdio"
      ? (typeof server.command === "string" ? server.command : "")
      : (typeof server.url === "string" ? server.url : "");
    const auth = server.auth && typeof server.auth === "object" ? server.auth as Record<string, unknown> : undefined;
    const authType = auth ? String(auth.type ?? "none") : undefined;
    const hasBearerToken = auth ? !!auth.bearerToken : false;
    const hasApiKey = auth ? !!auth.apiKey : false;
    const headerKeys = auth?.headers && typeof auth.headers === "object" ? Object.keys(auth.headers as Record<string, unknown>) : [];
    const envKeys = server.env && typeof server.env === "object" ? Object.keys(server.env as Record<string, unknown>) : [];
    return {
      toolName: tool.name,
      title: "保存 MCP Server 配置",
      readOnly: false,
      risk: "medium",
      argsPreview: { id, title, transport, endpoint, ...(authType ? { authType, hasBearerToken, hasApiKey, headerKeys } : {}), ...(envKeys.length > 0 ? { envKeys } : {}) },
      summary: [
        `Server：${title || id}`,
        `传输：${transport}`,
        endpoint ? `入口：${endpoint}` : "入口：未提供",
        authType && authType !== "none" ? `认证：${authType}` : "认证：无",
        hasBearerToken ? "已包含 Bearer Token" : "",
        hasApiKey ? "已包含 API Key" : "",
        headerKeys.length > 0 ? `附加 Header：${headerKeys.join(", ")}` : "",
        envKeys.length > 0 ? `环境变量：${envKeys.join(", ")}` : "",
        "将写入 notebrain/mcp/servers.json。保存后仍需要同步 tools/list 才会暴露工具。",
      ].filter(Boolean).join("\n"),
    };
  }

  const serverId = typeof args.serverId === "string" && args.serverId.trim() ? args.serverId.trim() : "(全部已启用)";
  return {
    toolName: tool.name,
    title: "同步 MCP 工具索引",
    readOnly: false,
    risk: "medium",
    argsPreview: { serverId },
    summary: [
      `目标 Server：${serverId}`,
      "将连接外部 MCP Server，调用 tools/list，并重写 notebrain/mcp/tool-index.json。",
      "同步工具不会直接调用具体 MCP 工具。",
    ].join("\n"),
  };
}

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

const SIYUAN_ACTION_PREVIEW_TITLES: Record<string, string> = {
  siyuan_block_attr: "块属性管理",
  siyuan_block_ref: "块引用管理",
  siyuan_block_state: "块状态修改",
  siyuan_doc_transform: "文档结构转换",
  siyuan_database_view: "数据库视图修改",
  siyuan_notebook_manage: "笔记本管理",
  siyuan_doc_tree: "文档树管理",
  siyuan_tag_manage: "标签管理",
  siyuan_bookmark_manage: "书签管理",
  siyuan_asset_manage: "资源管理",
  siyuan_workspace_file: "受限工作区文件操作",
  siyuan_riff_deck: "闪卡卡包管理",
  siyuan_riff_card: "闪卡管理",
};

const HIGH_RISK_SIYUAN_ACTIONS = new Set([
  "transfer_ref",
  "swap_ref",
  "doc_to_heading",
  "heading_to_doc",
  "list_item_to_doc",
  "remove",
  "remove_unused_batch",
  "remove_unused_one",
  "remove_file",
  "rename_file",
  "move",
  "move_by_id",
  "sort",
  "delete",
  "reset",
  "remove_cards",
]);

function joinTargetLines(args: Record<string, unknown>): string {
  const keys = [
    "id", "ids", "docId", "blockId", "blockIds", "fromID", "toID", "refIDs",
    "notebook", "path", "targetPath", "fromPaths", "toNotebook", "toPath",
    "avID", "blockID", "viewID", "keyID", "previousKeyID",
    "label", "oldLabel", "newLabel", "deckID", "cardID", "cardIDs",
    "blockIDs", "cardDues", "resetType", "due", "rating", "reviewedCardIDs",
    "paths", "newName",
  ];
  const lines: string[] = [];
  for (const key of keys) {
    if (!(key in args)) continue;
    const value = compactValue(args[key]);
    if (Array.isArray(value)) {
      lines.push(`${key}: ${value.join("、")}${Array.isArray(args[key]) && (args[key] as unknown[]).length > value.length ? " ..." : ""}`);
    } else if (value !== undefined && value !== null && value !== "") {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "目标由工具参数指定，请确认 ID/路径来自真实工具结果或用户明确输入。";
}

function buildSiyuanActionPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const action = typeof args.action === "string" ? args.action : "unknown";
  const title = SIYUAN_ACTION_PREVIEW_TITLES[tool.name] ?? tool.title;
  const isHighRisk = HIGH_RISK_SIYUAN_ACTIONS.has(action)
    || tool.name === "siyuan_doc_transform"
    || (tool.name === "siyuan_notebook_manage" && action === "remove")
    || (tool.name === "siyuan_workspace_file" && action !== "put_file");
  const targetLines = joinTargetLines(args);
  const impactLines: string[] = [];

  if (tool.name === "siyuan_workspace_file") {
    impactLines.push("仅允许访问白名单工作区目录；路径守卫会拒绝敏感目录和系统路径。");
  }
  if (tool.name === "siyuan_block_ref") {
    impactLines.push("引用迁移会改变块引用关系，请确认 fromID/toID/refIDs 均真实。");
  }
  if (tool.name === "siyuan_doc_transform" || tool.name === "siyuan_doc_tree") {
    impactLines.push("会改变文档树或文档结构，可能影响文档组织。");
  }
  if (tool.name === "siyuan_database_view") {
    impactLines.push("会修改数据库视图结构、排序、布局或分组，建议已先读取 schema/view。");
  }
  if (tool.name === "siyuan_asset_manage") {
    impactLines.push("会修改资源元信息、OCR、索引或删除未使用资源。");
  }
  if (tool.name === "siyuan_riff_card") {
    const riffAction = typeof args.action === "string" ? args.action : "";
    if (["due_cards", "tree_due_cards", "notebook_due_cards", "list_cards", "tree_cards", "notebook_cards", "cards_by_block_ids"].includes(riffAction)) {
      impactLines.push("只读查询，不改变任何数据。");
    } else if (riffAction === "add_cards") {
      impactLines.push(`添加 ${Array.isArray(args.blockIDs) ? (args.blockIDs as unknown[]).length : "?"} 张闪卡到 Deck${args.deckID ? ` ${String(args.deckID).slice(0, 20)}` : ""}。`);
    } else if (riffAction === "remove_cards") {
      impactLines.push(`从 Deck${args.deckID ? ` ${String(args.deckID).slice(0, 20)}` : ""} 移除 ${Array.isArray(args.blockIDs) ? (args.blockIDs as unknown[]).length : "?"} 张闪卡。`);
    } else if (riffAction === "review") {
      impactLines.push(`复习闪卡 ${args.cardID ? String(args.cardID).slice(0, 20) : "?"}，评价 ${args.rating ?? "?"}，Deck ${args.deckID ? String(args.deckID).slice(0, 20) : "?"}。`);
    } else if (riffAction === "skip") {
      impactLines.push(`跳过闪卡 ${args.cardID ? String(args.cardID).slice(0, 20) : "?"}，Deck ${args.deckID ? String(args.deckID).slice(0, 20) : "?"}。`);
    } else if (riffAction === "reset") {
      impactLines.push(`重置闪卡：${args.resetType ?? "?"} ${args.id ?? "?"}，Deck ${args.deckID ? String(args.deckID).slice(0, 20) : "?"}，共 ${Array.isArray(args.blockIDs) ? (args.blockIDs as unknown[]).length : "0"} 张。`);
    } else if (riffAction === "set_due_time") {
      const cardDues = Array.isArray(args.cardDues) ? args.cardDues as Record<string, unknown>[] : [];
      const previewItems = cardDues.slice(0, 3).map((cd) => `${typeof cd.id === "string" ? cd.id.slice(0, 12) : "?"}=${cd.due ?? "?"}`).join("、");
      impactLines.push(`设到期时间：共 ${cardDues.length} 张卡片${cardDues.length > 0 ? `，前 ${Math.min(3, cardDues.length)} 项：${previewItems}` : ""}。`);
    }
    if (!["due_cards", "tree_due_cards", "notebook_due_cards", "list_cards", "tree_cards", "notebook_cards", "cards_by_block_ids"].includes(riffAction)) {
      impactLines.push("执行后应以工具结果为准，拒绝/取消/失败时不能声称成功。");
    }
  } else if (tool.name === "siyuan_riff_deck") {
    impactLines.push("会改变闪卡卡包结构，执行后应以工具结果为准。");
  }
  if (tool.name === "siyuan_tag_manage" || tool.name === "siyuan_bookmark_manage") {
    impactLines.push("会改变标签/书签组织信息，删除后可能影响资料组织。");
  }
  if (impactLines.length === 0) {
    impactLines.push("该操作会写入思源数据或状态；用户拒绝、取消或失败时不能声称成功。");
  }

  const argsPreview: Record<string, unknown> = { action };
  for (const key of ["id", "notebook", "path", "label", "deckID", "cardID", "avID", "viewID"]) {
    if (args[key] !== undefined) argsPreview[key] = compactValue(args[key]);
  }

  return {
    toolName: tool.name,
    title,
    readOnly: false,
    risk: isHighRisk ? "high" : "medium",
    argsPreview,
    summary: [`操作：${action}`, `目标：${targetLines.split("\n")[0]}`, `影响：${impactLines[0]}`].join("\n"),
    sections: [
      { label: "操作", value: action },
      { label: "目标", value: targetLines },
      { label: "影响", value: impactLines.join("\n") },
    ],
  };
}

// ── web_http_post confirmation preview ──

/** Redact sensitive header keys and values for safe display. */
function redactHeadersForPreview(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers || Object.keys(headers).length === 0) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

/** Recursively redact sensitive keys in a JSON body. */
function redactJsonBodyForPreview(value: unknown, depth: number = 0): unknown {
  if (depth > 5) return "[嵌套过深，已省略]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 197)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => redactJsonBodyForPreview(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_HEADER_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactJsonBodyForPreview(v, depth + 1);
      }
    }
    return out;
  }
  return "[unknown]";
}

function buildWebHttpPostPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const url = typeof args.url === "string" ? args.url : "";
  const headers = args.headers && typeof args.headers === "object" ? args.headers as Record<string, string> : undefined;
  const jsonBody = args.jsonBody !== undefined ? args.jsonBody : undefined;
  const textBody = typeof args.textBody === "string" ? args.textBody : undefined;
  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;
  const responseMode = typeof args.responseMode === "string" ? args.responseMode : "json";
  const maxChars = typeof args.maxChars === "number" ? args.maxChars : undefined;

  const safeHeaders = redactHeadersForPreview(headers);
  const bodyType = jsonBody !== undefined ? "jsonBody" : (textBody !== undefined ? "textBody" : "无");
  let bodyPreview = "";
  let bodyCharCount = 0;

  if (jsonBody !== undefined) {
    const redacted = redactJsonBodyForPreview(jsonBody);
    const raw = JSON.stringify(redacted, null, 2);
    bodyPreview = raw.length > 500 ? `${raw.slice(0, 497)}...` : raw;
    bodyCharCount = raw.length;
  } else if (textBody !== undefined) {
    bodyPreview = textBody.length > 500 ? `${textBody.slice(0, 497)}...` : textBody;
    bodyCharCount = textBody.length;
  }

  let urlDisplay = url;
  try {
    const parsed = new URL(url);
    urlDisplay = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    if (parsed.search) urlDisplay += parsed.search;
  } catch { /* use raw url */ }

  const sections: Array<{ label: string; value: string }> = [
    { label: "请求方法", value: "POST" },
    { label: "URL", value: urlDisplay },
  ];

  if (Object.keys(safeHeaders).length > 0) {
    sections.push({ label: "Headers（脱敏）", value: JSON.stringify(safeHeaders, null, 2) });
  }

  sections.push({ label: "Body 类型", value: bodyType });
  sections.push({ label: "Body 字符数", value: String(bodyCharCount) });
  if (bodyPreview) {
    sections.push({ label: "Body 预览（脱敏）", value: bodyPreview });
  }

  if (timeoutMs) sections.push({ label: "超时", value: `${timeoutMs}ms` });
  sections.push({ label: "响应模式", value: responseMode });
  if (maxChars) sections.push({ label: "响应截断", value: `${maxChars} 字符` });
  sections.push({
    label: "风险说明",
    value: "POST 请求会向外部服务器发送数据，可能产生副作用。请确认 URL、headers 和 body 正确无误。",
  });

  const argsPreview: Record<string, unknown> = {
    url: urlDisplay,
    bodyType,
    bodyCharCount,
    responseMode,
  };

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "medium",
    argsPreview,
    summary: `HTTP POST → ${urlDisplay}（${bodyType}，${bodyCharCount} 字符）`,
    sections,
  };
}

export function buildToolPermissionPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  if (tool.name === "web_http_post") {
    return buildWebHttpPostPreview(tool, args);
  }
  if (tool.name === "run_notebrain_command") {
    return buildRunNotebrainCommandPreview(tool, args);
  }
  if (tool.name === "skill_install") {
    return buildSkillInstallPreview(tool, args);
  }
  if (tool.name === "skill_uninstall" || tool.name === "skill_reindex") {
    return buildSkillMaintenancePreview(tool, args);
  }
  if (tool.name === "write_notebrain_file" || tool.name === "delete_notebrain_path") {
    return buildNotebrainFileWritePreview(tool, args);
  }
  if (tool.name === "mcp_save_server" || tool.name === "mcp_sync_tools") {
    return buildMcpManagementPreview(tool, args);
  }
  if (tool.name.startsWith("mcp__")) {
    return buildMcpToolPreview(tool, args);
  }

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

  if (tool.name in SIYUAN_ACTION_PREVIEW_TITLES) {
    return buildSiyuanActionPreview(tool, args);
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
