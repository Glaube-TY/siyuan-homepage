/**
 * 模型提供商预设
 * 用于 UI 添加新提供商时的模板
 *
 * 内置入口：MiMo API / MiMo Coding Plan / DeepSeek API / Kimi API / Kimi Coding / 自定义
 * 底层统一 OpenAI-compatible 协议
 */

import type { KbChatProviderConfig } from "../types/settings";

/** 预设类型 */
export type ModelProviderPreset = {
  /** 预设 ID */
  id: string;
  /** 显示名称 */
  label: string;
  /** 描述 */
  description: string;
  /** 预设配置（不含 id，添加时会生成） */
  provider: Omit<KbChatProviderConfig, "id"> & { id?: string };
};

/** 提供商预设列表 */
export const MODEL_PROVIDER_PRESETS: ModelProviderPreset[] = [
  {
    id: "mimo-api",
    label: "MiMo API",
    description: "小米 MiMo 官方 API，自动填入官方 BaseURL",
    provider: {
      name: "MiMo API",
      type: "mimo-api",
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "",
      enabled: true,
      models: [
        {
          id: "",
          name: "请填写模型 ID",
          temperature: 0.3,
          default: true,
          enabled: false,
        },
      ],
    },
  },
  {
    id: "mimo-coding-plan",
    label: "MiMo Coding Plan",
    description: "小米 MiMo Coding Plan（Token 计划），自动填入官方 BaseURL",
    provider: {
      name: "MiMo Coding Plan",
      type: "mimo-coding-plan",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      apiKey: "",
      enabled: true,
      models: [
        {
          id: "",
          name: "请填写模型 ID",
          temperature: 0.3,
          default: true,
          enabled: false,
        },
      ],
    },
  },
  {
    id: "deepseek-api",
    label: "DeepSeek API",
    description: "DeepSeek 官方 API，自动填入官方 BaseURL",
    provider: {
      name: "DeepSeek API",
      type: "deepseek-api",
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      enabled: true,
      models: [
        {
          id: "deepseek-chat",
          name: "DeepSeek Chat",
          temperature: 0.3,
          default: true,
          enabled: true,
        },
      ],
    },
  },
  {
    id: "kimi-api",
    label: "Kimi API",
    description: "Moonshot AI Kimi 官方 API，自动填入官方 BaseURL",
    provider: {
      name: "Kimi API",
      type: "kimi-api",
      baseUrl: "https://api.moonshot.cn/v1",
      apiKey: "",
      enabled: true,
      models: [
        {
          id: "kimi-k2.6",
          name: "Kimi K2.6",
          temperature: 1,
          default: true,
          enabled: true,
          providerNativeAgentCompatibility: {
            temperatureParamStrategy: "omit",
          },
        },
        {
          id: "kimi-k2.5",
          name: "Kimi K2.5",
          temperature: 1,
          default: false,
          enabled: true,
          providerNativeAgentCompatibility: {
            temperatureParamStrategy: "omit",
          },
        },
      ],
    },
  },
  {
    id: "kimi-coding",
    label: "Kimi Coding",
    description: "Kimi Coding 专用入口，自动填入官方 BaseURL",
    provider: {
      name: "Kimi Coding",
      type: "kimi-coding",
      baseUrl: "https://api.kimi.com/coding/v1",
      apiKey: "",
      enabled: true,
      models: [
        {
          id: "kimi-for-coding",
          name: "Kimi for Coding",
          temperature: 0.3,
          default: true,
          enabled: true,
        },
      ],
    },
  },
  {
    id: "openai-compatible",
    label: "自定义 OpenAI-compatible",
    description: "兼容 OpenAI API 格式的自定义接口，需填写 Base URL",
    provider: {
      name: "自定义接口",
      type: "openai-compatible",
      baseUrl: "",
      apiKey: "",
      enabled: true,
      models: [
        {
          id: "",
          name: "请填写模型 ID",
          temperature: 0.3,
          default: false,
          enabled: false,
        },
      ],
    },
  },
];

/** 根据预设 ID 获取预设 */
export function getProviderPresetById(id: string): ModelProviderPreset | undefined {
  return MODEL_PROVIDER_PRESETS.find((p) => p.id === id);
}

/** 生成唯一的 provider ID */
export function generateUniqueProviderId(baseId: string, existingIds: string[]): string {
  if (!existingIds.includes(baseId)) {
    return baseId;
  }
  let counter = 1;
  let newId = `${baseId}-${counter}`;
  while (existingIds.includes(newId)) {
    counter++;
    newId = `${baseId}-${counter}`;
  }
  return newId;
}
