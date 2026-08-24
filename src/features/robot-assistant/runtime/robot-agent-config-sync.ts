/**
 * 前端 → Kernel 的 Agent 模型配置同步。
 *
 * 复用 AI 知识库已经配置的模型；机器人可以跟随知识库当前模型，也可以显式指定。
 * 通过 `robot.syncAgentRuntimeConfig`（非敏感快照）+ `robot.syncAgentApiKey`
 * （API Key 进 Kernel Secret Vault，加密落盘）推送到 Kernel，满足方案 §Agent 模型配置复用。
 *
 * 本模块依赖浏览器端 KB settings service，仅在前端环境使用。
 */

import { getKbSettings } from "@/features/kb/services/settings/kb-settings-service";
import { resolveSelectedChatConfig } from "@/features/kb/services/settings/chat-provider-config";
import type { RobotKernelClient } from "./robot-kernel-client";

/** 同步当前选中模型配置与 API Key 到 Kernel；失败不抛错（下次同步兜底）。 */
export async function syncRobotAgentRuntimeConfig(kernel: RobotKernelClient): Promise<void> {
  if (!kernel.available) return;
  try {
    const kb = await getKbSettings();
    await kernel.call("robot.syncAgentWebSearchSettings", { settings: kb.webSearch });
    const rawRobotSettings = await kernel.call("robot.getSettings");
    const wrapped = rawRobotSettings && typeof rawRobotSettings === "object"
      ? rawRobotSettings as Record<string, unknown>
      : {};
    const robotSettings = wrapped.settings && typeof wrapped.settings === "object"
      ? wrapped.settings as Record<string, unknown>
      : wrapped;
    const useExplicitModel = robotSettings.agentModel === "explicit"
      && typeof robotSettings.agentModelProviderId === "string"
      && Boolean(robotSettings.agentModelProviderId.trim())
      && typeof robotSettings.agentModelId === "string"
      && Boolean(robotSettings.agentModelId.trim());
    const selected = resolveSelectedChatConfig(
      kb.chatProviders,
      useExplicitModel ? String(robotSettings.agentModelProviderId) : kb.selectedChatProviderId,
      useExplicitModel ? String(robotSettings.agentModelId) : kb.selectedChatModelId,
    );
    if (!selected.provider || !selected.model) return;

    const provider = selected.provider;
    const model = selected.model;
    await kernel.call("robot.syncAgentRuntimeConfig", {
      providerId: provider.id,
      providerType: provider.type,
      ...(typeof provider.baseUrl === "string" && provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      modelId: model.id,
      ...(typeof model.maxTokens === "number" && Number.isFinite(model.maxTokens) ? { maxTokens: model.maxTokens } : {}),
      ...(typeof model.temperature === "number" && Number.isFinite(model.temperature) ? { temperature: model.temperature } : {}),
    });

    // 必须同步空值：从云端模型切到本地无密钥模型时，需要清除上一提供商的旧密钥。
    const apiKey = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
    await kernel.call("robot.syncAgentApiKey", { apiKey });
  } catch {
    // 同步失败不阻断（例如 AI 知识库尚未配置）
  }
}
