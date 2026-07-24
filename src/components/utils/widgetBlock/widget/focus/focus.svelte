<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { getImage } from "@/components/tools/getImage";
    import {
        flushPendingFocusSessions,
        getLocalFocusDate,
        loadFocusStatistics,
        queueFocusSession,
        toFocusSecondTimestamp,
        type FocusSessionRecord,
    } from "./focusData";
    import { subscribeSharedWidgetDataUpdated } from "../sharedLocalStorage/sharedWidgetDataEvents";
    import { registerSharedWidgetFlusher } from "../sharedLocalStorage/sharedLocalStorage";
    import {
        sendBreakCompletedNotification,
        sendFocusCompletedNotification,
    } from "@/features/focus-notify";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
    import { loadWidgetInstanceConfig, saveWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();

    let contentTypeJsonObj: any;
    let segmentStartedAt = 0;
    let segmentEndsAt = 0;
    let sessionStartedAt: number | null = null;
    let sessionPlannedSeconds = 0;
    let accumulatedFocusMs = 0;
    let completionHandled = false;
    let activeBreakCycleId: string | null = null;
    let endTimeout: ReturnType<typeof setTimeout> | null = null;
    let isRunning = $state(false);
    let isBreak = $state(false);
    let timeLeft: number = $state();
    let remainingMs = 0;
    let timer: ReturnType<typeof setInterval> | null = $state(null);
    let totalFocusTime = $state(0);
    let totalFocusTimes = $state(0);
    let focusBgImage =
        $state("https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464");
    let breakBgImage =
        $state("https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d");
    let focusLocalImage = $state("");
    let breakLocalImage = $state("");
    let focusImageType = $state("remote");
    let breakImageType = $state("remote");

    let showSettings = $state(false);
    let localFocusDuration = $state(25);
    let localBreakDuration = $state(5);
    let selectedTimerStyle = $state("classic");
    let timerFontSize = $state(3);
    let showFocusInfo = $state(false);
    let savedWidgetData: Record<string, unknown> = {};

    let isDestroyed = false;
    let unsubscribeDataUpdated: (() => void) | null = null;
    let unregisterFocusFlusher: (() => void) | null = null;

    let circumference = $state(Math.PI * 2 * 65);
    let baseSize = $derived(timerFontSize * 40);
    let strokeWidth = $derived(timerFontSize * 2);
    let radius = $derived(baseSize / 2 - strokeWidth);
    run(() => {
        circumference = 2 * Math.PI * radius;
    });
    let progressOffset =
        $derived(circumference -
        (timeLeft /
            (isBreak ? localBreakDuration * 60 : localFocusDuration * 60)) *
            circumference);

    onMount(async () => {
        unregisterFocusFlusher = registerSharedWidgetFlusher(flushActiveFocusSession);
        contentTypeJsonObj = JSON.parse(contentTypeJson);
        if (contentTypeJsonObj.type === "focus" && contentTypeJsonObj.data) {
            const data = contentTypeJsonObj.data || {};
            focusImageType = data.focusImageType || focusImageType;
            breakImageType = data.breakImageType || breakImageType;
            focusBgImage = data.focusBgImage || focusBgImage;
            breakBgImage = data.breakBgImage || breakBgImage;
            focusLocalImage = data.focusLocalImage || focusLocalImage;
            breakLocalImage = data.breakLocalImage || breakLocalImage;
            const savedConfig = runtimeContext.deviceViewContext
                ? await loadWidgetInstanceConfig(runtimeContext.deviceViewContext, contentTypeJsonObj.instanceId ?? contentTypeJsonObj.blockId)
                : null;
            // 保留旧 showSyNotif 及其他未知字段；它们不再参与运行时，但保存设置时也不能被主动删除。
            savedWidgetData = savedConfig?.data && typeof savedConfig.data === "object"
                ? structuredClone(savedConfig.data)
                : {};
            localFocusDuration =
                savedConfig?.data?.focusDuration || localFocusDuration;
            localBreakDuration =
                savedConfig?.data?.breakDuration || localBreakDuration;
            selectedTimerStyle =
                savedConfig?.data?.timerStyle || selectedTimerStyle;
            timerFontSize = savedConfig?.data?.timerFontSize || timerFontSize;
            showFocusInfo = savedConfig?.data?.showFocusInfo || showFocusInfo;
        }

        try {
            const stats = await loadFocusStatistics();
            totalFocusTime = stats.totalFocusTime;
            totalFocusTimes = stats.totalFocusTimes;
        } catch (error) {
            console.warn("[focus] 读取本地统计失败", error);
            showMessage("旧数据迁移尚未完成，请重新加载插件后重试。", 4000);
        }
        unsubscribeDataUpdated = subscribeSharedWidgetDataUpdated("focus", async () => {
            try {
                const stats = await loadFocusStatistics();
                totalFocusTime = stats.totalFocusTime;
                totalFocusTimes = stats.totalFocusTimes;
            } catch (error) {
                console.warn("[focus] 刷新本地统计失败", error);
            }
        });

        resetTimer("focus");

        if (focusImageType === "remote") {
            focusBgImage = await getImage(focusBgImage);
        }
        if (breakImageType === "remote") {
            breakBgImage = await getImage(breakBgImage);
        }
    });

    onDestroy(() => {
        isDestroyed = true;
        const now = Date.now();
        if (isRunning) {
            updateRemainingTime(now);
            captureFocusSegment(now);
        }
        clearTimerHandles();
        isRunning = false;
        const cancelled = !isBreak ? createCurrentFocusSession("cancelled") : null;
        if (cancelled) queueFocusSession(cancelled);
        resetSessionTracking();
        activeBreakCycleId = null;
        unsubscribeDataUpdated?.();
        unsubscribeDataUpdated = null;
        unregisterFocusFlusher?.();
        unregisterFocusFlusher = null;
        void flushPendingFocusSessions().catch((error) => {
            console.warn("[focus] 组件销毁时番茄钟会话暂未写入，已保留待重试", error);
        });
    });

    function resetTimer(mode: "focus" | "break") {
        if (mode === "focus") {
            remainingMs = localFocusDuration * 60 * 1000;
        } else {
            remainingMs = localBreakDuration * 60 * 1000;
        }
        timeLeft = Math.ceil(remainingMs / 1000);
    }

    function clearTimerHandles() {
        if (timer) clearInterval(timer);
        if (endTimeout) clearTimeout(endTimeout);
        timer = null;
        endTimeout = null;
    }

    function updateRemainingTime(now = Date.now()) {
        if (!isRunning || segmentEndsAt <= 0) return;
        remainingMs = Math.max(0, segmentEndsAt - now);
        timeLeft = Math.ceil(remainingMs / 1000);
    }

    function captureFocusSegment(now = Date.now()) {
        if (isBreak || sessionStartedAt === null || segmentStartedAt <= 0) return;
        accumulatedFocusMs += Math.max(0, Math.min(now, segmentEndsAt) - segmentStartedAt);
        segmentStartedAt = 0;
        segmentEndsAt = 0;
    }

    function resetSessionTracking() {
        sessionStartedAt = null;
        sessionPlannedSeconds = 0;
        accumulatedFocusMs = 0;
        segmentStartedAt = 0;
        segmentEndsAt = 0;
        completionHandled = false;
    }

    function createCurrentFocusSession(status: "completed" | "cancelled"): FocusSessionRecord | null {
        if (sessionStartedAt === null) return null;
        const endedAt = Date.now();
        const actualFocusSeconds = status === "completed"
            ? sessionPlannedSeconds
            : Math.min(sessionPlannedSeconds, Math.max(0, Math.floor(accumulatedFocusMs / 1000)));
        const uniquePart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
        return {
            id: `focus-session-${sessionStartedAt}-${uniquePart}`,
            startedAt: toFocusSecondTimestamp(sessionStartedAt),
            endedAt: toFocusSecondTimestamp(endedAt),
            localDate: getLocalFocusDate(sessionStartedAt),
            plannedSeconds: sessionPlannedSeconds,
            actualFocusSeconds,
            status,
        };
    }

    function startTimer() {
        if (isRunning || remainingMs <= 0) return;
        const now = Date.now();
        if (!isBreak && sessionStartedAt === null) {
            sessionStartedAt = now;
            sessionPlannedSeconds = Math.max(0, Math.round(localFocusDuration * 60));
            accumulatedFocusMs = 0;
            completionHandled = false;
        }
        clearTimerHandles();
        isRunning = true;
        segmentStartedAt = now;
        segmentEndsAt = now + remainingMs;
        const scheduledEnd = segmentEndsAt;
        timer = setInterval(updateTimer, 1000);
        endTimeout = setTimeout(() => {
            if (isDestroyed || !isRunning || segmentEndsAt !== scheduledEnd) return;
            updateRemainingTime(scheduledEnd);
            captureFocusSegment(scheduledEnd);
            clearTimerHandles();
            isRunning = false;
            remainingMs = 0;
            timeLeft = 0;
            void handleTimerEnd().catch((error) => {
                console.warn("[focus] 番茄钟结束处理失败", error);
            });
        }, Math.max(0, scheduledEnd - now));
    }

    function updateTimer() {
        updateRemainingTime();
    }

    function pauseTimer() {
        if (!isRunning) return;
        const now = Date.now();
        updateRemainingTime(now);
        captureFocusSegment(now);
        clearTimerHandles();
        isRunning = false;
    }

    async function stopTimer() {
        await flushActiveFocusSession();
        activeBreakCycleId = null;
        isBreak = false;
        resetTimer("focus");
    }

    async function flushActiveFocusSession() {
        const now = Date.now();
        if (isRunning) {
            updateRemainingTime(now);
            captureFocusSegment(now);
        }
        clearTimerHandles();
        isRunning = false;
        const cancelled = !isBreak ? createCurrentFocusSession("cancelled") : null;
        if (cancelled) queueFocusSession(cancelled);
        resetSessionTracking();
        if (cancelled) await persistFocusSession(cancelled);
    }

    async function openSettings() {
        await stopTimer();
        showSettings = true;
    }

    async function handleTimerEnd() {
        if (completionHandled) return;
        completionHandled = true;
        const message = isBreak ? "休息时间结束！" : "专注时间结束！";
        showMessage(message);

        if (!isBreak) {
            const completed = createCurrentFocusSession("completed");
            if (completed) {
                activeBreakCycleId = completed.id;
                queueFocusSession(completed);
            }
            resetSessionTracking();
            if (completed) {
                let sessionSaved = false;
                try {
                    await persistFocusSession(completed);
                    sessionSaved = true;
                } catch (error) {
                    console.warn("[focus] 专注会话保存失败，完成通知未发送；会话已保留待重试", error);
                }
                if (sessionSaved) {
                    void sendFocusCompletedNotification({
                        sessionId: completed.id,
                        plannedSeconds: completed.plannedSeconds,
                        actualFocusSeconds: completed.actualFocusSeconds,
                    }).catch((error) => {
                        console.warn("[focus] 专注结束通知发送失败，不影响进入休息阶段", error);
                    });
                }
            }
        } else {
            const cycleId = activeBreakCycleId;
            activeBreakCycleId = null;
            if (cycleId) {
                void sendBreakCompletedNotification({
                    cycleId,
                    breakSeconds: Math.max(0, Math.round(localBreakDuration * 60)),
                }).catch((error) => {
                    console.warn("[focus] 休息结束通知发送失败，不影响返回专注阶段", error);
                });
            }
        }

        isBreak = !isBreak;
        resetTimer(isBreak ? "break" : "focus");

        if (isBreak) startTimer();
    }

    function formatDuration(seconds: number, limit: number = 2): string {
        const units = [
            { limit: 31536000, label: "年" },
            { limit: 2628000, label: "个月" },
            { limit: 86400, label: "天" },
            { limit: 3600, label: "小时" },
            { limit: 60, label: "分钟" },
            { limit: 1, label: "秒" },
        ];

        let result = [];
        for (let i = 0; i < units.length && result.length < limit; i++) {
            const unit = units[i];
            const count = Math.floor(seconds / unit.limit);
            if (count > 0) {
                result.push(`${count}${unit.label}`);
                seconds %= unit.limit;
            }
        }

        return result.join("") || "0秒";
    }

    function formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    async function persistFocusSession(session: FocusSessionRecord) {
        queueFocusSession(session);
        try {
            const stats = await flushPendingFocusSessions();
            if (stats) {
                totalFocusTime = stats.totalFocusTime;
                totalFocusTimes = stats.totalFocusTimes;
            }
        } catch (error) {
            console.error("保存番茄钟会话失败:", error);
            showMessage("番茄钟会话保存失败，请重新加载插件后重试", 4000);
            throw error;
        }
    }

    async function saveConfig() {
        contentTypeJsonObj.data = {
            ...savedWidgetData,
            ...contentTypeJsonObj.data,
            focusDuration: localFocusDuration,
            breakDuration: localBreakDuration,
            timerStyle: selectedTimerStyle,
            timerFontSize: timerFontSize,
            showFocusInfo: showFocusInfo,
        };
        savedWidgetData = structuredClone(contentTypeJsonObj.data);
        if (!runtimeContext.deviceViewContext) throw new Error("专注组件缺少设备视图上下文");
        await saveWidgetInstanceConfig(runtimeContext.deviceViewContext, contentTypeJsonObj.instanceId ?? contentTypeJsonObj.blockId, contentTypeJsonObj);
        clearTimerHandles();
        resetTimer(isBreak ? "break" : "focus");
        showSettings = false;
    }
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
</svelte:head>

<div
    class="content-display"
    style="background-image: url({isBreak
        ? breakImageType === 'remote'
            ? breakBgImage
            : breakLocalImage
        : focusImageType === 'remote'
          ? focusBgImage
          : focusLocalImage})"
>
    <div class="overlay"></div>
    {#if showSettings}
        <!-- 设置弹窗 -->
        <div class="settings-modal">
            <h4>专注设置</h4>
            <div class="form-group">
                <label
                    >专注时长/分钟：
                    <input
                        type="number"
                        min="5"
                        max="120"
                        bind:value={localFocusDuration}
                    />
                </label>
            </div>
            <div class="form-group">
                <label
                    >休息时长/分钟：
                    <input
                        type="number"
                        min="1"
                        max="30"
                        bind:value={localBreakDuration}
                    />
                </label>
            </div>
            <h4>样式设置</h4>
            <div class="form-group">
                <label>
                    倒计时样式：
                    <select bind:value={selectedTimerStyle}>
                        <option value="classic">经典样式</option>
                        <option value="modern">现代简约</option>
                        <option value="rounded">圆角卡片</option>
                        <option value="digital-clock">数码时钟</option>
                        <option value="circular-progress">环形进度</option>
                    </select>
                </label>
            </div>
            <div class="form-group">
                <label>
                    倒计时大小：
                    <input
                        type="number"
                        min="1"
                        max="10"
                        bind:value={timerFontSize}
                        step="0.5"
                    />
                </label>
            </div>
            <div class="form-group">
                <label for="timer-show-info">
                    <input
                        id="timer-show-info"
                        type="checkbox"
                        bind:checked={showFocusInfo}
                    />显示专注信息
                </label>
            </div>
            <h4>专注统计</h4>
            <div class="form-group">
                <p>
                    已专注次数：{totalFocusTimes}
                </p>
                <p>
                    已专注时间：{formatDuration(totalFocusTime, 10)}
                </p>
            </div>
            <div class="modal-actions">
                <button onclick={saveConfig}>保存</button>
                <button onclick={() => (showSettings = false)}>取消</button>
            </div>
        </div>
    {:else}
        <!-- 主界面布局 -->
        <div class="focus-timer-section">
            <div class="timer-main">
                <div class="timer-wrapper">
                    <div
                        class="timer-display {selectedTimerStyle} {isBreak
                            ? 'break'
                            : 'focus'}"
                        style="font-size: {timerFontSize}rem;"
                    >
                        {#if selectedTimerStyle === "circular-progress"}
                            <div class="circular-timer">
                                <svg
                                    width={baseSize}
                                    height={baseSize}
                                    viewBox="0 0 {baseSize} {baseSize}"
                                >
                                    <!-- 内部填充背景 -->
                                    <circle
                                        cx={baseSize / 2}
                                        cy={baseSize / 2}
                                        r={radius}
                                        fill="color-mix(in srgb, var(--b3-theme-surface), transparent)"
                                    />

                                    <!-- 背景圆环 -->
                                    <circle
                                        cx={baseSize / 2}
                                        cy={baseSize / 2}
                                        r={radius}
                                        stroke-width={strokeWidth}
                                        fill="none"
                                        stroke="var(--b3-theme-surface)"
                                    />

                                    <!-- 进度圆环 -->
                                    <circle
                                        cx={baseSize / 2}
                                        cy={baseSize / 2}
                                        r={radius}
                                        stroke-width={strokeWidth}
                                        fill="none"
                                        stroke={isBreak
                                            ? "#60a5fa"
                                            : "var(--b3-theme-primary)"}
                                        stroke-linecap="round"
                                        transform="rotate(-90 {baseSize /
                                            2} {baseSize / 2})"
                                        style="stroke-dasharray: {circumference};
            stroke-dashoffset: {progressOffset}"
                                    />

                                    <!-- 时间文本 -->
                                    <text
                                        x={baseSize / 2}
                                        y={baseSize / 2 + 5}
                                        text-anchor="middle"
                                        font-size={timerFontSize * 10}
                                    >
                                        {formatTime(timeLeft)}
                                    </text>
                                </svg>
                            </div>
                        {:else}
                            {formatTime(timeLeft)}
                        {/if}
                    </div>

                    <div class="timer-controls">
                        <button
                            title="开始"
                            onclick={startTimer}
                            disabled={isRunning}
                        >
                            <i class="fas fa-play"></i>
                        </button>
                        <button
                            title="暂停"
                            onclick={pauseTimer}
                        >
                            <i class="fas fa-pause"></i>
                        </button>
                        <button
                            title="停止"
                            onclick={stopTimer}
                        >
                            <i class="fas fa-stop"></i>
                        </button>
                        <button
                            title="设置"
                            onclick={openSettings}
                        >
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                </div>
                {#if showFocusInfo}
                    <div class="focus-info">
                        <p>
                            已专注{totalFocusTimes}次，总时长{formatDuration(
                                totalFocusTime,
                                2,
                            )}
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        transition: background-image 0.5s ease;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        position: relative;
        overflow: hidden;
    }

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        box-shadow: 0 4px 16px 0 rgba(31, 38, 135, 0.1);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 1;
        pointer-events: none;
    }

    .focus-timer-section {
        z-index: 2;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    .timer-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    .timer-display {
        text-align: center;
        transition: all 0.3s ease;
        font-weight: bolder;
        font-size: 3rem;

        &.classic {
            color: var(--b3-theme-primary);
            background: none;
            padding: 0.5rem;
            border-radius: 1rem;
            background-color: var(--b3-theme-surface);
        }

        &.modern {
            color: #e5e7eb;
            background-color: #2e343d;
            border: 2px solid black;
            border-radius: 8px;
            box-shadow:
                0 4px 6px -1px rgba(0, 0, 0, 0.1),
                0 2px 4px -1px rgba(0, 0, 0, 0.06);
            padding: 0.5rem 1rem;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        &.rounded {
            color: var(--b3-theme-primary);
            background-color: var(--b3-theme-surface);
            border-radius: 999px;
            padding: 1rem 2rem;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        }

        &.digital-clock {
            font-family: "Courier New", Courier, monospace;
            color: #06b6d4;
            background-color: #0f172a;
            border-radius: 8px;
            padding: 0.8rem 1.5rem;
            letter-spacing: 2px;
        }
    }

    .timer-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .timer-controls {
        display: none;
        gap: 0.5rem;
        margin-top: 0.5rem;

        button {
            background-color: transparent;
            border: none;
            cursor: pointer;
            color: var(--b3-theme-primary);
            background-color: color-mix(
                in srgb,
                var(--b3-theme-surface) 50%,
                transparent
            );
            transition: color 0.2s;

            &:hover {
                border-radius: 50%;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                transform: scale(1.1);
                width: fit-content;
                background-color: var(--b3-list-icon-hover);
            }
        }
    }

    .content-display:hover .timer-controls {
        display: flex;
    }

    .focus-info {
        position: absolute;
        bottom: 0.2rem;
        margin-top: 1rem;
        font-size: 1rem;
        padding: 0.5rem;
        border-radius: 1rem;

        opacity: 0.5;
        background-color: var(--b3-theme-surface);
    }

    .settings-modal {
        padding: 1rem;
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-height: 100%;
        background-color: var(--b3-theme-surface);
        z-index: 100;
        overflow-y: auto;
    }

    .modal-actions {
        margin-top: 1.5rem;
        display: flex;
        justify-content: flex-end;
        gap: 1rem;

        button {
            color: var(--b3-theme-on-surface);
        }
    }

    button {
        padding: 0.5rem;
        font-size: 0.9rem;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 6px;
        background-color: transparent;
        transition: all 0.2s;
        cursor: pointer;

        &:hover {
            background-color: var(--b3-list-icon-hover);
        }
    }

    .form-group {
        label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.5rem;
        }

        input[type="number"] {
            width: 50px;
            padding: 0.3rem;
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
            background-color: var(--b3-theme-background);
            color: var(--b3-theme-on-surface);

            &:hover {
                border-color: var(--b3-theme-primary);
                outline: none;
                box-shadow: 0 0 0 1px var(--b3-theme-primary);
            }

            &:focus {
                border-color: var(--b3-theme-primary);
                outline: none;
                box-shadow: 0 0 0 1px var(--b3-theme-primary);
            }
        }

        input[type="checkbox"] {
            margin-right: 0.5rem;
        }

        select {
            padding: 0.3rem;
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
            color: var(--b3-theme-on-surface);
            background-color: var(--b3-theme-background);
        }
    }

    .circular-timer {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .timer-display.circular-progress {
        background-color: transparent !important;

        display: flex;
        align-items: center;
        justify-content: center;
    }

    .timer-display .circular-timer svg circle {
        transition: stroke-dashoffset 0.3s linear;
    }

    .timer-display .circular-timer svg text {
        font-weight: bold;
        dominant-baseline: middle;
    }
</style>
