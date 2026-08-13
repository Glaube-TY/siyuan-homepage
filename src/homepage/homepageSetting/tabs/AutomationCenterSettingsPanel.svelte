<script lang="ts">
  import { mount, onMount } from "svelte";
  import { showMessage } from "siyuan";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import type { AutomationJobDefinition, AutomationJobState, AutomationRunRecord } from "@/features/agent-platform/automation/automation-job-contract";
  import { AUTOMATION_JOBS_CHANGED_EVENT, automationJobStore } from "@/features/agent-platform/automation/automation-job-store";
  import { AUTOMATION_RUNTIME_CHANGED_EVENT } from "@/features/agent-platform/automation/automation-runtime";
  import { requestAutomationRunNow } from "@/features/agent-platform/automation/automation-control";
  import { decodeAutomationRobotRoute } from "@/features/agent-platform/automation/automation-robot-route";
  import { confirmDialogBoolean, safeConfirmContent, svelteDialog } from "@/libs/dialog";
  import AutomationJobEditor from "./AutomationJobEditor.svelte";

  type Kind = "agent" | "monitor";
  interface Row { job: AutomationJobDefinition; state?: AutomationJobState }

  let rows = $state<Row[]>([]);
  let runs = $state<AutomationRunRecord[]>([]);
  let loading = $state(true);
  let error = $state("");
  let view = $state<"jobs" | "runs">("jobs");
  let filter = $state<"all" | Kind>("all");
  const visibleRows = $derived(rows.filter((row) => filter === "all" || row.job.task.kind === filter));
  const enabledCount = $derived(rows.filter((row) => row.job.enabled).length);
  const failedCount = $derived(rows.filter((row) => row.state?.status === "failed" || row.state?.status === "blocked").length);

  function formatDate(timestamp?: number): string {
    return timestamp ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(timestamp) : "—";
  }
  function statusLabel(job: AutomationJobDefinition, state?: AutomationJobState): string {
    if (state?.status === "idle" && job.trigger.kind === "once" && state.lastCompletedAt) return "已完成";
    return ({ idle: "等待中", queued: "排队中", running: "运行中", paused: "已暂停", blocked: "已阻断", failed: "上次失败" } as Record<string, string>)[state?.status ?? "idle"] ?? "等待中";
  }
  function kindLabel(value: Kind): string { return value === "agent" ? "定时 Agent" : "心跳任务"; }
  function targetLabel(job: AutomationJobDefinition): string {
    const target = job.output.replyTarget;
    if (!target) return "仅运行记录";
    if (target.kind === "kb-conversation") return "本地 AI 会话";
    try {
      const route = decodeAutomationRobotRoute(target.routeRef);
      return `${route.provider === "wechat" ? "微信" : route.provider === "feishu" ? "飞书" : route.provider === "qq" ? "QQ" : "机器人"}会话`;
    } catch { return "机器人会话"; }
  }

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

  function openEditor(job?: AutomationJobDefinition, copyFrom?: AutomationJobDefinition): void {
    let close = () => {};
    const result = svelteDialog({
      title: job ? "编辑 Agent 自动任务" : copyFrom ? "复制 Agent 自动任务" : "新建 Agent 自动任务",
      width: "min(920px, calc(100vw - 32px))",
      height: "min(720px, calc(100vh - 48px))",
      constructor: (container) => mount(AutomationJobEditor, {
        target: container,
        props: { job, copyFrom, onCancel: () => close(), onSaved: async () => { close(); await refresh(); } },
      }),
    });
    close = result.close;
    result.dialog.element.classList.add("automation-job-editor-dialog-host");
  }

  async function toggle(row: Row): Promise<void> {
    const job = row.job;
    await automationJobStore.saveJob({ ...job, revision: job.revision + 1, enabled: !job.enabled, updatedAt: Date.now() }, job.revision);
    await refresh();
  }
  async function remove(row: Row): Promise<void> {
    if (!await confirmDialogBoolean({ title: "删除自动化任务", content: safeConfirmContent(`确定删除“${row.job.name}”？运行历史会保留。`) })) return;
    await automationJobStore.deleteJob(row.job.jobId, row.job.revision);
    await refresh();
  }
  async function runNow(row: Row): Promise<void> {
    try {
      await requestAutomationRunNow(row.job.jobId);
      showMessage(`“${row.job.name}”已加入执行队列`, 2500);
      await refresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  function onChanged(): void { void refresh(); }

  onMount(() => {
    void refresh();
    window.addEventListener(AUTOMATION_JOBS_CHANGED_EVENT, onChanged);
    window.addEventListener(AUTOMATION_RUNTIME_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(AUTOMATION_JOBS_CHANGED_EVENT, onChanged);
      window.removeEventListener(AUTOMATION_RUNTIME_CHANGED_EVENT, onChanged);
    };
  });
</script>

<section class="automation-center" aria-labelledby="automation-heading">
  <header class="center-header">
    <h3 id="automation-heading">Agent 自动任务</h3>
    <div class="header-actions"><button type="button" class="icon-button" aria-label="刷新自动化中心" title="刷新" onclick={() => void refresh()}><SiyuanIcon name="iconRefresh" size={15} /></button><button type="button" class="b3-button b3-button--small" onclick={() => openEditor()}>新建任务</button></div>
  </header>
  <div class="summary-strip" aria-label="自动化概览"><span><strong>{rows.length}</strong> 全部任务</span><span><strong>{enabledCount}</strong> 已启用</span><span class:error-text={failedCount > 0}><strong>{failedCount}</strong> 需要处理</span></div>
  <div class="view-tabs"><button type="button" class:active={view === "jobs"} onclick={() => view = "jobs"}>任务</button><button type="button" class:active={view === "runs"} onclick={() => view = "runs"}>运行记录</button></div>
  {#if error}<div class="state error" role="alert">{error}</div>{/if}
  {#if view === "jobs"}
    <div class="filter-row">{#each [["all", "全部"], ["agent", "定时 Agent"], ["monitor", "心跳任务"]] as item}<button type="button" class:active={filter === item[0]} onclick={() => filter = item[0] as typeof filter}>{item[1]}</button>{/each}</div>
    {#if loading}<div class="state">正在读取自动化任务…</div>{:else if visibleRows.length === 0}<div class="state empty">暂无任务</div>{:else}<div class="job-list">
      {#each visibleRows as row (row.job.jobId)}<article class="job-row"><div class="job-marker" data-kind={row.job.task.kind}></div><div class="job-main"><div class="job-title"><strong>{row.job.name}</strong><span>{kindLabel(row.job.task.kind)}</span><span class:danger={row.state?.status === "failed" || row.state?.status === "blocked"}>{row.job.enabled ? statusLabel(row.job, row.state) : "已停用"}</span></div><div class="job-meta"><span>结果：{targetLabel(row.job)}</span><span>下次：{formatDate(row.state?.nextRunAt)}</span><span>上次：{formatDate(row.state?.lastCompletedAt)}</span>{#if (row.state?.consecutiveFailures ?? 0) > 0}<span class="danger">失败：{row.state?.consecutiveFailures}</span>{/if}</div></div><div class="job-actions"><button type="button" class="run-button" onclick={() => void runNow(row)}><SiyuanIcon name="iconPlay" size={13} />运行一次</button><button type="button" title="编辑" aria-label={`编辑 ${row.job.name}`} onclick={() => openEditor(row.job)}><SiyuanIcon name="iconEdit" size={14} /></button><button type="button" title="复制" aria-label={`复制 ${row.job.name}`} onclick={() => openEditor(undefined, row.job)}><SiyuanIcon name="iconCopy" size={14} /></button><button type="button" title={row.job.enabled ? "暂停" : "启用"} aria-label={`${row.job.enabled ? "暂停" : "启用"} ${row.job.name}`} onclick={() => void toggle(row)}><SiyuanIcon name={row.job.enabled ? "iconPause" : "iconPlay"} size={14} /></button><button type="button" title="删除" aria-label={`删除 ${row.job.name}`} onclick={() => void remove(row)}><SiyuanIcon name="iconTrashcan" size={14} /></button></div></article>{/each}
    </div>{/if}
  {:else}
    {#if loading}<div class="state">正在读取运行记录…</div>{:else if runs.length === 0}<div class="state empty">暂无记录</div>{:else}<div class="run-list">{#each runs as run (run.runId)}<article class="run-row"><span class="run-status" data-status={run.status}>{run.status === "succeeded" ? "成功" : run.status === "failed" ? "失败" : run.status === "skipped" ? "无变化" : run.status}</span><div><strong>{rows.find((row) => row.job.jobId === run.jobId)?.job.name ?? run.jobId}</strong><p>{run.result?.summary ?? run.error?.message ?? "正在执行"}</p><small>{run.startedAt && run.completedAt ? `${Math.max(0, run.completedAt - run.startedAt)}ms` : ""}{run.usage ? ` · ${run.usage.totalTokens} tokens` : ""}{run.delivery ? ` · 投递${run.delivery.status === "succeeded" ? "成功" : `失败：${run.delivery.error ?? "未知错误"}`}` : " · 未配置投递"}</small></div><time>{formatDate(run.updatedAt)}</time></article>{/each}</div>{/if}
  {/if}
</section>

<style>
  .automation-center{display:flex;flex-direction:column;gap:12px;color:var(--b3-theme-on-surface)}.center-header,.header-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.center-header h3{margin:0;font-size:16px}.icon-button,.job-actions button{display:flex;align-items:center;justify-content:center;gap:5px;min-width:32px;height:32px;padding:0 8px;border:1px solid var(--b3-border-color);border-radius:7px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);cursor:pointer}.icon-button{padding:0}.summary-strip{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--b3-border-color);border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--b3-theme-primary) 4%,var(--b3-theme-surface))}.summary-strip span{display:flex;align-items:baseline;gap:6px;padding:10px 12px;font-size:12px;border-right:1px solid var(--b3-border-color)}.summary-strip span:last-child{border:0}.summary-strip strong{font-size:18px}.error-text,.danger{color:var(--b3-theme-error)!important}.view-tabs,.filter-row{display:flex;gap:4px}.view-tabs{border-bottom:1px solid var(--b3-border-color)}.view-tabs button,.filter-row button{border:0;background:transparent;color:var(--b3-theme-on-surface-light);cursor:pointer;padding:7px 10px;border-radius:6px}.view-tabs button.active{color:var(--b3-theme-primary);box-shadow:inset 0 -2px var(--b3-theme-primary);border-radius:0}.filter-row button.active{background:color-mix(in srgb,var(--b3-theme-primary) 12%,transparent);color:var(--b3-theme-primary)}.job-list,.run-list{display:flex;flex-direction:column;border:1px solid var(--b3-border-color);border-radius:9px;overflow:hidden}.job-row,.run-row{display:flex;align-items:center;gap:11px;min-height:56px;padding:10px;border-bottom:1px solid var(--b3-border-color);background:var(--b3-theme-surface)}.job-row:last-child,.run-row:last-child{border:0}.job-marker{width:4px;align-self:stretch;border-radius:4px;background:#7c5cff}.job-marker[data-kind="monitor"]{background:#e29b35}.job-main{min-width:0;flex:1}.job-title,.job-meta{display:flex;align-items:center;gap:8px}.job-title span,.job-meta{font-size:11px;color:var(--b3-theme-on-surface-light)}.job-meta{margin-top:6px;flex-wrap:wrap}.job-actions{display:flex;gap:5px}.job-actions button:not(.run-button){width:30px;padding:0}.job-actions .run-button{color:var(--b3-theme-primary);white-space:nowrap}.job-actions button:hover,.icon-button:hover{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}.run-row{align-items:flex-start}.run-row>div{min-width:0;flex:1}.run-row p{margin:4px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--b3-theme-on-surface-light);font-size:12px}.run-row small,.run-row time{font-size:11px;color:var(--b3-theme-on-surface-light)}.run-status{min-width:48px;padding:3px 5px;border-radius:5px;text-align:center;font-size:11px;background:var(--b3-theme-surface-light)}.run-status[data-status="succeeded"]{color:#24924a;background:color-mix(in srgb,#24924a 12%,transparent)}.run-status[data-status="failed"]{color:var(--b3-theme-error);background:color-mix(in srgb,var(--b3-theme-error) 10%,transparent)}.state{padding:24px;text-align:center;border:1px dashed var(--b3-border-color);border-radius:8px;color:var(--b3-theme-on-surface-light);font-size:12px}.state.error{color:var(--b3-theme-error)}
  @media(max-width:760px){.summary-strip{grid-template-columns:1fr}.summary-strip span{border-right:0;border-bottom:1px solid var(--b3-border-color)}.job-row{align-items:flex-start}.job-actions{display:grid;grid-template-columns:repeat(3,auto)}.job-actions .run-button{grid-column:1/-1}}
</style>
