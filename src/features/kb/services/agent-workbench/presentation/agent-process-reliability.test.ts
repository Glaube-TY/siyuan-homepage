import assert from "node:assert/strict";
import test from "node:test";

import type { KbConversationSession } from "../../../types/chat";
import { NativeToolAgentLoop } from "../../agent-core/loop/native-tool-agent-loop";
import type { AgentStreamEvent } from "../../agent-core/loop/stream-event";
import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import type { ProviderAdapter } from "../../agent-core/providers/provider-adapter";
import { NativeToolRegistry } from "../../agent-core/tools/native-tool-registry";
import { createAggregateTool } from "../tools/aggregate/aggregate-tool-factory";
import { listKnowledgeMapInputSchema } from "../tools/siyuan/contracts/list-knowledge-map.contract";
import { searchScopeInputSchema } from "../tools/siyuan/contracts/search-scope.contract";
import { siyuanDocTreeInputSchema } from "../tools/siyuan/contracts/siyuan-doc-tree.contract";
import { siyuanDocPathInputSchema } from "../tools/siyuan/contracts/siyuan-doc-path.contract";
import { siyuanDocTransformInputSchema } from "../tools/siyuan/contracts/siyuan-doc-transform.contract";
import { siyuanBlockRefInputSchema } from "../tools/siyuan/contracts/siyuan-block-ref.contract";
import { createSiyuanDocTreeTool } from "../tools/siyuan/siyuan-doc-tree.tool";
import { shouldEnqueueWorkbenchCheckpoint } from "../../orchestration/workbench-persistence-checkpoint-policy";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";
import {
  hasSettledWorkbenchTerminal,
  isProviderOutputTruncatedWorkbench,
} from "../runtime/workbench-terminal-state";
import {
  fromPersistedConversation,
  toPersistedConversation,
} from "../../session/kb-chat-session-storage";

test("知识结构工具兼容 docId 并自动推断为查看直接子文档", () => {
  const parsed = listKnowledgeMapInputSchema.parse({
    docId: "20250714112517-34he0qm",
  });

  assert.equal(parsed.rootDocId, "20250714112517-34he0qm");
  assert.equal(parsed.view, "children");
  assert.equal("docId" in parsed, false);
});

test("知识结构工具保留显式视图和标准 rootDocId", () => {
  const parsed = listKnowledgeMapInputSchema.parse({
    view: "subtree",
    rootDocId: "20250714112517-34he0qm",
    maxDepth: 3,
  });

  assert.equal(parsed.rootDocId, "20250714112517-34he0qm");
  assert.equal(parsed.view, "subtree");
  assert.equal(parsed.maxDepth, 3);
});

test("知识库搜索兼容模型附带的 scope 但不允许覆盖真实聊天范围", () => {
  const parsed = searchScopeInputSchema.parse({
    query: "测试",
    scope: "whole_kb",
  });

  assert.deepEqual(parsed, { query: "测试", limit: 20 });
  assert.equal("scope" in parsed, false);
});

test("文档树兼容只传 notebookId 并安全推断为只读整树查看", () => {
  const parsed = siyuanDocTreeInputSchema.parse({
    notebookId: "20250525102034-7cld5se",
  });

  assert.deepEqual(parsed, {
    action: "list_tree",
    notebook: "20250525102034-7cld5se",
  });
  assert.equal("notebookId" in parsed, false);
});

test("文档树兼容参数在权限预判时仍按只读处理", () => {
  const tool = createSiyuanDocTreeTool({
    async executeSiyuanDocTree() {
      return { output: { action: "list_tree", data: [] } };
    },
  });

  assert.deepEqual(tool.resolveCallSafety?.({ notebookId: "20250525102034-7cld5se" }), {
    readOnly: true,
    riskLevel: "low",
  });
});

test("聚合文档树可执行本次真实出现的 notebookId 简写参数", async () => {
  let received: unknown;
  const docTree = createSiyuanDocTreeTool({
    async executeSiyuanDocTree(args) {
      received = args;
      return { output: { action: args.action, data: [] } };
    },
  });
  const aggregate = createAggregateTool({
    name: "siyuan_tree",
    title: "思源树与笔记本",
    description: "测试",
    boundary: "测试",
    actions: [{ action: "doc_tree", tool: docTree }],
  });

  const result = await aggregate.execute({} as never, {
    action: "doc_tree",
    args: { notebookId: "20250525102034-7cld5se" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(received, {
    action: "list_tree",
    notebook: "20250525102034-7cld5se",
  });
});

test("批量路径转人类可读路径不强制要求底层 API 未使用的 notebook", () => {
  const parsed = siyuanDocPathInputSchema.parse({
    action: "hpaths_by_paths",
    paths: ["/20260802230000-abcdefg.sy"],
  });

  assert.deepEqual(parsed, {
    action: "hpaths_by_paths",
    paths: ["/20260802230000-abcdefg.sy"],
  });
});

test("复制文档只要求源文档 ID，排序只接受真实 API 使用的存储路径", () => {
  assert.deepEqual(siyuanDocTreeInputSchema.parse({
    action: "duplicate",
    id: "20260802230000-abcdefg",
  }), {
    action: "duplicate",
    id: "20260802230000-abcdefg",
  });

  assert.deepEqual(siyuanDocTreeInputSchema.parse({
    action: "sort",
    notebook: "20260802230000-hijklmn",
    fromPaths: ["/20260802230000-abcdefg.sy"],
  }), {
    action: "sort",
    notebook: "20260802230000-hijklmn",
    fromPaths: ["/20260802230000-abcdefg.sy"],
  });
  assert.equal(siyuanDocTreeInputSchema.safeParse({
    action: "sort",
    notebook: "20260802230000-hijklmn",
    ids: ["20260802230000-abcdefg"],
  }).success, false);
});

test("文档结构转换明确区分每一种思源 ID 并映射真实 API 必填参数", () => {
  assert.deepEqual(siyuanDocTransformInputSchema.parse({
    action: "doc_to_heading",
    sourceDocId: "20260802230000-abcdefg",
    targetBlockId: "20260802230001-hijklmn",
    after: false,
  }), {
    action: "doc_to_heading",
    sourceDocId: "20260802230000-abcdefg",
    targetBlockId: "20260802230001-hijklmn",
    after: false,
  });
  assert.deepEqual(siyuanDocTransformInputSchema.parse({
    action: "heading_to_doc",
    sourceHeadingId: "20260802230002-opqrstu",
    targetNotebookId: "20260802230003-vwxyz12",
    targetPath: "/",
  }), {
    action: "heading_to_doc",
    sourceHeadingId: "20260802230002-opqrstu",
    targetNotebookId: "20260802230003-vwxyz12",
    targetPath: "/",
  });
  assert.equal(siyuanDocTransformInputSchema.safeParse({
    action: "list_item_to_doc",
    id: "20260802230004-3456789",
    notebook: "20260802230003-vwxyz12",
  }).success, false);
});

test("块引用契约明确区分引用所在块与定义块 ID", () => {
  assert.deepEqual(siyuanBlockRefInputSchema.parse({
    action: "check_ref",
    ids: ["20260802230000-abcdefg"],
  }), {
    action: "check_ref",
    ids: ["20260802230000-abcdefg"],
  });
  assert.deepEqual(siyuanBlockRefInputSchema.parse({
    action: "swap_ref",
    refID: "20260802230000-abcdefg",
    defID: "20260802230001-hijklmn",
    includeChildren: false,
  }), {
    action: "swap_ref",
    refID: "20260802230000-abcdefg",
    defID: "20260802230001-hijklmn",
    includeChildren: false,
  });
  assert.equal(siyuanBlockRefInputSchema.safeParse({
    action: "swap_ref",
    id: "20260802230000-abcdefg",
    refText: "旧错误参数",
  }).success, false);
});

test("被停止的回答刷新后仍保留安全工具事件", () => {
  const session: KbConversationSession = {
    id: "conv-agent-process-test",
    title: "工具过程恢复测试",
    createdAt: 1,
    updatedAt: 2,
    messages: [
      { id: "user-1", role: "user", content: "查看知识结构", createdAt: 1 },
      {
        id: "assistant-1",
        role: "assistant",
        content: "本轮已停止。",
        createdAt: 2,
        isComplete: false,
        workbenchEvents: [
          {
            type: "tool_start",
            stepIndex: 1,
            at: 10,
            toolCallId: "call-1",
            toolName: "siyuan_kb",
            argsPreview: { action: "list_map", innerAction: "children" },
            readOnly: true,
            startedAt: 10,
          },
          {
            type: "tool_result",
            stepIndex: 1,
            at: 20,
            toolCallId: "call-1",
            toolName: "siyuan_kb",
            result: {
              ok: false,
              content: "",
              summary: "参数校验失败。",
              errorCode: "invalid_action_args",
            },
            durationMs: 10,
          },
        ],
      },
    ],
  };

  const restored = fromPersistedConversation(toPersistedConversation(session));
  const assistant = restored.messages.find((message) => message.role === "assistant");
  assert.ok(assistant && assistant.role === "assistant");
  assert.equal(assistant.isComplete, false);
  assert.equal(assistant.workbenchEvents?.length, 2);
  assert.equal(assistant.workbenchEvents?.[1]?.type, "tool_result");
});

test("旧会话存在成功终止事件时自动修复未完成标记", () => {
  const session: KbConversationSession = {
    id: "conv-agent-process-completed-test",
    title: "成功终态恢复测试",
    createdAt: 1,
    updatedAt: 2,
    messages: [
      { id: "user-1", role: "user", content: "查看知识结构", createdAt: 1 },
      {
        id: "assistant-1",
        role: "assistant",
        content: "已经完成知识结构分析。",
        createdAt: 2,
        isComplete: false,
        workbenchEvents: [
          {
            type: "done",
            status: "answer_ready",
            stepIndex: 2,
            at: 20,
          },
        ],
      },
    ],
  };

  const restored = fromPersistedConversation(toPersistedConversation(session));
  const assistant = restored.messages.find((message) => message.role === "assistant");
  assert.ok(assistant && assistant.role === "assistant");
  assert.equal(assistant.isComplete, true);
  assert.equal(assistant.workbenchEvents?.[0]?.type, "done");
});

test("模型输出达到上限时保留未完成标记并给出准确终态", async () => {
  const events: AgentStreamEvent[] = [];
  const provider: ProviderAdapter = {
    id: "output-limit-test",
    capabilities: {
      nativeToolCalls: true,
      streaming: true,
      reasoningDeltas: false,
    },
    async *streamChat() {
      yield { type: "text_delta" as const, delta: "这是一段尚未结束的回答" };
      yield { type: "done" as const, finishReason: "length" };
    },
  };
  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: "测试",
    onEvent: (event) => events.push(event),
  });

  const result = await loop.run("测试输出上限");
  const workbenchEvents = events.map((event) => ({ ...event, at: 10 })) as AgentWorkbenchEvent[];
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "provider_output_truncated");
  assert.equal(isProviderOutputTruncatedWorkbench(workbenchEvents), true);
  assert.equal(hasSettledWorkbenchTerminal(workbenchEvents), true);
  assert.equal(events.some((event) => event.type === "done" && event.status === "failed"), true);

  const session: KbConversationSession = {
    id: "conv-output-limit-test",
    title: "输出上限恢复测试",
    createdAt: 1,
    updatedAt: 2,
    messages: [
      { id: "user-1", role: "user", content: "测试输出上限", createdAt: 1 },
      {
        id: "assistant-1",
        role: "assistant",
        content: result.answer,
        createdAt: 2,
        isComplete: false,
        workbenchEvents,
      },
    ],
  };
  const restored = fromPersistedConversation(toPersistedConversation(session));
  const assistant = restored.messages.find((message) => message.role === "assistant");
  assert.ok(assistant && assistant.role === "assistant");
  assert.equal(assistant.isComplete, false);
});

test("最终回答引用校验失败时只重写一次且不重新调用工具", async () => {
  let streamCount = 0;
  const events: AgentStreamEvent[] = [];
  const provider: ProviderAdapter = {
    id: "citation-retry-test",
    capabilities: {
      nativeToolCalls: true,
      streaming: true,
      reasoningDeltas: false,
    },
    async *streamChat() {
      streamCount += 1;
      yield {
        type: "text_delta" as const,
        delta: streamCount === 1
          ? "第一版没有引用。"
          : "第二版已有引用[[cite:20260803125000-efghijk]]。",
      };
      yield { type: "done" as const };
    },
  };
  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: "测试",
    validateFinalAnswer: (answer) => answer.includes("[[cite:")
      ? undefined
      : "请使用已有工具结果重新输出，并补充引用。",
    onEvent: (event) => events.push(event),
  });

  const result = await loop.run("测试引用重写");
  assert.equal(streamCount, 2);
  assert.equal(result.status, "answer_ready");
  assert.match(result.answer, /第二版已有引用/);
  assert.equal(events.filter((event) => event.type === "assistant_text_reset").length, 1);
  assert.equal(events.filter((event) => event.type === "assistant_final").length, 1);
});

test("思源文档编辑帮助准确区分普通格式与特殊块", () => {
  const meta = findAggregateToolMeta("siyuan_doc_edit");
  assert.ok(meta);
  assert.match(meta.boundary, /公式、表格/);
  assert.match(meta.boundary, /数据库、挂件、iframe/);
  assert.equal(meta.notes?.some((note) => note.includes("思源内核创建并更新")), true);
});

test("密集工具事件不会逐条堆积会话检查点", () => {
  assert.equal(shouldEnqueueWorkbenchCheckpoint({
    eventType: "tool_result",
    lastCheckpointAt: 1000,
    now: 1999,
  }), false);
  assert.equal(shouldEnqueueWorkbenchCheckpoint({
    eventType: "assistant_final",
    lastCheckpointAt: 1000,
    now: 2000,
  }), true);
  assert.equal(shouldEnqueueWorkbenchCheckpoint({
    eventType: "permission_resolved",
    lastCheckpointAt: 2000,
    now: 2000,
  }), true);
});

test("伪工具调用被拦截后必须以失败终态结束", async () => {
  let streamCount = 0;
  const events: AgentStreamEvent[] = [];
  const provider: ProviderAdapter = {
    id: "pseudo-tool-test",
    capabilities: {
      nativeToolCalls: true,
      streaming: true,
      reasoningDeltas: false,
    },
    async *streamChat() {
      streamCount += 1;
      yield {
        type: "text_delta" as const,
        delta: '<tool_calls><invoke name="siyuan_kb"></invoke></tool_calls>',
      };
      yield { type: "done" as const };
    },
  };
  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: "测试",
    onEvent: (event) => events.push(event),
  });

  const result = await loop.run("测试伪工具调用终态");
  assert.equal(streamCount, 2);
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "pseudo_tool_markup_blocked");
  assert.equal(events.some((event) => event.type === "error" && event.code === "pseudo_tool_markup_blocked"), true);
  assert.equal(events.some((event) => event.type === "done" && event.status === "failed"), true);
});

test("重复调用保护后的收尾若出现伪工具格式，保留首次停止原因", async () => {
  const events: AgentStreamEvent[] = [];
  const provider: ProviderAdapter = {
    id: "soft-stop-fallback-test",
    capabilities: {
      nativeToolCalls: true,
      streaming: true,
      reasoningDeltas: false,
    },
    async *streamChat() {
      yield {
        type: "text_delta" as const,
        delta: '<tool_calls><invoke name="siyuan_doc_edit"></invoke></tool_calls>',
      };
      yield { type: "done" as const };
    },
  };
  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: "测试",
    onEvent: (event) => events.push(event),
  });
  const softFinalize = loop as unknown as {
    softFinalizeAfterToolStop(params: {
      code: string;
      message: string;
      steps: number;
    }): Promise<{ status: string; answer: string; errorCode?: string }>;
  };

  const result = await softFinalize.softFinalizeAfterToolStop({
    code: "duplicate_failed_call_blocked",
    message: "同一失败调用已停止。",
    steps: 8,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "duplicate_failed_call_blocked");
  assert.match(result.answer, /首次失败卡片中的原因和下一步提示/);
  assert.doesNotMatch(result.answer, /伪工具调用格式/);
  assert.equal(events.some((event) => event.type === "error" && event.code === "duplicate_failed_call_blocked"), true);
  assert.equal(events.some((event) => event.type === "error" && event.code === "pseudo_tool_markup_blocked"), false);
});
