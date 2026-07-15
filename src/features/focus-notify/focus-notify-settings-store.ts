import { z } from "zod";
import { assertNotificationCenterFeatureAvailable } from "@/features/notification-center/notification-center-plugin";
import { readJSON, writeJSON } from "@/features/notification-center/notification-center-storage";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";
import {
  DEFAULT_FOCUS_NOTIFY_SETTINGS,
  FOCUS_NOTIFY_SETTINGS_CHANGED_EVENT,
  FOCUS_NOTIFY_SETTINGS_KEY,
} from "./constants";
import type { FocusNotifySettings } from "./types";

const deliveryTargetSchema: z.ZodSchema<NotificationDeliveryTarget> = z.union([
  z.object({ kind: z.literal("desktop") }),
  z.object({ kind: z.literal("mobile") }),
  z.object({ kind: z.literal("external-default") }),
  z.object({ kind: z.literal("external"), channelId: z.string().min(1) }),
]);

const focusCompletedRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("focus_completed"),
  enabled: z.boolean(),
  title: z.string(),
  deliveryTargets: z.array(deliveryTargetSchema),
});

const breakCompletedRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("break_completed"),
  enabled: z.boolean(),
  title: z.string(),
  deliveryTargets: z.array(deliveryTargetSchema),
});

const focusNotifyRuleSchema = z.discriminatedUnion("type", [
  focusCompletedRuleSchema,
  breakCompletedRuleSchema,
]);

const focusNotifySettingsSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  rules: z.array(focusNotifyRuleSchema).length(2).superRefine((rules, context) => {
    if (rules[0]?.type !== "focus_completed" || rules[1]?.type !== "break_completed") {
      context.addIssue({ code: "custom", message: "番茄钟通知规则顺序或类型无效。" });
    }
  }),
});

export async function loadFocusNotifySettings(): Promise<FocusNotifySettings> {
  try {
    const stored = await readJSON(FOCUS_NOTIFY_SETTINGS_KEY, focusNotifySettingsSchema);
    return stored === null ? structuredClone(DEFAULT_FOCUS_NOTIFY_SETTINGS) : stored;
  } catch (error) {
    throw new Error(`番茄钟通知设置读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveFocusNotifySettings(settings: FocusNotifySettings): Promise<FocusNotifySettings> {
  assertNotificationCenterFeatureAvailable();
  let validated: FocusNotifySettings;
  try {
    validated = focusNotifySettingsSchema.parse(settings);
  } catch (error) {
    throw new Error(`番茄钟通知设置保存前校验失败：${error instanceof Error ? error.message : String(error)}`);
  }
  await writeJSON(FOCUS_NOTIFY_SETTINGS_KEY, validated, focusNotifySettingsSchema);
  const saved = await readJSON(FOCUS_NOTIFY_SETTINGS_KEY, focusNotifySettingsSchema);
  if (saved === null) throw new Error("番茄钟通知设置保存后读取为空。");
  if (JSON.stringify(saved) !== JSON.stringify(validated)) throw new Error("番茄钟通知设置保存后完整校验失败。");
  window.dispatchEvent(new CustomEvent(FOCUS_NOTIFY_SETTINGS_CHANGED_EVENT, {
    detail: { version: 1, enabled: saved.enabled },
  }));
  return saved;
}
