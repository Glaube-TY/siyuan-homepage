/**
 * Web HTTP API contract — input/output schemas for web_fetch.http_get / web_fetch.http_post actions.
 * Pure types and schemas. No side effects. No runtime logic.
 */
import { z } from "zod";

// ── Common ──

export const httpHeaderSchema = z.record(z.string(), z.string());

export const responseModeSchema = z.enum(["json", "text"]);

// ── http_get input ──

export const webHttpGetInputSchema = z.object({
  url: z.string().trim().min(1).max(2048).refine(
    (v) => /^https?:\/\//.test(v),
    { message: "只支持 http/https URL。" },
  ),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  responseMode: responseModeSchema.optional(),
  maxChars: z.number().int().min(1000).max(100000).optional(),
}).strict();

export type WebHttpGetInput = z.infer<typeof webHttpGetInputSchema>;

// ── http_post input ──

export const webHttpPostInputSchema = z.object({
  url: z.string().trim().min(1).max(2048).refine(
    (v) => /^https?:\/\//.test(v),
    { message: "只支持 http/https URL。" },
  ),
  headers: z.record(z.string(), z.string()).optional(),
  jsonBody: z.unknown().optional(),
  textBody: z.string().optional(),
  contentType: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  responseMode: responseModeSchema.optional(),
  maxChars: z.number().int().min(1000).max(100000).optional(),
}).strict().refine(
  (v) => v.jsonBody !== undefined || v.textBody !== undefined,
  { message: "jsonBody 或 textBody 至少提供一个。" },
);

export type WebHttpPostInput = z.infer<typeof webHttpPostInputSchema>;

// ── JSON Schema overrides (for Agent) ──

export const webHttpGetInputJsonSchema = {
  type: "object" as const,
  properties: {
    url: {
      type: "string",
      minLength: 1,
      maxLength: 2048,
      description: "请求 URL（http/https）。必须是公开可访问地址。",
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "自定义 HTTP header（可选）。Authorization 等敏感字段会被脱敏。",
    },
    query: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "URL 查询参数（可选），自动拼接到 URL 上。",
    },
    timeoutMs: {
      type: "integer",
      minimum: 1000,
      maximum: 60000,
      description: "超时毫秒数，默认 15000。",
    },
    responseMode: {
      type: "string",
      enum: ["json", "text"],
      description: "响应解析模式。json 自动解析 JSON，text 返回原始文本。默认 json。",
    },
    maxChars: {
      type: "integer",
      minimum: 1000,
      maximum: 100000,
      description: "响应体最大字符数，默认 30000。",
    },
  },
  required: ["url"],
  additionalProperties: false,
};

export const webHttpPostInputJsonSchema = {
  type: "object" as const,
  properties: {
    url: {
      type: "string",
      minLength: 1,
      maxLength: 2048,
      description: "请求 URL（http/https）。必须是公开可访问地址。",
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "自定义 HTTP header（可选）。Authorization 等敏感字段会被脱敏。",
    },
    jsonBody: {
      description: "JSON 请求体（与 textBody 二选一）。自动设置 Content-Type: application/json。",
    },
    textBody: {
      type: "string",
      description: "纯文本请求体（与 jsonBody 二选一）。需配合 contentType 使用。",
    },
    contentType: {
      type: "string",
      description: "Content-Type（仅 textBody 时需要）。默认 text/plain。",
    },
    timeoutMs: {
      type: "integer",
      minimum: 1000,
      maximum: 60000,
      description: "超时毫秒数，默认 15000。",
    },
    responseMode: {
      type: "string",
      enum: ["json", "text"],
      description: "响应解析模式。默认 json。",
    },
    maxChars: {
      type: "integer",
      minimum: 1000,
      maximum: 100000,
      description: "响应体最大字符数，默认 30000。",
    },
  },
  required: ["url"],
  anyOf: [
    { required: ["jsonBody"] },
    { required: ["textBody"] },
  ],
  additionalProperties: false,
};
