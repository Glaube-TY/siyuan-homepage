import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source end marker: ${endMarker}`);
  return source.slice(start, end);
}

function verifyPresentationScheduler(): void {
  const source = read("src/features/kb/services/orchestration/agent-workbench-mode-flow.ts");
  assert.match(source, /const AGENT_STREAM_PRESENTATION_INTERVAL_MS = 80/);
  assert.match(source, /let latestRawAnswerContent = ""/);
  assert.match(source, /let lastCommittedAnswerContent = ""/);
  assert.match(source, /let presentationFlushTimer: ReturnType<typeof setTimeout> \| undefined/);
  assert.doesNotMatch(source, /answerFlushTimer|reasoningFlushTimer/);
  assert.equal((source.match(/presentationFlushTimer = setTimeout/g) ?? []).length, 1);

  const presentation = sliceBetween(source, "const getDisplayedAnswerContent = (): string => {", "const schedulePresentationFlush");
  const flush = sliceBetween(source, "const flushPresentation = (): void => {", "const schedulePresentationFlush");
  assert.match(presentation, /stripInlineCitationMarkersForDisplay\(latestRawAnswerContent\)/);
  assert.equal((flush.match(/setMessages\(\(messages\) =>/g) ?? []).length, 1);
  assert.match(flush, /lastCommittedAnswerContent/);
  assert.match(flush, /lastCommittedReasoningContent/);
  assert.match(flush, /lastCommittedReasoningStatus/);
  assert.match(flush, /if \(!answerChanged && !reasoningChanged && !statusChanged && !workbenchChanged\) return/);

  const answerChunk = sliceBetween(source, "onAnswerChunk: ({ fullContent }) => {", "onWorkbenchEvent: (event) => {");
  assert.match(answerChunk, /latestRawAnswerContent = fullContent/);
  assert.doesNotMatch(answerChunk, /stripInlineCitationMarkersForDisplay/);
  assert.match(answerChunk, /schedulePresentationFlush\(\)/);

  assert.match(source, /flushPendingAgentStreams = \(\) => \{\s*flushPresentation\(\)/);
  assert.match(source, /onAnswerFinish: \(fullContent\) => \{[\s\S]*latestRawAnswerContent = fullContent[\s\S]*flushPresentation\(\)/);
  assert.match(source, /reasoningStatus = "streaming";\s*flushPresentation\(\)/);
  assert.match(source, /reasoningStatus = "done";\s*flushPresentation\(\)/);
}

function verifyMarkdownMemoAndRendererReuse(): void {
  const item = read("src/features/kb/components/common/chat-message-item.svelte");
  assert.match(item, /lastRenderedAssistantContent/);
  assert.match(item, /lastRenderedCitationSegmentsRef/);
  assert.match(item, /lastRenderedCitedReferencesRef/);
  assert.match(item, /message\.content !== lastRenderedAssistantContent/);
  assert.match(item, /reasoningHtmlWasRendered/);
  assert.match(item, /const shouldRenderReasoning = message\.role === "assistant"\s*&&\s*!reasoningCollapsed/);
  assert.match(item, /lastWorkbenchEventsRef/);
  assert.match(item, /lastDisplayStepsEventsRef/);
  assert.match(item, /EMPTY_WORKBENCH_EVENTS/);
  const workbenchMemo = sliceBetween(item, "let lastWorkbenchEventsRef", "$: temporaryWorkbenches");
  assert.match(workbenchMemo, /if \(nextWorkbenchEvents !== lastWorkbenchEventsRef\) \{[\s\S]*providerOutputTruncated = isProviderOutputTruncatedWorkbench\(nextWorkbenchEvents\)[\s\S]*workbenchTerminalSettled = hasSettledWorkbenchTerminal\(nextWorkbenchEvents\)/);
  const partialAnswer = sliceBetween(item, "$: isStoppedPartialAnswer =", "$: partialAnswerHint");
  assert.match(partialAnswer, /!workbenchTerminalSettled/);
  assert.doesNotMatch(partialAnswer, /message\.workbenchEvents/);

  const mdToHtml = read("src/components/tools/mdToHtml.ts");
  assert.match(mdToHtml, /let cachedLuteRenderer: LuteRenderer \| null = null/);
  assert.match(mdToHtml, /if \(!cachedLuteRenderer && typeof luteFactory\?\.New === "function"\)/);
  assert.match(mdToHtml, /cachedLuteRenderer = luteFactory\.New\(\) \?\? null/);
  assert.match(mdToHtml, /DOMPurify\.sanitize\(rawHtml\)/);
  assert.doesNotMatch(mdToHtml, /const lute = luteFactory\?\.New\?\.\(\)/);
}

function verifyStickyScroll(): void {
  const source = read("src/features/kb/components/common/chat-message-list.svelte");
  assert.match(source, /export let conversationId: string = ""/);
  assert.match(source, /let lastConversationId: string \| null = null/);
  assert.match(source, /async function forceFollowToBottom/);
  assert.match(source, /await tick\(\)/);
  assert.match(source, /lastMessageId = null/);
  assert.match(source, /let followStreamToBottom = true/);
  assert.match(source, /let autoScrollRaf: number \| undefined/);
  assert.match(source, /if \(autoScrollRaf !== undefined\) return/);
  assert.match(source, /autoScrollRaf = requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame\(autoScrollRaf\)/);
  assert.match(source, /followStreamToBottom = isNearBottom\(\)/);
  assert.match(source, /if \(followStreamToBottom\) scheduleScrollToBottom\(\)/);
  assert.match(source, /function setActiveTurnToLatest\(\): void/);
  assert.match(source, /use:observeMessages/);
  assert.match(source, /const observer = new ResizeObserver/);
  assert.match(source, /observer\.observe\(node\)/);
  assert.match(source, /observer\.disconnect\(\)/);

  // 普通发送可能在同一个 Svelte flush 内追加 user、启动 asking，再追加 assistant placeholder。
  assert.match(source, /let previousAsking = false/);
  assert.match(source, /function syncAskingFollowState\(nextAsking: boolean\): void/);
  assert.match(source, /const startedAsking = nextAsking && !previousAsking/);
  assert.match(source, /previousAsking = nextAsking/);
  assert.match(source, /\$: syncAskingFollowState\(asking\)/);
  const askingSync = sliceBetween(source, "function syncAskingFollowState", "$: syncAskingFollowState");
  assert.match(askingSync, /if \(startedAsking\) void forceFollowToBottom\(\)/);
  assert.doesNotMatch(askingSync, /scrollContainer\.scrollTop|setTimeout|requestAnimationFrame/);

  const conversationReset = sliceBetween(source, "$: if (conversationId !== lastConversationId)", "// 新增 user 消息");
  assert.match(conversationReset, /lastConversationId = conversationId/);
  assert.match(conversationReset, /lastMessageId = null/);
  assert.match(conversationReset, /forceFollowToBottom\(conversationId\)/);

  const newMessageBlock = sliceBetween(source, "// 新增 user 消息", "// 根据 activeTurnMessageId");
  assert.match(newMessageBlock, /currentLastMessage\.role === "user"\) \{\s*void forceFollowToBottom\(\)/);
  assert.doesNotMatch(newMessageBlock, /role === "user"\) \{\s*if \(followStreamToBottom\)/);

  const handleScroll = sliceBetween(source, "function handleScroll()", "// ===== 问答导航 =====");
  const fastPath = sliceBetween(handleScroll, "if (asking && followStreamToBottom)", "if (scrollNavRaf) cancelAnimationFrame");
  assert.match(handleScroll, /if \(asking && followStreamToBottom\) \{[\s\S]*cancelAnimationFrame\(scrollNavRaf\)[\s\S]*setActiveTurnToLatest\(\)[\s\S]*return/);
  assert.doesNotMatch(fastPath, /updateActiveTurnFromScroll|requestAnimationFrame/);
  assert.match(handleScroll, /scrollNavRaf = requestAnimationFrame\(\(\) => \{\s*updateActiveTurnFromScroll\(\)/);

  const scrollToMessage = sliceBetween(source, "function scrollToMessage(messageId: string)", "onDestroy");
  assert.match(scrollToMessage, /followStreamToBottom = false/);
  assert.match(scrollToMessage, /cancelAutoScroll\(\)/);
  assert.doesNotMatch(source, /lastMessageContent|getMessageContent/);

  const panel = read("src/features/kb/components/panels/kb-main-panel.svelte");
  assert.match(panel, /<ChatMessageList[\s\S]*conversationId=\{activeConversationId\}/);

  const item = read("src/features/kb/components/common/chat-message-item.svelte");
  assert.match(item, /let userMessageCollapsible = false/);
  assert.match(item, /let userMessageExpanded = false/);
  assert.match(item, /userMessageTextEl\.scrollHeight > userMessageTextEl\.clientHeight/);
  assert.match(item, /max-height:\s*19\.2em/);
  assert.match(item, /overflow:\s*hidden/);
  assert.match(item, /class="user-message-toggle"/);
  assert.match(item, /aria-expanded=\{userMessageExpanded\}/);
  assert.match(item, /on:click=\{toggleUserMessageExpanded\}/);
  assert.match(item, /use:observeUserMessageText/);
  assert.doesNotMatch(item, /message\.content\.slice/);
}

verifyPresentationScheduler();
verifyMarkdownMemoAndRendererReuse();
verifyStickyScroll();
console.log("KB stream presentation performance contracts verified");
