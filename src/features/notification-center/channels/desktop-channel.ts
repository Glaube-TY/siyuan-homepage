import {
  getDesktopNotificationPermission,
  isDesktopNotificationRuntime,
  requestDesktopNotificationPermission,
  type DesktopNotificationPermission,
} from "../notification-center-device";
import type { NotificationCenterSettings, NotificationEvent } from "../types";

function truncateContent(content: string, maxChars: number): string {
  const characters = Array.from(content);
  if (characters.length <= maxChars) return content;
  return `${characters.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
}

function getNotificationIcon(): string {
  try {
    const symbol = document.querySelector("svg defs symbol#iconhomepage");
    if (!symbol) return "/plugins/siyuan-homepage/icon.png";
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1024 1024");
    svg.setAttribute("xmlns", svgNS);
    svg.innerHTML = symbol.innerHTML;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const base64Svg = btoa(unescape(encodeURIComponent(svgStr)));
    return `data:image/svg+xml;base64,${base64Svg}`;
  } catch {
    return "/plugins/siyuan-homepage/icon.png";
  }
}

export async function sendDesktopNotification(event: NotificationEvent, settings: NotificationCenterSettings["desktop"]): Promise<void> {
  if (!isDesktopNotificationRuntime()) {
    throw Object.assign(new Error("当前设备不支持桌面系统通知。"), { code: "desktop_unavailable" });
  }
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw Object.assign(new Error("当前浏览器不支持系统通知 API。"), { code: "desktop_unsupported" });
  }

  const permission = getDesktopNotificationPermission();
  if (permission === "unsupported") {
    throw Object.assign(new Error("当前浏览器不支持系统通知 API。"), { code: "desktop_unsupported" });
  }
  if (permission === "denied") {
    throw Object.assign(new Error("桌面系统通知权限已被拒绝。"), { code: "desktop_permission_denied" });
  }
  if (permission === "default") {
    throw Object.assign(new Error("桌面系统通知需要用户授权。"), { code: "desktop_permission_required" });
  }

  const titlePrefix = settings.errorStyleForErrorLevel && (event.level === "error" || event.level === "urgent") ? "⚠️ " : "";
  const title = `${titlePrefix}${event.title}`;
  const body = truncateContent(event.content, settings.maxContentChars);
  const icon = getNotificationIcon();

  const notification = new window.Notification(title, { body, icon });
  if (settings.timeoutMs > 0) {
    setTimeout(() => notification.close(), settings.timeoutMs);
  }
}

export async function sendDesktopTestNotification(event: NotificationEvent, settings: NotificationCenterSettings["desktop"]): Promise<void> {
  if (!isDesktopNotificationRuntime()) {
    throw Object.assign(new Error("当前设备不支持桌面系统通知。"), { code: "desktop_unavailable" });
  }
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw Object.assign(new Error("当前浏览器不支持系统通知 API。"), { code: "desktop_unsupported" });
  }

  const permission = getDesktopNotificationPermission();
  if (permission === "unsupported") {
    throw Object.assign(new Error("当前浏览器不支持系统通知 API。"), { code: "desktop_unsupported" });
  }

  let finalPermission: DesktopNotificationPermission = permission;
  if (permission === "default") {
    finalPermission = await requestDesktopNotificationPermission();
  }

  if (finalPermission === "denied") {
    throw Object.assign(new Error("桌面系统通知权限已被拒绝。"), { code: "desktop_permission_denied" });
  }
  if (finalPermission !== "granted") {
    throw Object.assign(new Error("桌面系统通知需要用户授权。"), { code: "desktop_permission_required" });
  }

  await sendDesktopNotification(event, settings);
}
