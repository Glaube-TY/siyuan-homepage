import type { NotificationEvent } from "../types";

function getByPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) return "";
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeJson(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

export function renderExternalJsonTemplate(template: string, event: NotificationEvent): Record<string, unknown> {
  const time = event.createdAt ?? new Date().toISOString();
  const context: Record<string, unknown> = {
    title: event.title,
    content: event.content,
    level: event.level ?? "info",
    source: event.source,
    sourceId: event.sourceId ?? "",
    url: event.url ?? "",
    time,
    date: time.slice(0, 10),
    extra: event.extra ?? {},
  };
  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, rawPath: string) => {
    const path = rawPath.split(".");
    const value = path[0] === "extra" ? getByPath(context.extra, path.slice(1)) : context[path[0]];
    return escapeJson(stringifyValue(value));
  });
  try {
    const parsed = JSON.parse(rendered);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error("自定义 JSON 模板不是合法 JSON，已取消发送。"), { code: "invalid_template_json" });
  }
}

