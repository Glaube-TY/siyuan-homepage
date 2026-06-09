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

function hasTool(ctx: PlannerContext, name: string): boolean {
  return ctx.toolManifest.some((t) => t.name === name);
}

function renderGlobalWebAccessInstructions(ctx: PlannerContext): string[] {
  const webSearchAccess = ctx.conversationContext?.currentTurn?.webAccess;
  const hasWebSearch = hasTool(ctx, "web_search");
  const hasWebReadPage = hasTool(ctx, "web_read_page");
  if (!hasWebSearch && !hasWebReadPage) {
    return [];
  }

  const lines: string[] = [];

  // Only web_read_page available (web_search not registered, e.g. off mode or enabled=false)
  if (!webSearchAccess && hasWebReadPage) {
    lines.push("# 网页读取说明");
    lines.push("可以读取用户明确提供、历史 grounded reference 中真实出现的、或本轮 observation 中真实出现的 http/https URL 的网页正文。");
    lines.push("不能搜索网络，不能猜 URL，不能把网站名/标题/书名当 URL。");
    lines.push("不能自动跟随链接、递归抓取或整站抓取。");
    lines.push("只有 web_read_page 实际读取过的网页正文，才能作为 web_page 类型来源写入 references。");
    lines.push("读过但最终没用的网页不要列入 references。");
    lines.push("读取失败时如实说明失败原因。");
    return lines;
  }

  // smart / required modes (webSearchAccess exists)
  if (webSearchAccess) {
    const hasLocalDiscovery = hasTool(ctx, "list_knowledge_map") || hasTool(ctx, "search_scope");
    const hasLocalRead = hasTool(ctx, "read_docs");

    lines.push(hasWebSearch ? "# 联网搜索说明" : "# 网页读取说明");
    if (webSearchAccess.mode === "smart") {
      if (hasLocalDiscovery) {
        lines.push("本轮允许联网；用户显式提供资料和可用本地资料优先。");
      } else if (hasLocalRead) {
        lines.push("本轮允许联网；用户显式提供资料优先；已有明确 docId/blockId/cursor 时可读取本地正文。");
      } else {
        lines.push("本轮允许联网；用户显式提供资料优先。");
      }
      if (hasWebSearch) {
        lines.push("联网搜索用于补充当前公开信息、外部资料、用户明确要求联网。");
      }
      if (hasWebReadPage) {
        lines.push("可以读取用户明确提供、历史 grounded reference 或本轮 observation 中真实出现的 http/https URL 的网页正文；不能猜 URL，不能自动跟随链接。");
      }
      lines.push("是否调用由你自主判断，代码不会按关键词或 URL 自动触发。");
    } else if (webSearchAccess.mode === "required") {
      const availableWebTools = [
        hasWebSearch ? "web_search" : "",
        hasWebReadPage ? "web_read_page" : "",
      ].filter(Boolean);
      lines.push(`本轮要求使用联网能力；最终回答前至少调用一次 ${availableWebTools.join(" 或 ")}。`);
    }

    if (hasWebSearch) {
      lines.push("web_search 返回的是候选链接和摘要，不是正文证据。");
    }
    if (hasWebReadPage) {
      lines.push("只有 web_read_page 实际读取过的网页正文，才能作为 web_page 类型来源写入 references。");
    }
    lines.push("读过但最终没用的网页不要列入 references；不编造 URL、网页标题或网页正文；不自动跟随链接、不递归抓取、不整站抓取。");
    lines.push("联网失败时如实说明失败原因；如果本地和联网都没有可靠来源，要明确说没有可靠来源。");
    return lines;
  }

  return [];
}

/* ------------------------------------------------------------------ */
/*  Main prompt renderer                                              */
/* ------------------------------------------------------------------ */

export function renderPlannerPrompt(ctx: PlannerContext): string {
  const blocks: string[] = [];

  // Identity
  blocks.push("你是运行在思源笔记中的 AI 助手，帮助用户处理知识管理和资料阅读任务。");
  blocks.push("");

  // Global memory
  if (ctx.globalMemory && ctx.globalMemory.length > 0) {
    blocks.push("# 全局记忆");
    blocks.push("以下内容来自用户可编辑的长期记忆文档，代表用户的长期偏好、稳定约束和常用设置。");
    blocks.push("可用于回答风格、长期偏好、稳定约束。不能替代当前问题和正文证据。不能把记忆当来源引用。与当前明确指令冲突时，以当前指令为准。不要把临时任务、网页正文、工具结果、阶段摘要、未经确认事实写入长期记忆。全局记忆按条目顺序提供，顺序靠前的内容在整理偏好时更优先参考。如需更新长期记忆，可使用“编辑全局记忆”工具对条目进行新增、更新、删除或移动；遇到冲突时应优先整理为一致内容，而不是重复追加冲突条目。");
    blocks.push(ctx.globalMemory);
    if (ctx.globalMemory.length >= 7900) {
      blocks.push("（记忆内容可能已截断）");
    }
    blocks.push("");
  }

  // User request
  blocks.push("# 用户请求");
  blocks.push(ctx.question);
  blocks.push("");

  // Attached docs — user-explicitly selected docs, hydrated before loop starts.
  const attachedDocObs = ctx.observations.filter((o) => {
    const content = o.content as Record<string, unknown> | undefined;
    return content?.source === "attached_doc_hydration";
  });
  if (attachedDocObs.length > 0) {
    blocks.push("# 用户本轮已附加文档");
    const hasReadDocs = hasTool(ctx, "read_docs");
    if (hasReadDocs) {
      blocks.push("以下文档由用户通过输入框显式选定，已自动加载正文，作为本轮输入资料直接提供。你可以直接基于这些资料回答；如需更精确的 block 或更多片段，在已有明确 docId/blockId 时可调用 read_docs 读取正文。");
    } else {
      blocks.push("以下文档由用户通过输入框显式选定，已自动加载正文，作为本轮输入资料直接提供。你可以直接基于这些资料回答。");
    }
    blocks.push("");

    const ATTACHED_DOC_BUDGET = 20000;
    let usedChars = 0;
    let truncated = false;

    for (const obs of attachedDocObs) {
      const content = obs.content as Record<string, unknown> | undefined;
      const items = content?.items as Array<Record<string, unknown>> | undefined;
      const error = content?.error as Record<string, unknown> | undefined;

      if (error) {
        const docId = typeof error.docId === "string" ? error.docId : "";
        const message = typeof error.message === "string" ? error.message : "加载失败";
        blocks.push(`- [加载失败] docId=${docId}: ${message}`);
        continue;
      }

      if (!items) continue;
      for (const item of items) {
        const title = typeof item.title === "string" ? item.title : "";
        const docId = typeof item.docId === "string" ? item.docId : "";
        const text = typeof item.content === "string" ? item.content : "";
        const contentChars = typeof item.contentChars === "number" ? item.contentChars : 0;
        const isTruncated = !!item.truncated;
        const chunkIndex = typeof item.chunkIndex === "number" ? item.chunkIndex : undefined;
        const chunkCount = typeof item.chunkCount === "number" ? item.chunkCount : undefined;

        let header = `## 文档: ${title} [docId=${docId}]`;
        if (chunkIndex !== undefined && chunkCount !== undefined) {
          header += ` 第 ${chunkIndex}/${chunkCount} 块`;
        }
        const note = `（全文约 ${contentChars} 字${isTruncated ? "，已截断" : ""}）`;
        const entry = `${header}\n${note}\n${text}\n`;

        if (usedChars + entry.length > ATTACHED_DOC_BUDGET) {
          truncated = true;
          break;
        }
        blocks.push(entry);
        usedChars += entry.length;
      }
      if (truncated) break;
    }

    if (truncated) {
      blocks.push("（附加文档正文已截断，剩余内容未展示）");
    }
    blocks.push("");
  }

  // Conversation context — session history, separate from tool observations.
  // 若 globalMemory 已在独立区块展示，从 conversationContext JSON 中剔除以避免重复。
  blocks.push("# 对话上下文（JSON）");
  if (!ctx.conversationContext) {
    blocks.push("（暂无历史上下文）");
  } else {
    const conversationContextForPrompt = ctx.globalMemory
      ? { ...ctx.conversationContext, globalMemory: undefined }
      : ctx.conversationContext;
    blocks.push(stringifyForPrompt(conversationContextForPrompt));
  }
  blocks.push("");
  blocks.push("conversationContext.currentTurn.runtimeNow 表示插件运行时的当前本地时间，可用于理解相对时间和当前时间。runtimeNow 不是工具 observation，也不是历史消息；它只代表本轮上下文构建时的运行时刻。");
  blocks.push("");

  // Output protocol
  blocks.push("# 输出格式");
  blocks.push("每步只能输出一个纯 JSON object，禁止 Markdown、代码块、解释文字、前后缀。");
  blocks.push("");
  blocks.push("## 控制面 JSON 契约（合法 shape 约束）");
  blocks.push('- tool 只能是：{"type":"tool","toolName":"...","args":{...}}');
  blocks.push('- answer 只能是：{"type":"answer","args":{"body":"短草稿","references":[]}}');
  blocks.push('- stop 只能是：{"type":"stop","reasonCode":"...","message":"..."}');
  blocks.push("- body、references、stageSummary 不允许出现在顶层，只能在 answer.args 内。");
  blocks.push("- 不要输出未列入上述契约的 type 或 toolName。");
  blocks.push("- answer.body 是短草稿/回答意图/要点，建议 1-3 句，保持短文本，不超过 2000 字符，不写 Markdown 长文，不写多级列表。");
  blocks.push("");
  blocks.push('工具调用示例：{"type":"tool","toolName":"工具名","args":{...}}');
  blocks.push('普通最终回答示例：{"type":"answer","args":{"body":"短草稿","references":[]}}');
  blocks.push('需要阶段摘要时示例：{"type":"answer","args":{"body":"短草稿","references":[],"stageSummary":{"summary":"阶段摘要正文"}}}');
  blocks.push('停止示例：{"type":"stop","reasonCode":"cannot_continue","message":"..."}');
  blocks.push("");
  blocks.push('当回答基于真实资源 ID（docId、blockId、url、fileId、resourceId）时，应在 references 中列出对应来源。');
  blocks.push("references 是\"最终回答实际使用的直接证据来源清单\"；读过但没用的资料不要列；搜索结果只是候选线索，不可引用；没有直接来源时使用 []。");
  blocks.push('stageSummary 是可选的历史阶段摘要。默认不要写。只有当上一个阶段摘要之后的对话已经积累了对后续继续对话有帮助的信息时，才在最终回答中输出 stageSummary。摘要应忠实概括这段历史对话的关键信息，不预设固定格式，不编造，不重复已有阶段摘要。简单寒暄、确认、过渡回复、无新增信息时不要输出。');
  blocks.push('上下文压力提示：conversationContext.stageSummaryStatus.pressureLevel 表示上下文预算压力（none/suggested/recommended/urgent/required），pressureReason 说明原因。这只是预算压力提示，你仍自主判断是否输出 stageSummary；但 pressureLevel 为 required 时，除非最近内容完全无实质信息，否则应在 answer.args 中输出 stageSummary。');
  blocks.push('stageSummary.summary 建议 300-1000 字，简短阶段可 150-300 字，最多 1500 字。只总结上一个阶段摘要之后的新对话，并覆盖到当前最终回答为止；不要重述已有阶段摘要。');
  blocks.push('stageSummary 不得记录工具原始输出、工具调用事件、工具结果、工作界面事件、调试信息、完整提示词、内部路径、内部映射、工具返回正文、未经 grounding 的参考资料或代码内部隐藏映射。');
  blocks.push('思源文档来源优先显式写 sourceType:"siyuan_doc"，并填写真实 docId；blockId 和 title 可选。sourceType 缺省不推荐。');
  blocks.push("references 只能引用以下两类资源：");
  blocks.push("  1. 本轮工具 observation 中真实出现过的资源 ID；");
  blocks.push("  2. 对话上下文 history references 中明确标记 grounded:true 的资源。");
  blocks.push("未真实出现或未标记 grounded:true 的 ID 会被系统丢弃，不会出现在最终回答的来源列表中。");
  blocks.push("历史 references 只有 grounded:true 才可信；structure/search candidate 只是线索，不是正文证据。");
  // Local / web priority — conditional based on actual registered tools
  const hasWebSearch = hasTool(ctx, "web_search");
  const hasWebReadPage = hasTool(ctx, "web_read_page");
  const hasLocalDiscoveryTools = hasTool(ctx, "list_knowledge_map") || hasTool(ctx, "search_scope");
  const hasLocalReadTool = hasTool(ctx, "read_docs");

  blocks.push("正文证据只能来自读取工具的返回；具体工具能力以‘可用工具’列表为准。");
  blocks.push("用户显式提供的资料始终优先。");
  if (hasLocalDiscoveryTools) {
    blocks.push("可用本地知识库进行定位/检索。");
  }
  if (hasLocalReadTool) {
    blocks.push("已有明确 docId/blockId/cursor 时可读取本地正文。");
  }
  if (hasWebSearch) {
    blocks.push("联网搜索是补充资料来源。");
  }
  if (hasWebReadPage && !hasWebSearch) {
    blocks.push("可读取用户明确提供、历史 grounded reference 或本轮 observation 中真实出现的 http/https URL 的网页正文。");
  }
  blocks.push("搜索结果是候选线索，不是正文证据；没有正文证据时，应说明资料不足或缺少可靠来源，不要基于候选线索写确定性结论。");
  blocks.push("");
  blocks.push("参考资料显示规则：");
  blocks.push("- 底部“参考资料”只显示你在最终 answer.references 中显式列出的资源。");
  blocks.push("- 系统不会自动把 structure_result、search_candidate 或 read_content 追加为参考资料。");
  blocks.push("- 如果你没写 references，底部参考资料为空。");
  blocks.push("- 只查看文档树或搜索候选时，除非回答明确引用了某个文档，否则不要写 references。");
  blocks.push("- 读过文档但回答没有实际使用它，也不要写 references。");
  blocks.push("");

  // Global web access instructions (not a Skill — rendered by prompt-renderer based on mode + manifest)
  const webInstr = renderGlobalWebAccessInstructions(ctx);
  if (webInstr.length > 0) {
    blocks.push(...webInstr);
    blocks.push("");
  }

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
