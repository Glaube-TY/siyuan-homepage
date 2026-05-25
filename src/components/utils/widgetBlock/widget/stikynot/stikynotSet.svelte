<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

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
    <AdvancedFeatureLock
        title="便签"
        subtitle="快速记录灵感和备忘，支持富文本编辑。"
        icon="edit"
        features={[
            "快速记录灵感和备忘",
            "支持富文本编辑",
            "适合日常笔记和待办"
        ]}
        highlights={["快速记录", "富文本", "备忘录"]}
    />
{/if}
