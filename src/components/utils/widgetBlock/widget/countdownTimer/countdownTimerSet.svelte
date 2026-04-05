<script lang="ts">
    interface Props {
        advancedEnabled?: boolean;
        countdownTimerStyle?: string;
    }

    let { advancedEnabled = false, countdownTimerStyle = $bindable("default") }: Props = $props();
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div class="content-panel countdownTimer">
            <div class="form-group">
                <label for="countdownTimerStyle">倒计时样式</label>
                <select
                    id="countdownTimerStyle"
                    bind:value={countdownTimerStyle}
                >
                    <option value="default">默认</option>
                    <option value="ring1">圆环1</option>
                </select>
            </div>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr />
    <div>
        组件说明：<a
            href="https://ai.feishu.cn/wiki/R3bswPuXkiM8pYkUJ0VcSAben4c?from=from_copylink"
            target="_blank">倒计时</a
        >
    </div>
</div>

<style lang="scss">
</style>
