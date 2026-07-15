<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import TaskNotifyRuleEditor from "./TaskNotifyRuleEditor.svelte";
  import { DEFAULT_TASK_NOTIFY_SETTINGS, TASK_NOTIFY_SETTINGS_CHANGED_EVENT } from "../constants";
  import { loadTaskNotifySettings, saveTaskNotifySettings } from "../task-notify-settings-store";
  import { createTaskNotifyRule, type TaskNotifyRuleType, type TaskNotifySettings } from "../types";

  interface Props { advancedEnabled: boolean; onSaved?: () => void; }
  let { advancedEnabled, onSaved }: Props = $props();
  let settings = $state<TaskNotifySettings>(structuredClone(DEFAULT_TASK_NOTIFY_SETTINGS));
  let selectedType = $state<TaskNotifyRuleType>("task_reminder");
  let loading = $state(true);
  let saving = $state(false);
  let loadError = $state<string | null>(null);
  const singletonTypes = new Set<TaskNotifyRuleType>(["task_reminder", "today_digest", "tomorrow_digest", "overdue_digest", "priority_digest"]);
  const disabled = $derived(!advancedEnabled || loading || saving || loadError !== null);
  const hasRuleType = (type: TaskNotifyRuleType) => settings.rules.some((rule) => rule.type === type);
  const canAddSelectedType = $derived(!singletonTypes.has(selectedType) || !hasRuleType(selectedType));

  function assertUniqueRuleIds(next: TaskNotifySettings): void {
    const ids = new Set<string>();
    for (const rule of next.rules) {
      if (ids.has(rule.id)) throw new Error(`任务通知规则 ID 重复：${rule.id}。请先备份并修复设置文件。`);
      ids.add(rule.id);
    }
  }

  function addRule(): void {
    if (singletonTypes.has(selectedType) && hasRuleType(selectedType)) {
      showMessage("该规则已经存在，请直接编辑现有规则。", 3000, "info");
      return;
    }
    let nextRule = createTaskNotifyRule(selectedType);
    for (let attempt = 0; settings.rules.some((rule) => rule.id === nextRule.id) && attempt < 5; attempt += 1) {
      nextRule = createTaskNotifyRule(selectedType);
    }
    if (settings.rules.some((rule) => rule.id === nextRule.id)) {
      showMessage("无法生成唯一规则 ID，请稍后重试。", 5000, "error");
      return;
    }
    settings.rules = [...settings.rules, nextRule];
  }

  async function reload(): Promise<void> {
    loading = true;
    loadError = null;
    try {
      const loaded = await loadTaskNotifySettings();
      assertUniqueRuleIds(loaded);
      settings = loaded;
    }
    catch (error) { loadError = error instanceof Error ? error.message : "任务通知设置读取失败，请检查设置文件。"; }
    finally { loading = false; }
  }
  async function save(): Promise<void> {
    if (loading || loadError) return;
    if (settings.rules.some((rule) => rule.enabled && rule.deliveryTargets.length === 0)) {
      showMessage("启用的任务通知规则必须至少选择一种通知方式。", 5000, "error"); return;
    }
    saving = true;
    try { settings = await saveTaskNotifySettings(settings); showMessage("任务通知设置已保存。"); onSaved?.(); }
    catch (error) { showMessage(error instanceof Error ? error.message : "保存失败。", 5000, "error"); }
    finally { saving = false; }
  }
  onMount(() => {
    const handleChanged = () => { if (!saving) void reload(); };
    window.addEventListener(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, handleChanged);
    void reload();
    return () => window.removeEventListener(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, handleChanged);
  });
</script>

<div class="task-notify-form">
  {#if loadError}<div class="shp-notification-load-error"><span>任务通知设置读取失败，未允许覆盖原设置。<br />{loadError}</span><button type="button" class="b3-button b3-button--text" disabled={loading} onclick={() => void reload()}>重新加载</button></div>{:else if loading}<div class="shp-notification-loading">任务通知设置加载中…</div>{/if}
  <SettingSection title="基础设置">
    <SettingRow title="启用任务通知" description="控制全部通用任务通知规则是否运行"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.enabled} {disabled} /></SettingRow>
    <SettingRow title="扫描间隔" description="检查任务状态的间隔，单位为毫秒"><input type="number" class="b3-text-field control-sm" min="10000" max="3600000" bind:value={settings.scanIntervalMs} {disabled} /></SettingRow>
    <SettingRow title="补发窗口" description="允许补发错过通知的时间范围，单位为分钟"><input type="number" class="b3-text-field control-sm" min="1" max="1440" bind:value={settings.catchUpWindowMinutes} {disabled} /></SettingRow>
    <SettingRow title="摘要最多任务数" description="单次摘要中包含的任务数量上限"><input type="number" class="b3-text-field control-sm" min="1" max="100" bind:value={settings.maxTasksPerMessage} {disabled} /></SettingRow>
    <SettingRow title="包含来源路径" description="在通知正文中显示任务来源路径"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.includeSourcePath} {disabled} /></SettingRow>
    <SettingRow title="包含思源链接" description="在通知中附带可打开思源的链接"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.includeSiyuanLink} {disabled} /></SettingRow>
  </SettingSection>
  <SettingSection title="通知规则">
    <SettingRow title="新增规则" description="使用 task-notify 的全局规则与唯一调度器"><div class="shp-notification-add-rule"><select class="b3-text-field control-md" bind:value={selectedType} {disabled}><option value="task_reminder" disabled={hasRuleType("task_reminder")}>任务指定时间提醒</option><option value="today_digest" disabled={hasRuleType("today_digest")}>今日任务摘要</option><option value="tomorrow_digest" disabled={hasRuleType("tomorrow_digest")}>明日任务摘要</option><option value="overdue_digest" disabled={hasRuleType("overdue_digest")}>逾期任务摘要</option><option value="priority_digest" disabled={hasRuleType("priority_digest")}>高优先级任务摘要</option><option value="custom_filter_digest">自定义筛选摘要</option></select><button type="button" class="b3-button b3-button--text" disabled={disabled || !canAddSelectedType} onclick={addRule}>添加规则</button></div></SettingRow>
    {#if !canAddSelectedType}<p class="shp-notification-rule-exists">该规则已经存在，请直接编辑现有规则。</p>{/if}
    <div class="shp-notification-rule-list">{#each settings.rules as rule, index (rule.id)}<TaskNotifyRuleEditor bind:rule={settings.rules[index]} {disabled} onDelete={() => settings.rules = settings.rules.filter((_, i) => i !== index)} />{/each}</div>
  </SettingSection>
  {#if !advancedEnabled}<p class="shp-notification-locked">当前会员状态不可用；已有设置会保留。</p>{/if}
  <div class="form-footer"><button type="button" class="b3-button b3-button--text" {disabled} onclick={save}>{saving ? "保存中…" : "保存通用任务通知"}</button></div>
</div>

<style>
  .task-notify-form, .shp-notification-rule-list { display: grid; gap: 10px; min-width: 0; }
  .shp-notification-add-rule, .form-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
  .shp-notification-load-error { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: var(--b3-theme-error); background: var(--b3-theme-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-loading, .shp-notification-locked { margin: 0; color: var(--b3-theme-on-surface); font-size: 12px; }
  .shp-notification-rule-exists { margin: 0; color: var(--b3-theme-on-surface); font-size: 12px; text-align: right; }
  @media (max-width: 600px) { .shp-notification-add-rule, .shp-notification-load-error { align-items: stretch; flex-direction: column; } .shp-notification-add-rule > :global(*) { width: 100%; } }
</style>
