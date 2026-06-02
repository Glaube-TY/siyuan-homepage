/**
 * User skill rules: 纯校验函数。
 */

import { FORBIDDEN_FLOW_CONTROL_FIELDS, AUTO_ACTION_PATTERN } from "../flow-control";

const SAFE_ID_PATTERN = /^[a-z0-9_-]+$/;
const SAFE_FILENAME_PATTERN = /^[a-z0-9_-]+\.md$/;
const SAFE_TOOL_NAME_PATTERN = /^[a-z0-9_-]+$/;

const FORBIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read_docs",
  "read_block_context",
]);

const FLOW_CONTROL_KEYWORDS_LOWER: ReadonlySet<string> = new Set(
  FORBIDDEN_FLOW_CONTROL_FIELDS.map((k) => k.toLowerCase()),
);

const FORBIDDEN_TOKENS_LOWER: ReadonlySet<string> = new Set([
  ...FORBIDDEN_TOOL_NAMES,
  ...FLOW_CONTROL_KEYWORDS_LOWER,
]);

const TOKEN_BOUNDARY_PATTERN = /(?:^|[^a-z0-9_])([a-z0-9_]+)(?:[^a-z0-9_]|$)/gi;

export function isValidUserSkillId(id: string): boolean {
  if (!id || id.length > 100) return false;
  if (id.includes("..") || id.includes("/") || id.includes("\\")) return false;
  return SAFE_ID_PATTERN.test(id);
}

export function isValidUserSkillFilename(filename: string): boolean {
  if (!filename || filename.length > 100) return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return SAFE_FILENAME_PATTERN.test(filename);
}

export function isValidUserSkillToolName(name: string): boolean {
  if (!name || !SAFE_TOOL_NAME_PATTERN.test(name)) return false;
  if (FORBIDDEN_TOOL_NAMES.has(name)) return false;
  if (FLOW_CONTROL_KEYWORDS_LOWER.has(name.toLowerCase())) return false;
  if (AUTO_ACTION_PATTERN.test(name)) return false;
  return true;
}

export function isForbiddenToolName(name: string): boolean {
  return FORBIDDEN_TOOL_NAMES.has(name);
}

export function isFlowControlKeyword(name: string): boolean {
  if (FLOW_CONTROL_KEYWORDS_LOWER.has(name.toLowerCase())) return true;
  return AUTO_ACTION_PATTERN.test(name);
}

function extractTokens(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  const matches = lower.matchAll(TOKEN_BOUNDARY_PATTERN);
  for (const match of matches) {
    const token = match[1];
    if (token && token.length > 2) {
      tokens.push(token);
    }
  }
  return tokens;
}

export function detectForbiddenTextTokens(text: string): string[] {
  const found: string[] = [];
  const tokens = extractTokens(text);
  const tokenSet = new Set(tokens);

  for (const forbidden of FORBIDDEN_TOKENS_LOWER) {
    if (tokenSet.has(forbidden)) {
      found.push(forbidden);
    }
  }

  if (AUTO_ACTION_PATTERN.test(text)) {
    found.push("AUTO_*ACTION");
  }

  return found;
}

export function validateUserSkillTitle(title: string): string | null {
  if (!title) return null;
  if (title.length > 100) return "Title exceeds 100 characters.";
  if (/[\n\r\x00-\x1f]/.test(title)) return "Title contains control characters.";

  const forbidden = detectForbiddenTextTokens(title);
  if (forbidden.length > 0) {
    return "Title contains forbidden token.";
  }

  return null;
}
