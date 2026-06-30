/**
 * Conservative text sanitizer for persisted summaries.
 *
 * - Trims and truncates to maxChars.
 * - Redacts absolute paths (Windows and Unix-like).
 * - Redacts sensitive tokens: api_key, apikey, secret, token, password,
 *   authorization, bearer.
 *
 * Does not throw.
 */

const SENSITIVE_STRING_KEYS = [
  "api_key",
  "apikey",
  "secret",
  "token",
  "password",
  "authorization",
  "bearer",
];

export function sanitizePersistedSummaryText(
  value: unknown,
  maxChars: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  let text = value.trim();
  if (!text) return undefined;

  // Authorization: Bearer <token>
  text = text.replace(/\b(Authorization)\s*:\s*(Bearer\s+[^\s,]+)/gi, "$1: [redacted]");

  // Sensitive key=value / key: value patterns
  const sensitivePattern = new RegExp(
    `\\b(${SENSITIVE_STRING_KEYS.join("|")})\\s*[:=]\\s*[^\\s&,"]+`,
    "gi",
  );
  text = text.replace(sensitivePattern, "$1=[redacted]");

  // Absolute paths
  text = text.replace(/\b[a-zA-Z]:[\\/](?:[^\\/\s]+[\\/])*[^\\/\s]*\b/g, "[path]");
  // Unix-like absolute paths: only match after start/whitespace/punctuation to avoid URLs like https://example.com/path
  text = text.replace(/(^|[\s(\[\{"'=,;:])(\/[^/\s]+(?:\/[^/\s]+)*\/?)/g, "$1[path]");

  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 3))}...`;
  }
  return text || undefined;
}
