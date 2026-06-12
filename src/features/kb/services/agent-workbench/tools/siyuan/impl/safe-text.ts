/**
 * Safe text utilities for siyuan tools.
 * Sanitizes titles, snippets, and content for agent context visibility.
 */

const SIYUAN_BLOCK_ID_PATTERN = /\d{14}-[a-z0-9]{7}/i;
const HEX_32_PATTERN = /\b[0-9a-f]{32}\b/i;
const PATH_SEPARATOR_PATTERN = /[\\/]/;
const SY_FILE_PATTERN = /\.sy\b/i;

export const MAX_TITLE_CHARS = 80;
export const MAX_SNIPPET_CHARS = 3000;
export const SAFE_EMPTY_SNIPPET = "Content excerpt unavailable.";

export function containsInternalReference(value: string): boolean {
  return (
    SIYUAN_BLOCK_ID_PATTERN.test(value) ||
    HEX_32_PATTERN.test(value) ||
    PATH_SEPARATOR_PATTERN.test(value) ||
    SY_FILE_PATTERN.test(value)
  );
}

export function sanitizeTitle(value: unknown): string {
  if (typeof value !== "string") return "Untitled";
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) return "Untitled";
  if (containsInternalReference(title)) return "Untitled";
  return title.slice(0, MAX_TITLE_CHARS);
}

export function sanitizeSnippet(value: unknown): string {
  if (typeof value !== "string") return SAFE_EMPTY_SNIPPET;
  const snippet = value
    .replace(SIYUAN_BLOCK_ID_PATTERN, "[redacted-id]")
    .replace(HEX_32_PATTERN, "[redacted-id]")
    .replace(SY_FILE_PATTERN, "[redacted-file]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SNIPPET_CHARS);
  if (!snippet) return SAFE_EMPTY_SNIPPET;
  return snippet;
}

export function sanitizeContent(value: unknown): string {
  if (typeof value !== "string") return SAFE_EMPTY_SNIPPET;
  const content = value
    .replace(SIYUAN_BLOCK_ID_PATTERN, "[redacted-id]")
    .replace(HEX_32_PATTERN, "[redacted-id]")
    .replace(SY_FILE_PATTERN, "[redacted-file]")
    .trim();
  if (!content) return SAFE_EMPTY_SNIPPET;
  return content;
}
