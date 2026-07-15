<script lang="ts">
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import NotificationTargetSelector from "@/features/notification-center/components/NotificationTargetSelector.svelte";
  import type { TaskNotifyRule } from "../types";
  interface Props { rule: TaskNotifyRule; disabled?: boolean; onDelete: () => void; }
  let { rule = $bindable(), disabled = false, onDelete }: Props = $props();
  const patch = (next: Partial<TaskNotifyRule>) => { rule = { ...rule, ...next }; };
  const labels: Record<TaskNotifyRule["type"], string> = { task_reminder: "任务固定提醒", today_digest: "今日任务摘要", tomorrow_digest: "明日任务摘要", overdue_digest: "逾期任务摘要", priority_digest: "高优先级摘要", custom_filter_digest: "自定义筛选摘要" };
</script>
<div class="shp-notification-rule-card">
  <div class="shp-notification-rule-header"><strong>{labels[rule.type]}</strong><label><span>启用</span><input type="checkbox" class="b3-switch fn__flex-center" checked={rule.enabled} {disabled} onchange={(e) => patch({ enabled: e.currentTarget.checked })} /></label></div>
  <SettingRow title="标题" description="通知中显示的规则标题"><input class="b3-text-field control-lg" value={rule.title} {disabled} onchange={(e) => patch({ title: e.currentTarget.value })} /></SettingRow>
  {#if rule.type !== "task_reminder"}<SettingRow title="通知时间" description="每天生成任务摘要的时间"><input type="time" class="b3-text-field control-sm" value={rule.time ?? "09:00"} {disabled} onchange={(e) => patch({ time: e.currentTarget.value })} /></SettingRow>{/if}
  {#if rule.type === "priority_digest"}<SettingRow title="最低优先级" description="只包含达到此优先级的任务"><input type="number" class="b3-text-field control-sm" min="1" max="4" value={rule.priorityMin ?? 4} {disabled} onchange={(e) => patch({ priorityMin: Number(e.currentTarget.value) })} /></SettingRow>{/if}
  {#if rule.type === "custom_filter_digest"}<SettingRow title="筛选表达式" description="使用现有任务筛选语法选择摘要内容"><input class="b3-text-field control-lg" value={rule.customFilter ?? "not done"} {disabled} onchange={(e) => patch({ customFilter: e.currentTarget.value })} /></SettingRow>{/if}
  <NotificationTargetSelector bind:value={rule.deliveryTargets} {disabled} showMobileRuntimeHint={rule.type !== "task_reminder"} />
  <p class="shp-notification-rule-hint">{rule.type === "task_reminder" ? "固定提醒会提前注册到当前移动设备，可在思源关闭后触发。" : "动态摘要需要通知时刻的最新任务数据；手机端思源完全关闭时不保证触发。"}</p>
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
