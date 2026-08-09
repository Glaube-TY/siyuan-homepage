/**
 * Robot Agent 运行时模型配置快照。
 * 前端在 AI Provider 保存 / 选中模型改变 / Robot 开启 / Robot 模型选择改变时
 * 通过 `robot.syncAgentRuntimeConfig` 推送到 Kernel。
 * 只含非敏感字段；API Key 走 Robot Secret Vault，不进入快照。
 */
export interface RobotAgentRuntimeConfigSnapshot {
  providerId: string;
  providerType: string;
  baseUrl?: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  nativeCompatibility?: Record<string, unknown>;
}

export interface RobotModelConfigStore {
  get(): Promise<RobotAgentRuntimeConfigSnapshot | null>;
  set(snapshot: RobotAgentRuntimeConfigSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export function normalizeRobotAgentRuntimeConfig(raw: unknown): RobotAgentRuntimeConfigSnapshot | null {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (typeof value.providerId !== "string" || !value.providerId || typeof value.modelId !== "string" || !value.modelId) {
    return null;
  }
  const snapshot: RobotAgentRuntimeConfigSnapshot = {
    providerId: value.providerId,
    providerType: typeof value.providerType === "string" && value.providerType ? value.providerType : "openai-compatible",
    modelId: value.modelId,
    ...(typeof value.baseUrl === "string" && value.baseUrl ? { baseUrl: value.baseUrl } : {}),
    ...(typeof value.maxTokens === "number" && Number.isFinite(value.maxTokens) ? { maxTokens: Math.round(value.maxTokens) } : {}),
    ...(typeof value.temperature === "number" && Number.isFinite(value.temperature) ? { temperature: value.temperature } : {}),
    ...(value.nativeCompatibility && typeof value.nativeCompatibility === "object" ? { nativeCompatibility: value.nativeCompatibility as Record<string, unknown> } : {}),
  };
  return snapshot;
}
