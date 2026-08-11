/**
 * OpenAI-compatible Provider URL 解析（环境无关纯函数）。
 *
 * 从 model-provider-factory 抽出，供前端（model-provider-factory / agent-provider-factory）
 * 与 Kernel Robot（kernel-robot-agent-runtime）共同使用。
 * 本文件禁止 import：@ai-sdk/*、Svelte、window、settings service、debug 系统。
 */

import type { KbChatProviderConfig, KbChatProviderType } from "../../../types/settings";

/**
 * 规范化文本值
 * 统一对字符串字段做 trim 处理
 * @param value 原始值
 * @param fallback 回退值（默认为空字符串）
 * @returns trim 后的字符串
 */
export function normalizeText(value: unknown, fallback = ""): string {
  return String(value || fallback).trim();
}

/**
 * 规范化 OpenAI-compatible Base URL 的通用逻辑
 * - 去掉末尾斜杠
 * - 兼容用户填到 /chat/completions 的情况，截断到 /v1
 * - 确保以 /v1 结尾
 */
export function normalizeOpenAICompatibleBaseUrl(baseUrl: string): string {
  let normalized = normalizeText(baseUrl);
  normalized = normalized.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    normalized = normalized.slice(0, -"/chat/completions".length);
  }
  if (!normalized.endsWith("/v1")) {
    if (normalized.endsWith("/v1/")) {
      normalized = normalized.replace(/\/+$/, "");
    } else {
      normalized = `${normalized}/v1`;
    }
  }
  return normalized;
}

export const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<KbChatProviderType, string>> = {
  "kimi-api": "https://api.moonshot.cn/v1",
  "kimi-coding": "https://api.kimi.com/coding/v1",
  "deepseek-api": "https://api.deepseek.com/v1",
  "mimo-api": "https://api.xiaomimimo.com/v1",
  "mimo-coding-plan": "https://token-plan-cn.xiaomimimo.com/v1",
};

export function resolveOpenAICompatibleBaseUrlForProvider(provider: KbChatProviderConfig): string {
  const raw = normalizeText(provider.baseUrl);
  if (!raw) {
    const defaultUrl = PROVIDER_DEFAULT_BASE_URLS[provider.type];
    if (defaultUrl) {
      return defaultUrl;
    }
    return "";
  }
  return normalizeOpenAICompatibleBaseUrl(raw);
}
