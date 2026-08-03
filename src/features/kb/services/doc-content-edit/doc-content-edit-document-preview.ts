/**
 * 文档级内容预览辅助函数。
 *
 * 这些函数只构造确认框中的拟议结果，不参与实际写入。所有块级内容操作
 * 都以整篇文档为坐标系，避免把目标块误显示为“第 1 行”。
 */

const TRAILING_IAL = /(?:\r?\n)?(\{:\s[^\r\n]*\})\s*$/;
const IAL_LINE = /^[ \t]*\{:\s[^\r\n]*\}[ \t]*$/gm;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

interface LocatedBlockFragment {
  start: number;
  end: number;
  fragment: string;
  ial?: string;
}

function replaceRange(source: string, range: LocatedBlockFragment, replacement: string): string {
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

function readIalId(ial: string | undefined): string | undefined {
  return ial?.match(/(?:^|\s)id="([^"]+)"(?:\s|})/)?.[1];
}

function locateBlockFragment(
  documentKramdown: string,
  blockKramdown: string,
): LocatedBlockFragment | undefined {
  const source = normalizeNewlines(documentKramdown);
  const snapshot = normalizeNewlines(blockKramdown).trim();
  const snapshotIalMatch = snapshot.match(TRAILING_IAL);
  const blockId = readIalId(snapshotIalMatch?.[1]);

  if (blockId) {
    const ialMatches = Array.from(source.matchAll(IAL_LINE));
    const targetIndex = ialMatches.findIndex((match) => readIalId(match[0].trim()) === blockId);
    if (targetIndex >= 0) {
      const target = ialMatches[targetIndex];
      const ialStart = target.index ?? 0;
      const ialEnd = ialStart + target[0].length;
      const snapshotContent = snapshotIalMatch
        ? snapshot.slice(0, snapshotIalMatch.index).trimEnd()
        : "";

      // 同一块的 IAL 属性顺序可能在两次 API 返回间变化；优先用块 ID
      // 锚定 IAL，再从 IAL 向前匹配正文，避免整段字符串精确匹配失败。
      let contentEnd = ialStart;
      if (contentEnd > 0 && source[contentEnd - 1] === "\n") contentEnd--;
      let start = snapshotContent
        && source.slice(Math.max(0, contentEnd - snapshotContent.length), contentEnd) === snapshotContent
        ? contentEnd - snapshotContent.length
        : targetIndex > 0
          ? (ialMatches[targetIndex - 1].index ?? 0) + ialMatches[targetIndex - 1][0].length
          : 0;
      while (start < ialStart && source[start] === "\n") start++;

      return {
        start,
        end: ialEnd,
        fragment: source.slice(start, ialEnd),
        ial: target[0].trim(),
      };
    }
  }

  const exactIndex = source.indexOf(snapshot);
  if (exactIndex < 0) return undefined;
  return {
    start: exactIndex,
    end: exactIndex + snapshot.length,
    fragment: snapshot,
    ial: snapshotIalMatch?.[1],
  };
}

function contentWithOriginalIal(markdown: string, ial?: string): string {
  const content = normalizeNewlines(markdown).trimEnd();
  return ial ? `${content}\n${ial}` : content;
}

export function withDocumentTitle(title: string, documentKramdown: string): string {
  const safeTitle = title.replace(/[\r\n]+/g, " ").trim() || "未命名文档";
  const body = normalizeNewlines(documentKramdown).trim();
  return body ? `# ${safeTitle}\n\n${body}` : `# ${safeTitle}`;
}

export function previewUpdatedBlockInDocument(
  documentKramdown: string,
  blockKramdown: string,
  markdown: string,
): string | undefined {
  const source = normalizeNewlines(documentKramdown);
  const located = locateBlockFragment(source, blockKramdown);
  if (!located) return undefined;
  return replaceRange(source, located, contentWithOriginalIal(markdown, located.ial));
}

export function previewInsertedBlockInDocument(
  documentKramdown: string,
  referenceBlockKramdown: string,
  markdown: string,
  position: "before" | "after" | "child",
): string | undefined {
  const source = normalizeNewlines(documentKramdown);
  const located = locateBlockFragment(source, referenceBlockKramdown);
  if (!located) return undefined;
  const inserted = normalizeNewlines(markdown).trim();
  if (!inserted) return source;

  const replacement = position === "before"
    ? `${inserted}\n\n${located.fragment}`
    : `${located.fragment}\n\n${inserted}`;
  return replaceRange(source, located, replacement);
}

export function previewDeletedBlocksInDocument(
  documentKramdown: string,
  blockKramdowns: string[],
): string {
  let result = normalizeNewlines(documentKramdown);
  const snapshots = blockKramdowns
    .map((snapshot) => normalizeNewlines(snapshot).trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const snapshot of snapshots) {
    const located = locateBlockFragment(result, snapshot);
    if (located) result = replaceRange(result, located, "");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}
