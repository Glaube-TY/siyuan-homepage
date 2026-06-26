import type { NotifyBridgeEvent } from "./types";

function getByPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) return "";
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeJsonString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function buildTemplateContext(event: NotifyBridgeEvent): Record<string, unknown> {
  const time = event.createdAt ?? new Date().toISOString();
  return {
    title: event.title,
    content: event.content,
    level: event.level ?? "info",
    source: event.source ?? "manual",
    sourceId: event.sourceId ?? "",
    url: event.url ?? "",
    time,
    date: time.slice(0, 10),
    extra: event.extra ?? {},
  };
}

export function renderNotifyBridgeJsonTemplate(
  template: string,
  event: NotifyBridgeEvent,
): Record<string, unknown> {
  const context = buildTemplateContext(event);
  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, rawPath: string) => {
    const path = rawPath.split(".");
    const value = path[0] === "extra"
      ? getByPath(context.extra, path.slice(1))
      : context[path[0]];
    return escapeJsonString(stringifyTemplateValue(value));
  });

  try {
    const parsed = JSON.parse(rendered);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("模板渲染结果必须是 JSON 对象。");
    }
    return parsed;
  } catch {
    throw Object.assign(new Error("自定义 JSON 模板不是合法 JSON，已取消发送。"), {
      code: "invalid_template_json",
    });
  }
}
