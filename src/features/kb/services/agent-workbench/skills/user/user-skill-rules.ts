/**
 * User skill rules: pure validation helpers.
 */

import { AUTO_ACTION_PATTERN, FORBIDDEN_FLOW_CONTROL_FIELDS } from "../../shared/flow-control";

const SAFE_ID_PATTERN = /^[a-z0-9_-]+$/;
const SAFE_FILENAME_PATTERN = /^[a-z0-9_-]+\.md$/;
const SAFE_TOOL_NAME_PATTERN = /^[a-z0-9_-]+$/;

const FORBIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set();

const FLOW_CONTROL_KEYWORDS_LOWER: ReadonlySet<string> = new Set(
  FORBIDDEN_FLOW_CONTROL_FIELDS.map((k) => k.toLowerCase()),
);

/**
 * Legacy architecture / flow-control tokens that must not appear in user skill
 * text. These are old system concepts that would confuse the agent if injected
 * as skill guidance. This is a skill text safety check, not a business flow
 * judgment.
 */
const LEGACY_FORBIDDEN_TOKENS_LOWER: ReadonlySet<string> = new Set([
  "assistantprogress",
  "maxsteps",
  "remainingstep",
  "remainingsteps",
  "budget",
  "dedup",
  "read_block_context",
  "internalmapping",
  "realpath",
  "realdocid",
  "realblockid",
]);

const FORBIDDEN_PHRASES: readonly string[] = [
  "agentic rag",
  "run v3",
  "hidden handle",
  "hidden handles",
  "internal mapping",
  "real path",
  "assistant progress",
];

const FLOW_BINDING_PATTERNS: readonly RegExp[] = [
  /必须先调用/,
  /必须使用/,
  /固定步骤/,
  /看到.*就调用/,
  /如果用户问.*就调用/,
  /不要让.*决定/,
  /\bmust call\b/i,
  /\bmust use\b/i,
  /\bfixed steps?\b/i,
  /\bif the user asks\b.*\bcall\b/i,
];

const FORBIDDEN_TOKENS_LOWER: ReadonlySet<string> = new Set([
  ...FORBIDDEN_TOOL_NAMES,
  ...FLOW_CONTROL_KEYWORDS_LOWER,
  ...LEGACY_FORBIDDEN_TOKENS_LOWER,
]);

const TOKEN_BOUNDARY_PATTERN = /(?:^|[^a-z0-9_])([a-z0-9_]+)(?:[^a-z0-9_]|$)/gi;

function normalizePhraseSeparators(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

  const normalized = normalizePhraseSeparators(text);
  for (const phrase of FORBIDDEN_PHRASES) {
    if (normalized.includes(phrase)) {
      found.push(phrase);
    }
  }

  for (const pattern of FLOW_BINDING_PATTERNS) {
    if (pattern.test(text) || pattern.test(normalized)) {
      found.push(`flow_binding:${pattern.source}`);
    }
  }

  return [...new Set(found)];
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
