import assert from "node:assert/strict";
import {
  asCurrentConversationRecord,
  parseLegacyConversationRecord,
} from "../src/features/kb/services/session/kb-chat-session-storage";
import {
  isCurrentConversationRecord,
  isLegacyConversationRecord,
  LEGACY_CONVERSATION_READ_ONLY,
} from "../src/features/kb/types/conversation-record";
import { searchConversations } from "../src/features/kb/components/common/conversation-search";
import { toPersistedConversation } from "../src/features/kb/services/session/kb-chat-session-storage";
import { restoreKbChatSessions, saveKbChatSessionStorage } from "../src/features/kb/services/agent-workbench/storage/chat-session-facade";
import { setNotebrainPlugin } from "../src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { NOTEBRAIN_CHAT_INDEX_KEY, toSessionKey } from "../src/features/kb/services/agent-workbench/storage/notebrain-storage-keys";

const raw = {
  id: "legacy-1",
  title: "旧版知识库",
  schemaVersion: 2,
  createdAt: 10,
  updatedAt: 20,
  compressionState: { stageSummary: "old state" },
  stageSummaries: [{ summary: "old summary" }],
  compressedContextSummary: "old compressed context",
  agentSession: { messages: [{ role: "tool", content: "must not replay" }] },
  checkpoint: { messages: [{ role: "tool", content: "must not replay" }] },
  agentRecovery: { checkpoint: { phase: "after_tool" } },
  pendingToolCalls: [{ id: "pending" }],
  successfulWriteGuards: [{ toolName: "delete_doc" }],
  messages: [
    { id: "u1", role: "user", content: "查找旧资料", createdAt: 11 },
    { id: "a1", role: "assistant", content: "旧版回答", createdAt: 12, compacted: true },
    { id: "tool1", role: "tool", content: "工具正文不应进入归档运行时", createdAt: 13 },
  ],
};

const legacy = parseLegacyConversationRecord(raw, { id: "legacy-1" });
assert.equal(legacy.kind, "legacy");
assert.equal(legacy.readOnly, true);
assert.equal(isLegacyConversationRecord(legacy), true);
assert.equal(isCurrentConversationRecord(legacy), false);
assert.equal(legacy.id, "legacy-1");
assert.equal(legacy.title, "旧版知识库");
assert.equal(legacy.createdAt, 10);
assert.equal(legacy.updatedAt, 20);
assert.equal(legacy.messages.length, 2);
assert.equal(legacy.messages[0].role, "user");
assert.equal(legacy.messages[1].role, "assistant");
assert.equal(legacy.latestCompactionSnapshot, undefined);
assert.equal(toPersistedConversation(legacy).latestCompactionSnapshot, undefined);
assert.equal(legacy.legacySchemaVersion, 2);
assert.equal((legacy as { checkpoint?: unknown }).checkpoint, undefined);
assert.equal((legacy as { compressionState?: unknown }).compressionState, undefined);
assert.equal((legacy as { stageSummaries?: unknown }).stageSummaries, undefined);
assert.equal((legacy as { compressedContextSummary?: unknown }).compressedContextSummary, undefined);
assert.equal((legacy as { agentSession?: unknown }).agentSession, undefined);
assert.equal((legacy as { agentRecovery?: unknown }).agentRecovery, undefined);
assert.equal((legacy as { pendingToolCalls?: unknown }).pendingToolCalls, undefined);
assert.equal((legacy as { successfulWriteGuards?: unknown }).successfulWriteGuards, undefined);
assert.equal(legacy.ignoredInternalCount, 1);
assert.equal(legacy.corrupted, undefined);

const normalInternal = parseLegacyConversationRecord({
  id: "legacy-internal",
  messages: [
    { role: "user", content: "可见问题", attachedDocs: [{ docId: "d1", title: "文档", source: "current_doc" }] },
    { role: "tool", content: "运行时工具结果" },
    { role: "system", content: "内部提示" },
    { role: "loading", content: "加载中" },
    { role: "assistant", content: "可见回答", isComplete: false, citationSegments: [{ text: "段落", citationIds: [0] }], citedReferences: [{ index: 0, docTitle: "文档", headingPathText: "H1", sourceBlockIds: ["b1"] }] },
  ],
}, { id: "legacy-internal" });
assert.equal(normalInternal.corrupted, undefined);
assert.equal(normalInternal.ignoredInternalCount, 3);
assert.equal(normalInternal.unparseableVisibleCount, undefined);
assert.equal(normalInternal.messages[0].role === "user" && normalInternal.messages[0].attachedDocs?.[0].source, "current_doc");
assert.equal(normalInternal.messages[1].role === "assistant" && normalInternal.messages[1].citationSegments?.[0].text, "段落");
assert.equal(normalInternal.messages[1].role === "assistant" && normalInternal.messages[1].isComplete, false);

const searchResult = searchConversations([legacy], "旧资料");
assert.equal(searchResult.length, 1);
assert.equal(searchResult[0].conversation.kind, "legacy");

const damaged = parseLegacyConversationRecord({
  id: "legacy-damaged",
  title: "损坏但可见",
  updatedAt: 40,
  messages: [{ role: "user", content: "可读", createdAt: 41 }, { role: "assistant", content: 123 }, { role: "tool", content: "跳过" }],
}, { id: "legacy-damaged", createdAt: 30 });
assert.equal(damaged.id, "legacy-damaged");
assert.equal(damaged.title, "损坏但可见");
assert.equal(damaged.corrupted, true);
assert.ok(damaged.archiveError);
assert.equal(damaged.unparseableVisibleCount, 1);
assert.equal(damaged.ignoredInternalCount, 1);
assert.equal(damaged.messages.length, 1);

const missing = parseLegacyConversationRecord(undefined, {
  id: "missing-file",
  title: "索引仍保留",
  createdAt: 50,
  updatedAt: 60,
});
assert.equal(missing.kind, "legacy");
assert.equal(missing.title, "索引仍保留");
assert.equal(missing.corrupted, true);
assert.equal(missing.updatedAt, 60);

const current = asCurrentConversationRecord({
  id: "current-1",
  title: "新 V4",
  createdAt: 1,
  updatedAt: 2,
  messages: [],
});
assert.equal(current.kind, "current");
assert.equal(current.readOnly, false);
assert.equal(current.schemaVersion, 3);
assert.equal(isCurrentConversationRecord(current), true);
assert.equal(isLegacyConversationRecord(current), false);
assert.equal(toPersistedConversation(current).schemaVersion, 3);
assert.equal(LEGACY_CONVERSATION_READ_ONLY, "LEGACY_CONVERSATION_READ_ONLY");
assert.equal(isCurrentConversationRecord(undefined), false);
assert.equal(isCurrentConversationRecord(null), false);
assert.equal(isCurrentConversationRecord({ kind: "mystery", readOnly: false, schemaVersion: 3 }), false);
assert.equal(isCurrentConversationRecord({ kind: "current" }), false);
assert.equal(isCurrentConversationRecord({ kind: "current", readOnly: false, schemaVersion: 2 }), false);

const storageFiles = new Map<string, unknown>();
const rawLegacyFile = { version: 1, schemaVersion: 2, id: "legacy-1", title: legacy.title, createdAt: 10, updatedAt: 20, messages: raw.messages };
storageFiles.set(NOTEBRAIN_CHAT_INDEX_KEY, {
  version: 1,
  activeSessionId: "current-index",
  sessions: [
    { id: "current-index", title: "当前", createdAt: 1, updatedAt: 2, messageCount: 0, lastMessagePreview: "" },
    { id: "legacy-1", title: legacy.title, createdAt: 10, updatedAt: 20, messageCount: 2, lastMessagePreview: "旧版回答" },
  ],
  revision: 1,
});
storageFiles.set(toSessionKey("legacy-1"), rawLegacyFile);
setNotebrainPlugin({
  saveData: async (key: string, value: unknown) => { storageFiles.set(key, value); },
  loadData: async (key: string) => storageFiles.get(key) ?? "",
  removeData: async (key: string) => { storageFiles.delete(key); },
} as never);
const rawBeforeIndexOnlySave = JSON.stringify(storageFiles.get(toSessionKey("legacy-1")));
const indexOnlySave = await saveKbChatSessionStorage({
  activeConversationId: "legacy-1",
  conversations: [legacy],
  selectedMode: "whole_kb",
});
assert.equal(indexOnlySave.success, true);
const savedIndex = storageFiles.get(NOTEBRAIN_CHAT_INDEX_KEY) as { activeSessionId?: string; selectedMode?: string };
assert.equal(savedIndex.activeSessionId, "legacy-1");
assert.equal(savedIndex.selectedMode, "whole_kb");
assert.equal(JSON.stringify(storageFiles.get(toSessionKey("legacy-1"))), rawBeforeIndexOnlySave);
assert.equal((storageFiles.get(toSessionKey("legacy-1")) as { updatedAt: number }).updatedAt, 20);

const indexBeforeMissing = storageFiles.get(NOTEBRAIN_CHAT_INDEX_KEY) as {
  version: 1;
  activeSessionId: string;
  sessions: Array<Record<string, unknown>>;
  [key: string]: unknown;
};
const missingEntry = {
  id: "missing-file",
  title: "索引中的旧会话",
  createdAt: 50,
  updatedAt: 60,
  messageCount: 4,
  lastMessagePreview: "索引预览",
};
storageFiles.delete(toSessionKey("missing-file"));
storageFiles.set(NOTEBRAIN_CHAT_INDEX_KEY, {
  ...indexBeforeMissing,
  activeSessionId: "missing-file",
  sessions: [...indexBeforeMissing.sessions, missingEntry],
});
const missingSnapshot = await restoreKbChatSessions();
assert.ok(missingSnapshot);
const missingConversation = missingSnapshot!.conversations.find((item) => item.id === "missing-file");
assert.ok(missingConversation);
assert.equal(missingConversation!.kind, "legacy");
assert.equal(missingConversation!.readOnly, true);
assert.equal(missingConversation!.messages.length, 0);
assert.equal(missingConversation!.title, "索引中的旧会话");
assert.equal(missingConversation!.updatedAt, 60);
assert.equal((missingConversation as { recoverable?: boolean }).recoverable, true);
assert.match(missingConversation!.archiveError ?? "", /暂时无法读取/);
assert.ok(missingSnapshot!.sessionReadIssues.some((issue) => issue.sessionId === "missing-file" && issue.status === "missing"));

const missingSave = await saveKbChatSessionStorage({
  activeConversationId: "missing-file",
  conversations: [missingConversation!],
});
assert.equal(missingSave.success, true);
assert.equal(storageFiles.has(toSessionKey("missing-file")), false, "missing Legacy placeholder must not create a session file");

storageFiles.set(toSessionKey("missing-file"), {
  version: 1,
  schemaVersion: 2,
  id: "missing-file",
  title: "恢复后的旧会话",
  createdAt: 50,
  updatedAt: 61,
  messages: [{ role: "user", content: "恢复成功", createdAt: 62 }],
});
const recoveredSnapshot = await restoreKbChatSessions();
const recoveredConversation = recoveredSnapshot?.conversations.find((item) => item.id === "missing-file");
assert.equal(recoveredConversation?.kind, "legacy");
assert.equal(recoveredConversation?.messages.length, 1);
assert.equal(recoveredConversation?.messages[0]?.content, "恢复成功");
assert.equal((recoveredConversation as { recoverable?: boolean } | undefined)?.recoverable, undefined);
assert.equal(recoveredSnapshot?.sessionReadIssues.some((issue) => issue.sessionId === "missing-file"), false);

const mixed = [legacy, current, damaged].sort((a, b) => b.updatedAt - a.updatedAt);
assert.deepEqual(mixed.map((item) => item.id), ["legacy-damaged", "legacy-1", "current-1"]);

console.log("verify-agent-context-legacy-archive-v4: extended assertions passed");
