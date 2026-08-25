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
  assert.match(source, /let followStreamToBottom = true/);
  assert.match(source, /let autoScrollRaf: number \| undefined/);
  assert.match(source, /if \(autoScrollRaf !== undefined\) return/);
  assert.match(source, /autoScrollRaf = requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame\(autoScrollRaf\)/);
  assert.match(source, /followStreamToBottom = isNearBottom\(\)/);
  assert.match(source, /if \(followStreamToBottom\) \{\s*scheduleScrollToBottom\(\)/);
  assert.match(source, /function setActiveTurnToLatest\(\): void/);
  const handleScroll = sliceBetween(source, "function handleScroll()", "// 最后一条消息的内容");
  const fastPath = sliceBetween(handleScroll, "if \(asking && followStreamToBottom\)", "if \(scrollNavRaf\) cancelAnimationFrame");
  assert.match(handleScroll, /if \(asking && followStreamToBottom\) \{[\s\S]*cancelAnimationFrame\(scrollNavRaf\)[\s\S]*setActiveTurnToLatest\(\)[\s\S]*return/);
  assert.doesNotMatch(fastPath, /updateActiveTurnFromScroll|requestAnimationFrame/);
  assert.match(handleScroll, /scrollNavRaf = requestAnimationFrame\(\(\) => \{\s*updateActiveTurnFromScroll\(\)/);

  const streamReactiveBlock = sliceBetween(source, "// 消息变化时：", "// ===== 问答导航 =====");
  assert.doesNotMatch(streamReactiveBlock, /isNearBottom\(\)/);
}

verifyPresentationScheduler();
verifyMarkdownMemoAndRendererReuse();
verifyStickyScroll();
console.log("KB stream presentation performance contracts verified");
