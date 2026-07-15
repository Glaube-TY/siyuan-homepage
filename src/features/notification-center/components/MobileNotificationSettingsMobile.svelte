<script lang="ts">
  import type { MobilePlanRuntimeStatus, NotificationCenterSettings } from "../types";
  import { getNotificationDeviceId, getNotificationDevicePlatform, isMobileNotificationRuntime } from "../notification-center-device";

  interface Props {
    value: NotificationCenterSettings["mobile"];
    status: MobilePlanRuntimeStatus;
    error?: string | null;
    reconcileError?: string | null;
    disabled?: boolean;
    planActionsDisabled?: boolean;
    onChange: (value: NotificationCenterSettings["mobile"]) => void;
    onCommit?: (value: NotificationCenterSettings["mobile"]) => void;
    onTest: () => void;
    onReconcile: () => void;
    onClear: () => void;
  }

  let {
    value,
    status,
    error = null,
    reconcileError = null,
    disabled = false,
    planActionsDisabled = false,
    onChange,
    onCommit,
    onTest,
    onReconcile,
    onClear,
  }: Props = $props();

  let planningHorizonDraft = $state("");
  let planningHorizonFocused = $state(false);
  const mobileRuntime = isMobileNotificationRuntime();
  const platform = getNotificationDevicePlatform();

  $effect(() => {
    const planningHorizonDays = value.planningHorizonDays;
    if (!planningHorizonFocused) planningHorizonDraft = String(planningHorizonDays);
  });

  function patch(next: Partial<NotificationCenterSettings["mobile"]>, commit = false): void {
    const updated = { ...value, ...next };
    onChange(updated);
    if (commit) onCommit?.(updated);
  }

  function platformLabel(value: string): string {
    switch (value) {
      case "android": return "Android";
      case "ios": return "iOS";
      case "harmony": return "Harmony";
      default: return "Desktop";
    }
  }

  function commitPlanningHorizonDraft(): void {
    const text = planningHorizonDraft.trim();
    const parsed = Number(text);
    if (text === "" || !Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
      planningHorizonDraft = String(value.planningHorizonDays);
      return;
    }
    planningHorizonDraft = String(parsed);
    if (parsed !== value.planningHorizonDays) patch({ planningHorizonDays: parsed }, true);
  }

  function finishPlanningHorizonEdit(): void {
    commitPlanningHorizonDraft();
    planningHorizonFocused = false;
  }
</script>

<div class="shp-mobile-notify-settings">
  <section class="shp-mobile-notify-card">
    <h2>移动端系统通知</h2>

    <label class="shp-mobile-notify-row shp-mobile-notify-switch-row">
      <span class="shp-mobile-notify-copy">
        <strong>开启移动通知</strong>
        <small>在原生手机端注册本地通知计划</small>
      </span>
      <input type="checkbox" class="b3-switch fn__flex-center" checked={value.enabled} {disabled} onchange={(event) => patch({ enabled: event.currentTarget.checked }, true)} />
    </label>

    <div class="shp-mobile-notify-row">
      <span class="shp-mobile-notify-copy">
        <strong>当前平台</strong>
        <small>显示当前通知运行环境</small>
      </span>
      <span class="shp-mobile-notify-platform">{platformLabel(platform)}</span>
    </div>

    <label class="shp-mobile-notify-field-row">
      <span class="shp-mobile-notify-copy">
        <strong>通知持续方式</strong>
        <small>控制移动系统通知是否持续显示</small>
      </span>
      <select class="b3-text-field shp-mobile-notify-field" value={value.timeoutType} {disabled} onchange={(event) => patch({ timeoutType: event.currentTarget.value as "default" | "never" }, true)}>
        <option value="default">默认</option>
        <option value="never">持续</option>
      </select>
    </label>

    <label class="shp-mobile-notify-field-row">
      <span class="shp-mobile-notify-copy">
        <strong>未来计划天数</strong>
        <small>只生成未来指定天数的固定通知</small>
      </span>
      <input
        type="number"
        class="b3-text-field shp-mobile-notify-field"
        min="1"
        max="90"
        step="1"
        value={planningHorizonDraft}
        {disabled}
        onfocus={() => planningHorizonFocused = true}
        oninput={(event) => planningHorizonDraft = event.currentTarget.value}
        onchange={commitPlanningHorizonDraft}
        onblur={finishPlanningHorizonEdit}
      />
    </label>
  </section>

  <section class="shp-mobile-notify-card">
    <h2>当前设备通知计划</h2>

    <dl class="shp-mobile-notify-summary">
      <div><dt>已注册</dt><dd>{status.planCount}</dd></div>
      <div><dt>下一条</dt><dd>{status.nextScheduledAt ? new Date(status.nextScheduledAt).toLocaleString() : "无"}</dd></div>
      <div><dt>最近对账</dt><dd>{status.lastReconciledAt ? new Date(status.lastReconciledAt).toLocaleString() : "尚未"}</dd></div>
      {#if status.lastClearResult}
        <div><dt>最近清理</dt><dd>成功 {status.lastClearResult.clearedCount}，失败保留 {status.lastClearResult.retainedFailureCount}</dd></div>
      {/if}
    </dl>

    {#if !mobileRuntime}
      <div class="shp-mobile-notify-warning">当前设备不是移动端，计划将在手机端打开思源后生成。</div>
    {/if}
    {#if error}
      <div class="shp-mobile-notify-error">当前设备计划文件异常，未执行覆盖；请先备份插件数据。<br />{error}</div>
    {:else if reconcileError || status.lastError}
      <div class="shp-mobile-notify-warning">{reconcileError ?? status.lastError}</div>
    {/if}

    <p class="shp-mobile-notify-hint">移动通知需要在手机端至少打开一次思源。固定通知可在思源关闭后触发；动态摘要需要思源在通知时间附近运行。</p>

    <div class="shp-mobile-notify-actions">
      <button type="button" class="b3-button b3-button--text shp-mobile-notify-action shp-mobile-notify-action--test" disabled={disabled || !value.enabled || !mobileRuntime} onclick={onTest}>测试通知</button>
      <div class="shp-mobile-notify-action-pair">
        <button type="button" class="b3-button b3-button--text shp-mobile-notify-action" disabled={disabled || planActionsDisabled || !mobileRuntime} onclick={onReconcile}>重新生成计划</button>
        <button type="button" class="b3-button b3-button--cancel shp-mobile-notify-action" disabled={disabled || planActionsDisabled || !mobileRuntime} onclick={onClear}>清理计划</button>
      </div>
    </div>
  </section>

  <section class="shp-mobile-notify-card">
    <h2>当前设备</h2>
    <div class="shp-mobile-notify-device">
      <div><span>平台</span><strong>{platformLabel(platform)}</strong></div>
      <div><span>设备 ID</span><strong>{getNotificationDeviceId()}</strong></div>
    </div>
  </section>
</div>

<style>
  .shp-mobile-notify-settings {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .shp-mobile-notify-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 13px;
    box-sizing: border-box;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
  }

  .shp-mobile-notify-card h2 {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 15px;
    line-height: 1.4;
  }

  .shp-mobile-notify-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }

  .shp-mobile-notify-switch-row {
    cursor: pointer;
  }

  .shp-mobile-notify-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .shp-mobile-notify-copy strong {
    color: var(--b3-theme-on-surface);
    font-size: 14px;
    line-height: 1.4;
  }

  .shp-mobile-notify-copy small,
  .shp-mobile-notify-hint {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.45;
  }

  .shp-mobile-notify-platform {
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    white-space: nowrap;
  }

  .shp-mobile-notify-field-row {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .shp-mobile-notify-field {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 44px;
    box-sizing: border-box;
  }

  .shp-mobile-notify-summary {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
  }

  .shp-mobile-notify-summary > div {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .shp-mobile-notify-summary dt {
    flex: 0 0 68px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.5;
  }

  .shp-mobile-notify-summary dd {
    min-width: 0;
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .shp-mobile-notify-error,
  .shp-mobile-notify-warning {
    padding: 9px 10px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .shp-mobile-notify-error {
    color: var(--b3-theme-error);
    background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
  }

  .shp-mobile-notify-warning {
    color: var(--b3-theme-on-surface);
    background: var(--b3-theme-background);
  }

  .shp-mobile-notify-hint {
    margin: 0;
  }

  .shp-mobile-notify-actions {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .shp-mobile-notify-action,
  .shp-mobile-notify-action--test {
    min-width: 0;
    min-height: 44px;
  }

  .shp-mobile-notify-action--test {
    width: 100%;
  }

  .shp-mobile-notify-action-pair {
    min-width: 0;
    display: flex;
    gap: 8px;
  }

  .shp-mobile-notify-action-pair .shp-mobile-notify-action {
    flex: 1 1 0;
  }

  .shp-mobile-notify-device {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .shp-mobile-notify-device > div {
    min-width: 0;
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }

  .shp-mobile-notify-device span {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.5;
  }

  .shp-mobile-notify-device strong {
    min-width: 0;
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  @media (max-width: 360px) {
    .shp-mobile-notify-card { padding: 12px; }
    .shp-mobile-notify-action-pair .shp-mobile-notify-action { padding-right: 8px; padding-left: 8px; font-size: 12px; }
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .shp-mobile-notify-card { gap: 10px; }
  }
</style>
