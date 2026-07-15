import { notificationCenter } from "@/features/notification-center";
import { loadFocusNotifySettings } from "./focus-notify-settings-store";
import type {
  BreakCompletedNotificationInput,
  FocusCompletedNotificationInput,
  FocusNotifyRuleType,
} from "./types";

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  if (minutes === 0) return `${remainder} 秒`;
  return remainder === 0 ? `${minutes} 分钟` : `${minutes} 分钟 ${remainder} 秒`;
}

async function loadEnabledRule(type: FocusNotifyRuleType) {
  const settings = await loadFocusNotifySettings();
  if (!settings.enabled) return null;
  const rule = settings.rules.find((item) => item.type === type);
  return rule?.enabled && rule.deliveryTargets.length > 0 ? rule : null;
}

export async function sendFocusCompletedNotification(input: FocusCompletedNotificationInput): Promise<void> {
  const rule = await loadEnabledRule("focus_completed");
  if (!rule) return;
  const result = await notificationCenter.notify({
    source: "focus",
    sourceId: input.sessionId,
    type: "focus_completed",
    title: rule.title || "专注时间结束",
    content: `本次计划专注时长：${formatDuration(input.plannedSeconds)}；实际专注时长：${formatDuration(input.actualFocusSeconds)}。`,
    level: "success",
    occurrenceKey: `focus:completed:${input.sessionId}`,
    extra: {
      type: "focus_completed",
      plannedSeconds: input.plannedSeconds,
      actualFocusSeconds: input.actualFocusSeconds,
    },
  }, { targets: rule.deliveryTargets, reason: "focus-completed" });
  if (!result.ok) console.warn("[focus-notify] 专注结束通知未完成投递", result.errors);
}

export async function sendBreakCompletedNotification(input: BreakCompletedNotificationInput): Promise<void> {
  const rule = await loadEnabledRule("break_completed");
  if (!rule) return;
  const result = await notificationCenter.notify({
    source: "focus",
    sourceId: input.cycleId,
    type: "break_completed",
    title: rule.title || "休息时间结束",
    content: `本次休息时长：${formatDuration(input.breakSeconds)}。`,
    level: "info",
    occurrenceKey: `focus:break-completed:${input.cycleId}`,
    extra: { type: "break_completed", breakSeconds: input.breakSeconds },
  }, { targets: rule.deliveryTargets, reason: "focus-break-completed" });
  if (!result.ok) console.warn("[focus-notify] 休息结束通知未完成投递", result.errors);
}
