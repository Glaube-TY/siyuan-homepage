<script lang="ts">
    interface Props {
        advancedEnabled: boolean;
        almanacStyle?: string;
    }

    let { advancedEnabled, almanacStyle = $bindable("") }: Props = $props();
</script>

<div class="music-player-settings">
    {#if advancedEnabled}
        <div class="content-panel almanac">
            <div class="setting-item">
                <label for="almanacStyle"> 黄历样式：</label>
                <select id="almanacStyle" bind:value={almanacStyle}>
                    <option value="classic">经典</option>
                    <option value="tradition1">传统1</option>
                </select>
            </div>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr />
    <div>
        组件说明：<a
            href="https://ai.feishu.cn/wiki/LoLMwANVLibTQFkChB0csi2dnjb"
            target="_blank">黄历</a
        >
    </div>
</div>

<style lang="scss">
</style>
