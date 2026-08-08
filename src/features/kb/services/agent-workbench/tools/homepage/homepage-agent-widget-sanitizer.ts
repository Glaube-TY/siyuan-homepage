const SENSITIVE_KEY = /(^|[_-])(password|passwd|pwd|secret|appsecret|token|authtoken|accesstoken|refreshtoken|bearer|authorization|apikey|api_key|credential|cookie|privatekey|encryptedpassword|encryptedsecret|localauthtoken)([_-]|$)/i;
const SENSITIVE_QUERY_KEY = /token|key|password|secret|authorization|cookie|credential/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;
const UNIX_ABSOLUTE_PATH = /^\/(?:Users|home|root|mnt|data|var|opt|tmp)(?:\/|$)/;

export interface SanitizedLocalPath {
  configured: true;
  basename: string;
  pathKind: "local";
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").pop() || "已配置";
}

function sanitizeUrl(value: string): unknown {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString().replace(/%5BREDACTED%5D/gi, "[REDACTED]");
  } catch {
    return value;
  }
}

function isAbsoluteLocalPath(value: string): boolean {
  return WINDOWS_ABSOLUTE_PATH.test(value) || UNIX_ABSOLUTE_PATH.test(value);
}

export function isSensitiveHomepageConfigKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.replace(/([a-z])([A-Z])/g, "$1_$2"));
}

export function sanitizeWidgetConfigForAgent(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[已省略]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (isAbsoluteLocalPath(value)) {
      return { configured: true, basename: basename(value), pathKind: "local" } satisfies SanitizedLocalPath;
    }
    if (/^https?:\/\//i.test(value)) return sanitizeUrl(value);
    return value.length > 2000 ? `${value.slice(0, 1999)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeWidgetConfigForAgent(item, depth + 1));
  if (typeof value !== "object") return "[不可序列化]";

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveHomepageConfigKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    if (key.toLowerCase() === "headers" && child && typeof child === "object") {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitizeWidgetConfigForAgent(child, depth + 1);
  }
  return output;
}

export function assertHomepagePatchContainsNoSensitiveFields(value: unknown, path = "patch"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertHomepagePatchContainsNoSensitiveFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveHomepageConfigKey(key) || key.toLowerCase() === "headers") {
      throw new Error(`字段 ${path}.${key} 属于敏感配置，主页 Agent 不允许读取或修改`);
    }
    assertHomepagePatchContainsNoSensitiveFields(child, `${path}.${key}`);
  }
}
