import { getFrontend, platformUtils } from "siyuan";
import { isInMobileApp } from "@/api";

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function systemConfig(): Record<string, unknown> {
  return ((window as any)?.siyuan?.config?.system ?? {}) as Record<string, unknown>;
}

export function getNotificationDeviceId(): string {
  const system = systemConfig();
  const explicit = typeof system.id === "string" ? system.id.trim() : "";
  if (explicit) return explicit;
  const seed = [system.os, system.name, system.container, navigator.userAgent]
    .filter((value) => value != null)
    .map(String)
    .join("|");
  return `device-${stableHash(seed || "siyuan-homepage")}`;
}

export function getSafeNotificationDeviceFileName(): string {
  return getNotificationDeviceId().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "unknown-device";
}

export function getNotificationDevicePlatform(): "android" | "ios" | "harmony" | "desktop" | "browser" {
  const system = systemConfig();
  const os = String(system.os ?? "").toLowerCase();
  const container = String(system.container ?? "").toLowerCase();
  let isHuawei = false;
  try {
    isHuawei = Boolean(platformUtils.isHuawei?.());
  } catch {
    isHuawei = false;
  }
  if (container === "harmony" || Boolean((window as any).JSHarmony) || isHuawei || /harmony|huawei|ohos/.test(os + "|" + container)) return "harmony";
  if (/android/.test(os) || platformUtils.isInAndroid?.()) return "android";
  if (/ios|iphone|ipad/.test(os) || platformUtils.isInIOS?.()) return "ios";
  if (isInMobileApp()) return "android";
  const frontend = getFrontend();
  return frontend === "desktop" || frontend === "browser-desktop" ? "desktop" : "browser";
}

export function isDesktopNotificationRuntime(): boolean {
  const frontend = getFrontend();
  return !isInMobileApp()
    && (frontend === "desktop" || frontend === "desktop-window" || frontend === "browser-desktop");
}

export function isHarmonyMobile(): boolean {
  const system = systemConfig();
  return String(system.container ?? "").toLowerCase() === "harmony" || Boolean((window as any).JSHarmony);
}

export function isMobileNotificationRuntime(): boolean {
  return isInMobileApp();
}

export type DesktopNotificationPermission = "unsupported" | "default" | "granted" | "denied";

export function getDesktopNotificationPermission(): DesktopNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const permission = window.Notification.permission;
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    const result = await window.Notification.requestPermission();
    if (result === "granted") return "granted";
    if (result === "denied") return "denied";
    return "default";
  } catch {
    return getDesktopNotificationPermission();
  }
}
