import { isEncryptedSecret } from "@/features/kb/services/settings/kb-sensitive-secret-crypto";

const SECRET_VALUE = "***";
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const ENCRYPTED_PATTERN = /enc:v1:[A-Za-z0-9+/=:_-]+/g;
const SIGN_PATTERN = /("?(?:sign|secret|token|authorization|api[-_]?key)"?\s*[:=]\s*)("[^"]*"|[^\s,;}]*)/gi;

export function isSensitiveHeaderKey(key: string): boolean {
  return /(authorization|token|secret|apikey|api-key|x-api-key|key|password)/i.test(key);
}

export function redactSecret(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未配置";
  if (isEncryptedSecret(value)) return "已配置";
  return SECRET_VALUE;
}

export function redactUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "未配置";
  if (isEncryptedSecret(value)) return "已配置 Webhook";

  try {
    const url = new URL(value);
    const tail = (url.pathname + url.search).replace(/[/?#]+$/g, "").slice(-4);
    return `${url.origin}${url.pathname.replace(/[^/]*$/, "")}****${tail || "****"}`;
  } catch {
    return "已配置 Webhook";
  }
}

export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    result[key] = isSensitiveHeaderKey(key) || isEncryptedSecret(value) ? SECRET_VALUE : value;
  }
  return result;
}

export function redactMessage(message: unknown): string {
  const raw = message instanceof Error ? message.message : String(message ?? "");
  return raw
    .replace(ENCRYPTED_PATTERN, "[ENCRYPTED_SECRET]")
    .replace(URL_PATTERN, (url) => redactUrl(url))
    .replace(SIGN_PATTERN, (_match, prefix) => `${prefix}${SECRET_VALUE}`)
    .slice(0, 500);
}
