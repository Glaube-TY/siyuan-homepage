import type { SelectionAiContext, SelectionAiRequest, SelectionAiSkill, SelectionAiToolbarSettings } from "./selection-ai-types";

/**
 * 以选中文字位置为中心，截取文档上下文。
 * 使用字符数组处理，避免中文/emoji 被粗暴截断。
 */
function truncateDocumentContext(
  documentText: string,
  selectionStart: number | undefined,
  maxChars: number
): string {
  if (!documentText || maxChars <= 0) return "";

  const chars = Array.from(documentText);
  if (chars.length <= maxChars) return documentText;

  const half = Math.floor(maxChars / 2);
  const safeStart = selectionStart !== undefined
    ? Math.max(0, Math.min(selectionStart, chars.length))
    : 0;
  const start = Math.max(0, safeStart - half);
  const end = Math.min(chars.length, start + maxChars);
  const actualStart = Math.max(0, end - maxChars);

  const prefix = actualStart > 0 ? "..." : "";
  const suffix = end < chars.length ? "..." : "";
  return prefix + chars.slice(actualStart, end).join("") + suffix;
}

/**
 * 构建内部文档信息块。
 * 由系统自动附带，不依赖用户模板变量。
 */
function buildInternalDocumentContextBlock(
  skill: SelectionAiSkill,
  context: SelectionAiContext
): string {
  if (!skill.includeDocumentContext) return "";

  let documentContext = "";
  if (context.documentText) {
    documentContext = truncateDocumentContext(
      context.documentText,
      context.selectionStartInDocument,
      skill.documentContextMaxChars
    );
  }

  const hasTitle = Boolean(context.docTitle);
  const hasContext = Boolean(documentContext);
  if (!hasTitle && !hasContext) return "";

  let block = "当前文档信息：";
  if (hasTitle) {
    block += "\n文档标题：" + context.docTitle;
  }
  if (hasContext) {
    block += "\n\n当前文档上下文（可能为按选区位置截取的片段）：\n" + documentContext;
  }
  return block;
}

/**
 * 只渲染用户模板。
 * 替换 {{选择文字}}，清理旧变量残留，自动追加选中文字。
 */
function renderUserTemplateOnly(
  skill: SelectionAiSkill,
  context: SelectionAiContext
): string {
  const template = skill.promptTemplate;

  let result = template;
  result = result.split("{{选择文字}}").join(context.selectedText);

  // 清理旧配置中残留的不再支持的变量
  result = result.split("{{文档标题}}").join("");
  result = result.split("{{文档上下文}}").join("");

  // 如果模板没有 {{选择文字}}，自动追加
  if (!template.includes("{{选择文字}}")) {
    result += "\n\n选中文字：\n" + context.selectedText;
  }

  return result;
}

/**
 * 公共模板渲染函数（普通弹窗技能）。
 * 用户模板 + 文档上下文追加在末尾。
 */
export function renderSelectionAiSkillTemplate(
  skill: SelectionAiSkill,
  context: SelectionAiContext
): string {
  const body = renderUserTemplateOnly(skill, context);
  const contextBlock = buildInternalDocumentContextBlock(skill, context);
  return contextBlock ? `${body}\n\n${contextBlock}` : body;
}

function findSkillForRequest(
  request: SelectionAiRequest,
  settings: SelectionAiToolbarSettings
): SelectionAiSkill | undefined {
  // 优先按 skillId 查找
  if (request.skillId) {
    const byId = settings.skills.find((s) => s.id === request.skillId);
    if (byId) return byId;
  }
  // 按 builtInAction 查找
  return settings.skills.find((s) => s.builtInAction === request.action && s.enabled)
    ?? settings.skills.find((s) => s.builtInAction === request.action);
}

export function buildSelectionAiPrompt(
  request: SelectionAiRequest,
  settings: SelectionAiToolbarSettings
): string {
  const skill = findSkillForRequest(request, settings);
  const actionLabel = skill?.name ?? request.action;
  const maxOutputChars = skill?.maxOutputChars ?? 3000;

  const truncationLine = request.context.truncated
    ? "注意：用户选中的文字较长，以下内容已按设置截断，只能基于截断后的内容处理。"
    : "";

  const skillBody = skill
    ? renderSelectionAiSkillTemplate(skill, request.context)
    : `请处理下面选中的文字。\n\n选中文字：\n${request.context.selectedText}`;

  return `你是一个编辑器选区 AI 工具，主要处理用户当前选中的文字。

任务：${actionLabel}

硬性规则：
- 主要基于"选中文字"作答，可参考给定的文档上下文，但不要声称读取了知识库或调用了工具；
- 不要进入多轮对话，不要请求用户补充；
- 不要输出与任务无关的开场白；
- 输出长度不超过 ${maxOutputChars} 个字符；

${truncationLine}

${skillBody}`;
}

export function buildSelectionAskDraft(
  context: SelectionAiContext,
  skill?: SelectionAiSkill
): string {
  if (skill) {
    // ask 草稿：文档上下文放在前面，用户模板（含"我的问题是："）留在最后
    const body = renderUserTemplateOnly(skill, context);
    const contextBlock = buildInternalDocumentContextBlock(skill, context);
    return contextBlock ? `${contextBlock}\n\n${body}` : body;
  }

  // fallback 到旧逻辑
  const quoted = context.selectedText
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  const truncationHint = context.truncated ? "（选中文字较长，以下内容已截断）" : "";
  return `请基于文档中的下列内容回答问题${truncationHint}：\n${quoted}\n\n我的问题是：`;
}
