import { z } from "zod";
import { broadcastNotificationCenterEvent } from "@/features/notification-center/notification-center-events";
import { requestMobilePlanRefresh } from "@/features/notification-center/notification-center-mobile-plan-manager";
import { readJSON, writeJSON } from "@/features/notification-center/notification-center-storage";
import { assertNotificationCenterFeatureAvailable } from "@/features/notification-center/notification-center-plugin";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
import { DEFAULT_REVIEW_NOTIFY_SETTINGS, REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT, REVIEW_NOTIFY_SETTINGS_KEY } from "./constants";
import type { ReviewNotifyRule, ReviewNotifyRuleType, ReviewNotifySettings } from "./types";

let pluginInstance: any = null;

export function setReviewNotifyPlugin(plugin: any): void {
  pluginInstance = plugin;
}

function ensurePlugin(): void {
  if (!pluginInstance) throw new Error("Review Notify 尚未初始化。");
}

const deliveryTargetSchema: z.ZodSchema<NotificationDeliveryTarget> = z.union([
  z.object({ kind: z.literal("desktop") }),
  z.object({ kind: z.literal("mobile") }),
  z.object({ kind: z.literal("external-default") }),
  z.object({ kind: z.literal("external"), channelId: z.string().min(1) }),
]);

const reviewNotifyRuleSchema: z.ZodSchema<ReviewNotifyRule> = z.object({
  id: z.string().min(1),
  type: z.enum(["today_digest", "overdue_digest", "tomorrow_digest", "item_due_reminder"]),
  enabled: z.boolean(),
  title: z.string(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  deliveryTargets: z.array(deliveryTargetSchema),
});

const reviewNotifySettingsSchema: z.ZodSchema<ReviewNotifySettings> = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  scanIntervalMs: z.number().int().min(10000).max(3600000),
  catchUpWindowMinutes: z.number().int().min(1).max(1440),
  maxItemsPerMessage: z.number().int().min(1).max(100),
  includePath: z.boolean(),
  includeNote: z.boolean(),
  includeSiyuanLink: z.boolean(),
  rules: z.array(reviewNotifyRuleSchema),
});

function keepAllowedSingletonRules(rules: ReviewNotifyRule[]): ReviewNotifyRule[] {
  const singletonTypes = new Set<ReviewNotifyRuleType>(["today_digest", "overdue_digest", "tomorrow_digest"]);
  const seen = new Set<ReviewNotifyRuleType>();
  return rules.filter((rule) => {
    if (!singletonTypes.has(rule.type)) return true;
    if (seen.has(rule.type)) return false;
    seen.add(rule.type);
    return true;
  });
}

function normalizeSettings(settings: ReviewNotifySettings): ReviewNotifySettings {
  return {
    ...settings,
    rules: keepAllowedSingletonRules(settings.rules),
  };
}

export async function loadReviewNotifySettings(): Promise<ReviewNotifySettings> {
  ensurePlugin();
  try {
    const stored = await readJSON(REVIEW_NOTIFY_SETTINGS_KEY, reviewNotifySettingsSchema);
    return stored === null
      ? structuredClone(DEFAULT_REVIEW_NOTIFY_SETTINGS)
      : normalizeSettings(stored);
  } catch (error) {
    throw new Error(`复习通知设置读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveReviewNotifySettings(settings: ReviewNotifySettings): Promise<ReviewNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  ensurePlugin();
  let normalized: ReviewNotifySettings;
  try {
    normalized = reviewNotifySettingsSchema.parse(normalizeSettings(settings));
  } catch (error) {
    throw new Error(`复习通知设置保存前校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
  await writeJSON(REVIEW_NOTIFY_SETTINGS_KEY, normalized, reviewNotifySettingsSchema);
  const saved = await readJSON(REVIEW_NOTIFY_SETTINGS_KEY, reviewNotifySettingsSchema);
  if (saved === null) throw new Error("复习通知设置保存后读取为空。");
  const verified = normalizeSettings(saved);
  if (JSON.stringify(verified) !== JSON.stringify(normalized)) throw new Error("复习通知设置保存后完整校验失败。");
  window.dispatchEvent(new CustomEvent(REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT, { detail: { version: 1, enabled: verified.enabled, ruleCount: verified.rules.length } }));
  broadcastNotificationCenterEvent(REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT, { version: 1 });
  requestMobilePlanRefresh("review-notify-settings-changed");
  return verified;
}
