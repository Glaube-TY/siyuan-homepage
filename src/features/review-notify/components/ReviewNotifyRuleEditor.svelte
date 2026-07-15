<script lang="ts">
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import NotificationTargetSelector from "@/features/notification-center/components/NotificationTargetSelector.svelte";
  import type { ReviewNotifyRule } from "../types";

  interface Props { rule: ReviewNotifyRule; disabled?: boolean; onDelete: () => void; }
  let { rule = $bindable(), disabled = false, onDelete }: Props = $props();
  const patch = (next: Partial<ReviewNotifyRule>) => { rule = { ...rule, ...next }; };
  const labels: Record<ReviewNotifyRule["type"], string> = {
    today_digest: "今日复习摘要",
    overdue_digest: "逾期复习摘要",
    tomorrow_digest: "明日复习摘要",
    item_due_reminder: "单项到期提醒",
  };
  const hints: Record<ReviewNotifyRule["type"], string> = {
    today_digest: "今日摘要可提前注册到当前移动设备。",
    tomorrow_digest: "明日摘要可提前注册到当前移动设备。",
    overdue_digest: "逾期状态依赖通知时刻的真实复习数据，移动端思源需要在通知时间附近运行。",
    item_due_reminder: "每个到期项目会单独发送，项目较多时可能产生多条通知。",
  };
</script>

<div class="shp-notification-rule-card">
  <div class="shp-notification-rule-header"><strong>{labels[rule.type]}</strong><label><span>启用</span><input type="checkbox" class="b3-switch fn__flex-center" checked={rule.enabled} {disabled} onchange={(event) => patch({ enabled: event.currentTarget.checked })} /></label></div>
  <SettingRow title="标题" description="通知中显示的规则标题"><input class="b3-text-field control-lg" value={rule.title} {disabled} onchange={(event) => patch({ title: event.currentTarget.value })} /></SettingRow>
  <SettingRow title="通知时间" description="每天检查并发送此规则的本地时间"><input type="time" class="b3-text-field control-sm" value={rule.time} {disabled} onchange={(event) => patch({ time: event.currentTarget.value })} /></SettingRow>
  <NotificationTargetSelector bind:value={rule.deliveryTargets} {disabled} showMobileRuntimeHint={rule.type === "overdue_digest"} />
  <p class="shp-notification-rule-hint">{hints[rule.type]}</p>
  {#if rule.type !== "overdue_digest" && rule.deliveryTargets.some((target) => target.kind === "mobile")}<p class="shp-notification-rule-hint">在其他设备完成复习后，需要手机再次打开思源完成计划对账。</p>{/if}
  <div class="shp-notification-rule-footer"><button type="button" class="b3-button b3-button--cancel shp-notification-danger-button" {disabled} onclick={onDelete}>删除规则</button></div>
</div>

<style>
  .shp-notification-rule-card { width: 100%; min-width: 0; box-sizing: border-box; display: grid; gap: 6px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; }
  .shp-notification-rule-card .b3-text-field { max-width: 100%; box-sizing: border-box; }
  .shp-notification-rule-header, .shp-notification-rule-header label, .shp-notification-rule-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .shp-notification-rule-header label { justify-content: flex-end; }
  .shp-notification-rule-hint { margin: 0; color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-rule-footer { justify-content: flex-end; }
  .shp-notification-danger-button { color: var(--b3-theme-error); }
</style>
