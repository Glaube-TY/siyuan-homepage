<script lang="ts">
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import type { MobilePlanRuntimeStatus, NotificationCenterSettings } from "../types";
  import { getNotificationDeviceId, getNotificationDevicePlatform, isMobileNotificationRuntime } from "../notification-center-device";
  interface Props { value: NotificationCenterSettings["mobile"]; status: MobilePlanRuntimeStatus; error?: string | null; reconcileError?: string | null; disabled?: boolean; planActionsDisabled?: boolean; onChange: (value: NotificationCenterSettings["mobile"]) => void; onCommit?: (value: NotificationCenterSettings["mobile"]) => void; onTest: () => void; onReconcile: () => void; onClear: () => void; }
  let { value, status, error = null, reconcileError = null, disabled = false, planActionsDisabled = false, onChange, onCommit, onTest, onReconcile, onClear }: Props = $props();
  const patch = (next: Partial<NotificationCenterSettings["mobile"]>, commit = false) => {
    const updated = { ...value, ...next };
    onChange(updated);
    if (commit) onCommit?.(updated);
  };
  const mobileRuntime = isMobileNotificationRuntime();
</script>
<SettingSection title="移动端系统通知">
  <SettingRow title="开启移动通知" description="在原生手机端注册本地通知计划">
    <input type="checkbox" class="b3-switch fn__flex-center" checked={value.enabled} {disabled} onchange={(e) => patch({ enabled: e.currentTarget.checked }, true)} />
  </SettingRow>
  <SettingRow title="当前平台" description="显示当前通知运行环境">
    <span class="shp-notification-status">{getNotificationDevicePlatform()}</span>
  </SettingRow>
  <SettingRow title="通知持续方式" description="控制移动系统通知是否持续显示">
    <select class="b3-text-field control-md" value={value.timeoutType} {disabled} onchange={(e) => patch({ timeoutType: e.currentTarget.value as "default" | "never" }, true)}><option value="default">默认</option><option value="never">持续</option></select>
  </SettingRow>
  <SettingRow title="未来计划天数" description="只生成未来指定天数的固定通知">
    <input type="number" class="b3-text-field control-sm" min="1" max="90" value={value.planningHorizonDays} {disabled} oninput={(e) => patch({ planningHorizonDays: Number(e.currentTarget.value) })} onchange={(e) => patch({ planningHorizonDays: Number(e.currentTarget.value) }, true)} />
  </SettingRow>
  <SettingRow title="通知计划状态" description="已注册计划和最近对账信息">
    <div class="shp-notification-plan-summary">
      <span>已注册：{status.planCount}</span>
      <span>下一条：{status.nextScheduledAt ? new Date(status.nextScheduledAt).toLocaleString() : "无"}</span>
      <span>最近对账：{status.lastReconciledAt ? new Date(status.lastReconciledAt).toLocaleString() : "尚未"}</span>
      {#if status.lastClearResult}<span>最近清理：成功 {status.lastClearResult.clearedCount}，失败保留 {status.lastClearResult.retainedFailureCount}</span>{/if}
    </div>
  </SettingRow>
  {#if !mobileRuntime}<p class="shp-notification-hint">当前设备不是移动端，计划将在手机端打开思源后生成。</p>{/if}
  {#if error}<p class="shp-notification-error">当前设备计划文件异常，未执行覆盖；请先备份插件数据。<br />{error}</p>{:else if reconcileError}<p class="shp-notification-error">{reconcileError}</p>{:else if status.lastError}<p class="shp-notification-error">{status.lastError}</p>{/if}
  <p class="shp-notification-hint">移动通知需要在手机端至少打开一次思源以注册计划。固定时间提醒可在思源关闭后触发；动态摘要仍需思源在通知时间附近运行。</p>
  <SettingRow title="当前设备计划" description="重新生成会重新向手机系统注册计划；清理只影响当前设备">
    <div class="shp-notification-plan-actions">
      <button type="button" class="b3-button b3-button--text" disabled={disabled || !value.enabled || !mobileRuntime} onclick={onTest}>测试</button>
      <button type="button" class="b3-button b3-button--text" disabled={disabled || planActionsDisabled || !mobileRuntime} onclick={onReconcile}>重新生成计划</button>
      <button type="button" class="b3-button b3-button--cancel shp-notification-danger-button" disabled={disabled || planActionsDisabled || !mobileRuntime} onclick={onClear}>清理计划</button>
    </div>
  </SettingRow>
  <SettingRow title="当前设备" description="用于区分不同设备的移动通知计划">
    <span class="shp-notification-device-id">{getNotificationDeviceId().slice(0, 20)}</span>
  </SettingRow>
</SettingSection>

<style>
  .shp-notification-plan-summary { display: grid; justify-items: end; gap: 4px; color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-plan-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .shp-notification-status, .shp-notification-device-id, .shp-notification-hint { color: var(--b3-theme-on-surface); font-size: 12px; }
  .shp-notification-device-id { overflow-wrap: anywhere; }
  .shp-notification-hint, .shp-notification-error { margin: 0; line-height: 1.5; }
  .shp-notification-error { color: var(--b3-theme-error); font-size: 12px; }
  .shp-notification-danger-button { color: var(--b3-theme-error); }
  @media (max-width: 480px) { .shp-notification-plan-summary { justify-items: start; } .shp-notification-plan-actions { justify-content: flex-start; } }
</style>
