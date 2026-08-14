<script lang="ts">
  import { mount, onDestroy, onMount } from "svelte";
  import { showMessage } from "siyuan";
  import { svelteDialog } from "@/libs/dialog";
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";
  import Square from "@lucide/svelte/icons/square";
  import Settings from "@lucide/svelte/icons/settings";
  import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
  import { getImage } from "@/components/tools/getImage";
  import { createRuntimeUuid } from "@/libs/runtime-id";
  import { loadWidgetInstanceConfig, saveWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
  import { registerSharedWidgetFlusher } from "../sharedLocalStorage/sharedLocalStorage";
  import { subscribeSharedWidgetDataUpdated } from "../sharedLocalStorage/sharedWidgetDataEvents";
  import { sendBreakCompletedNotification, sendFocusCompletedNotification } from "@/features/focus-notify";
  import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
  import FocusCenterDialog, { type FocusTimerConfig } from "./FocusCenterDialog.svelte";
  import {
    flushPendingFocusSessions, getLocalFocusDate, loadFocusStatistics, queueFocusSession, toFocusSecondTimestamp,
    type FocusBindingSnapshot, type FocusSegmentType, type FocusSessionRecord,
  } from "./focusData";
  import { normalizeFocusBinding } from "./focusBinding";

  interface Props { plugin: any; contentTypeJson?: string; runtimeContext?: WidgetRuntimeContext }
  let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();

  const defaultConfig: FocusTimerConfig = { focusDuration: 25, shortBreakDuration: 5, longBreakDuration: 15, longBreakEvery: 4, autoStartBreak: true, autoStartFocus: false, timerStyle: "classic", timerFontSize: 3, showFocusInfo: false };
  let config = $state<FocusTimerConfig>({ ...defaultConfig });
  let content = $state<Record<string, any>>({});
  let savedWidgetData: Record<string, unknown> = {};
  let binding = $state<FocusBindingSnapshot | undefined>();
  let segmentBinding: FocusBindingSnapshot | undefined;
  let advancedEnabled = $state(false);
  let segmentType = $state<FocusSegmentType>("focus");
  let isRunning = $state(false);
  let timeLeft = $state(defaultConfig.focusDuration * 60);
  let remainingMs = defaultConfig.focusDuration * 60 * 1000;
  let recordStartedAt: number | null = null;
  let segmentStartedAt = 0;
  let segmentEndsAt = 0;
  let accumulatedMs = 0;
  let plannedSeconds = 0;
  let completedFocusInCycle = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let endTimeout: ReturnType<typeof setTimeout> | null = null;
  let totalFocusTime = $state(0);
  let totalFocusTimes = $state(0);
  let focusBgImage = $state("https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464");
  let breakBgImage = $state("https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d");
  let focusLocalImage = $state("");
  let breakLocalImage = $state("");
  let focusImageType = $state("remote");
  let breakImageType = $state("remote");
  let destroyed = false;
  let unsubscribe: (() => void) | null = null;
  let unregisterFlusher: (() => void) | null = null;

  const isBreak = $derived(segmentType !== "focus");
  const totalSeconds = $derived(durationMinutes(segmentType) * 60);
  const progress = $derived(totalSeconds ? Math.max(0, Math.min(1, 1 - timeLeft / totalSeconds)) : 0);
  const radius = $derived(config.timerFontSize * 18);
  const circumference = $derived(2 * Math.PI * radius);

  function durationMinutes(type: FocusSegmentType): number {
    return type === "focus" ? config.focusDuration : type === "long_break" ? config.longBreakDuration : config.shortBreakDuration;
  }
  function clearHandles(): void {
    if (interval) clearInterval(interval);
    if (endTimeout) clearTimeout(endTimeout);
    interval = null;
    endTimeout = null;
  }
  function reset(type: FocusSegmentType): void {
    segmentType = type;
    remainingMs = durationMinutes(type) * 60 * 1000;
    timeLeft = Math.ceil(remainingMs / 1000);
    recordStartedAt = null;
    segmentStartedAt = 0;
    segmentEndsAt = 0;
    accumulatedMs = 0;
    plannedSeconds = 0;
    segmentBinding = undefined;
  }
  function tick(now = Date.now()): void {
    if (!isRunning) return;
    remainingMs = Math.max(0, segmentEndsAt - now);
    timeLeft = Math.ceil(remainingMs / 1000);
  }
  function capture(now = Date.now()): void {
    if (recordStartedAt === null || segmentStartedAt <= 0) return;
    accumulatedMs += Math.max(0, Math.min(now, segmentEndsAt) - segmentStartedAt);
    segmentStartedAt = 0;
  }
  function createRecord(status: "completed" | "cancelled", endedAt = Date.now()): FocusSessionRecord | null {
    if (recordStartedAt === null) return null;
    const actualSeconds = status === "completed" ? plannedSeconds : Math.min(plannedSeconds, Math.max(0, Math.floor(accumulatedMs / 1000)));
    return { id: `focus-${recordStartedAt}-${createRuntimeUuid()}`, startedAt: toFocusSecondTimestamp(recordStartedAt), endedAt: toFocusSecondTimestamp(endedAt), localDate: getLocalFocusDate(recordStartedAt), segmentType, plannedSeconds, actualSeconds, status, binding: segmentType === "focus" ? segmentBinding : undefined };
  }
  async function persist(record: FocusSessionRecord): Promise<void> {
    queueFocusSession(record);
    const stats = await flushPendingFocusSessions();
    if (stats) { totalFocusTime = stats.totalFocusTime; totalFocusTimes = stats.totalFocusTimes; }
  }
  function startTimer(): void {
    if (!advancedEnabled || isRunning || remainingMs <= 0) return;
    const now = Date.now();
    if (recordStartedAt === null) {
      recordStartedAt = now;
      plannedSeconds = Math.round(durationMinutes(segmentType) * 60);
      segmentBinding = segmentType === "focus" && binding ? { ...binding } : undefined;
    }
    clearHandles();
    isRunning = true;
    segmentStartedAt = now;
    segmentEndsAt = now + remainingMs;
    const scheduledEnd = segmentEndsAt;
    interval = setInterval(() => tick(), 1000);
    endTimeout = setTimeout(() => {
      if (destroyed || !isRunning || scheduledEnd !== segmentEndsAt) return;
      tick(scheduledEnd); capture(scheduledEnd); clearHandles(); isRunning = false; remainingMs = 0; timeLeft = 0;
      void completeSegment(scheduledEnd);
    }, Math.max(0, scheduledEnd - now));
  }
  function pauseTimer(): void {
    if (!isRunning) return;
    const now = Date.now(); tick(now); capture(now); clearHandles(); isRunning = false;
  }
  async function stopTimer(): Promise<void> {
    const now = Date.now();
    if (isRunning) { tick(now); capture(now); }
    clearHandles(); isRunning = false;
    const record = createRecord("cancelled", now);
    reset("focus");
    if (record) await persist(record);
  }
  async function completeSegment(endedAt: number): Promise<void> {
    const record = createRecord("completed", endedAt);
    if (!record) return;
    try { await persist(record); } catch (error) { console.warn("[focus] 会话保存失败，已保留待重试", error); showMessage("番茄钟记录暂未保存，将在稍后重试", 4000); }
    if (record.segmentType === "focus") {
      completedFocusInCycle += 1;
      showMessage("专注完成，休息一下吧");
      void sendFocusCompletedNotification({ sessionId: record.id, plannedSeconds: record.plannedSeconds, actualFocusSeconds: record.actualSeconds }).catch((error) => console.warn("[focus] 专注通知失败", error));
      const next: FocusSegmentType = completedFocusInCycle % config.longBreakEvery === 0 ? "long_break" : "short_break";
      reset(next);
      if (config.autoStartBreak) startTimer();
    } else {
      showMessage("休息结束，准备下一轮专注");
      void sendBreakCompletedNotification({ cycleId: record.id, breakSeconds: record.actualSeconds }).catch((error) => console.warn("[focus] 休息通知失败", error));
      reset("focus");
      if (config.autoStartFocus) startTimer();
    }
  }
  function formatTime(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
  function formatDuration(seconds: number): string { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}小时${minutes}分` : `${minutes}分钟`; }
  async function saveConfig(next: FocusTimerConfig): Promise<void> {
    await stopTimer();
    config = { focusDuration: Math.max(5, Math.min(180, Number(next.focusDuration) || 25)), shortBreakDuration: Math.max(1, Math.min(60, Number(next.shortBreakDuration) || 5)), longBreakDuration: Math.max(5, Math.min(90, Number(next.longBreakDuration) || 15)), longBreakEvery: Math.max(2, Math.min(12, Math.round(Number(next.longBreakEvery) || 4))), autoStartBreak: next.autoStartBreak, autoStartFocus: next.autoStartFocus, timerStyle: next.timerStyle, timerFontSize: Math.max(1, Math.min(10, Number(next.timerFontSize) || 3)), showFocusInfo: next.showFocusInfo };
    await saveRuntimeConfig(); reset("focus");
  }
  async function applySetup(next: FocusTimerConfig, nextBinding?: FocusBindingSnapshot): Promise<void> {
    const previousBinding = binding ? { ...binding } : undefined;
    binding = normalizeFocusBinding(nextBinding);
    try {
      await saveConfig(next);
    } catch (error) {
      binding = previousBinding;
      throw error;
    }
  }
  async function saveRuntimeConfig(): Promise<void> {
    if (!runtimeContext.deviceViewContext || !content.instanceId) throw new Error("番茄钟缺少设备视图上下文");
    content.data = { ...savedWidgetData, ...$state.snapshot(content.data), ...config };
    if (binding) content.data.focusBinding = { ...binding };
    else delete content.data.focusBinding;
    savedWidgetData = structuredClone($state.snapshot(content.data));
    await saveWidgetInstanceConfig(runtimeContext.deviceViewContext, content.instanceId, $state.snapshot(content));
  }
  function openCenter(): void {
    if (!advancedEnabled) return;
    let ref: ReturnType<typeof svelteDialog>;
    ref = svelteDialog({ title: "", mobileCloseControl: "content", width: "min(1120px, calc(100vw - 48px))", height: "min(820px, calc(100vh - 56px))", constructor: (container) => mount(FocusCenterDialog, { target: container, props: { plugin, config: { ...config }, binding: binding ? { ...binding } : undefined, onApply: applySetup, onStart: startTimer, onClose: () => ref.close() } }) });
    ref.dialog.element.classList.add("focus-center-dialog-host");
  }
  async function refreshStats(): Promise<void> { const stats = await loadFocusStatistics(); totalFocusTime = stats.totalFocusTime; totalFocusTimes = stats.totalFocusTimes; }

  async function initialize(): Promise<void> {
    try { content = JSON.parse(contentTypeJson); } catch { content = {}; }
    const data = content.data || {};
    focusImageType = data.focusImageType || focusImageType; breakImageType = data.breakImageType || breakImageType;
    focusBgImage = data.focusBgImage || focusBgImage; breakBgImage = data.breakBgImage || breakBgImage;
    focusLocalImage = data.focusLocalImage || focusLocalImage; breakLocalImage = data.breakLocalImage || breakLocalImage;
    const saved = runtimeContext.deviceViewContext ? await loadWidgetInstanceConfig(runtimeContext.deviceViewContext, content.instanceId) : null;
    if (destroyed) return;
    savedWidgetData = saved?.data && typeof saved.data === "object" ? structuredClone(saved.data) : {};
    const source = { ...data, ...(saved?.data || {}) };
    config = { focusDuration: Number(source.focusDuration) || defaultConfig.focusDuration, shortBreakDuration: Number(source.shortBreakDuration) || defaultConfig.shortBreakDuration, longBreakDuration: Number(source.longBreakDuration) || defaultConfig.longBreakDuration, longBreakEvery: Number(source.longBreakEvery) || defaultConfig.longBreakEvery, autoStartBreak: source.autoStartBreak !== false, autoStartFocus: source.autoStartFocus === true, timerStyle: String(source.timerStyle || defaultConfig.timerStyle), timerFontSize: Number(source.timerFontSize) || defaultConfig.timerFontSize, showFocusInfo: source.showFocusInfo === true };
    binding = normalizeFocusBinding(source.focusBinding);
    reset("focus");
    if (advancedEnabled) await refreshStats().catch((error) => console.warn("[focus] 统计读取失败", error));
    unsubscribe = subscribeSharedWidgetDataUpdated("focus", () => void refreshStats().catch(() => undefined));
    unregisterFlusher = registerSharedWidgetFlusher(async () => { if (recordStartedAt !== null) await stopTimer(); await flushPendingFocusSessions(); });
    if (focusImageType === "remote") focusBgImage = await getImage(focusBgImage);
    if (breakImageType === "remote") breakBgImage = await getImage(breakBgImage);
  }

  onMount(() => {
    advancedEnabled = Boolean(plugin?.ADVANCED);
    const enabled = () => { advancedEnabled = true; void refreshStats(); };
    const disabled = () => { advancedEnabled = false; void stopTimer(); };
    window.addEventListener("homepage-advanced-ready", enabled);
    window.addEventListener("homepage-advanced-unavailable", disabled);
    void initialize().catch((error) => console.error("[focus] 初始化失败", error));
    return () => { window.removeEventListener("homepage-advanced-ready", enabled); window.removeEventListener("homepage-advanced-unavailable", disabled); };
  });
  onDestroy(() => {
    destroyed = true;
    if (isRunning) { const now = Date.now(); tick(now); capture(now); }
    clearHandles(); unsubscribe?.(); unregisterFlusher?.();
    if (recordStartedAt !== null) { const record = createRecord("cancelled"); if (record) queueFocusSession(record); }
    void flushPendingFocusSessions().catch((error) => console.warn("[focus] 销毁写入失败，保留待重试", error));
  });
</script>

{#if !advancedEnabled}
  <AdvancedFeatureLock compact title="高级番茄钟" subtitle="任务、项目与习惯专注数据中心" icon="vip" />
{:else}
  <div class="timer" style:background-image={`url(${isBreak ? (breakImageType === "remote" ? breakBgImage : breakLocalImage) : (focusImageType === "remote" ? focusBgImage : focusLocalImage)})`}>
    <div class="veil"></div>
    <div class="content">
      {#if binding && segmentType === "focus"}<button class="binding" type="button" onclick={openCenter}>{binding.title}</button>{/if}
      <div class="display {config.timerStyle}" style:font-size={`${config.timerFontSize}rem`}>
        {#if config.timerStyle === "circular-progress"}
          <svg width={radius * 2 + 18} height={radius * 2 + 18} viewBox={`0 0 ${radius * 2 + 18} ${radius * 2 + 18}`}><circle class="track" cx={radius + 9} cy={radius + 9} r={radius}></circle><circle class="progress" cx={radius + 9} cy={radius + 9} r={radius} style:stroke-dasharray={circumference} style:stroke-dashoffset={circumference * (1 - progress)}></circle><text x={radius + 9} y={radius + 12}>{formatTime(timeLeft)}</text></svg>
        {:else}{formatTime(timeLeft)}{/if}
      </div>
      <div class="controls">
        <button type="button" title="开始" disabled={isRunning} onclick={startTimer}><Play size={17} /></button>
        <button type="button" title="暂停" disabled={!isRunning} onclick={pauseTimer}><Pause size={17} /></button>
        <button type="button" title="停止" onclick={stopTimer}><Square size={16} /></button>
        <button type="button" title="番茄钟中心" onclick={openCenter}><Settings size={17} /></button>
      </div>
      {#if config.showFocusInfo}<small class="stats">{totalFocusTimes} 轮 · {formatDuration(totalFocusTime)}</small>{/if}
    </div>
  </div>
{/if}

<style>
  .timer{position:relative;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;border-radius:12px;background-size:cover;background-position:center;color:var(--b3-theme-on-background)}.veil{position:absolute;inset:0;background:color-mix(in srgb,var(--b3-theme-background) 26%,transparent);backdrop-filter:blur(2px)}.content{position:relative;z-index:1;width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:18px}.binding{max-width:78%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;border-radius:999px;padding:4px 10px;background:color-mix(in srgb,var(--b3-theme-primary) 14%,var(--b3-theme-surface));color:var(--b3-theme-primary);cursor:pointer}.display{font-weight:750;line-height:1;text-align:center}.display.classic{padding:9px 16px;border-radius:14px;background:color-mix(in srgb,var(--b3-theme-surface) 84%,transparent);color:var(--b3-theme-primary)}.display.modern{padding:9px 16px;border-radius:11px;background:color-mix(in srgb,#18202a 90%,transparent);color:#f4f7fb}.display.rounded{padding:10px 20px;border-radius:999px;background:color-mix(in srgb,var(--b3-theme-surface) 88%,transparent);color:var(--b3-theme-primary)}.display.digital-clock{padding:9px 15px;border-radius:10px;background:#101923;color:#55d8df;font-family:ui-monospace,monospace;letter-spacing:.05em}.display.circular-progress{background:transparent}.display svg{display:block;overflow:visible}.display circle{fill:none;stroke-width:7}.display .track{stroke:color-mix(in srgb,var(--b3-theme-surface) 72%,transparent)}.display .progress{stroke:var(--b3-theme-primary);stroke-linecap:round;transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset .25s linear}.display text{fill:currentColor;text-anchor:middle;dominant-baseline:middle;font-size:16px}.controls{display:flex;gap:7px;opacity:0;transform:translateY(3px);transition:.18s}.timer:hover .controls,.timer:focus-within .controls{opacity:1;transform:none}.controls button{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;background:color-mix(in srgb,var(--b3-theme-surface) 82%,transparent);color:var(--b3-theme-primary);cursor:pointer}.controls button:disabled{opacity:.38;cursor:not-allowed}.stats{position:absolute;bottom:8px;border-radius:999px;padding:4px 9px;background:color-mix(in srgb,var(--b3-theme-surface) 76%,transparent);color:var(--b3-theme-on-surface)}@container(max-height:210px){.stats{display:none}.content{gap:4px}.controls{opacity:1}}@media(prefers-reduced-motion:reduce){.controls,.display .progress{transition:none}}
</style>
