<script lang="ts">
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import NotificationTargetSelector from "@/features/notification-center/components/NotificationTargetSelector.svelte";
  import type { EnhancedDiaryNotifyRule } from "../types";
  interface Props { rule: EnhancedDiaryNotifyRule; disabled?: boolean; onDelete: () => void; }
  let { rule = $bindable(), disabled = false, onDelete }: Props = $props();
  const patch = (next: Partial<EnhancedDiaryNotifyRule>) => { rule = { ...rule, ...next }; };
  const labels: Record<EnhancedDiaryNotifyRule["type"], string> = {
    today_diary_missing: "今日日记未创建", yesterday_review_missing: "昨日未复盘", weekly_review_reminder: "周复盘提醒",
    daily_review_due: "日复盘待完成", monthly_review_due: "月复盘待完成", yearly_review_due: "年度复盘待完成",
    unmigrated_tasks_digest: "未迁移任务摘要", workspace_overdue_tasks_digest: "工作台逾期任务摘要",
    stale_workspace_tasks_digest: "长期未处理任务摘要", project_overdue_digest: "项目逾期风险",
    project_stale_digest: "项目长期停滞", project_completed_digest: "项目完成待归档", project_weekly_digest: "项目周进展",
  };
  const weekly = $derived(rule.type === "weekly_review_reminder" || rule.type === "project_weekly_digest");
  const staticMobile = $derived(rule.type === "weekly_review_reminder" || rule.type === "monthly_review_due" || rule.type === "yearly_review_due");
</script>
<div class="shp-notification-rule-card">
  <div class="shp-notification-rule-header"><strong>{labels[rule.type]}</strong><label><span>启用</span><input type="checkbox" class="b3-switch fn__flex-center" checked={rule.enabled} {disabled} onchange={(e) => patch({ enabled: e.currentTarget.checked })} /></label></div>
  <SettingRow title="标题" description="通知中显示的规则标题"><input class="b3-text-field control-lg" value={rule.title} {disabled} onchange={(e) => patch({ title: e.currentTarget.value })} /></SettingRow>
  <SettingRow title="通知时间" description="每天检查并发送该规则的时间"><input type="time" class="b3-text-field control-sm" value={rule.time ?? "09:00"} {disabled} onchange={(e) => patch({ time: e.currentTarget.value })} /></SettingRow>
  {#if weekly}<SettingRow title="星期" description="每周发送提醒的日期"><select class="b3-text-field control-sm" value={rule.weekday ?? 5} {disabled} onchange={(e) => patch({ weekday: Number(e.currentTarget.value) })}><option value="0">周日</option><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option></select></SettingRow>{/if}
  {#if rule.type === "project_stale_digest" || rule.type === "stale_workspace_tasks_digest"}<SettingRow title="无活动天数" description="超过该天数后纳入摘要（1～365）"><input type="number" class="b3-text-field control-sm" min="1" max="365" value={rule.inactiveDaysThreshold ?? (rule.type === "project_stale_digest" ? 14 : 7)} {disabled} onchange={(e) => patch({ inactiveDaysThreshold: Number(e.currentTarget.value) })} /></SettingRow>{/if}
  <NotificationTargetSelector bind:value={rule.deliveryTargets} {disabled} showMobileRuntimeHint={!staticMobile} />
  <p class="shp-notification-rule-hint">{staticMobile ? "固定复盘提醒可提前注册到移动系统。" : "动态项目和任务摘要需要手机端思源在通知时间附近运行。"}</p>
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
