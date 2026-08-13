<script lang="ts">
  import { onMount, untrack } from "svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { loadTaskData } from "@/features/task-data/task-data-service";
  import { loadHabitTracker, type HabitDefinition } from "@/features/habit-tracker/habit-tracker-store";
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
    onBindingChange: (binding?: FocusBindingSnapshot) => void;
    onSaveConfig: (config: FocusTimerConfig) => void | Promise<void>;
    onClose: () => void;
  }

  let { plugin, config, binding, onBindingChange, onSaveConfig, onClose }: Props = $props();
  type Tab = "overview" | "binding" | "history" | "settings";
  let tab = $state<Tab>("overview");
  let tasks = $state<ComponentTaskInfo[]>([]);
  let habits = $state<HabitDefinition[]>([]);
  let sessions = $state<FocusSessionRecord[]>([]);
  let search = $state("");
  let loading = $state(true);
  let saving = $state(false);
  let draft = $state<FocusTimerConfig>(untrack(() => ({ ...config })));
  let selectedBinding = $state<FocusBindingSnapshot | undefined>(untrack(() => binding ? structuredClone(binding) : undefined));
  const analytics = $derived(buildFocusCenterAnalytics(sessions));
  const query = $derived(search.trim().toLowerCase());
  const filteredTasks = $derived(tasks.filter((task) => taskTitle(task).toLowerCase().includes(query)).slice(0, 80));
  const filteredHabits = $derived(habits.filter((habit) => habit.name.toLowerCase().includes(query)).slice(0, 80));
  const projects = $derived((() => {
    const values = new Map<string, FocusBindingSnapshot>();
    for (const task of tasks) {
      const id = task.projectTargetId || task.rootProjectId;
      const title = task.projectPath?.at(-1)?.trim();
      if (id && title && (!query || title.toLowerCase().includes(query))) values.set(id, { kind: "project", id, title });
    }
    return [...values.values()].slice(0, 80);
  })());

  function taskTitle(task: ComponentTaskInfo): string {
    return String(task.content || task.markdown || "未命名任务").replace(/<[^>]+>|\[[ xX]\]|\*\*|__|`/g, "").trim().slice(0, 120) || "未命名任务";
  }
  function selectTask(task: ComponentTaskInfo): void {
    const projectId = task.projectTargetId || task.rootProjectId;
    const projectTitle = task.projectPath?.at(-1)?.trim();
    choose({ kind: "task", id: task.id, title: taskTitle(task), projectId, projectTitle });
  }
  function choose(next?: FocusBindingSnapshot): void { selectedBinding = next ? structuredClone(next) : undefined; onBindingChange(selectedBinding); }
  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
  }
  function formatTime(value: string): string {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
  }
  async function save(): Promise<void> {
    if (saving) return;
    saving = true;
    try { await onSaveConfig({ ...draft }); } finally { saving = false; }
  }
  onMount(() => {
    let active = true;
    void (async () => {
      try {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 89);
      const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
      const [taskData, habitData, focusData] = await Promise.all([loadTaskData(plugin), loadHabitTracker(), loadFocusSessionsForRange(date(start), date(end))]);
        if (!active) return;
        tasks = taskData.items;
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
    <button class:active={tab === "overview"} onclick={() => tab = "overview"}>数据概览</button>
    <button class:active={tab === "binding"} onclick={() => tab = "binding"}>专注对象</button>
    <button class:active={tab === "history"} onclick={() => tab = "history"}>时间记录</button>
    <button class:active={tab === "settings"} onclick={() => tab = "settings"}>计时设置</button>
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
      <section class="binding-head"><div><small>当前专注对象</small><h3>{selectedBinding?.title || "未绑定"}</h3>{#if selectedBinding?.projectTitle}<p>{selectedBinding.projectTitle}</p>{/if}</div>{#if selectedBinding}<button type="button" onclick={() => choose(undefined)}>解除绑定</button>{/if}</section>
      <input class="search" bind:value={search} placeholder="搜索任务、项目或习惯" />
      <section class="binding-grid">
        <div class="panel"><h3>任务</h3>{#each filteredTasks as task}<button class:selected={selectedBinding?.kind === "task" && selectedBinding.id === task.id} onclick={() => selectTask(task)}><b>{taskTitle(task)}</b><small>{task.projectPath?.at(-1) || "未分组"}</small></button>{:else}<p>没有匹配任务</p>{/each}</div>
        <div class="panel"><h3>项目</h3>{#each projects as item}<button class:selected={selectedBinding?.kind === "project" && selectedBinding.id === item.id} onclick={() => choose(item)}><b>{item.title}</b><small>项目</small></button>{:else}<p>任务索引中暂无项目</p>{/each}</div>
        <div class="panel"><h3>习惯</h3>{#each filteredHabits as habit}<button class:selected={selectedBinding?.kind === "habit" && selectedBinding.id === habit.id} onclick={() => choose({ kind: "habit", id: habit.id, title: habit.name })}><b>{habit.name}</b><small>{habit.unit}</small></button>{:else}<p>没有匹配习惯</p>{/each}</div>
      </section>
    {:else if tab === "history"}
      <section class="history">{#each sessions as session}<article><div><b>{session.binding?.title || (session.segmentType === "focus" ? "自由专注" : session.segmentType === "long_break" ? "长休息" : "短休息")}</b><small>{formatTime(session.startedAt)} — {formatTime(session.endedAt)}</small></div><span>{formatDuration(session.actualSeconds)}</span><em class:cancelled={session.status === "cancelled"}>{session.status === "completed" ? "完成" : "中止"}</em></article>{:else}<div class="empty">还没有时间记录</div>{/each}</section>
    {:else}
      <section class="settings panel">
        <div class="setting-grid"><label>专注时长<input type="number" min="5" max="180" bind:value={draft.focusDuration} /><small>分钟</small></label><label>短休息<input type="number" min="1" max="60" bind:value={draft.shortBreakDuration} /><small>分钟</small></label><label>长休息<input type="number" min="5" max="90" bind:value={draft.longBreakDuration} /><small>分钟</small></label><label>长休息间隔<input type="number" min="2" max="12" bind:value={draft.longBreakEvery} /><small>轮</small></label></div>
        <label class="toggle"><span><b>自动开始休息</b><small>专注完成后直接进入休息</small></span><input type="checkbox" bind:checked={draft.autoStartBreak} /></label>
        <label class="toggle"><span><b>自动开始下一轮</b><small>休息完成后继续专注</small></span><input type="checkbox" bind:checked={draft.autoStartFocus} /></label>
        <div class="setting-grid"><label>计时样式<select bind:value={draft.timerStyle}><option value="classic">经典卡片</option><option value="modern">现代简约</option><option value="rounded">圆角胶囊</option><option value="digital-clock">数码时钟</option><option value="circular-progress">环形进度</option></select></label><label>字号<input type="number" min="1" max="10" step="0.5" bind:value={draft.timerFontSize} /></label></div>
        <label class="toggle"><span><b>组件显示累计信息</b><small>在桌面计时器底部显示总次数与时长</small></span><input type="checkbox" bind:checked={draft.showFocusInfo} /></label>
        <footer><button class="primary" type="button" disabled={saving} onclick={save}>{saving ? "保存中…" : "保存设置"}</button></footer>
      </section>
    {/if}
  </main>
</div>

<style>
  .center{height:100%;display:flex;flex-direction:column;overflow:hidden;color:var(--b3-theme-on-background);background:var(--b3-theme-background)}header{display:flex;align-items:center;justify-content:space-between;padding:22px 28px 16px;border-bottom:1px solid var(--b3-border-color)}h2,h3,p{margin:0}header small{color:var(--b3-theme-primary)}header h2{margin-top:4px;font-size:24px}.icon{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:12px;background:var(--b3-theme-surface);color:inherit;cursor:pointer}nav{display:flex;gap:4px;padding:10px 28px;border-bottom:1px solid var(--b3-border-color)}nav button{border:0;border-radius:9px;padding:8px 14px;background:transparent;color:inherit;cursor:pointer}nav button.active{background:var(--b3-theme-primary);color:var(--b3-theme-on-primary)}main{flex:1;overflow:auto;padding:22px 28px 32px}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.kpis article,.panel,.binding-head{border:1px solid var(--b3-border-color);border-radius:16px;background:color-mix(in srgb,var(--b3-theme-surface) 72%,transparent);padding:18px}.kpis span,.kpis small,.panel small,.binding-head small,.binding-head p{color:var(--b3-theme-on-surface)}.kpis strong{display:block;margin-top:10px;font-size:24px}.dashboard{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,1fr);gap:14px;margin-top:14px}.panel h3{margin-bottom:16px}.bars{height:230px;display:flex;align-items:flex-end;gap:5px}.bars>div{display:flex;flex:1;height:100%;min-width:4px;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px}.bars i{display:block;width:100%;max-width:18px;border-radius:7px 7px 3px 3px;background:linear-gradient(180deg,var(--b3-theme-primary),color-mix(in srgb,var(--b3-theme-primary) 55%,transparent))}.bars small{font-size:9px}.rank{display:flex;flex-direction:column}.rank>div{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--b3-border-color)}.rank span{min-width:0;display:flex;flex-direction:column}.rank b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rank em{font-style:normal;white-space:nowrap}.binding-head{display:flex;justify-content:space-between;align-items:center}.binding-head button,.primary{border:0;border-radius:10px;padding:9px 15px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);cursor:pointer}.search{width:100%;box-sizing:border-box;margin:14px 0;padding:11px 13px;border:1px solid var(--b3-border-color);border-radius:11px;background:var(--b3-theme-background);color:inherit}.binding-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.binding-grid .panel{max-height:55vh;overflow:auto}.binding-grid button{width:100%;display:flex;justify-content:space-between;gap:10px;margin:5px 0;padding:10px;border:1px solid transparent;border-radius:10px;background:var(--b3-theme-background);color:inherit;text-align:left;cursor:pointer}.binding-grid button.selected{border-color:var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 12%,var(--b3-theme-background))}.binding-grid button b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history{display:flex;flex-direction:column;gap:8px}.history article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:16px;padding:13px 16px;border:1px solid var(--b3-border-color);border-radius:13px;background:var(--b3-theme-surface)}.history article div{min-width:0;display:flex;flex-direction:column}.history article b,.history article small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history article small{color:var(--b3-theme-on-surface)}.history em{border-radius:999px;padding:3px 8px;background:color-mix(in srgb,#34a66f 16%,transparent);color:#278657;font-style:normal}.history em.cancelled{background:color-mix(in srgb,#d9667d 16%,transparent);color:#bd4e65}.settings{max-width:850px;margin:auto}.setting-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.setting-grid label{display:grid;grid-template-columns:minmax(0,1fr) 120px auto;align-items:center;gap:8px;padding:12px 0;border-bottom:1px solid var(--b3-border-color)}input,select{min-width:0;box-sizing:border-box;border:1px solid var(--b3-border-color);border-radius:8px;padding:8px;background:var(--b3-theme-background);color:inherit}.toggle{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--b3-border-color)}.toggle span{display:flex;flex-direction:column}.toggle small{color:var(--b3-theme-on-surface)}footer{display:flex;justify-content:flex-end;padding-top:18px}.empty{display:grid;min-height:220px;place-items:center;color:var(--b3-theme-on-surface)}@media(max-width:760px){header{padding:16px 18px}header h2{font-size:19px}nav,main{padding-left:16px;padding-right:16px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard,.binding-grid{grid-template-columns:1fr}.setting-grid{grid-template-columns:1fr}.history article{grid-template-columns:minmax(0,1fr) auto}.history em{display:none}}
</style>
