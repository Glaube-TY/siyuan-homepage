export function maskChatActionId(value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

export function previewChatActionContent(value: string | undefined, maxChars = 80): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function sanitizeChatActionErrorMessage(value: unknown, fallback = "操作失败，请稍后重试。"): string {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : fallback;
  return message
    .replace(/[A-Za-z]:\\[^\s]+/g, "[local-path]")
    .replace(/(app_secret|secret|token|webhook)[=:]\S+/gi, "$1=[redacted]")
    .split("\n")[0]
    .trim()
    .slice(0, 160) || fallback;
}

export function normalizeChatActionList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)));
  }
  if (typeof value === "string") {
    return Array.from(new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)));
  }
  return [];
}

