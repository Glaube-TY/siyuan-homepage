import type { CitationSegment, ReferenceItem } from "../../../types/chat";
import type { CollectedReference } from "./reference-collector";
import { toReferenceItem } from "./reference-collector";

const CITATION_PREFIX = "[[cite:";
const CITATION_SUFFIX = "]]";
const MAX_CITATION_TARGET_CHARS = 2048;
const MAX_INLINE_REFERENCES = 10;
const MAX_RETRY_REFERENCE_HINTS = 10;
const SIYUAN_ID_RE = /^\d{14}-[a-z0-9]{7}$/i;

export interface InlineCitationResolution {
  answer: string;
  citationSegments?: CitationSegment[];
  citedReferences: ReferenceItem[];
  acceptedCount: number;
  rejectedCount: number;
}

interface CitationMarker {
  start: number;
  end: number;
  target: string;
}

function isCitableReference(ref: CollectedReference): boolean {
  return (ref.readLevel === "content" || ref.readLevel === "structure")
    && (ref.sourceType === "siyuan_doc" || ref.sourceType === "web_page");
}

function citationTarget(ref: CollectedReference): string | undefined {
  if (ref.sourceType === "web_page") return ref.url ? `web:${ref.url}` : undefined;
  const id = ref.blockId ?? ref.docId;
  return id ? `siyuan:${id}` : undefined;
}

/**
 * 最终回答使用了外部来源却完全没有有效引用时，生成一次精简的重写指令。
 * 指令只暴露本轮工具真实返回、且运行时允许引用的来源，避免模型编造标记。
 */
export function buildMissingCitationRetryInstruction(
  answer: string,
  observationRefs: readonly CollectedReference[],
): string | undefined {
  const citableRefs = observationRefs.filter(isCitableReference);
  if (citableRefs.length === 0) return undefined;

  const resolution = resolveInlineCitations(answer, observationRefs);
  if (resolution.acceptedCount > 0) return undefined;

  const seen = new Set<string>();
  const hints: string[] = [];
  for (const ref of citableRefs) {
    const target = citationTarget(ref);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    const label = ref.title?.trim() || (ref.sourceType === "web_page" ? "网页来源" : "思源文档");
    hints.push(`- ${label}：[[cite:${target}]]`);
    if (hints.length >= MAX_RETRY_REFERENCE_HINTS) break;
  }
  if (hints.length === 0) return undefined;

  return [
    "内部引用校验未通过：上一版回答使用了本轮工具读取的外部内容，但没有任何有效来源标记。",
    "请基于已有工具结果重新输出完整回答，不要再次调用工具。",
    "凡使用笔记、知识库结构或网页信息的表述，都要在实际使用位置加入对应的 [[cite:来源标识]]；不要集中堆到末尾，也不要编造标识。",
    "本轮可用来源标记（只选与具体表述对应的项）：",
    ...hints,
  ].join("\n");
}

function normalizeCitationTarget(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("siyuan:")) return trimmed.slice("siyuan:".length).trim();
  if (trimmed.startsWith("web:")) return trimmed.slice("web:".length).trim();
  return trimmed;
}

function resolveReference(
  rawTarget: string,
  observationRefs: readonly CollectedReference[],
): CollectedReference | undefined {
  const target = normalizeCitationTarget(rawTarget);
  if (!target) return undefined;

  if (SIYUAN_ID_RE.test(target)) {
    return observationRefs.find((ref) =>
      isCitableReference(ref)
      && ref.sourceType === "siyuan_doc"
      && (ref.blockId === target || ref.docId === target)
    );
  }

  if (/^https?:\/\//i.test(target)) {
    return observationRefs.find((ref) =>
      isCitableReference(ref)
      && ref.sourceType === "web_page"
      && ref.url === target
    );
  }

  return undefined;
}

function referenceKey(ref: CollectedReference): string {
  if (ref.sourceType === "web_page") return `web:${ref.url ?? ""}`;
  return `siyuan:${ref.blockId ?? ref.docId ?? ""}`;
}

function countRun(text: string, start: number, char: string): number {
  let end = start;
  while (end < text.length && text[end] === char) end++;
  return end - start;
}

/**
 * 查找回答正文中的内部引用标记，并跳过 Markdown 围栏代码块与行内代码。
 * 标记只是一种模型到运行时的传输协议，不会原样进入最终聊天消息。
 */
function findCitationMarkers(answer: string): CitationMarker[] {
  const markers: CitationMarker[] = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let inlineBackticks = 0;
  let lineStart = true;

  for (let index = 0; index < answer.length;) {
    if (lineStart) {
      let cursor = index;
      let leadingSpaces = 0;
      while (leadingSpaces < 4 && answer[cursor] === " ") {
        cursor++;
        leadingSpaces++;
      }
      const char = answer[cursor];
      if ((char === "`" || char === "~") && countRun(answer, cursor, char) >= 3) {
        const runLength = countRun(answer, cursor, char);
        if (!inFence) {
          inFence = true;
          fenceChar = char;
          fenceLength = runLength;
        } else if (char === fenceChar && runLength >= fenceLength) {
          inFence = false;
          fenceChar = "";
          fenceLength = 0;
        }
      }
      lineStart = false;
    }

    if (answer[index] === "\n") {
      lineStart = true;
      inlineBackticks = 0;
      index++;
      continue;
    }

    if (!inFence && answer[index] === "`") {
      const runLength = countRun(answer, index, "`");
      if (inlineBackticks === 0) inlineBackticks = runLength;
      else if (inlineBackticks === runLength) inlineBackticks = 0;
      index += runLength;
      continue;
    }

    if (!inFence && inlineBackticks === 0 && answer.startsWith(CITATION_PREFIX, index)) {
      const targetStart = index + CITATION_PREFIX.length;
      const suffixIndex = answer.indexOf(CITATION_SUFFIX, targetStart);
      if (suffixIndex >= 0 && suffixIndex - targetStart <= MAX_CITATION_TARGET_CHARS) {
        markers.push({
          start: index,
          end: suffixIndex + CITATION_SUFFIX.length,
          target: answer.slice(targetStart, suffixIndex),
        });
        index = suffixIndex + CITATION_SUFFIX.length;
        continue;
      }
    }

    index++;
  }

  return markers;
}

/**
 * 将模型输出的引用标记解析为结构化行内引用。
 * 只有本轮工具真实返回的正文或结构来源可以进入结果；搜索候选仍不可引用。
 */
export function resolveInlineCitations(
  answer: string,
  observationRefs: readonly CollectedReference[],
): InlineCitationResolution {
  const markers = findCitationMarkers(answer);
  if (markers.length === 0) {
    return { answer, citedReferences: [], acceptedCount: 0, rejectedCount: 0 };
  }

  const citationSegments: CitationSegment[] = [];
  const citedReferences: ReferenceItem[] = [];
  const indexByReferenceKey = new Map<string, number>();
  let cursor = 0;
  let pendingText = "";
  let acceptedCount = 0;
  let rejectedCount = 0;

  for (const marker of markers) {
    pendingText += answer.slice(cursor, marker.start);
    cursor = marker.end;

    const matched = resolveReference(marker.target, observationRefs);
    if (!matched) {
      rejectedCount++;
      continue;
    }

    const key = referenceKey(matched);
    let citationIndex = indexByReferenceKey.get(key);
    if (citationIndex === undefined) {
      if (citedReferences.length >= MAX_INLINE_REFERENCES) {
        rejectedCount++;
        continue;
      }
      citationIndex = citedReferences.length + 1;
      const item = toReferenceItem(matched, citationIndex);
      if (!item) {
        rejectedCount++;
        continue;
      }
      citedReferences.push(item);
      indexByReferenceKey.set(key, citationIndex);
    }

    const previous = citationSegments[citationSegments.length - 1];
    if (!pendingText && previous) {
      if (!previous.citationIds.includes(citationIndex)) {
        previous.citationIds.push(citationIndex);
      }
    } else {
      citationSegments.push({ text: pendingText, citationIds: [citationIndex] });
      pendingText = "";
    }
    acceptedCount++;
  }

  pendingText += answer.slice(cursor);
  if (pendingText || citationSegments.length === 0) {
    citationSegments.push({ text: pendingText, citationIds: [] });
  }

  const cleanAnswer = citationSegments.map((segment) => segment.text).join("");
  if (acceptedCount === 0) {
    return {
      answer: cleanAnswer,
      citedReferences: [],
      acceptedCount: 0,
      rejectedCount,
    };
  }

  return {
    answer: cleanAnswer,
    citationSegments,
    citedReferences,
    acceptedCount,
    rejectedCount,
  };
}

/** 流式显示阶段隐藏已完成的内部引用标记，最终位置由结构化结果接管。 */
export function stripInlineCitationMarkersForDisplay(answer: string): string {
  const markers = findCitationMarkers(answer);
  if (markers.length === 0) return answer;
  let cursor = 0;
  let clean = "";
  for (const marker of markers) {
    clean += answer.slice(cursor, marker.start);
    cursor = marker.end;
  }
  return clean + answer.slice(cursor);
}
