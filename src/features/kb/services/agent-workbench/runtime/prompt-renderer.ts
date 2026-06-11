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
 * Render the references protocol instructions for the Planner prompt.
 * This is a global answer protocol — not domain-specific.
 */
function renderReferenceProtocolInstructions(): string[] {
  return [
    'references 是最终回答实际使用的直接来源 JSON 数组。只能引用本轮 observation 中真实出现的资源 ID，或对话上下文 history references 中 grounded:true 的资源。来源类型应填写工具返回的真实来源类型和 ID。搜索结果只是候选线索，不可引用。未真实出现或未 grounded 的 ID 会被系统丢弃。读过但没有实际使用的来源不要列入 references。没有直接来源时使用 []。不要在正文末尾手写参考文献列表。',
  ];
}

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
 */
function buildSystemEnvelope(o: SkillObservation): Record<string, unknown> {
  const envelope: Record<string, unknown> = {
    ok: false,
    kind: o.kind,
    error: {
      code: o.reasonCode ?? "system_event",
      message: o.summary ?? "系统事件",
    },
  };
  if (o.content !== undefined && o.content !== null) {
    envelope.data = o.content;
  }
  return envelope;
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
    lines.push("可读取用户明确提供或本轮 observation 中真实出现的 http/https URL 的网页正文。不搜索网络，不猜 URL，不自动跟随链接。");
    return lines;
  }

  // smart / required modes (webSearchAccess exists)
  if (webSearchAccess) {
    lines.push(hasWebSearch ? "# 联网搜索说明" : "# 网页读取说明");
    if (webSearchAccess.mode === "smart") {
      lines.push("本轮允许联网；用户显式提供资料优先，联网搜索为补充。是否调用由你自主判断。");
    } else if (webSearchAccess.mode === "required") {
      lines.push("本轮要求使用联网能力；最终回答前必须实际使用已注册的联网工具。");
    }

    if (hasWebSearch) {
      lines.push("web_search 返回的是候选链接和摘要，不是正文证据。");
    }
    if (hasWebReadPage) {
      lines.push("只有 web_read_page 实际读取过的网页正文才能作为来源写入 references。");
    }
    lines.push("读过但最终没用的网页不列入 references；不编造 URL、不自动跟随链接。");
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
    blocks.push("以下内容来自用户可编辑的长期记忆文档，代表用户的长期偏好和稳定约束。不能替代当前问题、资料正文或工具结果；与当前明确指令冲突时以当前指令为准。如需修改长期记忆，必须通过可用的写入工具完成，不能口头声称已修改。");
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
    blocks.push("以下文档由用户通过输入框显式选定，已自动加载正文作为本轮输入资料供你直接使用。");
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
  blocks.push('- answer 只能是：{"type":"answer","args":{"body":"最终回答正文","references":[]}}');
  blocks.push('- stop 只能是：{"type":"stop","reasonCode":"...","message":"..."}');
  blocks.push("- body、references、stageSummary 不允许出现在顶层，只能在 answer.args 内。");
  blocks.push("- 不要输出未列入上述契约的 type 或 toolName。");
  blocks.push("- answer.body 是最终用户可见回答正文。内容风格、结构、长短、是否使用 Markdown、列表或表格，由你根据用户请求和已获得信息自主决定。");
  blocks.push("");
  blocks.push('工具调用示例：{"type":"tool","toolName":"工具名","args":{...}}');
  blocks.push('answer 示例：{"type":"answer","args":{"body":"最终回答正文","references":[]}}');
  blocks.push('需要阶段摘要时示例：{"type":"answer","args":{"body":"最终回答正文","references":[],"stageSummary":{"summary":"阶段摘要正文"}}}');
  blocks.push('停止示例：{"type":"stop","reasonCode":"cannot_continue","message":"..."}');
  blocks.push("如果缺少某个写工具必需参数，不能编造；应使用 answer JSON 简短说明还缺什么信息，等用户补充后再调用。");
  blocks.push("");
  blocks.push(...renderReferenceProtocolInstructions());
  blocks.push('stageSummary 可选，只在上一个阶段摘要之后积累了有价值信息时才输出。summary 建议 300-1000 字，最多 1500 字。只总结上一个摘要之后的新信息并覆盖到当前回答。不得记录工具原始输出、调试信息、内部路径。pressureLevel required 时除非最近内容无实质信息，否则应输出 stageSummary。');
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

  // 通用工具结果解释规则
  blocks.push("工具结果解释规则：");
  blocks.push("- 工具返回的 observation 即为本轮实际结果；以 observation 中描述的成功、失败或用户拒绝为准。");
  blocks.push("- 涉及写入、删除、整理、修改时，必须以工具返回结果为准；不要声称未完成的操作已经完成，不要无必要地重复执行同一目标操作。");
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
