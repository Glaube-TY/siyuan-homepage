import { setKbSensitiveSecretCryptoPlugin } from "@/features/kb/services/settings/kb-sensitive-secret-crypto";

let pluginInstance: any = null;

export const NOTIFICATION_CENTER_PREMIUM_REQUIRED_MESSAGE = "通知中心为 VIP 专属功能，请在会员服务中开通后使用。";

export function setNotificationCenterPlugin(plugin: any): void {
  pluginInstance = plugin;
  setKbSensitiveSecretCryptoPlugin(plugin);
}

export function getNotificationCenterPlugin(): any {
  if (!pluginInstance) throw new Error("通知中心尚未初始化。");
  return pluginInstance;
}

export function isNotificationCenterFeatureAvailable(): boolean {
  return pluginInstance?.ADVANCED === true;
}

export function assertNotificationCenterFeatureAvailable(): void {
  if (isNotificationCenterFeatureAvailable()) return;
  throw Object.assign(new Error(NOTIFICATION_CENTER_PREMIUM_REQUIRED_MESSAGE), {
    code: "premium_required",
  });
}
