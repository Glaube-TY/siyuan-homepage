export const DEFAULT_SIYUAN_TOOL_MAX_ITEMS = 50;
export const DEFAULT_SIYUAN_TOOL_MAX_CHARS = 12000;

export interface TruncatedText {
  text: string;
  truncated: boolean;
  originalChars: number;
}

export interface TruncatedArray<T> {
  items: T[];
  truncated: boolean;
  originalCount: number;
  hasMore: boolean;
}

export function clampMaxItems(value: unknown, fallback = DEFAULT_SIYUAN_TOOL_MAX_ITEMS): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(500, Math.max(1, n));
}

export function clampMaxChars(value: unknown, fallback = DEFAULT_SIYUAN_TOOL_MAX_CHARS): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(100000, Math.max(100, n));
}

export function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function truncateText(value: unknown, maxChars: number = DEFAULT_SIYUAN_TOOL_MAX_CHARS): TruncatedText {
  const text = safeString(value);
  if (text.length <= maxChars) {
    return { text, truncated: false, originalChars: text.length };
  }
  return {
    text: text.slice(0, Math.max(0, maxChars - 20)) + "\n...[truncated]",
    truncated: true,
    originalChars: text.length,
  };
}

export function truncateArray<T>(items: readonly T[] | undefined, maxItems: number = DEFAULT_SIYUAN_TOOL_MAX_ITEMS): TruncatedArray<T> {
  const source = Array.isArray(items) ? items : [];
  const sliced = source.slice(0, maxItems);
  return {
    items: sliced,
    truncated: source.length > sliced.length,
    originalCount: source.length,
    hasMore: source.length > sliced.length,
  };
}

export function safeJsonPreview(value: unknown, maxChars: number = 2000): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = safeString(value);
  }
  return truncateText(text, maxChars).text;
}

export function normalizeSiyuanResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  if (typeof obj.code === "number" && "data" in obj) {
    return obj.data;
  }
  return value;
}

export function collectArrayCandidates(value: unknown): unknown[] {
  const normalized = normalizeSiyuanResponse(value);
  if (Array.isArray(normalized)) return normalized;
  if (!normalized || typeof normalized !== "object") return [];
  const obj = normalized as Record<string, unknown>;
  const candidates = [
    obj.items,
    obj.blocks,
    obj.docs,
    obj.results,
    obj.cards,
    obj.decks,
    obj.assets,
    obj.rows,
    obj.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function limitResultData(params: {
  data: unknown;
  maxItems?: number;
  maxChars?: number;
}): { data: unknown; truncated: boolean; originalCount?: number; originalChars?: number } {
  const maxItems = clampMaxItems(params.maxItems);
  const maxChars = clampMaxChars(params.maxChars);
  const data = normalizeSiyuanResponse(params.data);

  if (typeof data === "string") {
    const text = truncateText(data, maxChars);
    return {
      data: text.text,
      truncated: text.truncated,
      originalChars: text.originalChars,
    };
  }

  if (Array.isArray(data)) {
    const arr = truncateArray(data, maxItems);
    return {
      data: arr.items,
      truncated: arr.truncated,
      originalCount: arr.originalCount,
    };
  }

  const text = safeJsonPreview(data, maxChars);
  const truncated = safeString(data).length > maxChars || text.endsWith("...[truncated]");
  return { data: truncated ? text : data, truncated };
}
