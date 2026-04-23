<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        // 热力图配置变量
        heatmapTitle?: string;
        pastMonthCount?: number;
        showLabel?: boolean;
        selectedColorPreset?: "github" | "blue" | "custom";
        customColor?: string;
        heatmapCountType?: string;
    }

    let {
        heatmapTitle = $bindable("📅创作热力图"),
        pastMonthCount = $bindable(6),
        showLabel = $bindable(true),
        selectedColorPreset = $bindable("github"),
        customColor = $bindable("#1ea769"),
        heatmapCountType = $bindable("block")
    }: Props = $props();
</script>

<SettingSection title="基础配置">
    <SettingRow title="热力图标题">
        <input type="text" bind:value={heatmapTitle} class="control-full" />
    </SettingRow>
    <SettingRow title="显示范围">
        <select bind:value={pastMonthCount} class="control-sm">
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as month}
                <option value={month}>前 {month} 个月</option>
            {/each}
        </select>
    </SettingRow>
    <SettingRow title="显示标签">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showLabel} />
    </SettingRow>
</SettingSection>

<SettingSection title="颜色配置">
    <SettingRow title="区块颜色">
        <select bind:value={selectedColorPreset} class="control-sm">
            <option value="github">GitHub 绿色</option>
            <option value="blue">蓝色</option>
            <option value="custom">自定义颜色</option>
        </select>
    </SettingRow>
    {#if selectedColorPreset === "custom"}
        <SettingRow title="自定义颜色">
            <input type="color" bind:value={customColor} />
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="统计配置">
    <SettingRow title="计数类型">
        <select bind:value={heatmapCountType} class="control-sm">
            <option value="block">内容块</option>
            <option value="words">字数👑</option>
        </select>
    </SettingRow>
    {#if heatmapCountType === "words"}
        <div class="help-block">
            <p>👑订阅会员专属</p>
            <p>字数统计的块类型为：段落块、标题块、列表块、代码块、公式块、引注块、表格块</p>
        </div>
    {/if}
</SettingSection>

<style lang="scss">
    .help-block {
        padding: 0.75rem;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.5;
        margin-top: 0.5rem;

        p {
            margin: 0 0 0.25rem 0;

            &:last-child {
                margin-bottom: 0;
            }
        }
    }
</style>