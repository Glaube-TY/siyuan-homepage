import { normalizeNotifyBridgeSettings } from "@/features/notify-bridge/notify-bridge-settings-store";
import { NOTIFY_BRIDGE_SETTINGS_KEY } from "@/features/notify-bridge/constants";
import { TASK_NOTIFY_HISTORY_KEY, TASK_NOTIFY_SETTINGS_KEY } from "@/features/task-notify/constants";
import { normalizeTaskNotifySettings, saveTaskNotifySettingsForMigration } from "@/features/task-notify/task-notify-settings-store";
import { COUNTDOWN_NOTIFY_HISTORY_KEY, COUNTDOWN_NOTIFY_SETTINGS_KEY } from "@/features/countdown-notify/constants";
import { normalizeCountdownNotifySettings, saveCountdownNotifySettingsForMigration } from "@/features/countdown-notify/countdown-notify-settings-store";
import { ENHANCED_DIARY_NOTIFY_HISTORY_KEY, ENHANCED_DIARY_NOTIFY_SETTINGS_KEY } from "@/features/enhanced-diary-notify/constants";
import { normalizeEnhancedDiaryNotifySettings, saveEnhancedDiaryNotifySettingsForMigration } from "@/features/enhanced-diary-notify/enhanced-diary-notify-settings-store";
import { z } from "zod";
import { DEFAULT_NOTIFICATION_CENTER_SETTINGS } from "./constants";
import { upsertLegacyNotificationHistory } from "./notification-center-history-store";
import { notificationLockName, withNotificationLock } from "./notification-center-locks";
import {
  readNotificationCenterSettingsFile,
  saveNotificationCenterSettingsForMigration,
} from "./notification-center-settings-store";
import { readJSON } from "./notification-center-storage";
import type { NotificationCenterSettings, NotificationDeliveryHistoryRecord } from "./types";

let migrationPromise: Promise<void> | null = null;
let migrationError: string | undefined;

function hasStoredObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sensitiveFields(channel: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const key of ["url", "webhookUrl", "secret"]) if (typeof channel[key] === "string") values.push(channel[key] as string);
  if (channel.headers && typeof channel.headers === "object") {
    values.push(...Object.values(channel.headers as Record<string, unknown>).filter((value): value is string => typeof value === "string"));
  }
  return values.filter((value) => value.startsWith("enc:v1:"));
}

async function migrateCenterSettings(): Promise<NotificationCenterSettings> {
  const existing = await readNotificationCenterSettingsFile();
  if (existing !== null) return existing;

  const oldRaw = await readJSON(NOTIFY_BRIDGE_SETTINGS_KEY, z.unknown());
  const oldSettings = normalizeNotifyBridgeSettings(oldRaw);
  const next: NotificationCenterSettings = {
    ...structuredClone(DEFAULT_NOTIFICATION_CENTER_SETTINGS),
    external: {
      enabled: hasStoredObject(oldRaw) ? oldSettings.enabled : false,
      defaultChannelIds: [...oldSettings.defaultChannelIds],
      channels: structuredClone(oldSettings.channels),
      rateLimit: { ...oldSettings.rateLimit! },
      dedupe: { ...oldSettings.dedupe! },
    },
    migration: {
      version: 1,
      migratedAt: new Date().toISOString(),
      notifyBridgeSettingsMigrated: hasStoredObject(oldRaw),
      oldHistoryMigrated: false,
    },
  };
  const saved = await saveNotificationCenterSettingsForMigration(next);
  if (saved.external.channels.length !== oldSettings.channels.length) throw new Error("旧外联渠道迁移校验失败：渠道数量不一致。");
  for (let i = 0; i < oldSettings.channels.length; i += 1) {
    const before = oldSettings.channels[i] as unknown as Record<string, unknown>;
    const after = saved.external.channels[i] as unknown as Record<string, unknown>;
    if (before.id !== after.id || before.type !== after.type || before.enabled !== after.enabled) throw new Error("旧外联渠道迁移校验失败：渠道基础字段不一致。");
    for (const cipher of sensitiveFields(before)) {
      if (!sensitiveFields(after).includes(cipher)) throw new Error("旧外联渠道迁移校验失败：加密字段未原样保留。");
    }
  }
  return saved;
}

interface MigratableSourceSettings {
  rules: Array<{ deliveryTargets: unknown[] }>;
}

async function migrateSourceSetting<T extends MigratableSourceSettings>(
  key: string,
  normalize: (raw: unknown) => T,
  save: (settings: T) => Promise<T>,
): Promise<void> {
  const raw = await readJSON(key, z.record(z.string(), z.unknown()));
  if (raw === null) return;
  const normalized = normalize(raw);
  const verified = await save(normalized);
  if (verified.rules.length !== normalized.rules.length || verified.rules.some((rule) => !Array.isArray(rule.deliveryTargets))) {
    throw new Error(`通知规则迁移校验失败：${key}`);
  }
}

async function migrateSourceSettings(): Promise<void> {
  await migrateSourceSetting(TASK_NOTIFY_SETTINGS_KEY, normalizeTaskNotifySettings, saveTaskNotifySettingsForMigration);
  await migrateSourceSetting(COUNTDOWN_NOTIFY_SETTINGS_KEY, normalizeCountdownNotifySettings, saveCountdownNotifySettingsForMigration);
  await migrateSourceSetting(ENHANCED_DIARY_NOTIFY_SETTINGS_KEY, normalizeEnhancedDiaryNotifySettings, saveEnhancedDiaryNotifySettingsForMigration);
}

function sourceFromKey(key: string): string {
  if (key === TASK_NOTIFY_HISTORY_KEY) return "task";
  if (key === COUNTDOWN_NOTIFY_HISTORY_KEY) return "countdown";
  return "diary";
}

async function migrateLegacyHistories(): Promise<void> {
  for (const key of [TASK_NOTIFY_HISTORY_KEY, COUNTDOWN_NOTIFY_HISTORY_KEY, ENHANCED_DIARY_NOTIFY_HISTORY_KEY]) {
    const raw = await readJSON(key, z.unknown());
    if (!hasStoredObject(raw) || !hasStoredObject(raw.sentKeys)) continue;
    for (const [occurrenceKey, sentAtRaw] of Object.entries(raw.sentKeys)) {
      if (typeof sentAtRaw !== "string" || !occurrenceKey.trim()) continue;
      const sentAt = Number.isNaN(new Date(sentAtRaw).getTime()) ? new Date().toISOString() : sentAtRaw;
      const record: NotificationDeliveryHistoryRecord = {
        id: `legacy:${sourceFromKey(key)}:${occurrenceKey}`,
        eventId: `legacy:${occurrenceKey}`,
        occurrenceKey,
        source: sourceFromKey(key),
        type: "legacy_notification",
        title: "历史外联通知",
        targetKey: "external:legacy",
        targetKind: "external",
        targetTitle: "旧版外联通知",
        status: "delivered",
        attemptCount: 1,
        firstAttemptAt: sentAt,
        lastAttemptAt: sentAt,
        deliveredAt: sentAt,
        legacyExternalCompleted: true,
      };
      await upsertLegacyNotificationHistory(record);
    }
  }
}

async function runMigration(): Promise<void> {
  await withNotificationLock(notificationLockName("migration", "v1"), async () => {
    let settings = await migrateCenterSettings();
    if (settings.migration?.oldHistoryMigrated) return;
    await migrateSourceSettings();
    await migrateLegacyHistories();
    settings = {
      ...settings,
      migration: {
        version: 1,
        migratedAt: settings.migration?.migratedAt ?? new Date().toISOString(),
        notifyBridgeSettingsMigrated: settings.migration?.notifyBridgeSettingsMigrated ?? false,
        oldHistoryMigrated: true,
      },
    };
    await saveNotificationCenterSettingsForMigration(settings);
  });
}

export function ensureNotificationCenterMigration(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = runMigration().catch((error) => {
      migrationError = error instanceof Error ? error.message : String(error);
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

export function getNotificationCenterMigrationError(): string | undefined {
  return migrationError;
}
