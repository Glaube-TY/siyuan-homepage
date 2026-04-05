<script lang="ts">
    interface Props {
        advancedEnabled: boolean;
        historyDaysType: string;
    }

    let { advancedEnabled, historyDaysType = $bindable() }: Props = $props();
</script>

<div class="historyDays-set">
    {#if advancedEnabled}
        <div class="form-group">
            <label for="historyDaysType">
                显示类型：
                <select
                    id="historyDaysType"
                    bind:value={historyDaysType}
                >
                    <option value="list">列表</option>
                    <option value="img">图片</option>
                </select>
            </label>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr>
    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/SgHPwf76fiVlsnkxUNTcZ0ADnXg?from=from_copylink" target="_blank">历史上的今天</a></div>
    <p>注：若接口失效请联系我更新~</p>
</div>

<style lang="scss">
</style>