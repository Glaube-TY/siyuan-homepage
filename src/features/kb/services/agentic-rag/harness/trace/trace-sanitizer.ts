const FORBIDDEN_TRACE_KEYS = new Set([
  "docId",
  "docIds",
  "blockId",
  "blockIds",
  "box",
  "path",
  "root_id",
  "sql",
  "SQL",
  "content",
  "rawContent",
]);

export function sanitizeTracePayload(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_TRACE_KEYS.has(key)) {
      result[key] = Array.isArray(value) ? { count: value.length } : "[redacted]";
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === "object"
          ? sanitizeTracePayload(item as Record<string, unknown>)
          : item
      );
      continue;
    }
    if (value && typeof value === "object") {
      result[key] = sanitizeTracePayload(value as Record<string, unknown>);
      continue;
    }
    result[key] = value;
  }
  return result;
}
