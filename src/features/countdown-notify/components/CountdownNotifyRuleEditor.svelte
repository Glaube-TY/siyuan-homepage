<script lang="ts">
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import NotificationTargetSelector from "@/features/notification-center/components/NotificationTargetSelector.svelte";
  import type { CountdownNotifyRule } from "../types";
  interface Props { rule: CountdownNotifyRule; disabled?: boolean; onDelete: () => void; }
  let { rule = $bindable(), disabled = false, onDelete }: Props = $props();
  const patch = (next: Partial<CountdownNotifyRule>) => { rule = { ...rule, ...next }; };
  const labels = { today_events: "今日事件提醒", advance_events: "提前 N 天提醒", upcoming_digest: "未来 N 天摘要" } as const;
  function setAdvanceDays(value: string): void { patch({ advanceDays: [...new Set(value.split(/[,，\s]+/).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 365))].sort((a, b) => a - b) }); }
</script>
<div class="shp-notification-rule-card">
  <div class="shp-notification-rule-header"><strong>{labels[rule.type]}</strong><label><span>启用</span><input type="checkbox" class="b3-switch fn__flex-center" checked={rule.enabled} {disabled} onchange={(e) => patch({ enabled: e.currentTarget.checked })} /></label></div>
  <SettingRow title="标题" description="通知中显示的规则标题"><input class="b3-text-field control-lg" value={rule.title} {disabled} onchange={(e) => patch({ title: e.currentTarget.value })} /></SettingRow>
  <SettingRow title="通知时间" description="每天检查并发送该规则的时间"><input type="time" class="b3-text-field control-sm" value={rule.time ?? "08:00"} {disabled} onchange={(e) => patch({ time: e.currentTarget.value })} /></SettingRow>
  {#if rule.type === "advance_events"}<SettingRow title="提前天数" description="使用逗号或空格分隔多个提前天数"><input class="b3-text-field control-md" value={(rule.advanceDays ?? []).join(", ")} {disabled} onchange={(e) => setAdvanceDays(e.currentTarget.value)} /></SettingRow>{/if}
  {#if rule.type === "upcoming_digest"}<SettingRow title="摘要范围" description="汇总未来指定天数内的纪念日"><input type="number" class="b3-text-field control-sm" min="1" max="365" value={rule.upcomingDays ?? 7} {disabled} onchange={(e) => patch({ upcomingDays: Number(e.currentTarget.value) })} /></SettingRow>{/if}
  <NotificationTargetSelector bind:value={rule.deliveryTargets} {disabled} />
  {#if rule.deliveryTargets.some((target) => target.kind === "mobile")}<p class="shp-notification-rule-hint">纪念日时间可提前计算，会注册为当前手机的本地计划；修改事件或规则后自动对账。</p>{/if}
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
