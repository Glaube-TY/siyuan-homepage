/**
 * PromptRenderer — renders planner context to a clean prompt string.
 *
 * This is a fully generic renderer. It does NOT know about specific tools.
 * Tool observations are rendered as JSON envelopes for the Planner.
 * Like an API response: success → JSON data, failure → JSON error.
 *
 * The renderer does NOT reorganize, filter, or reinterpret tool content.
 * It wraps the observation in a standard envelope and JSON.stringify's it.
 */

import type { PlannerContext } from "./planner-context-builder";
import type { SkillObservation } from "../contracts/skill-contract";

/* ------------------------------------------------------------------ */
/*  JSON observation envelope for Planner                             */
/* ------------------------------------------------------------------ */

/**
 * Emergency safety limit — only triggers if a tool produces abnormally
 * large output. This is an extreme guard, not a normal truncation.
 * Normal output size is controlled by each tool's own limit/maxChars.
 */
const EMERGENCY_SAFETY_LIMIT = 200000;

/**
 * Build a JSON envelope from a SkillObservation for the Planner prompt.
 * Success: { ok: true, toolName, data: <content> }
 * Failure: { ok: false, toolName, error: { code, message, ... } }
 *
 * For failures, if content.error exists (structured), use it directly.
 * For success, always include the `data` field — even for falsy values.
 */
function buildObservationEnvelope(o: SkillObservation): Record<string, unknown> {
  const isSuccess = o.kind !== "tool_failed";

  if (isSuccess) {
    const envelope: Record<string, unknown> = {
      ok: true,
      toolName: o.toolName ?? "unknown",
    };
    if ("content" in o) {
      envelope.data = o.content;
    }
    return envelope;
  }

  // Error envelope — prefer structured content.error if available
  const contentObj = o.content as Record<string, unknown> | undefined;
  const contentError = contentObj?.error;
  if (contentError != null && typeof contentError === "object") {
    return {
      ok: false,
      toolName: o.toolName ?? "unknown",
      error: contentError,
    };
  }

  // Fallback: build error envelope from flat fields
  return {
    ok: false,
    toolName: o.toolName ?? "unknown",
    error: {
      code: o.reasonCode ?? "unknown_error",
      message: o.summary ?? "未知错误",
    },
  };
}

/**
 * Build a JSON envelope for system observations (no toolName).
 * These are typically planner_returned_no_action events.
 */
function buildSystemEnvelope(o: SkillObservation): Record<string, unknown> {
  return {
    ok: false,
    kind: o.kind,
    error: {
      code: o.reasonCode ?? "system_event",
      message: o.summary ?? "系统事件",
    },
  };
}

/**
 * Stringify for prompt with emergency head+tail truncation.
 * If output exceeds EMERGENCY_SAFETY_LIMIT, keeps the first 60% and last 40%,
 * inserting an explicit truncation marker.
 */
function stringifyForPrompt(obj: unknown): string {
  const text = JSON.stringify(obj, null, 2);
  if (text.length <= EMERGENCY_SAFETY_LIMIT) return text;

  const headChars = Math.floor(EMERGENCY_SAFETY_LIMIT * 0.6);
  const tailChars = Math.floor(EMERGENCY_SAFETY_LIMIT * 0.4);
  const head = text.slice(0, headChars);
  const tail = text.slice(-tailChars);
  const marker = `\n... [safety truncation: output exceeded ${EMERGENCY_SAFETY_LIMIT} chars; middle omitted — emergency guard only]\n`;
  return head + marker + tail;
}

/* ------------------------------------------------------------------ */
/*  Main prompt renderer                                              */
/* ------------------------------------------------------------------ */

export function renderPlannerPrompt(ctx: PlannerContext): string {
  const blocks: string[] = [];

  // Identity
  blocks.push("你是运行在思源笔记中的 AI 助手，帮助用户处理知识管理和资料阅读任务。");
  blocks.push("");

  // User request
  blocks.push("# 用户请求");
  blocks.push(ctx.question);
  blocks.push("");

  // Conversation context — session history, separate from tool observations.
  blocks.push("# 对话上下文（JSON）");
  if (!ctx.conversationContext) {
    blocks.push("（暂无历史上下文）");
  } else {
    blocks.push(stringifyForPrompt(ctx.conversationContext));
  }
  blocks.push("");

  // Output protocol
  blocks.push("# 输出格式");
  blocks.push("每步只能输出一个纯 JSON object，禁止 Markdown、代码块、解释文字、前后缀。");
  blocks.push('工具调用：{"type":"tool","toolName":"工具名","args":{...}}');
  blocks.push('普通最终回答：{"type":"answer","args":{"body":"回答正文","references":[]}}');
  blocks.push('需要阶段摘要时：{"type":"answer","args":{"body":"回答正文","references":[],"stageSummary":{"summary":"阶段摘要正文"}}}');
  blocks.push('当回答基于真实资源 ID（docId、blockId、url、fileId、resourceId）时，应在 references 中列出对应来源。');
  blocks.push('stageSummary 是可选的历史阶段摘要。默认不要写。只有当上一个阶段摘要之后的对话已经积累了对后续继续对话有帮助的信息时，才在最终回答中输出 stageSummary。摘要应忠实概括这段历史对话的关键信息，不预设固定格式，不编造，不重复已有阶段摘要。');
  blocks.push('适合输出 stageSummary 的情况：连续多轮对话后形成了值得后续保留的关键信息或结论；当前回答包含对后续对话有参考价值的判断、规则或方案；用户明确要求保存阶段摘要；或不总结会导致后续压缩丢失重要上下文。简单寒暄、确认、过渡回复、无新增信息时不要输出。');
  blocks.push('上下文压力提示：conversationContext.stageSummaryStatus.pressureLevel 表示上下文预算压力（none/suggested/recommended/urgent/required），pressureReason 说明原因。这只是预算压力提示，你仍自主判断是否输出 stageSummary；但 pressureLevel 为 required 时，除非最近内容完全无实质信息，否则应在 final_answer 中输出 stageSummary。');
  blocks.push('stageSummary.summary 建议 300-1000 字，简短阶段可 150-300 字，最多 1500 字。只总结上一个阶段摘要之后的新对话，并覆盖到当前最终回答为止；不要重述已有阶段摘要。');
  blocks.push('stageSummary 不得记录工具 observation 原文、ToolDispatch、ToolResult、workbenchEvents、debug trace、full prompt、internal path、realPath、工具返回正文、未经 grounding 的参考资料或代码内部隐藏映射。');
  blocks.push('思源文档来源优先显式写 sourceType:"siyuan_doc"，并填写真实 docId；blockId 和 title 可选。sourceType 缺省不推荐。');
  blocks.push("references 只能引用以下两类资源：");
  blocks.push("  1. 本轮工具 observation 中真实出现过的资源 ID；");
  blocks.push("  2. 对话上下文 history references 中明确标记 grounded:true 的资源。");
  blocks.push("未真实出现或未标记 grounded:true 的 ID 会被系统丢弃，不会出现在最终回答的来源列表中。");
  blocks.push("历史 references 只有 grounded:true 才可信；structure/search candidate 只是线索，不是正文证据。");
  blocks.push("如果要总结正文，应先调用可读取正文的工具；具体工具能力以‘可用工具’列表为准。");
  blocks.push("");
  blocks.push("参考资料显示规则：");
  blocks.push("- 底部“参考资料”只显示你在最终 answer.references 中显式列出的资源。");
  blocks.push("- 系统不会自动把 structure_result、search_candidate 或 read_content 追加为参考资料。");
  blocks.push("- 如果你没写 references，底部参考资料为空。");
  blocks.push("- 只查看文档树或搜索候选时，除非回答明确引用了某个文档，否则不要写 references。");
  blocks.push("- 读过文档但回答没有实际使用它，也不要写 references。");
  blocks.push('停止：{"type":"stop","reasonCode":"cannot_continue","message":"..."}');
  blocks.push("");

  // Skill sections
  if (ctx.skillSections.length > 0) {
    blocks.push("# 可参考能力说明");
    for (const section of ctx.skillSections) {
      blocks.push(`## ${section.title}`);
      blocks.push(section.body);
      blocks.push("");
    }
  }

  // Tool manifest
  blocks.push("# 可用工具");
  if (ctx.toolManifest.length === 0) {
    blocks.push("（当前无可用工具）");
  } else {
    for (const tool of ctx.toolManifest) {
      const avail = tool.availability.available ? "可用" : `不可用（${tool.availability.reasonCode ?? "未知"}）`;
      const safety = tool.safety?.readOnly ? "只读" : "可写入";
      blocks.push(`- ${tool.name}：${tool.title}`);
      blocks.push(`  用途：${tool.description}`);
      if (tool.inputJsonSchema) {
        const schemaText = JSON.stringify(tool.inputJsonSchema, null, 2);
        blocks.push(`  参数 JSON Schema：`);
        // Indent each line of the schema for readability
        for (const line of schemaText.split("\n")) {
          blocks.push(`    ${line}`);
        }
      } else if (tool.inputHint) {
        blocks.push(`  参数：${tool.inputHint}`);
      } else {
        blocks.push(`  参数：{}`);
      }
      if (tool.boundary) {
        blocks.push(`  边界：${tool.boundary}`);
      }
      blocks.push(`  安全性：${safety}；状态：${avail}`);
    }
  }
  blocks.push("");

  // Observations — ALL entries, not just the last 10
  blocks.push("# 已获得的信息");
  if (ctx.observations.length === 0) {
    blocks.push("（暂无）");
  } else {
    for (const o of ctx.observations) {
      if (o.toolName) {
        const envelope = buildObservationEnvelope(o);
        blocks.push(`- 工具 ${o.toolName}：`);
        blocks.push(stringifyForPrompt(envelope));
      } else {
        const envelope = buildSystemEnvelope(o);
        blocks.push(`- 系统：`);
        blocks.push(stringifyForPrompt(envelope));
      }
    }
  }

  return blocks.join("\n");
}
