<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

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

<div class="content-display-default">
    {#if advancedEnabled}
        <div class="countdown-header">
            <div class="countdown-item">
                <span class="time-number"
                    >{displayHours.toString().padStart(2, "0")}</span
                >
                <span class="time-label">时</span>
            </div>
            <div class="countdown-separator">:</div>
            <div class="countdown-item">
                <span class="time-number"
                    >{displayMinutes.toString().padStart(2, "0")}</span
                >
                <span class="time-label">分</span>
            </div>
            <div class="countdown-separator">:</div>
            <div class="countdown-item">
                <span class="time-number"
                    >{displaySeconds.toString().padStart(2, "0")}</span
                >
                <span class="time-label">秒</span>
            </div>
        </div>

        <div class="countdown-controls">
            <button
                class="control-button pause-button"
                onclick={togglePause}
                disabled={!isRunning}
                aria-label={isPaused ? "Resume countdown" : "Pause countdown"}
                title={isPaused ? "Resume countdown" : "Pause countdown"}
            >
                <i class="fas {isPaused ? 'fa-play' : 'fa-pause'}"></i>
            </button>
            <button
                class="control-button stop-button"
                onclick={stopCountdown}
                aria-label="Stop countdown"
                title="Stop countdown"
            >
                <i class="fas fa-stop"></i>
            </button>
        </div>
    {:else}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="倒计时"
                subtitle="重要日期倒计时组件，多种样式可选。"
                icon="time"
                features={[
                    "重要日期倒计时",
                    "多种样式展示",
                    "适合考试、DDL、纪念日"
                ]}
                highlights={["倒计时", "多样式", "纪念日"]}
                compact
            />
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display-default {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;

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

        .countdown-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-family: "Courier New", monospace;

            .countdown-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.25rem;

                .time-number {
                    font-size: 2.5rem;
                    font-weight: 700;
                    color: var(--b3-theme-primary);
                    line-height: 1;
                }

                .time-label {
                    font-size: 0.75rem;
                    color: var(--b3-theme-on-surface-light);
                    font-weight: 500;
                }
            }

            .countdown-separator {
                font-size: 2rem;
                font-weight: 600;
                color: var(--b3-theme-primary);
                margin: 0 0.25rem;
                align-self: flex-start;
                padding-top: 0.5rem;
            }
        }

        .countdown-controls {
            display: flex;
            gap: 1rem;

            .control-button {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.6rem 1rem;
                border: none;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;

                i {
                    font-size: 0.75rem;
                }

                &.pause-button {
                    background: var(--b3-theme-secondary);
                    color: white;
                    box-shadow: 0 2px 8px
                        rgba(var(--b3-theme-secondary-rgb), 0.3);

                    &:hover:not(:disabled) {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px
                            rgba(var(--b3-theme-secondary-rgb), 0.4);
                    }

                    &:disabled {
                        background: var(--b3-theme-on-surface-light);
                        cursor: not-allowed;
                        box-shadow: none;
                    }
                }

                &.stop-button {
                    background: var(--b3-theme-error);
                    color: white;
                    box-shadow: 0 2px 8px rgba(var(--b3-theme-error-rgb), 0.3);

                    &:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px
                            rgba(var(--b3-theme-error-rgb), 0.4);
                    }
                }

                &:active {
                    transform: translateY(0);
                }
            }
        }
    }
</style>
