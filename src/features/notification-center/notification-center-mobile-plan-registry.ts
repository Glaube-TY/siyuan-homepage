import type { MobileNotificationPlanProvider } from "./types";

const providers = new Map<string, MobileNotificationPlanProvider>();

export function registerMobileNotificationPlanProvider(provider: MobileNotificationPlanProvider): () => void {
  if (!provider.id.trim()) throw new Error("移动通知计划 provider id 不能为空。");
  if (!provider.source.trim()) throw new Error("移动通知计划 provider source 不能为空。");
  providers.set(provider.id, provider);
  return () => {
    if (providers.get(provider.id) === provider) providers.delete(provider.id);
  };
}

export function getMobileNotificationPlanProviders(): MobileNotificationPlanProvider[] {
  return [...providers.values()];
}

export function clearMobileNotificationPlanProviders(): void {
  providers.clear();
}
