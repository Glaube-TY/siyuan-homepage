import { cancelScheduledMobileNotification, scheduleMobileNotification } from "./channels/mobile-local-channel";
import { NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT } from "./constants";
import { getNotificationDeviceId, isMobileNotificationRuntime } from "./notification-center-device";
import { recordNotificationDelivery } from "./notification-center-history-store";
import { notificationLockName, withNotificationLock } from "./notification-center-locks";
import { getMobileNotificationPlanProviders } from "./notification-center-mobile-plan-registry";
import { loadCurrentDeviceMobilePlans, saveCurrentDeviceMobilePlans } from "./notification-center-mobile-plan-store";
import { isNotificationCenterFeatureAvailable, loadNotificationCenterSettings } from "./notification-center-settings-store";
import type {
  MobileNotificationPlanFile,
  MobileNotificationPlanRecord,
  MobileNotificationPlanRequest,
  MobilePlanRuntimeStatus,
  NotificationDeliveryResult,
  NotificationSource,
} from "./types";
import { broadcastNotificationCenterEvent } from "./notification-center-events";

let refreshTimer: number | null = null;
let reconcileRequested = false;
let forceRebuildRequested = false;
let premiumRevocationRequested = false;
let reconcileQueuePromise: Promise<MobilePlanRuntimeStatus> | null = null;
let runtimeStatus: MobilePlanRuntimeStatus = { planCount: 0 };

function payloadHash(plan: MobileNotificationPlanRequest, timeoutType: "default" | "never"): string {
  const value = JSON.stringify({
    title: plan.event.title,
    content: plan.event.content,
    scheduledAt: plan.scheduledAt,
    level: plan.event.level,
    timeoutType,
  });
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function updateStatus(file: MobileNotificationPlanFile, error?: unknown): MobilePlanRuntimeStatus {
  const plans = Object.values(file.plans).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  runtimeStatus = {
    planCount: plans.length,
    nextScheduledAt: plans[0]?.scheduledAt,
    lastReconciledAt: new Date().toISOString(),
    lastError: error ? (error instanceof Error ? error.message : String(error)) : undefined,
  };
  return { ...runtimeStatus };
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emitMobilePlansChanged(file: MobileNotificationPlanFile): void {
  const detail = { planCount: Object.keys(file.plans).length };
  window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT, { detail }));
  broadcastNotificationCenterEvent(NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT, detail);
}

async function persistPlanFile(file: MobileNotificationPlanFile): Promise<MobileNotificationPlanFile> {
  const saved = await saveCurrentDeviceMobilePlans(file);
  emitMobilePlansChanged(saved);
  return saved;
}

async function scheduleAndPersist(
  file: MobileNotificationPlanFile,
  plan: MobileNotificationPlanRequest,
  timeoutType: "default" | "never",
): Promise<MobileNotificationPlanFile> {
  const notificationId = await scheduleMobileNotification(plan.event, plan.scheduledAt, timeoutType);
  const now = new Date().toISOString();
  const record: MobileNotificationPlanRecord = {
    planKey: plan.planKey,
    source: plan.source,
    ruleId: plan.ruleId,
    occurrenceKey: plan.event.occurrenceKey,
    scheduledAt: plan.scheduledAt,
    notificationId,
    payloadHash: payloadHash(plan, timeoutType),
    createdAt: file.plans[plan.planKey]?.createdAt ?? now,
    updatedAt: now,
  };
  const next = { ...file, plans: { ...file.plans, [plan.planKey]: record } };
  let saved: MobileNotificationPlanFile;
  try {
    saved = await persistPlanFile(next);
  } catch (error) {
    try {
      cancelScheduledMobileNotification(notificationId);
    } catch {
      // 新通知取消失败已在计划文件外孤立，保留旧通知和旧记录
    }
    throw error;
  }
  try {
    const delivery: NotificationDeliveryResult = {
      targetKey: `mobile:${getNotificationDeviceId()}`,
      targetKind: "mobile",
      targetTitle: "移动端系统通知",
      deviceId: getNotificationDeviceId(),
      notificationId,
      status: "scheduled",
    };
    await recordNotificationDelivery({ ...plan.event, scheduledAt: plan.scheduledAt }, plan.event.id ?? `mobile-plan:${plan.planKey}`, delivery, undefined, record.payloadHash);
  } catch {
    // 移动计划已保存，投递历史写入失败不影响计划本身
  }
  return saved;
}

interface DesiredPlansBuildResult {
  desiredPlans: Map<string, MobileNotificationPlanRequest>;
  failedSources: Set<NotificationSource>;
  warnings: string[];
  allProvidersFailed: boolean;
}

async function buildDesiredPlans(planningHorizonDays: number): Promise<DesiredPlansBuildResult> {
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + planningHorizonDays * 86400000);
  const desiredPlans = new Map<string, MobileNotificationPlanRequest>();
  const failedSources = new Set<NotificationSource>();
  const warnings: string[] = [];
  const providers = getMobileNotificationPlanProviders();
  let successfulProviderCount = 0;
  for (const provider of providers) {
    try {
      const plans = await provider.buildPlans({ now, horizonEnd, planningHorizonDays });
      successfulProviderCount += 1;
      for (const plan of plans) {
        const scheduledAt = new Date(plan.scheduledAt);
        if (!plan.planKey.trim() || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now || scheduledAt > horizonEnd) continue;
        desiredPlans.set(plan.planKey, { ...plan, event: { ...plan.event, scheduledAt: plan.scheduledAt } });
      }
    } catch (error) {
      failedSources.add(provider.source);
      const warning = `移动计划 Provider ${provider.id}（${provider.source}）读取失败，已保留该来源现有计划：${readableError(error)}`;
      warnings.push(warning);
      console.warn(`[notification-center] ${warning}`, error);
    }
  }
  for (const [planKey, plan] of desiredPlans) {
    if (failedSources.has(plan.source)) desiredPlans.delete(planKey);
  }
  return {
    desiredPlans,
    failedSources,
    warnings,
    allProvidersFailed: providers.length > 0 && successfulProviderCount === 0,
  };
}

async function replaceExistingPlan(
  file: MobileNotificationPlanFile,
  existing: MobileNotificationPlanRecord,
  wanted: MobileNotificationPlanRequest,
  timeoutType: "default" | "never",
  warnings: string[],
): Promise<MobileNotificationPlanFile> {
  const newNotificationId = await scheduleMobileNotification(wanted.event, wanted.scheduledAt, timeoutType);
  const now = new Date().toISOString();
  const record: MobileNotificationPlanRecord = {
    planKey: wanted.planKey,
    source: wanted.source,
    ruleId: wanted.ruleId,
    occurrenceKey: wanted.event.occurrenceKey,
    scheduledAt: wanted.scheduledAt,
    notificationId: newNotificationId,
    payloadHash: payloadHash(wanted, timeoutType),
    createdAt: existing.createdAt ?? now,
    updatedAt: now,
  };
  let saved: MobileNotificationPlanFile;
  try {
    saved = await persistPlanFile({ ...file, plans: { ...file.plans, [wanted.planKey]: record } });
  } catch (error) {
    try {
      cancelScheduledMobileNotification(newNotificationId);
    } catch (cancelError) {
      console.warn("[notification-center] 移动计划保存失败后取消新通知失败", cancelError);
    }
    throw error;
  }
  try {
    cancelScheduledMobileNotification(existing.notificationId);
  } catch (error) {
    const warning = `旧移动通知 ${existing.notificationId} 取消失败，已保留验证后的新计划。`;
    warnings.push(warning);
    console.warn(`[notification-center] ${warning}`, error);
  }
  return saved;
}

async function cancelAndRemovePlan(
  file: MobileNotificationPlanFile,
  planKey: string,
  plan: MobileNotificationPlanRecord,
  warnings: string[],
): Promise<{ file: MobileNotificationPlanFile; removed: boolean }> {
  try {
    cancelScheduledMobileNotification(plan.notificationId);
  } catch (error) {
    const warning = `移动通知 ${plan.notificationId} 取消失败，已保留计划 ${planKey} 供下次重试：${readableError(error)}`;
    warnings.push(warning);
    console.warn(`[notification-center] ${warning}`, error);
    return { file, removed: false };
  }
  const plans = { ...file.plans };
  delete plans[planKey];
  return { file: await persistPlanFile({ ...file, plans }), removed: true };
}

async function reconcileInternal(forceRebuild = false): Promise<MobilePlanRuntimeStatus> {
  if (!isNotificationCenterFeatureAvailable() || !isMobileNotificationRuntime()) return { ...runtimeStatus };
  return withNotificationLock(notificationLockName("mobile-plan", getNotificationDeviceId()), async () => {
    const settings = await loadNotificationCenterSettings();
    let file = await loadCurrentDeviceMobilePlans();
    try {
      const buildResult = settings.mobile.enabled
        ? await buildDesiredPlans(settings.mobile.planningHorizonDays)
        : { desiredPlans: new Map<string, MobileNotificationPlanRequest>(), failedSources: new Set<NotificationSource>(), warnings: [], allProvidersFailed: false };
      const desired = buildResult.desiredPlans;
      const warnings = [...buildResult.warnings];
      const now = Date.now();

      for (const [planKey, existing] of Object.entries(file.plans)) {
        if (buildResult.allProvidersFailed || buildResult.failedSources.has(existing.source)) {
          desired.delete(planKey);
          continue;
        }
        const wanted = desired.get(planKey);
        const isExpired = new Date(existing.scheduledAt).getTime() < now - 60000;
        if (isExpired) {
          const result = await cancelAndRemovePlan(file, planKey, existing, warnings);
          file = result.file;
          if (!result.removed) desired.delete(planKey);
          continue;
        }
        if (!wanted) {
          file = (await cancelAndRemovePlan(file, planKey, existing, warnings)).file;
          continue;
        }
        if (forceRebuild || existing.scheduledAt !== wanted.scheduledAt || existing.payloadHash !== payloadHash(wanted, settings.mobile.timeoutType)) {
          file = await replaceExistingPlan(file, existing, wanted, settings.mobile.timeoutType, warnings);
        }
        desired.delete(planKey);
      }

      for (const plan of desired.values()) file = await scheduleAndPersist(file, plan, settings.mobile.timeoutType);
      const status = updateStatus(file, warnings.length > 0 ? warnings.join("；") : undefined);
      if (forceRebuild) emitMobilePlansChanged(file);
      return status;
    } catch (error) {
      updateStatus(file, error);
      throw error;
    }
  });
}

async function revokeForPremiumLossInternal(): Promise<MobilePlanRuntimeStatus> {
  if (!isMobileNotificationRuntime()) return { ...runtimeStatus };
  return withNotificationLock(notificationLockName("mobile-plan", getNotificationDeviceId()), async () => {
    let file = await loadCurrentDeviceMobilePlans();
    const remaining = { ...file.plans };
    const warnings: string[] = [];
    let cancelledCount = 0;
    for (const [planKey, plan] of Object.entries(file.plans)) {
      try {
        cancelScheduledMobileNotification(plan.notificationId);
        delete remaining[planKey];
        cancelledCount += 1;
      } catch (error) {
        const warning = `会员失效后取消移动通知 ${plan.notificationId} 失败，已保留计划 ${planKey} 供下次重试：${readableError(error)}`;
        warnings.push(warning);
        console.warn(`[notification-center] ${warning}`, error);
      }
    }
    if (cancelledCount > 0) file = await persistPlanFile({ ...file, plans: remaining });
    else emitMobilePlansChanged(file);
    return updateStatus(file, warnings.length > 0 ? warnings.join("；") : undefined);
  });
}

async function drainReconcileQueue(): Promise<MobilePlanRuntimeStatus> {
  let latestStatus = { ...runtimeStatus };
  let latestError: unknown;
  while (premiumRevocationRequested || forceRebuildRequested || reconcileRequested) {
    const revokeForPremiumLoss = premiumRevocationRequested;
    premiumRevocationRequested = false;
    const forceRebuild = forceRebuildRequested;
    if (!revokeForPremiumLoss) {
      forceRebuildRequested = false;
      reconcileRequested = false;
    }
    try {
      latestStatus = revokeForPremiumLoss
        ? await revokeForPremiumLossInternal()
        : await reconcileInternal(forceRebuild);
      latestError = undefined;
    } catch (error) {
      latestError = error;
      if (!premiumRevocationRequested && !forceRebuildRequested && !reconcileRequested) throw error;
    }
  }
  if (latestError) throw latestError;
  return latestStatus;
}

function ensureReconcileQueue(): Promise<MobilePlanRuntimeStatus> {
  if (!reconcileQueuePromise) {
    reconcileQueuePromise = drainReconcileQueue().finally(() => { reconcileQueuePromise = null; });
  }
  return reconcileQueuePromise;
}

export function reconcileMobilePlans(): Promise<MobilePlanRuntimeStatus> {
  reconcileRequested = true;
  return ensureReconcileQueue();
}

export function rebuildCurrentDeviceMobilePlans(): Promise<MobilePlanRuntimeStatus> {
  forceRebuildRequested = true;
  return ensureReconcileQueue();
}

export function revokeCurrentDeviceMobilePlansForPremiumLoss(): Promise<MobilePlanRuntimeStatus> {
  if (!isMobileNotificationRuntime()) return Promise.resolve({ ...runtimeStatus });
  premiumRevocationRequested = true;
  return ensureReconcileQueue();
}

export function requestMobilePlanRefresh(_reason = "unspecified"): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void reconcileMobilePlans().catch(() => undefined);
  }, 750);
}

export async function clearCurrentDeviceMobilePlans(): Promise<MobilePlanRuntimeStatus> {
  return withNotificationLock(notificationLockName("mobile-plan", getNotificationDeviceId()), async () => {
    let file = await loadCurrentDeviceMobilePlans();
    const remaining = { ...file.plans };
    const warnings: string[] = [];
    let clearedCount = 0;
    for (const [key, plan] of Object.entries(file.plans)) {
      try {
        cancelScheduledMobileNotification(plan.notificationId);
        delete remaining[key];
        clearedCount += 1;
      } catch (error) {
        const warning = `移动通知 ${plan.notificationId} 取消失败，已保留计划 ${key}：${readableError(error)}`;
        warnings.push(warning);
        console.warn(`[notification-center] ${warning}`, error);
      }
    }
    file = await persistPlanFile({ ...file, plans: remaining });
    const status = updateStatus(file, warnings.length > 0 ? warnings.join("；") : undefined);
    runtimeStatus = {
      ...status,
      lastClearResult: {
        clearedCount,
        retainedFailureCount: warnings.length,
      },
    };
    return { ...runtimeStatus };
  });
}

export function getMobilePlanRuntimeStatus(): MobilePlanRuntimeStatus {
  return { ...runtimeStatus };
}

export function cancelPendingMobilePlanRefresh(): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
}

export async function settleMobilePlanReconcile(): Promise<void> {
  while (reconcileQueuePromise) {
    await reconcileQueuePromise.catch(() => undefined);
  }
}
