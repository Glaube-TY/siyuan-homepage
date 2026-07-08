<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    let {
        advancedEnabled,
        accountingTitle = $bindable("记账"),
        accountingHomeRecentLimit = $bindable(5),
        accountingShowBudget = $bindable(true),
        accountingShowRecentRecords = $bindable(true),
    } = $props();
</script>

{#if advancedEnabled}
    <SettingSection title="记账">
        <p class="set-hint">
            记账流水、资产、分类和预算设置保存在插件本地 accounting/ 目录下，删除组件后不会丢失。
        </p>

        <SettingRow title="组件标题">
            <input type="text" bind:value={accountingTitle} class="control-full" />
        </SettingRow>

        <SettingRow title="主页显示记录数量">
            <input type="number" min="1" max="30" bind:value={accountingHomeRecentLimit} class="control-xs" />
        </SettingRow>

        <SettingRow title="显示预算">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={accountingShowBudget} />
        </SettingRow>

        <SettingRow title="显示最近流水">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={accountingShowRecentRecords} />
        </SettingRow>
    </SettingSection>
{:else}
    <AdvancedFeatureLock
        title="记账"
        subtitle="记录个人收支流水，查看预算进度和分类趋势。"
        icon="database"
        features={[
            "收支流水新增、编辑和归档",
            "本月收入、支出、结余和预算进度",
            "ECharts 趋势图与分类支出分析"
        ]}
        highlights={["个人账本", "预算进度", "财务分析"]}
    />
{/if}

<style lang="scss">
    .set-hint {
        margin: 0 0 0.5rem;
        font-size: 0.76rem;
        color: var(--b3-theme-on-surface-light);
        font-style: italic;
        line-height: 1.5;
        padding: 0.5rem;
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
    }
</style>
