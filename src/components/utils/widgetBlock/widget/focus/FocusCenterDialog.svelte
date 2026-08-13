<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { showMessage } from "siyuan";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { loadTaskData } from "@/features/task-data/task-data-service";
  import { loadHabitTracker, type HabitDefinition } from "@/features/habit-tracker/habit-tracker-store";
  import { loadEnhancedDiaryConfig } from "../enhancedDiary/enhancedDiaryConfig";
  import { isEnhancedDiaryProjectStorageReady } from "../enhancedDiary/enhancedDiaryTypes";
  import {
    isEnhancedDiaryProjectEffectivelyActive,
    readEnhancedDiaryProjectIndex,
    resolveEnhancedDiaryProjectTarget,
  } from "../enhancedDiary/enhancedDiaryProjectIndex";
  import type { ComponentTaskInfo } from "@/components/tools/siyuanComponentDataApi";
  import { loadFocusSessionsForRange, type FocusBindingSnapshot, type FocusSessionRecord } from "./focusData";
  import { buildFocusCenterAnalytics } from "./focusCenterAnalytics";

  export interface FocusTimerConfig {
    focusDuration: number;
    shortBreakDuration: number;
    longBreakDuration: number;
    longBreakEvery: number;
    autoStartBreak: boolean;
    autoStartFocus: boolean;
    timerStyle: string;
    timerFontSize: number;
    showFocusInfo: boolean;
  }

  interface Props {
    plugin: any;
    config: FocusTimerConfig;
    binding?: FocusBindingSnapshot;
    onApply: (config: FocusTimerConfig, binding?: FocusBindingSnapshot) => void | Promise<void>;
    onStart: () => void;
    onClose: () => void;
  }

  interface ProjectOption {
    binding: FocusBindingSnapshot;
    path: string;
    level: number;
    order: number;
  }

  let { plugin, config, binding, onApply, onStart, onClose }: Props = $props();
  type Tab = "overview" | "binding" | "history";
  let tab = $state<Tab>("binding");
  let tasks = $state<ComponentTaskInfo[]>([]);
  let projects = $state<ProjectOption[]>([]);
  let habits = $state<HabitDefinition[]>([]);
  let sessions = $state<FocusSessionRecord[]>([]);
  let search = $state("");
  let loading = $state(true);
  let saving = $state(false);
  let draft = $state<FocusTimerConfig>(untrack(() => ({ ...config })));
  let selectedBinding = $state<FocusBindingSnapshot | undefined>(untrack(() => binding ? { ...binding } : undefined));
  const analytics = $derived(buildFocusCenterAnalytics(sessions));
  const query = $derived(search.trim().toLowerCase());
  const filteredTasks = $derived(tasks.filter((task) => taskTitle(task).toLowerCase().includes(query)).slice(0, 80));
  const filteredProjects = $derived(projects.filter((item) => `${item.binding.title} ${item.path}`.toLowerCase().includes(query)).slice(0, 80));
  const filteredHabits = $derived(habits.filter((habit) => habit.name.toLowerCase().includes(query)).slice(0, 80));

  async function loadProjects(): Promise<ProjectOption[]> {
    const storage = (await loadEnhancedDiaryConfig(plugin)).projectStorage;
    if (!isEnhancedDiaryProjectStorageReady(storage)) return [];
    const index = await readEnhancedDiaryProjectIndex(storage);
    return [...Object.values(index.roots), ...Object.values(index.nodes)]
      .filter((item) => isEnhancedDiaryProjectEffectivelyActive(index, item.id))
      .map((item) => {
        const target = resolveEnhancedDiaryProjectTarget(index, item.id)!;
        return { binding: { kind: "project", id: item.id, title: item.title }, path: target.pathTitles.join(" / "), level: target.ancestorTargetIds.length, order: item.order };
      })
      .sort((a, b) => a.level - b.level || a.order - b.order);
  }

  function taskTitle(task: ComponentTaskInfo): string {
    return String(task.content || task.markdown || "未命名任务").replace(/<[^>]+>|\[[ xX]\]|\*\*|__|`/g, "").trim().slice(0, 120) || "未命名任务";
  }
  function selectTask(task: ComponentTaskInfo): void {
    const projectId = task.projectTargetId || task.rootProjectId;
    const projectTitle = task.projectPath?.at(-1)?.trim();
    choose({ kind: "task", id: task.id, title: taskTitle(task), projectId, projectTitle });
  }
  function choose(next?: FocusBindingSnapshot): void { selectedBinding = next ? { ...next } : undefined; }
  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
  }
  function formatTime(value: string): string {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
  }
  async function apply(start: boolean): Promise<void> {
    if (saving) return;
    saving = true;
    try {
      await onApply({ ...draft }, selectedBinding ? { ...selectedBinding } : undefined);
      if (start) onStart();
      onClose();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "番茄钟设置保存失败", 5000, "error");
    } finally { saving = false; }
  }
  onMount(() => {
    let active = true;
    void (async () => {
      try {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 89);
      const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
      const projectRequest = loadProjects().catch((error) => {
        console.warn("[FocusCenterDialog] load projects failed", error);
        return [];
      });
      const [taskData, projectData, habitData, focusData] = await Promise.all([loadTaskData(plugin), projectRequest, loadHabitTracker(), loadFocusSessionsForRange(date(start), date(end))]);
        if (!active) return;
        tasks = taskData.items;
        projects = projectData;
        habits = habitData.habits.filter((habit) => !habit.archived);
        sessions = focusData.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      } finally { if (active) loading = false; }
    })();
    return () => { active = false; };
  });
</script>

<div class="center">
  <header><div><small>高级番茄钟</small><h2>把专注投入到真正重要的事</h2></div><button class="icon" type="button" title="关闭" onclick={onClose}><SiyuanIcon name="close" size={18} /></button></header>
  <nav>
    <button class:active={tab === "binding"} onclick={() => tab = "binding"}>专注设置</button>
    <button class:active={tab === "overview"} onclick={() => tab = "overview"}>数据概览</button>
    <button class:active={tab === "history"} onclick={() => tab = "history"}>时间记录</button>
  </nav>
  <main>
    {#if loading}<div class="empty">正在整理专注数据…</div>
    {:else if tab === "overview"}
      <section class="kpis"><article><small>近 90 天专注</small><strong>{formatDuration(analytics.focusSeconds)}</strong></article><article><span>完成番茄</span><strong>{analytics.sessions}</strong></article><article><span>平均一轮</span><strong>{formatDuration(analytics.averageSeconds)}</strong></article><article><span>计划完成率</span><strong>{Math.round(analytics.completionRate * 100)}%</strong></article></section>
      <div class="dashboard">
        <section class="panel"><h3>最近专注节奏</h3><div class="bars">{#each analytics.daily.slice(-28) as day}<div title={`${day.date} · ${formatDuration(day.seconds)}`}><i style:height={`${Math.max(5, Math.round(day.seconds / Math.max(1, ...analytics.daily.map((item) => item.seconds)) * 100))}%`}></i><small>{day.date.slice(8)}</small></div>{:else}<p>完成一次专注后，这里会形成趋势。</p>{/each}</div></section>
        <section class="panel"><h3>投入方向</h3><div class="rank">{#each analytics.bindings.slice(0, 8) as item}<div><span><b>{item.title}</b><small>{item.sessions} 轮</small></span><em>{formatDuration(item.seconds)}</em></div>{:else}<p>绑定任务、项目或习惯后即可分类统计。</p>{/each}</div></section>
        <section class="panel"><h3>高效时段</h3><div class="rank">{#each analytics.hours.filter((item) => item.seconds > 0).sort((a, b) => b.seconds - a.seconds).slice(0, 6) as item}<div><span><b>{String(item.hour).padStart(2, "0")}:00</b><small>{item.sessions} 轮</small></span><em>{formatDuration(item.seconds)}</em></div>{:else}<p>完成专注后即可识别高效时段。</p>{/each}</div></section>
      </div>
    {:else if tab === "binding"}
      <section class="session-setup panel">
        <div class="setup-title"><div><small>本轮节奏</small><h3>{draft.focusDuration} 分钟专注</h3></div><div class="binding-actions"><button class="secondary" type="button" disabled={saving} onclick={() => void apply(false)}>保存并返回</button><button type="button" disabled={saving} onclick={() => void apply(true)}>{saving ? "保存中…" : "开始专注"}</button></div></div>
        <div class="range-grid">
          <label><span><b>专注</b><output>{draft.focusDuration} 分钟</output></span><input type="range" min="5" max="180" step="1" bind:value={draft.focusDuration} /></label>
          <label><span><b>短休息</b><output>{draft.shortBreakDuration} 分钟</output></span><input type="range" min="1" max="60" step="1" bind:value={draft.shortBreakDuration} /></label>
          <label><span><b>长休息</b><output>{draft.longBreakDuration} 分钟</output></span><input type="range" min="5" max="90" step="1" bind:value={draft.longBreakDuration} /></label>
        </div>
        <details><summary>自动节奏与显示</summary><div class="detail-settings">
          <label class="range-row"><span><b>长休息间隔</b><output>{draft.longBreakEvery} 轮</output></span><input type="range" min="2" max="12" step="1" bind:value={draft.longBreakEvery} /></label>
          <label class="toggle"><span><b>自动开始休息</b><small>专注完成后直接进入休息</small></span><input type="checkbox" bind:checked={draft.autoStartBreak} /></label>
          <label class="toggle"><span><b>自动开始下一轮</b><small>休息完成后继续专注</small></span><input type="checkbox" bind:checked={draft.autoStartFocus} /></label>
          <label class="toggle"><span><b>组件显示累计信息</b><small>显示总次数与时长</small></span><input type="checkbox" bind:checked={draft.showFocusInfo} /></label>
          <div class="display-settings"><label><span>计时样式</span><select bind:value={draft.timerStyle}><option value="classic">经典卡片</option><option value="modern">现代简约</option><option value="rounded">圆角胶囊</option><option value="digital-clock">数码时钟</option><option value="circular-progress">环形进度</option></select></label><label><span>字号</span><input type="range" min="1" max="10" step="0.5" bind:value={draft.timerFontSize} /></label></div>
        </div></details>
      </section>
      <section class="binding-head"><div><small>本轮专注对象</small><h3>{selectedBinding?.title || "自由专注"}</h3>{#if selectedBinding?.projectTitle}<p>{selectedBinding.projectTitle}</p>{/if}</div>{#if selectedBinding}<button class="secondary" type="button" onclick={() => choose(undefined)}>解除绑定</button>{/if}</section>
      <input class="search" bind:value={search} placeholder="搜索任务、项目或习惯" />
      <section class="binding-grid">
        <div class="panel"><h3>任务</h3>{#each filteredTasks as task}<button class:selected={selectedBinding?.kind === "task" && selectedBinding.id === task.id} onclick={() => selectTask(task)}><b>{taskTitle(task)}</b><small>{task.projectPath?.at(-1) || "未分组"}</small></button>{:else}<p>没有匹配任务</p>{/each}</div>
        <div class="panel"><h3>项目</h3>{#each filteredProjects as item}<button class:selected={selectedBinding?.kind === "project" && selectedBinding.id === item.binding.id} onclick={() => choose(item.binding)}><b>{item.binding.title}</b><small>{item.level ? item.path : "根项目"}</small></button>{:else}<p>项目索引中暂无项目</p>{/each}</div>
        <div class="panel"><h3>习惯</h3>{#each filteredHabits as habit}<button class:selected={selectedBinding?.kind === "habit" && selectedBinding.id === habit.id} onclick={() => choose({ kind: "habit", id: habit.id, title: habit.name })}><b>{habit.name}</b><small>{habit.unit}</small></button>{:else}<p>没有匹配习惯</p>{/each}</div>
      </section>
    {:else if tab === "history"}
      <section class="history">{#each sessions as session}<article><div><b>{session.binding?.title || (session.segmentType === "focus" ? "自由专注" : session.segmentType === "long_break" ? "长休息" : "短休息")}</b><small>{formatTime(session.startedAt)} — {formatTime(session.endedAt)}</small></div><span>{formatDuration(session.actualSeconds)}</span><em class:cancelled={session.status === "cancelled"}>{session.status === "completed" ? "完成" : "中止"}</em></article>{:else}<div class="empty">还没有时间记录</div>{/each}</section>
    {/if}
  </main>
</div>

<style>
  .center{width:100%;height:100%;min-width:0;flex:1 1 auto;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;color:var(--b3-theme-on-background);background:var(--b3-theme-background)}header{display:flex;align-items:center;justify-content:space-between;padding:22px 28px 16px;border-bottom:1px solid var(--b3-border-color)}h2,h3,p{margin:0}header small{color:var(--b3-theme-primary)}header h2{margin-top:4px;font-size:24px}.icon{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:12px;background:var(--b3-theme-surface);color:inherit;cursor:pointer}nav{display:flex;gap:4px;padding:10px 28px;border-bottom:1px solid var(--b3-border-color)}nav button{border:0;border-radius:9px;padding:8px 14px;background:transparent;color:inherit;cursor:pointer}nav button.active{background:var(--b3-theme-primary);color:var(--b3-theme-on-primary)}main{flex:1;min-width:0;overflow:auto;padding:22px 28px 32px}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.kpis article,.panel,.binding-head{border:1px solid var(--b3-border-color);border-radius:16px;background:color-mix(in srgb,var(--b3-theme-surface) 72%,transparent);padding:18px}.kpis span,.kpis small,.panel small,.binding-head small,.binding-head p{color:var(--b3-theme-on-surface)}.kpis strong{display:block;margin-top:10px;font-size:24px}.dashboard{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,1fr);gap:14px;margin-top:14px}.panel h3{margin-bottom:16px}.bars{height:230px;display:flex;align-items:flex-end;gap:5px}.bars>div{display:flex;flex:1;height:100%;min-width:4px;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px}.bars i{display:block;width:100%;max-width:18px;border-radius:7px 7px 3px 3px;background:linear-gradient(180deg,var(--b3-theme-primary),color-mix(in srgb,var(--b3-theme-primary) 55%,transparent))}.bars small{font-size:9px}.rank{display:flex;flex-direction:column}.rank>div{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--b3-border-color)}.rank span{min-width:0;display:flex;flex-direction:column}.rank b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rank em{font-style:normal;white-space:nowrap}.binding-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.binding-actions{display:flex;gap:8px}.binding-head button{border:0;border-radius:10px;padding:9px 15px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);cursor:pointer}.binding-head button.secondary{background:var(--b3-theme-background);color:inherit;border:1px solid var(--b3-border-color)}.search{width:100%;box-sizing:border-box;margin:14px 0;padding:11px 13px;border:1px solid var(--b3-border-color);border-radius:11px;background:var(--b3-theme-background);color:inherit}.binding-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.binding-grid .panel{max-height:50vh;overflow:auto}.binding-grid button{width:100%;display:flex;justify-content:space-between;gap:10px;margin:5px 0;padding:10px;border:1px solid transparent;border-radius:10px;background:var(--b3-theme-background);color:inherit;text-align:left;cursor:pointer}.binding-grid button.selected{border-color:var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 12%,var(--b3-theme-background))}.binding-grid button b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history{display:flex;flex-direction:column;gap:8px}.history article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:16px;padding:13px 16px;border:1px solid var(--b3-border-color);border-radius:13px;background:var(--b3-theme-surface)}.history article div{min-width:0;display:flex;flex-direction:column}.history article b,.history article small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history article small{color:var(--b3-theme-on-surface)}.history em{border-radius:999px;padding:3px 8px;background:color-mix(in srgb,#34a66f 16%,transparent);color:#278657;font-style:normal}.history em.cancelled{background:color-mix(in srgb,#d9667d 16%,transparent);color:#bd4e65}input,select{min-width:0;box-sizing:border-box;border:1px solid var(--b3-border-color);border-radius:8px;padding:8px;background:var(--b3-theme-background);color:inherit}.toggle{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--b3-border-color)}.toggle span{display:flex;flex-direction:column}.toggle small{color:var(--b3-theme-on-surface)}.empty{display:grid;min-height:220px;place-items:center;color:var(--b3-theme-on-surface)}:global(.focus-center-dialog-host .dialog-content){width:100%;min-width:0;display:flex!important;overflow:hidden}:global(.focus-center-dialog-host .b3-dialog__content){min-width:0;overflow:hidden}@media(max-width:760px){header{padding:16px 18px}header h2{font-size:19px}nav,main{padding-left:16px;padding-right:16px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard,.binding-grid{grid-template-columns:1fr}.binding-head{align-items:flex-start;flex-direction:column}.binding-actions{width:100%}.binding-actions button:last-child{flex:1}.history article{grid-template-columns:minmax(0,1fr) auto}.history em{display:none}}
  .session-setup{padding:16px 18px}.setup-title{display:flex;justify-content:space-between;align-items:center;gap:16px}.setup-title h3{margin:3px 0 0;font-size:22px}.binding-actions button:disabled{opacity:.5;cursor:wait}.range-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}.range-grid label,.range-row{display:grid;gap:10px;border-radius:12px;padding:12px;background:var(--b3-theme-background)}.range-grid span,.range-row span{display:flex;justify-content:space-between;gap:8px}.range-grid output,.range-row output{color:var(--b3-theme-primary);font-variant-numeric:tabular-nums}.range-grid input,.range-row input,.display-settings input{width:100%;padding:0;border:0;accent-color:var(--b3-theme-primary)}details{margin-top:12px;border-top:1px solid var(--b3-border-color);padding-top:10px}summary{cursor:pointer;color:var(--b3-theme-on-surface);user-select:none}.detail-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;margin-top:8px}.range-row{grid-column:1/-1}.display-settings{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding-top:10px}.display-settings label{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px}.binding-head{margin-top:14px}.binding-grid .panel{max-height:32vh}.binding-head button.secondary{background:var(--b3-theme-background);color:inherit;border:1px solid var(--b3-border-color)}
  @media(max-width:760px){.range-grid,.detail-settings,.display-settings{grid-template-columns:1fr}.setup-title{align-items:flex-start;flex-direction:column}.display-settings label{grid-template-columns:1fr}.range-row,.display-settings{grid-column:auto}}
  .binding-actions button{border:0;border-radius:10px;padding:9px 15px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);cursor:pointer}.binding-actions button.secondary{background:var(--b3-theme-background);color:inherit;border:1px solid var(--b3-border-color)}
</style>
