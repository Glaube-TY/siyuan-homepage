import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import {
  clampMaxChars,
  clampMaxItems,
  limitResultData,
  normalizeSiyuanResponse,
} from "./siyuan-output-utils.impl";

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[invalid_args] 缺少必填参数：${field}`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function requireStringArray(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`[invalid_args] 缺少必填数组参数：${field}`);
  }
  const items = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (items.length === 0) {
    throw new Error(`[invalid_args] ${field} 不能为空。`);
  }
  if (items.length > maxItems) {
    throw new Error(`[invalid_args] ${field} 最多允许 ${maxItems} 项。`);
  }
  return items;
}

export function outputForAction(action: string, data: unknown, options?: {
  maxItems?: number;
  maxChars?: number;
  meta?: Record<string, unknown>;
}): SiyuanToolOutput {
  const limited = limitResultData({
    data: normalizeSiyuanResponse(data),
    maxItems: clampMaxItems(options?.maxItems),
    maxChars: clampMaxChars(options?.maxChars),
  });
  return {
    action,
    data: limited.data,
    truncated: limited.truncated || undefined,
    hasMore: limited.truncated || undefined,
    meta: {
      ...(limited.originalCount !== undefined ? { originalCount: limited.originalCount } : {}),
      ...(limited.originalChars !== undefined ? { originalChars: limited.originalChars } : {}),
      ...(options?.meta ?? {}),
    },
  };
}

export function compactPayload(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
