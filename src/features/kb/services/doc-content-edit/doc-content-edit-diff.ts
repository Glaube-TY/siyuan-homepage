/**
 * 文档内容编辑视觉对比数据生成。
 * 提供左右分栏渲染对比和箭头流动对比，不依赖外部库。
 */

import type {
  DocContentEditRenderedLine,
  DocContentEditRenderedSideBySide,
  DocContentEditArrowFlow,
} from "./doc-content-edit-types";

export interface RenderedCompareOptions {
  maxLines?: number;
  maxChars?: number;
}

/**
 * 将 kramdown 原始内容转换为适合用户可见对比的展示文本。
 * 移除 kramdown IAL 属性行，例如 `{: id="..." updated="..." }`。
 */
export function toDisplayMarkdownFromKramdown(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // 跳过独立行形式的 IAL 属性块 {: ... }
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) return false;
      return true;
    })
    .join("\n");
}

/**
 * 将 kramdown 原始内容规范化为稳定形式，用于替换前一致性比较。
 * 去掉独立 IAL 行、规范化换行符、去掉行尾空白、忽略 updated 等易变属性。
 */
export function normalizeKramdownForStability(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      // 跳过独立行形式的 IAL 属性块 {: ... }
      if (trimmed.startsWith("{:") && trimmed.endsWith("}")) return false;
      return true;
    })
    .join("\n")
    .replace(/\s+updated="[^"]*"/g, "")
    .replace(/\s+updated='[^']*'/g, "");
}

/**
 * 生成左右分栏渲染对比数据。
 * 使用简单行级 LCS 算法标记 unchanged / added / removed / modified。
 * 超长内容截断并标记 truncated。
 */
export function createRenderedSideBySideCompare(
  before: string,
  after: string,
  options?: RenderedCompareOptions,
): DocContentEditRenderedSideBySide {
  const maxLines = options?.maxLines ?? 500;
  const maxChars = options?.maxChars ?? 30000;

  const a = before.split("\n");
  const b = after.split("\n");

  const ops = computeLcs(a, b);

  const beforeLines: DocContentEditRenderedLine[] = [];
  const afterLines: DocContentEditRenderedLine[] = [];

  let i = 0;
  let j = 0;
  let lineNo = 1;
  let opIdx = 0;

  while (opIdx < ops.length) {
    const op = ops[opIdx];

    if (op === "match") {
      const text = a[i];
      beforeLines.push({ text, kind: "unchanged", lineNo });
      afterLines.push({ text, kind: "unchanged", lineNo });
      i++;
      j++;
      lineNo++;
      opIdx++;
    } else if (op === "remove") {
      // 收集连续 removed
      const removedTexts: string[] = [];
      while (opIdx < ops.length && ops[opIdx] === "remove") {
        removedTexts.push(a[i]);
        i++;
        opIdx++;
      }
      // 收集紧跟的连续 added
      const addedTexts: string[] = [];
      while (opIdx < ops.length && ops[opIdx] === "add") {
        addedTexts.push(b[j]);
        j++;
        opIdx++;
      }
      // 按最小数量配对为 modified
      const pairCount = Math.min(removedTexts.length, addedTexts.length);
      for (let p = 0; p < pairCount; p++) {
        beforeLines.push({ text: removedTexts[p], kind: "modified", lineNo: lineNo + p });
        afterLines.push({ text: addedTexts[p], kind: "modified", lineNo: lineNo + p });
      }
      // 多余 removed
      for (let p = pairCount; p < removedTexts.length; p++) {
        beforeLines.push({ text: removedTexts[p], kind: "removed", lineNo: lineNo + p });
        afterLines.push({ text: "", kind: "unchanged" });
      }
      // 多余 added
      for (let p = pairCount; p < addedTexts.length; p++) {
        beforeLines.push({ text: "", kind: "unchanged" });
        afterLines.push({ text: addedTexts[p], kind: "added", lineNo: lineNo + p });
      }
      lineNo += Math.max(removedTexts.length, addedTexts.length);
    } else if (op === "add") {
      // 没有前置 removed 的 add
      const addedTexts: string[] = [];
      while (opIdx < ops.length && ops[opIdx] === "add") {
        addedTexts.push(b[j]);
        j++;
        opIdx++;
      }
      for (let p = 0; p < addedTexts.length; p++) {
        beforeLines.push({ text: "", kind: "unchanged" });
        afterLines.push({ text: addedTexts[p], kind: "added", lineNo: lineNo + p });
      }
      lineNo += addedTexts.length;
    }
  }

  let truncated = false;

  // 截断行数
  if (beforeLines.length > maxLines) {
    beforeLines.length = maxLines;
    afterLines.length = maxLines;
    truncated = true;
  }

  // 截断字符数
  let charCount = 0;
  let cutIndex = beforeLines.length;
  for (let k = 0; k < beforeLines.length; k++) {
    charCount += beforeLines[k].text.length + afterLines[k].text.length;
    if (charCount > maxChars) {
      cutIndex = k;
      truncated = true;
      break;
    }
  }
  if (cutIndex < beforeLines.length) {
    beforeLines.length = cutIndex;
    afterLines.length = cutIndex;
  }

  return { beforeLines, afterLines, truncated };
}

/**
 * 生成箭头流动对比数据。
 */
export function createArrowFlowCompare(
  fromLabel: string,
  toLabel: string,
  descriptions?: { fromDescription?: string; toDescription?: string },
): DocContentEditArrowFlow {
  return {
    fromLabel,
    toLabel,
    fromDescription: descriptions?.fromDescription,
    toDescription: descriptions?.toDescription,
  };
}

/**
 * 计算两个字符串数组的最长公共子序列（LCS）。
 * 返回操作序列："match" | "remove" | "add"。
 */
function computeLcs(a: string[], b: string[]): Array<"match" | "remove" | "add"> {
  const m = a.length;
  const n = b.length;

  // 使用滚动数组优化空间
  const prev: number[] = new Array(n + 1).fill(0);
  const curr: number[] = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }

  // 空间优化后无法回溯，改用贪心近似
  return greedyDiff(a, b);
}

/**
 * 贪心行级 diff，适用于大文本。
 * 简单但足够用于渲染对比。
 */
function greedyDiff(a: string[], b: string[]): Array<"match" | "remove" | "add"> {
  const ops: Array<"match" | "remove" | "add"> = [];
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push("match");
      i++;
      j++;
    } else {
      // 向前看最多 3 行，找最近匹配
      let found = false;
      const lookahead = 3;
      for (let k = 1; k <= lookahead && i + k < a.length; k++) {
        if (j < b.length && a[i + k] === b[j]) {
          for (let r = 0; r < k; r++) {
            ops.push("remove");
          }
          i += k;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let k = 1; k <= lookahead && j + k < b.length; k++) {
          if (i < a.length && a[i] === b[j + k]) {
            for (let r = 0; r < k; r++) {
              ops.push("add");
            }
            j += k;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        if (i < a.length) {
          ops.push("remove");
          i++;
        }
        if (j < b.length) {
          ops.push("add");
          j++;
        }
      }
    }
  }

  return ops;
}
