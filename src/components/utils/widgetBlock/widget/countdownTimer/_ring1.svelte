<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy } from "svelte";

    interface Props {
        plugin: any;
        hours?: number;
        minutes?: number;
        seconds?: number;
        beforeCountdown: boolean;
    }

    let {
        plugin,
        hours = 0,
        minutes = 0,
        seconds = 0,
        beforeCountdown = $bindable()
    }: Props = $props();

    let advancedEnabled = $state(false);
    let timeRemaining: number = $state(); // 剩余时间（秒）
    let isRunning: boolean = $state(false);
    let isPaused: boolean = $state(false);
    let interval: number | null = null;

    // 计算总秒数
    let totalSeconds = $derived(hours * 3600 + minutes * 60 + seconds);
    run(() => {
        timeRemaining = totalSeconds;
    });

    // 格式化显示时间
    let displayHours = $derived(Math.floor(timeRemaining / 3600));
    let displayMinutes = $derived(Math.floor((timeRemaining % 3600) / 60));
    let displaySeconds = $derived(timeRemaining % 60);

    // 环形进度计算 - 反向逻辑：从满到空
     // 与SVG中的半径保持一致
    let circumference = $derived(2 * Math.PI * radius);
    // 反向进度：从1(满)到0(空)，基于剩余时间比例
    let remainingProgress = $derived(totalSeconds > 0 ? timeRemaining / totalSeconds : 0);
    // 确保进度值在0-1之间
    let clampedProgress = $derived(Math.max(0, Math.min(1, remainingProgress)));
    let progressOffset = $derived(circumference * (1 - clampedProgress));

    // 格式化时间文本
    function formatTimeText(): string {
        const hours = displayHours;
        const minutes = displayMinutes;
        const seconds = displaySeconds;

        if (hours > 0) {
            return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        } else {
            return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        }
    }

    // 开始倒计时
    function startCountdown() {
        if (timeRemaining <= 0) return;

        isRunning = true;
        isPaused = false;

        interval = window.setInterval(() => {
            if (timeRemaining > 0 && !isPaused) {
                timeRemaining--;
            } else if (timeRemaining <= 0) {
                // 倒计时结束
                stopCountdown();
                // 可以添加提示音或其他结束提示
            }
        }, 1000);
    }

    // 暂停/继续
    function togglePause() {
        isPaused = !isPaused;
    }

    // 停止倒计时并返回起始页面
    function stopCountdown() {
        isRunning = false;
        isPaused = false;
        beforeCountdown = false;
        timeRemaining = totalSeconds;

        if (interval) {
            clearInterval(interval);
            interval = null;
        }
    }

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;
        startCountdown(); // 组件挂载时自动开始倒计时
    });

    onDestroy(() => {
        if (interval) {
            clearInterval(interval);
        }
    });
</script>

<div class="content-display-ring1">
    {#if advancedEnabled}
        <svg class="progress-ring" viewBox="0 0 100 100">
            <!-- 背景圆环 -->
            <circle
                class="progress-ring-bg"
                cx="50"
                cy="50"
                r="47"
                stroke="var(--b3-border-color)"
                stroke-width="6"
                fill="none"
            />
            <!-- 进度圆环 -->
            <circle
                class="progress-ring-progress"
                cx="50"
                cy="50"
                r="47"
                stroke="var(--b3-theme-primary)"
                stroke-width="6"
                fill="none"
                stroke-dasharray={circumference}
                stroke-dashoffset={progressOffset}
                stroke-linecap="round"
                transform="rotate(-90 50 50)"
            />
            <!-- 时间显示 -->
            <g class="time-display">
                <text
                    x="50"
                    y="30"
                    font-size="12"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    opacity="0.5"
                >
                    {formatTimeText()}
                </text>
                <text
                    x="50"
                    y="50"
                    font-size="20"
                    fill="var(--b3-theme-primary)"
                    text-anchor="middle"
                    dominant-baseline="middle"
                >
                    {#if displayHours > 0}
                        {displayHours
                            .toString()
                            .padStart(2, "0")}:{displayMinutes
                            .toString()
                            .padStart(2, "0")}:{displaySeconds
                            .toString()
                            .padStart(2, "0")}
                    {:else}
                        {displayMinutes
                            .toString()
                            .padStart(2, "0")}:{displaySeconds
                            .toString()
                            .padStart(2, "0")}
                    {/if}
                </text>
            </g>

            <!-- 倒计时控制 -->
            <!-- 暂停/继续按钮 -->
            <g
                class="control-button pause-button"
                onclick={togglePause}
                role="button"
                tabindex={isRunning ? 0 : -1}
                aria-label={isPaused ? "继续倒计时" : "暂停倒计时"}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        togglePause();
                    }
                }}
            >
                <circle
                    cx="36"
                    cy="69"
                    r="8"
                    fill="var(--b3-theme-primary)"
                    class="button-bg"
                    style="opacity: {!isRunning ? 0.5 : 1}"
                />
                <g
                    class="button-icon"
                    style="pointer-events: none; opacity: {!isRunning
                        ? 0.5
                        : 1}"
                >
                    {#if isPaused}
                        <!-- 播放图标：三角形，稍微往右移一点 -->
                        <polygon points="34,66 34,72 40,69" fill="white" />
                    {:else}
                        <!-- 暂停图标：两竖线 -->
                        <rect
                            x="33.5"
                            y="65"
                            width="1.5"
                            height="8"
                            fill="white"
                        />
                        <rect
                            x="37"
                            y="65"
                            width="1.5"
                            height="8"
                            fill="white"
                        />
                    {/if}
                </g>
            </g>
            <!-- 停止按钮 -->
            <g
                class="control-button stop-button"
                onclick={stopCountdown}
                role="button"
                tabindex="0"
                aria-label="停止倒计时"
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        stopCountdown();
                    }
                }}
            >
                <rect
                    x="57"
                    y="61"
                    width="16"
                    height="16"
                    rx="4"
                    ry="4"
                    fill="var(--b3-theme-primary)"
                    class="button-bg"
                />
                <!-- 停止图标：X -->
                <rect
                    x="61"
                    y="65"
                    width="8"
                    height="8"
                    rx="2"
                    ry="2"
                    fill="white"
                    class="button-icon"
                    style="pointer-events: none; opacity: {!isRunning
                        ? 0.5
                        : 1}"
                />
            </g>
        </svg>
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在"主页设置"→"会员服务"中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display-ring1 {
        width: 100%;
        height: 100%;
        display: flex;

        .content-not-advanced {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            text-align: center;
            color: #666;
        }

        .progress-ring {
            width: 100%;
            height: 100%;

            .progress-ring-bg {
                transition: stroke 0.3s ease;
            }

            .progress-ring-progress {
                transition: stroke-dashoffset 0.5s ease;
                filter: drop-shadow(
                    0 0 4px rgba(var(--b3-theme-primary-rgb), 0.3)
                );
            }
        }
    }
</style>
