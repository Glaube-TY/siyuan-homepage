<script lang="ts">
    import { onMount } from "svelte";

    import Default from "./_default.svelte";
    import Ring1 from "./_ring1.svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const countdownTimerStyle =
        parsedContent?.data?.countdownTimerStyle || "default";

    let advancedEnabled = false;
    let beforeCountdown = false;
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    // 模拟加载文档数据
    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
    });
</script>

<div class="content-display">
    {#if advancedEnabled}
        {#if beforeCountdown}
            {#if countdownTimerStyle === "default"}
                <Default
                    {plugin}
                    bind:hours
                    bind:minutes
                    bind:seconds
                    bind:beforeCountdown
                ></Default>
            {:else if countdownTimerStyle === "ring1"}
                <Ring1
                    {plugin}
                    bind:hours
                    bind:minutes
                    bind:seconds
                    bind:beforeCountdown
                ></Ring1>
            {/if}
        {:else}
            <div class="content-not-started">
                <div class="countdown-header">
                    <i class="fas fa-clock"></i>
                    <h3>设置倒计时</h3>
                </div>
                <div class="countdown-input-container">
                    <div class="time-input-group">
                        <label for="hours">小时</label>
                        <input
                            type="number"
                            name="hours"
                            id="hours"
                            bind:value={hours}
                            min="0"
                            max="99"
                            placeholder="0"
                        />
                        <span class="time-unit">时</span>
                    </div>
                    <div class="time-separator">:</div>
                    <div class="time-input-group">
                        <label for="minutes">分钟</label>
                        <input
                            type="number"
                            name="minutes"
                            id="minutes"
                            bind:value={minutes}
                            min="0"
                            max="59"
                            placeholder="0"
                        />
                        <span class="time-unit">分</span>
                    </div>
                    <div class="time-separator">:</div>
                    <div class="time-input-group">
                        <label for="seconds">秒钟</label>
                        <input
                            type="number"
                            name="seconds"
                            id="seconds"
                            bind:value={seconds}
                            min="0"
                            max="59"
                            placeholder="0"
                        />
                        <span class="time-unit">秒</span>
                    </div>
                </div>
                <button
                    class="start-button"
                    on:click={() => (beforeCountdown = true)}
                    disabled={hours === 0 && minutes === 0 && seconds === 0}
                >
                    <i class="fas fa-play"></i>
                    开始倒计时
                </button>
            </div>
        {/if}
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;

        .content-not-advanced {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }

        .content-not-started {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;

            .countdown-header {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: var(--b3-theme-primary);
                margin-bottom: 0.5rem;

                i {
                    font-size: 1.5rem;
                }

                h3 {
                    margin: 0;
                    font-size: 1.2rem;
                    font-weight: 600;
                }
            }

            .countdown-input-container {
                display: flex;
                align-items: center;
                gap: 0.25rem;
                background: var(--b3-theme-surface);
                padding: 1rem;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

                .time-input-group {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.25rem;

                    label {
                        font-size: 0.7rem;
                        color: var(--b3-theme-on-surface-light);
                        font-weight: 500;
                    }

                    input {
                        width: 45px;
                        height: 35px;
                        text-align: center;
                        font-size: 1.1rem;
                        font-weight: 600;
                        border: 1px solid var(--b3-border-color);
                        border-radius: 6px;
                        background: var(--b3-theme-background);
                        color: var(--b3-theme-on-surface);
                        transition: all 0.2s ease;

                        &:focus {
                            outline: none;
                            border-color: var(--b3-theme-primary);
                            box-shadow: 0 0 0 2px
                                rgba(var(--b3-theme-primary-rgb), 0.1);
                        }

                        &::-webkit-inner-spin-button,
                        &::-webkit-outer-spin-button {
                            -webkit-appearance: none;
                            margin: 0;
                        }
                    }

                    .time-unit {
                        font-size: 0.75rem;
                        color: var(--b3-theme-on-surface-light);
                        font-weight: 500;
                    }
                }

                .time-separator {
                    font-size: 1.2rem;
                    font-weight: 600;
                    color: var(--b3-theme-on-surface-light);
                    margin: 0 0.25rem;
                    align-self: center;
                }
            }

            .start-button {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                padding: 0.6rem 1.2rem;
                background: var(--b3-theme-primary);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 0.9rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(var(--b3-theme-primary-rgb), 0.3);

                &:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px
                        rgba(var(--b3-theme-primary-rgb), 0.4);
                }

                &:active:not(:disabled) {
                    transform: translateY(0);
                }

                &:disabled {
                    background: var(--b3-theme-on-surface-light);
                    cursor: not-allowed;
                    box-shadow: none;
                }

                i {
                    font-size: 0.75rem;
                }
            }
        }
    }
</style>
