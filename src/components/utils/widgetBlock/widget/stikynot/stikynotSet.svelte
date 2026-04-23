<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    let { advancedEnabled, stikynotStyle = $bindable() } = $props();
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="便签样式">
            <select bind:value={stikynotStyle} class="control-sm">
                <option value="default">默认</option>
                <option value="kraftPaper">牛皮纸</option>
                <option value="wood">木纹</option>
                <option value="marble">大理石</option>
                <option value="Ink">水墨</option>
                <option value="beach">海滩</option>
                <option value="BlueSky">蓝天</option>
                <option value="sunsetHeart">夕阳</option>
                <option value="Stars">星空</option>
                <option value="waterDrop">雨窗</option>
                <option value="PinkPorcelain">粉瓷</option>
            </select>
        </SettingRow>
    </SettingSection>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
