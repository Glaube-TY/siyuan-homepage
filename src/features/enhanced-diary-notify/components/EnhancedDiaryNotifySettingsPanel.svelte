<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import { isNotificationCenterFeatureAvailable } from "@/features/notification-center";
  import TaskNotifySettingsForm from "@/features/task-notify/components/TaskNotifySettingsForm.svelte";
  import EnhancedDiaryNotifyRuleEditor from "./EnhancedDiaryNotifyRuleEditor.svelte";
  import { DEFAULT_ENHANCED_DIARY_NOTIFY_SETTINGS } from "../constants";
  import { loadEnhancedDiaryNotifySettings, saveEnhancedDiaryNotifySettings } from "../enhanced-diary-notify-settings-store";
  import { createEnhancedDiaryNotifyRule, type EnhancedDiaryNotifyRuleType, type EnhancedDiaryNotifySettings } from "../types";

  type Category = "review" | "tasks" | "projects";
  let settings = $state<EnhancedDiaryNotifySettings>(structuredClone(DEFAULT_ENHANCED_DIARY_NOTIFY_SETTINGS));
  let reviewType = $state<EnhancedDiaryNotifyRuleType>("today_diary_missing");
  let taskType = $state<EnhancedDiaryNotifyRuleType>("unmigrated_tasks_digest");
  let projectType = $state<EnhancedDiaryNotifyRuleType>("project_overdue_digest");
  let loading = $state(true);
  let saving = $state(false);
  let loadError = $state<string | null>(null);
  const advancedEnabled = $derived(isNotificationCenterFeatureAvailable());
  const disabled = $derived(!advancedEnabled || loading || saving || loadError !== null);
  const categories: Record<EnhancedDiaryNotifyRuleType, Category> = {
    today_diary_missing: "review", yesterday_review_missing: "review", weekly_review_reminder: "review",
    daily_review_due: "review", monthly_review_due: "review", yearly_review_due: "review",
    unmigrated_tasks_digest: "tasks", workspace_overdue_tasks_digest: "tasks", stale_workspace_tasks_digest: "tasks",
    project_overdue_digest: "projects", project_stale_digest: "projects", project_completed_digest: "projects", project_weekly_digest: "projects",
  };
  async function reload(): Promise<void> {
    loading = true; loadError = null;
    try { settings = await loadEnhancedDiaryNotifySettings(); }
    catch (error) { loadError = error instanceof Error ? error.message : "强化日记通知设置读取失败，请检查设置文件。"; }
    finally { loading = false; }
  }
  function addRule(type: EnhancedDiaryNotifyRuleType): void {
    if ((type === "today_diary_missing" || type === "yesterday_review_missing") && settings.rules.some((rule) => rule.type === type)) {
      showMessage("该日记提醒已存在，请直接编辑现有规则。", 3000, "info"); return;
    }
    settings.rules = [...settings.rules, createEnhancedDiaryNotifyRule(type)];
  }
  async function save(): Promise<void> {
    if (loading || loadError) return;
    if (settings.rules.some((rule) => rule.enabled && rule.deliveryTargets.length === 0)) {
      showMessage("启用的强化日记规则必须至少选择一种通知方式。", 5000, "error"); return;
    }
    saving = true;
    try { settings = await saveEnhancedDiaryNotifySettings(settings); showMessage("强化日记专属通知设置已保存。"); }
    catch (error) { showMessage(error instanceof Error ? error.message : "保存失败。", 5000, "error"); }
    finally { saving = false; }
  }
  onMount(() => { void reload(); });
</script>

<div class="shp-notification-settings-panel">
  <div class="panel-header"><h3>强化日记统一通知</h3><p>通用任务与强化日记专属通知分别保存，读取或保存失败互不覆盖。</p></div>

  <SettingSection title="1. 通用任务通知">
    <p class="section-note">直接管理全局 taskNotifySettings.json；仍由唯一的 taskNotifyScheduler 和现有移动计划 Provider 发送。</p>
    <TaskNotifySettingsForm {advancedEnabled} />
  </SettingSection>

  {#if loadError}<div class="load-error"><span>强化日记专属通知设置读取失败，未允许覆盖原设置。<br />{loadError}</span><button type="button" class="b3-button b3-button--text" disabled={loading} onclick={() => void reload()}>重新加载</button></div>{:else if loading}<div class="loading">强化日记专属通知设置加载中…</div>{/if}

  <SettingSection title="强化日记专属基础设置">
    <SettingRow title="启用强化日记通知" description="仅控制日记、复盘、任务整理与项目进展规则"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.enabled} {disabled} /></SettingRow>
    <SettingRow title="扫描间隔" description="检查强化日记状态的间隔，单位为毫秒"><input type="number" class="b3-text-field control-sm" min="10000" max="3600000" bind:value={settings.scanIntervalMs} {disabled} /></SettingRow>
    <SettingRow title="补发窗口" description="允许补发错过通知的时间范围，单位为分钟"><input type="number" class="b3-text-field control-sm" min="1" max="1440" bind:value={settings.catchUpWindowMinutes} {disabled} /></SettingRow>
    <SettingRow title="摘要最多项目数" description="单次摘要中包含的条目数量上限"><input type="number" class="b3-text-field control-sm" min="1" max="100" bind:value={settings.maxItemsPerMessage} {disabled} /></SettingRow>
    <SettingRow title="显示项目路径" description="在项目摘要中显示根项目路径"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.includeProjectPath} {disabled} /></SettingRow>
    <SettingRow title="包含思源链接" description="为具体日记或根项目附带思源链接"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.includeSiyuanLink} {disabled} /></SettingRow>
  </SettingSection>

  <SettingSection title="2. 日记与复盘">
    <div class="add-row"><select class="b3-text-field control-md" bind:value={reviewType} {disabled}><option value="today_diary_missing">今日日记未创建</option><option value="yesterday_review_missing">昨日未复盘</option><option value="daily_review_due">日复盘待完成</option><option value="weekly_review_reminder">周复盘提醒</option><option value="monthly_review_due">月复盘待完成</option><option value="yearly_review_due">年度复盘待完成</option></select><button type="button" class="b3-button b3-button--text" {disabled} onclick={() => addRule(reviewType)}>添加规则</button></div>
    <div class="rule-list">{#each settings.rules as rule, index (rule.id)}{#if categories[rule.type] === "review"}<EnhancedDiaryNotifyRuleEditor bind:rule={settings.rules[index]} {disabled} onDelete={() => settings.rules = settings.rules.filter((_, i) => i !== index)} />{/if}{/each}</div>
  </SettingSection>

  <SettingSection title="3. 任务整理">
    <p class="section-note">只处理日记任务迁移与工作台遗留任务；普通任务提醒由上方通用任务通知唯一负责。</p>
    <div class="add-row"><select class="b3-text-field control-md" bind:value={taskType} {disabled}><option value="unmigrated_tasks_digest">未迁移任务摘要</option><option value="workspace_overdue_tasks_digest">工作台逾期任务摘要</option><option value="stale_workspace_tasks_digest">长期未处理任务摘要</option></select><button type="button" class="b3-button b3-button--text" {disabled} onclick={() => addRule(taskType)}>添加规则</button></div>
    <div class="rule-list">{#each settings.rules as rule, index (rule.id)}{#if categories[rule.type] === "tasks"}<EnhancedDiaryNotifyRuleEditor bind:rule={settings.rules[index]} {disabled} onDelete={() => settings.rules = settings.rules.filter((_, i) => i !== index)} />{/if}{/each}</div>
  </SettingSection>

  <SettingSection title="4. 项目进展">
    <p class="section-note">按活动根项目汇总子项目风险；动态摘要需要手机端思源在通知时间附近运行。</p>
    <div class="add-row"><select class="b3-text-field control-md" bind:value={projectType} {disabled}><option value="project_overdue_digest">项目逾期风险</option><option value="project_stale_digest">项目长期停滞</option><option value="project_completed_digest">项目完成待归档</option><option value="project_weekly_digest">项目周进展</option></select><button type="button" class="b3-button b3-button--text" {disabled} onclick={() => addRule(projectType)}>添加规则</button></div>
    <div class="rule-list">{#each settings.rules as rule, index (rule.id)}{#if categories[rule.type] === "projects"}<EnhancedDiaryNotifyRuleEditor bind:rule={settings.rules[index]} {disabled} onDelete={() => settings.rules = settings.rules.filter((_, i) => i !== index)} />{/if}{/each}</div>
  </SettingSection>

  <SettingSection title="5. 数据维护"><p class="section-note">模板缺失、项目关系异常和索引异常继续由强化日记内部通知面板维护，不会默认投递到桌面、移动端或外联渠道。</p></SettingSection>
  {#if !advancedEnabled}<p class="locked">当前会员状态不可用；两个配置文件中的已有设置均会保留。</p>{/if}
  <div class="panel-footer"><button type="button" class="b3-button b3-button--text" {disabled} onclick={save}>{saving ? "保存中…" : "保存强化日记专属通知"}</button></div>
</div>

<style>
  .shp-notification-settings-panel, .rule-list { display: grid; gap: 12px; min-width: 0; }
  .panel-header h3, .panel-header p, .section-note, .locked { margin: 0; }
  .panel-header p, .section-note, .locked, .loading { color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
  .add-row, .panel-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
  .load-error { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: var(--b3-theme-error); background: var(--b3-theme-surface); font-size: 12px; line-height: 1.5; }
  @media (max-width: 600px) { .add-row, .load-error { align-items: stretch; flex-direction: column; } .add-row > :global(*) { width: 100%; } }
</style>
