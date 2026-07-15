import { z } from "zod";
import { getNotificationDeviceId, getSafeNotificationDeviceFileName } from "./notification-center-device";
import { readJSON, writeJSON } from "./notification-center-storage";
import type { MobileNotificationPlanFile, MobileNotificationPlanRecord } from "./types";

export function getCurrentDeviceMobilePlanKey(): string {
  return `notification-center/mobile-plans/${getSafeNotificationDeviceFileName()}.json`;
}

function emptyFile(): MobileNotificationPlanFile {
  return {
    schema: "siyuan-homepage-notification-mobile-plans",
    version: 1,
    revision: 0,
    updatedAt: new Date().toISOString(),
    deviceId: getNotificationDeviceId(),
    plans: {},
  };
}

const mobilePlanRecordSchema: z.ZodSchema<MobileNotificationPlanRecord> = z.object({
  planKey: z.string(),
  source: z.string(),
  ruleId: z.string(),
  occurrenceKey: z.string(),
  scheduledAt: z.string(),
  notificationId: z.number(),
  payloadHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const mobilePlanFileSchema: z.ZodSchema<MobileNotificationPlanFile> = z.object({
  schema: z.literal("siyuan-homepage-notification-mobile-plans"),
  version: z.literal(1),
  revision: z.number(),
  updatedAt: z.string(),
  deviceId: z.string(),
  plans: z.record(z.string(), mobilePlanRecordSchema),
});

function assertCurrentDevice(file: MobileNotificationPlanFile): void {
  if (file.deviceId !== getNotificationDeviceId()) {
    throw new Error("移动计划文件设备 ID 与当前设备不一致，未执行覆盖；请先备份插件数据。");
  }
}

export async function loadCurrentDeviceMobilePlans(): Promise<MobileNotificationPlanFile> {
  const raw = await readJSON(getCurrentDeviceMobilePlanKey(), mobilePlanFileSchema);
  if (raw === null) return emptyFile();
  assertCurrentDevice(raw);
  return raw;
}

function validateSavedPlans(saved: MobileNotificationPlanFile, original: MobileNotificationPlanFile): void {
  if (saved.schema !== "siyuan-homepage-notification-mobile-plans") throw new Error("移动计划文件 schema 保存后校验失败。");
  if (saved.version !== 1) throw new Error("移动计划文件版本保存后校验失败。");
  if (saved.deviceId !== getNotificationDeviceId()) throw new Error("移动计划文件设备 ID 保存后校验失败。");
  const originalKeys = Object.keys(original.plans);
  const savedKeys = Object.keys(saved.plans);
  if (savedKeys.length !== originalKeys.length) throw new Error("移动计划数量保存后校验失败。");
  for (const key of originalKeys) {
    const record = saved.plans[key];
    if (!record) throw new Error(`移动计划 ${key} 保存后丢失。`);
    if (!record.planKey || !record.source || !record.ruleId || !record.occurrenceKey || !record.scheduledAt) {
      throw new Error(`移动计划 ${key} 关键字段保存后校验失败。`);
    }
    if (!Number.isFinite(record.notificationId)) throw new Error(`移动计划 ${key} 通知 ID 保存后校验失败。`);
    if (!record.payloadHash) throw new Error(`移动计划 ${key} 负载哈希保存后校验失败。`);
  }
}

export async function saveCurrentDeviceMobilePlans(file: MobileNotificationPlanFile): Promise<MobileNotificationPlanFile> {
  const next = { ...file, revision: file.revision + 1, updatedAt: new Date().toISOString(), deviceId: getNotificationDeviceId() };
  const saved = await writeJSON(getCurrentDeviceMobilePlanKey(), next, mobilePlanFileSchema);
  assertCurrentDevice(saved);
  validateSavedPlans(saved, next);
  return saved;
}
