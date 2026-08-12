<script lang="ts">
  import { onMount } from "svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { getNotificationDeviceId } from "@/features/notification-center";
  import { createAutomationJobId, type AutomationJobDefinition, type AutomationJobState, type AutomationRunRecord } from "@/features/agent-platform/automation/automation-job-contract";
  import { AUTOMATION_JOBS_CHANGED_EVENT, automationJobStore } from "@/features/agent-platform/automation/automation-job-store";
  import { AUTOMATION_RUNTIME_CHANGED_EVENT } from "@/features/agent-platform/automation/automation-runtime";
  import { requestAutomationRunNow } from "@/features/agent-platform/automation/automation-control";
  import { listAutomationSensors } from "@/features/agent-platform/automation/automation-sensor-registry";
  import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";

  type Kind = "reminder" | "agent" | "monitor";
  type TriggerKind = "once" | "daily" | "weekly" | "monthly" | "interval" | "sensor";
  interface Row { job: AutomationJobDefinition; state?: AutomationJobState }

  let rows = $state<Row[]>([]);
  let runs = $state<AutomationRunRecord[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let view = $state<"jobs" | "runs">("jobs");
  let filter = $state<"all" | Kind>("all");
  let editingId = $state("");
  let copyingJob = $state<AutomationJobDefinition>();
  let name = $state("");
  let kind = $state<Kind>("reminder");
  let content = $state("");
  let triggerKind = $state<TriggerKind>("once");
  let onceAt = $state("");
  let dailyTime = $state("08:00");
  let weeklyDays = $state("1,2,3,4,5");
  let monthlyDays = $state("1");
  let intervalMinutes = $state(60);
  let sensorId = $state("task-overdue");
  let monitorReaction = $state<"notify" | "agent">("notify");
  let desktop = $state(true);
  let mobile = $state(false);
  let external = $state(false);

  const sensors = listAutomationSensors();
  const visibleRows = $derived(rows.filter((row) => filter === "all" || row.job.task.kind === filter));
  const enabledCount = $derived(rows.filter((row) => row.job.enabled).length);
  const failedCount = $derived(rows.filter((row) => row.state?.status === "failed" || row.state?.status === "blocked").length);

  function localDateTimeValue(timestamp: number): string {
    const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
    return date.toISOString().slice(0, 16);
  }
  function formatDate(timestamp?: number): string {
    return timestamp ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(timestamp) : "—";
  }
  function resetForm(): void {
    editingId = ""; copyingJob = undefined; name = ""; kind = "reminder"; content = ""; triggerKind = "once";
    onceAt = localDateTimeValue(Date.now() + 3_600_000); dailyTime = "08:00"; weeklyDays = "1,2,3,4,5"; monthlyDays = "1";
    intervalMinutes = 60; sensorId = sensors[0]?.id ?? "task-overdue"; monitorReaction = "notify";
    desktop = true; mobile = false; external = false;
  }
  function statusLabel(state?: AutomationJobState): string {
    return ({ idle: "等待中", queued: "排队中", running: "运行中", paused: "已暂停", blocked: "已阻断", failed: "上次失败" } as Record<string, string>)[state?.status ?? "idle"] ?? "等待中";
  }
  function kindLabel(value: Kind): string { return value === "reminder" ? "固定提醒" : value === "agent" ? "后台 Agent" : "变化监测"; }

  async function refresh(): Promise<void> {
    loading = true; error = "";
    try {
      const jobs = await automationJobStore.listJobs();
      [rows, runs] = await Promise.all([
        Promise.all(jobs.map(async (job) => ({ job, state: await automationJobStore.getState(job.jobId) }))),
        automationJobStore.listRecentRuns(50),
      ]);
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { loading = false; }
  }

  function edit(row: Row): void {
    const job = row.job; editingId = job.jobId; copyingJob = undefined; name = job.name; kind = job.task.kind;
    content = job.task.kind === "reminder" ? job.task.message : job.task.kind === "agent" ? job.task.execution.goal : job.task.reaction.kind === "notify" ? job.task.reaction.message : job.task.reaction.execution.goal;
    triggerKind = job.trigger.kind;
    if (job.trigger.kind === "once") onceAt = localDateTimeValue(job.trigger.at);
    if (job.trigger.kind === "daily" || job.trigger.kind === "weekly" || job.trigger.kind === "monthly") dailyTime = job.trigger.time;
    if (job.trigger.kind === "weekly") weeklyDays = job.trigger.weekdays.join(",");
    if (job.trigger.kind === "monthly") monthlyDays = job.trigger.daysOfMonth.join(",");
    if (job.trigger.kind === "interval" || job.trigger.kind === "sensor") intervalMinutes = job.trigger.intervalMinutes;
    if (job.trigger.kind === "sensor") sensorId = job.trigger.sensorId;
    if (job.task.kind === "monitor") monitorReaction = job.task.reaction.kind;
    desktop = job.delivery.targets.some((target) => target.kind === "desktop"); mobile = job.delivery.targets.some((target) => target.kind === "mobile"); external = job.delivery.targets.some((target) => target.kind === "external-default");
  }

  async function save(): Promise<void> {
    if (!name.trim() || !content.trim()) { error = "请填写名称和内容。"; return; }
    saving = true; error = "";
    try {
      const current = editingId ? await automationJobStore.getJob(editingId) : undefined;
      const base = current ?? copyingJob;
      const now = Date.now(); const timeZone = base?.trigger.timeZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai");
      const parseDays = (value: string, max: number) => Array.from(new Set(value.split(",").map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= max)));
      const trigger = kind === "monitor" || triggerKind === "sensor"
        ? { kind: "sensor" as const, sensorId, intervalMinutes, timeZone }
        : triggerKind === "daily" ? { kind: "daily" as const, time: dailyTime, timeZone }
        : triggerKind === "weekly" ? { kind: "weekly" as const, time: dailyTime, weekdays: parseDays(weeklyDays, 7), timeZone }
        : triggerKind === "monthly" ? { kind: "monthly" as const, time: dailyTime, daysOfMonth: parseDays(monthlyDays, 31), timeZone }
        : triggerKind === "interval" ? { kind: "interval" as const, intervalMinutes, anchorAt: base?.trigger.kind === "interval" ? base.trigger.anchorAt : now, timeZone }
        : { kind: "once" as const, at: new Date(onceAt).getTime(), timeZone };
      const execution = { goal: content.trim(), profileId: "background-job", allowedToolNames: ["siyuan_kb", "diary_task"], allowedActionNames: ["siyuan_kb:search", "siyuan_kb:read_docs", "siyuan_kb:read_evidence", "siyuan_kb:get_doc_info", "siyuan_kb:list_map", "siyuan_kb:list_by_time", "siyuan_kb:outline", "diary_task:overview", "diary_task:query_tasks", "diary_task:query_records", "diary_task:find_docs"], memoryAccess: "read" as const, budget: { maxTokens: 30_000, maxToolCalls: 12, maxDurationMs: 300_000 } };
      const task = kind === "reminder" ? { kind: "reminder" as const, message: content.trim() }
        : kind === "agent" ? { kind: "agent" as const, execution: base?.task.kind === "agent" ? { ...base.task.execution, goal: content.trim() } : execution }
        : { kind: "monitor" as const, reaction: monitorReaction === "agent"
          ? { kind: "agent" as const, execution: base?.task.kind === "monitor" && base.task.reaction.kind === "agent" ? { ...base.task.reaction.execution, goal: content.trim() } : execution }
          : { kind: "notify" as const, message: content.trim() } };
      const preservedTargets = base?.delivery.targets.filter((target) => target.kind === "external" || target.kind === "robot") ?? [];
      const targets = [...preservedTargets, ...[desktop ? { kind: "desktop" as const } : null, mobile ? { kind: "mobile" as const } : null, external ? { kind: "external-default" as const } : null].filter((target): target is NonNullable<typeof target> => Boolean(target))];
      if (targets.length === 0) throw new Error("请至少选择一个投递目标。");
      const job: AutomationJobDefinition = {
        schemaVersion: 1, jobId: current?.jobId ?? createAutomationJobId(), revision: current ? current.revision + 1 : 1,
        name: name.trim(), enabled: base?.enabled ?? true, source: current?.source ?? { surface: "settings" }, trigger, task,
        runner: base?.runner ?? { deviceId: getNotificationDeviceId(), runtime: "frontend", requiredCapabilities: [] },
        policy: base?.policy ?? { catchUp: "latest", overlap: "skip", maxRetries: 1, maxConsecutiveFailures: 3, expiresAfterMs: 86_400_000 },
        delivery: { targets, notifyWhen: kind === "reminder" ? "always" : kind === "monitor" ? "change-only" : "result-or-error" },
        createdAt: current?.createdAt ?? now, updatedAt: now,
      };
      await automationJobStore.saveJob(job, current?.revision); resetForm(); await refresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { saving = false; }
  }

  async function toggle(row: Row): Promise<void> {
    const job = row.job; await automationJobStore.saveJob({ ...job, revision: job.revision + 1, enabled: !job.enabled, updatedAt: Date.now() }, job.revision); await refresh();
  }
  async function remove(row: Row): Promise<void> {
    if (!await confirmDialogBoolean({ title: "删除自动化任务", content: safeConfirmContent(`确定删除“${row.job.name}”？运行历史会保留。`) })) return;
    await automationJobStore.deleteJob(row.job.jobId, row.job.revision); await refresh();
  }
  function duplicate(row: Row): void { edit(row); editingId = ""; copyingJob = row.job; name = `${row.job.name}（副本）`; }
  function runNow(row: Row): void { void requestAutomationRunNow(row.job.jobId).catch((cause) => error = cause instanceof Error ? cause.message : String(cause)); }
  function onChanged(): void { void refresh(); }

  onMount(() => {
    resetForm(); void refresh(); window.addEventListener(AUTOMATION_JOBS_CHANGED_EVENT, onChanged); window.addEventListener(AUTOMATION_RUNTIME_CHANGED_EVENT, onChanged);
    return () => { window.removeEventListener(AUTOMATION_JOBS_CHANGED_EVENT, onChanged); window.removeEventListener(AUTOMATION_RUNTIME_CHANGED_EVENT, onChanged); };
  });
</script>

<section class="automation-center" aria-labelledby="automation-heading">
  <header class="center-header">
    <div><h3 id="automation-heading">自动化中心</h3><p>让提醒、后台 Agent 和变化监测使用同一个调度器与通知出口。</p></div>
    <button type="button" class="icon-button" aria-label="刷新自动化中心" title="刷新" onclick={() => void refresh()}><SiyuanIcon name="iconRefresh" size={15} /></button>
  </header>
  <div class="summary-strip" aria-label="自动化概览">
    <span><strong>{rows.length}</strong> 全部任务</span><span><strong>{enabledCount}</strong> 正在运行</span><span class:error-text={failedCount > 0}><strong>{failedCount}</strong> 需要处理</span>
  </div>
  <div class="view-tabs"><button type="button" class:active={view === "jobs"} onclick={() => view = "jobs"}>任务</button><button type="button" class:active={view === "runs"} onclick={() => view = "runs"}>运行记录</button></div>
  {#if error}<div class="state error" role="alert">{error}</div>{/if}
  {#if view === "jobs"}
    <div class="composer">
      <div class="composer-title"><strong>{editingId ? "编辑自动化" : "新建自动化"}</strong>{#if editingId}<button type="button" class="text-button" onclick={resetForm}>取消编辑</button>{/if}</div>
      <div class="form-grid">
        <label><span>名称</span><input class="b3-text-field" bind:value={name} placeholder="如：每天早报" /></label>
        <label><span>类型</span><select class="b3-select" bind:value={kind} onchange={() => { if (kind === "monitor") triggerKind = "sensor"; }}><option value="reminder">固定提醒</option><option value="agent">后台 Agent</option><option value="monitor">变化监测</option></select></label>
        <label><span>触发方式</span><select class="b3-select" bind:value={triggerKind} disabled={kind === "monitor"}><option value="once">仅一次</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="interval">按间隔</option>{#if kind === "monitor"}<option value="sensor">数据变化</option>{/if}</select></label>
        {#if triggerKind === "once"}<label><span>执行时间</span><input class="b3-text-field" type="datetime-local" bind:value={onceAt} /></label>{/if}
        {#if triggerKind === "daily" || triggerKind === "weekly" || triggerKind === "monthly"}<label><span>执行时间</span><input class="b3-text-field" type="time" bind:value={dailyTime} /></label>{/if}
        {#if triggerKind === "weekly"}<label><span>星期（1-7，逗号分隔）</span><input class="b3-text-field" bind:value={weeklyDays} placeholder="1,2,3,4,5" /></label>{/if}
        {#if triggerKind === "monthly"}<label><span>日期（1-31，逗号分隔）</span><input class="b3-text-field" bind:value={monthlyDays} placeholder="1,15" /></label>{/if}
        {#if triggerKind === "interval" || triggerKind === "sensor"}<label><span>检查间隔（分钟）</span><input class="b3-text-field" type="number" min="1" max="10080" bind:value={intervalMinutes} /></label>{/if}
        {#if triggerKind === "sensor"}<label><span>监测对象</span><select class="b3-select" bind:value={sensorId}>{#each sensors as sensor}<option value={sensor.id}>{sensor.label}</option>{/each}</select></label>{/if}
        {#if kind === "monitor"}<label><span>变化后动作</span><select class="b3-select" bind:value={monitorReaction}><option value="notify">直接通知</option><option value="agent">交给 Agent 处理</option></select></label>{/if}
        <label class="wide"><span>{kind === "reminder" ? "提醒内容" : kind === "agent" || monitorReaction === "agent" ? "执行目标" : "变化后通知"}</span><textarea class="b3-text-field" rows="3" bind:value={content} placeholder={kind === "agent" || monitorReaction === "agent" ? "说明 Agent 到点后要读取什么、整理什么" : "输入要发送的内容"}></textarea></label>
      </div>
      <div class="target-row"><span>投递到</span><label><input type="checkbox" bind:checked={desktop} />桌面</label><label><input type="checkbox" bind:checked={mobile} />移动端</label><label><input type="checkbox" bind:checked={external} />默认外联</label>{#if editingId && rows.find((row) => row.job.jobId === editingId)?.job.delivery.targets.some((target) => target.kind === "external" || target.kind === "robot")}<small>专用外联/机器人路由将保留</small>{/if}<button type="button" class="b3-button b3-button--small" disabled={saving} onclick={() => void save()}>{saving ? "保存中…" : editingId ? "保存修改" : "创建任务"}</button></div>
    </div>
    <div class="filter-row">{#each [["all", "全部"], ["reminder", "提醒"], ["agent", "Agent"], ["monitor", "监测"]] as item}<button type="button" class:active={filter === item[0]} onclick={() => filter = item[0] as typeof filter}>{item[1]}</button>{/each}</div>
    {#if loading}<div class="state">正在读取自动化任务…</div>{:else if visibleRows.length === 0}<div class="state empty">还没有符合条件的任务，可在上方直接创建。</div>{:else}<div class="job-list">{#each visibleRows as row (row.job.jobId)}<article class="job-row"><div class="job-marker" data-kind={row.job.task.kind}></div><div class="job-main"><div class="job-title"><strong>{row.job.name}</strong><span>{kindLabel(row.job.task.kind)}</span><span class:danger={row.state?.status === "failed" || row.state?.status === "blocked"}>{row.job.enabled ? statusLabel(row.state) : "已停用"}</span></div><div class="job-meta"><span>下次：{formatDate(row.state?.nextRunAt)}</span><span>上次：{formatDate(row.state?.lastCompletedAt)}</span><span>Runner：{row.job.runner.deviceId}</span><span>连续失败：{row.state?.consecutiveFailures ?? 0}</span></div></div><div class="job-actions"><button type="button" title="立即运行" aria-label={`立即运行 ${row.job.name}`} onclick={() => runNow(row)}><SiyuanIcon name="iconPlay" size={14} /></button><button type="button" title="编辑" aria-label={`编辑 ${row.job.name}`} onclick={() => edit(row)}><SiyuanIcon name="iconEdit" size={14} /></button><button type="button" title="复制" aria-label={`复制 ${row.job.name}`} onclick={() => duplicate(row)}><SiyuanIcon name="iconCopy" size={14} /></button><button type="button" title={row.job.enabled ? "暂停" : "启用"} aria-label={`${row.job.enabled ? "暂停" : "启用"} ${row.job.name}`} onclick={() => void toggle(row)}><SiyuanIcon name={row.job.enabled ? "iconPause" : "iconPlay"} size={14} /></button><button type="button" title="删除" aria-label={`删除 ${row.job.name}`} onclick={() => void remove(row)}><SiyuanIcon name="iconTrashcan" size={14} /></button></div></article>{/each}</div>{/if}
  {:else}
    {#if loading}<div class="state">正在读取运行记录…</div>{:else if runs.length === 0}<div class="state empty">任务运行后，结果会保留在这里。</div>{:else}<div class="run-list">{#each runs as run (run.runId)}<article class="run-row"><span class="run-status" data-status={run.status}>{run.status === "succeeded" ? "成功" : run.status === "failed" ? "失败" : run.status === "skipped" ? "无变化" : run.status}</span><div><strong>{rows.find((row) => row.job.jobId === run.jobId)?.job.name ?? run.jobId}</strong><p>{run.result?.summary ?? run.error?.message ?? "正在执行"}</p><small>{run.startedAt && run.completedAt ? `${Math.max(0, run.completedAt - run.startedAt)}ms` : ""}{run.usage ? ` · ${run.usage.totalTokens} tokens` : ""}{run.toolSummaries.length ? ` · ${run.toolSummaries.length} 次工具` : ""}</small></div><time>{formatDate(run.updatedAt)}</time></article>{/each}</div>{/if}
  {/if}
</section>

<style>
  .automation-center{display:flex;flex-direction:column;gap:12px;color:var(--b3-theme-on-surface)}
  .center-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.center-header h3{margin:0 0 4px;font-size:16px}.center-header p{margin:0;color:var(--b3-theme-on-surface-light);font-size:12px;line-height:1.5}
  .icon-button,.job-actions button{display:grid;place-items:center;min-width:32px;height:32px;padding:0;border:1px solid var(--b3-border-color);border-radius:7px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);cursor:pointer}
  .summary-strip{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--b3-border-color);border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--b3-theme-primary) 4%,var(--b3-theme-surface))}.summary-strip span{display:flex;align-items:baseline;gap:6px;padding:10px 12px;font-size:12px;border-right:1px solid var(--b3-border-color)}.summary-strip span:last-child{border:0}.summary-strip strong{font-size:18px}.error-text{color:var(--b3-theme-error)}
  .view-tabs,.filter-row{display:flex;gap:4px}.view-tabs{border-bottom:1px solid var(--b3-border-color)}.view-tabs button,.filter-row button,.text-button{border:0;background:transparent;color:var(--b3-theme-on-surface-light);cursor:pointer;padding:7px 10px;border-radius:6px}.view-tabs button.active{color:var(--b3-theme-primary);box-shadow:inset 0 -2px var(--b3-theme-primary);border-radius:0}.filter-row button.active{background:color-mix(in srgb,var(--b3-theme-primary) 12%,transparent);color:var(--b3-theme-primary)}
  .composer{padding:12px;border:1px solid var(--b3-border-color);border-radius:9px;background:color-mix(in srgb,var(--b3-theme-primary) 3%,var(--b3-theme-surface))}.composer-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.form-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px}.form-grid .wide{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea{box-sizing:border-box;width:100%}.target-row{display:flex;align-items:center;gap:14px;margin-top:10px;font-size:12px}.target-row label{display:flex;align-items:center;gap:5px}.target-row button{margin-left:auto}
  .job-list,.run-list{display:flex;flex-direction:column;border:1px solid var(--b3-border-color);border-radius:9px;overflow:hidden}.job-row,.run-row{display:flex;align-items:center;gap:11px;min-height:52px;padding:9px 10px;border-bottom:1px solid var(--b3-border-color);background:var(--b3-theme-surface)}.job-row:last-child,.run-row:last-child{border:0}.job-marker{width:4px;align-self:stretch;border-radius:4px;background:var(--b3-theme-primary)}.job-marker[data-kind="agent"]{background:#7c5cff}.job-marker[data-kind="monitor"]{background:#e29b35}.job-main{min-width:0;flex:1}.job-title,.job-meta{display:flex;align-items:center;gap:8px}.job-title span,.job-meta{font-size:11px;color:var(--b3-theme-on-surface-light)}.job-title .danger{color:var(--b3-theme-error)}.job-meta{margin-top:5px;flex-wrap:wrap}.job-actions{display:flex;gap:5px}.job-actions button{min-width:30px;height:30px}.job-actions button:hover,.icon-button:hover{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}
  .run-row{align-items:flex-start}.run-row>div{min-width:0;flex:1}.run-row p{margin:4px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--b3-theme-on-surface-light);font-size:12px}.run-row small,.run-row time{font-size:11px;color:var(--b3-theme-on-surface-light)}.run-status{min-width:48px;padding:3px 5px;border-radius:5px;text-align:center;font-size:11px;background:var(--b3-theme-surface-light)}.run-status[data-status="succeeded"]{color:#24924a;background:color-mix(in srgb,#24924a 12%,transparent)}.run-status[data-status="failed"]{color:var(--b3-theme-error);background:color-mix(in srgb,var(--b3-theme-error) 10%,transparent)}
  .state{padding:24px;text-align:center;border:1px dashed var(--b3-border-color);border-radius:8px;color:var(--b3-theme-on-surface-light);font-size:12px}.state.error{color:var(--b3-theme-error)}
  @media (max-width:760px){.form-grid{grid-template-columns:1fr}.summary-strip{grid-template-columns:1fr}.summary-strip span{border-right:0;border-bottom:1px solid var(--b3-border-color)}.target-row{align-items:flex-start;flex-wrap:wrap}.target-row button{width:100%;margin-left:0}.job-row{align-items:flex-start}.job-actions{display:grid;grid-template-columns:repeat(2,36px)}.job-actions button{min-width:36px;height:36px}}
</style>
