/**
 * Inline diff — Chinese-friendly tokenization + LCS-based diff.
 * Produces per-character granularity for CJK, per-word for English.
 */

export type InlineDiffKind = "same" | "removed" | "added";

export interface InlineDiffPart {
  text: string;
  kind: InlineDiffKind;
}

/**
 * Tokenize text for inline diff:
 * - CJK characters (including punctuation): each char is a token
 * - English letters / digits / underscore / hyphen: grouped into word tokens
 * - Whitespace: each run of whitespace is a token
 * - Other punctuation/symbols: each char is a token
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const cp = ch.codePointAt(0) ?? 0;

    // CJK Unified Ideographs + CJK Extension A + common CJK ranges
    const isCJK =
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
      (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext-A
      (cp >= 0x3000 && cp <= 0x303f) || // CJK punctuation
      (cp >= 0xff00 && cp <= 0xffef) || // Fullwidth forms
      (cp >= 0x2e80 && cp <= 0x2fdf) || // CJK radicals
      (cp >= 0x31c0 && cp <= 0x31ef) || // CJK strokes
      (cp >= 0x3200 && cp <= 0x33ff) || // Enclosed CJK
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility
      (cp >= 0x20000 && cp <= 0x2a6df);   // CJK Ext-B+

    if (isCJK) {
      tokens.push(ch);
      i++;
    } else if (isWordChar(ch)) {
      let word = "";
      while (i < text.length && isWordChar(text[i])) {
        word += text[i];
        i++;
      }
      tokens.push(word);
    } else if (isWhitespace(ch)) {
      let ws = "";
      while (i < text.length && isWhitespace(text[i])) {
        ws += text[i];
        i++;
      }
      tokens.push(ws);
    } else {
      // Other punctuation / symbols — single char token
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

function isWordChar(ch: string): boolean {
  return /^[a-zA-Z0-9_\-]$/.test(ch);
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

/**
 * Longest Common Subsequence (LCS) on token arrays.
 * Returns the LCS length table for backtracking.
 */
function computeLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Backtrack LCS table to produce aligned diff pairs.
 */
function backtrackLcs(
  a: string[],
  b: string[],
  dp: number[][],
): Array<{ aIdx: number | null; bIdx: number | null }> {
  const pairs: Array<{ aIdx: number | null; bIdx: number | null }> = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      pairs.unshift({ aIdx: i - 1, bIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      pairs.unshift({ aIdx: null, bIdx: j - 1 });
      j--;
    } else {
      pairs.unshift({ aIdx: i - 1, bIdx: null });
      i--;
    }
  }
  return pairs;
}

/**
 * Build inline diff parts for a pair of old/new text strings.
 * Returns oldParts (what the old text looks like with removed markers)
 * and newParts (what the new text looks like with added markers).
 */
export function buildInlineDiffParts(
  oldText: string,
  newText: string,
): { oldParts: InlineDiffPart[]; newParts: InlineDiffPart[] } {
  if (oldText === newText) {
    return {
      oldParts: [{ text: oldText, kind: "same" }],
      newParts: [{ text: newText, kind: "same" }],
    };
  }

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  const dp = computeLcsTable(oldTokens, newTokens);
  const pairs = backtrackLcs(oldTokens, newTokens, dp);

  const oldParts: InlineDiffPart[] = [];
  const newParts: InlineDiffPart[] = [];

  for (const pair of pairs) {
    if (pair.aIdx !== null && pair.bIdx !== null) {
      // Same token
      const token = oldTokens[pair.aIdx];
      // Merge with previous same part if possible
      const lastOld = oldParts[oldParts.length - 1];
      const lastNew = newParts[newParts.length - 1];
      if (lastOld?.kind === "same" && lastNew?.kind === "same") {
        lastOld.text += token;
        lastNew.text += token;
      } else {
        oldParts.push({ text: token, kind: "same" });
        newParts.push({ text: token, kind: "same" });
      }
    } else if (pair.aIdx !== null) {
      // Removed from old
      oldParts.push({ text: oldTokens[pair.aIdx], kind: "removed" });
    } else if (pair.bIdx !== null) {
      // Added in new
      newParts.push({ text: newTokens[pair.bIdx], kind: "added" });
    }
  }

  // Post-process: merge consecutive same-kind parts
  return {
    oldParts: mergeConsecutiveParts(oldParts),
    newParts: mergeConsecutiveParts(newParts),
  };
}

function mergeConsecutiveParts(parts: InlineDiffPart[]): InlineDiffPart[] {
  if (parts.length <= 1) return parts;
  const merged: InlineDiffPart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.kind === part.kind) {
      last.text += part.text;
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}
