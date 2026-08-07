/**
 * conversation-search 纯函数测试
 * 运行：pnpm test:kb-conversation-search
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  searchConversations,
  splitHighlightSegments,
  normalizeSearchText,
} from "./conversation-search.js";
import type { ChatMessage, KbConversationSession } from "../../types/chat.js";

let messageSeq = 0;

function userMessage(content: string, overrides: Partial<Extract<ChatMessage, { role: "user" }>> = {}): ChatMessage {
  messageSeq += 1;
  return { id: `user-${messageSeq}`, role: "user", content, createdAt: 1000 + messageSeq, ...overrides };
}

function assistantMessage(content: string, overrides: Partial<Extract<ChatMessage, { role: "assistant" }>> = {}): ChatMessage {
  messageSeq += 1;
  return {
    id: `assistant-${messageSeq}`,
    role: "assistant",
    content,
    createdAt: 1000 + messageSeq,
    ...overrides,
  };
}

function errorMessage(content: string): ChatMessage {
  messageSeq += 1;
  return { id: `error-${messageSeq}`, role: "error", content, createdAt: 1000 + messageSeq };
}

let convSeq = 0;

function makeConversation(overrides: Partial<KbConversationSession> & { messages: ChatMessage[] }): KbConversationSession {
  convSeq += 1;
  const now = 2000 + convSeq;
  return {
    id: `conv-${convSeq}`,
    title: "新对话",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("1. 空搜索词返回全部会话", () => {
  const conversations = [
    makeConversation({ title: "甲", messages: [] }),
    makeConversation({ title: "乙", messages: [] }),
    makeConversation({ title: "丙", messages: [] }),
  ];
  const results = searchConversations(conversations, "");
  assert.equal(results.length, 3);
  assert.equal(results[0].conversation.id, conversations[0].id);
  assert.equal(results[2].conversation.id, conversations[2].id);
});

test("2. 标题中文命中", () => {
  const conversations = [
    makeConversation({ title: "知识库问答研究", messages: [] }),
    makeConversation({ title: "另一个会话", messages: [] }),
  ];
  const results = searchConversations(conversations, "知识库");
  assert.equal(results.length, 1);
  assert.equal(results[0].conversation.id, conversations[0].id);
  assert.equal(results[0].matchSource, "title");
});

test("3. 标题英文大小写不敏感", () => {
  const conversations = [
    makeConversation({ title: "Meeting Notes", messages: [] }),
    makeConversation({ title: "日常记录", messages: [] }),
  ];
  const results = searchConversations(conversations, "meeting");
  assert.equal(results.length, 1);
  assert.equal(results[0].conversation.id, conversations[0].id);

  const upper = searchConversations(conversations, "MEETING");
  assert.equal(upper.length, 1);
  assert.equal(upper[0].conversation.id, conversations[0].id);
});

test("4. 用户消息内容命中", () => {
  const conversations = [
    makeConversation({
      title: "闲聊",
      messages: [
        assistantMessage("这是 AI 的回答内容"),
        userMessage("我想了解光伏储能方案"),
      ],
    }),
    makeConversation({ title: "无关", messages: [userMessage("今天天气如何")] }),
  ];
  const results = searchConversations(conversations, "光伏");
  assert.equal(results.length, 1);
  assert.equal(results[0].conversation.id, conversations[0].id);
  assert.equal(results[0].matchSource, "user_message");
  assert.equal(results[0].matchedUserMessageId, conversations[0].messages[1].id);
});

test("5. assistant 消息内容不应命中", () => {
  const conversations = [
    makeConversation({
      title: "会话一",
      messages: [
        userMessage("普通问题"),
        assistantMessage("深度解析量子纠缠态坍缩的数学推导"),
      ],
    }),
  ];
  const results = searchConversations(conversations, "量子纠缠");
  assert.equal(results.length, 0);
});

test("6. reasoning 内容不应命中", () => {
  const conversations = [
    makeConversation({
      title: "思考会话",
      messages: [
        userMessage("1+1 等于几"),
        assistantMessage("答案是 2", {
          reasoning: { content: "内部推理链：先做加法运算再比较", status: "done", partCount: 1, chars: 20 },
        }),
      ],
    }),
  ];
  const results = searchConversations(conversations, "内部推理链");
  assert.equal(results.length, 0);
});

test("7. 错误消息内容不应命中", () => {
  const conversations = [
    makeConversation({
      title: "报错会话",
      messages: [userMessage("请执行"), errorMessage("API 调用失败：网络超时")],
    }),
  ];
  const results = searchConversations(conversations, "网络超时");
  assert.equal(results.length, 0);
});

test("8. 同一个会话多条用户消息命中时只返回一次", () => {
  const conversations = [
    makeConversation({
      title: "多轮命中",
      messages: [
        userMessage("关于股票投资的问题"),
        assistantMessage("回答一"),
        userMessage("继续聊股票投资策略"),
        assistantMessage("回答二"),
      ],
    }),
  ];
  const results = searchConversations(conversations, "股票");
  assert.equal(results.length, 1);
});

test("9. 返回第一条命中的用户消息摘要", () => {
  const conversations = [
    makeConversation({
      title: "多消息",
      messages: [
        userMessage("第一条包含关键词 A"),
        userMessage("第二条包含关键词 B"),
        userMessage("第三条也包含关键词 A"),
      ],
    }),
  ];
  const results = searchConversations(conversations, "关键词 A");
  assert.equal(results.length, 1);
  assert.equal(results[0].matchSnippet, "第一条包含关键词 A");
  assert.equal(results[0].matchedUserMessageId, conversations[0].messages[0].id);
});

test("10. 搜索不会修改原 conversations 数组顺序", () => {
  const conversations = [
    makeConversation({ title: "丙", messages: [userMessage("内容三")] }),
    makeConversation({ title: "甲", messages: [userMessage("内容一")] }),
    makeConversation({ title: "乙", messages: [userMessage("内容二")] }),
  ];
  const before = JSON.stringify(conversations.map((c) => c.id));
  searchConversations(conversations, "内容");
  searchConversations(conversations, "甲");
  searchConversations(conversations, "");
  const after = JSON.stringify(conversations.map((c) => c.id));
  assert.equal(before, after);
});

test("11. 结果保持最新会话在前的原有顺序", () => {
  // 原数组顺序为旧→新（最新在后），UI 渲染时会 reverse；
  // 搜索结果必须保持与原数组一致的顺序，才能保证 UI reverse 后最新在前。
  const conversations = [
    makeConversation({ title: "旧会话", updatedAt: 1000, messages: [userMessage("包含词")] }),
    makeConversation({ title: "中会话", updatedAt: 2000, messages: [userMessage("包含词")] }),
    makeConversation({ title: "新会话", updatedAt: 3000, messages: [userMessage("包含词")] }),
  ];
  const results = searchConversations(conversations, "包含词");
  assert.deepEqual(
    results.map((r) => r.conversation.id),
    conversations.map((c) => c.id),
  );
});

test("12. 换行和连续空格被正确压缩", () => {
  const conversations = [
    makeConversation({
      title: "格式",
      messages: [
        userMessage("第一行\n第二行    中间  连续空格"),
      ],
    }),
  ];
  const results = searchConversations(conversations, "第二行");
  assert.equal(results.length, 1);
  assert.equal(results[0].matchSnippet, "第一行 第二行 中间 连续空格");
});

test("13. 长消息摘要被正确截断", () => {
  const longText = "这是一个非常长的用户消息，".repeat(20); // 320 字
  const conversations = [
    makeConversation({
      title: "长消息",
      messages: [userMessage(`${longText}目标关键词${longText}`)],
    }),
  ];
  const results = searchConversations(conversations, "目标关键词");
  assert.equal(results.length, 1);
  const snippet = results[0].matchSnippet!;
  assert.ok(snippet.includes("目标关键词"), "摘要应包含命中词");
  assert.ok(snippet.startsWith("…") || !snippet.startsWith(longText.slice(0, 3)), "前部截断应带省略号");
  assert.ok(snippet.length <= 74, `摘要长度应约为 70 字，实际 ${snippet.length}`);
});

test("14. 中文关键词高亮分段正确", () => {
  const segments = splitHighlightSegments("光伏储能方案", "储能");
  assert.deepEqual(segments, [
    { text: "光伏", highlighted: false },
    { text: "储能", highlighted: true },
    { text: "方案", highlighted: false },
  ]);
});

test("15. 英文大小写不敏感高亮正确", () => {
  const segments = splitHighlightSegments("Meeting Notes And meeting", "MEETING");
  assert.deepEqual(segments, [
    { text: "Meeting", highlighted: true },
    { text: " Notes And ", highlighted: false },
    { text: "meeting", highlighted: true },
  ]);
});

test("16. 特殊正则字符不会导致报错", () => {
  const conversations = [
    makeConversation({
      title: "正则字符",
      messages: [userMessage("a+b*c(d)? [x] {y} \\d+ .* 都是普通文本")],
    }),
  ];
  // 不应抛出任何异常
  const results = searchConversations(conversations, "a+b*c(d)?");
  assert.equal(results.length, 1);
  assert.equal(results[0].matchSnippet, "a+b*c(d)? [x] {y} \\d+ .* 都是普通文本");

  const segments = splitHighlightSegments("a+b*c(d)?", "a+b*c(d)?");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].highlighted, true);
});

test("17. 用户消息为空时不会报错", () => {
  const conversations = [
    makeConversation({
      title: "空消息",
      messages: [userMessage(""), assistantMessage("回答")],
    }),
  ];
  const results = searchConversations(conversations, "任何词");
  assert.equal(results.length, 0);

  const results2 = searchConversations(conversations, "");
  assert.equal(results2.length, 1);
});

test("18. 会话消息数组为空时仍可通过标题搜索", () => {
  const conversations = [
    makeConversation({ title: "空会话标题", messages: [] }),
  ];
  const results = searchConversations(conversations, "空会话");
  assert.equal(results.length, 1);
  assert.equal(results[0].matchSource, "title");
});

test("normalizeSearchText: trim 与连续空白压缩", () => {
  assert.equal(normalizeSearchText("  你好   世界  "), "你好 世界");
  assert.equal(normalizeSearchText("a\n\nb\tc"), "a b c");
});
