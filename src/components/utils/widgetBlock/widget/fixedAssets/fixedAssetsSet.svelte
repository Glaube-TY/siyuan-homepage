<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    let {
        advancedEnabled,
        fixedAssetsTitle = $bindable("固定资产"),
        fixedAssetsDatabaseId = $bindable(""),
        fixedAssetsListLimit = $bindable(6),
        fixedAssetsSortBy = $bindable("updated"),
        fixedAssetsShowHourly = $bindable(true),
        fixedAssetsShowMonthly = $bindable(true),
        fixedAssetsShowWeekly = $bindable(false),
        fixedAssetsShowQuarterly = $bindable(false),
        fixedAssetsShowYearly = $bindable(false),
        fixedAssetsItemCostPeriod = $bindable("day"),
    } = $props();
</script>

{#if advancedEnabled}
    <SettingSection title="固定资产">
        <SettingRow title="组件标题">
            <input
                type="text"
                bind:value={fixedAssetsTitle}
                class="control-full"
            />
        </SettingRow>

        <SettingRow
            title="数据库 ID"
            description="填写用于保存资产数据的数据库 ID。同一主页空间内的固定资产组件会自动共用已有数据库 ID。"
        >
            <input
                type="text"
                bind:value={fixedAssetsDatabaseId}
                class="control-full"
                placeholder="输入固定资产数据库 ID"
            />
        </SettingRow>

        <SettingRow title="显示数量" description="主页组件内最多展示多少条资产记录">
            <input
                type="number"
                min="1"
                max="50"
                bind:value={fixedAssetsListLimit}
                class="control-xs"
            />
        </SettingRow>

        <SettingRow title="排序方式">
            <select bind:value={fixedAssetsSortBy} class="control-md">
                <option value="updated">最近更新</option>
                <option value="dailyCost">日均成本高优先</option>
                <option value="totalCost">总价高优先</option>
                <option value="days">使用天数长优先</option>
                <option value="name">名称</option>
            </select>
        </SettingRow>
    </SettingSection>

    <SettingSection title="成本展示">
        <SettingRow title="显示小时成本">
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                bind:checked={fixedAssetsShowHourly}
            />
        </SettingRow>

        <SettingRow title="显示周均成本">
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                bind:checked={fixedAssetsShowWeekly}
            />
        </SettingRow>

        <SettingRow title="显示月均成本">
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                bind:checked={fixedAssetsShowMonthly}
            />
        </SettingRow>

        <SettingRow title="显示季均成本">
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                bind:checked={fixedAssetsShowQuarterly}
            />
        </SettingRow>

        <SettingRow title="显示年均成本">
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                bind:checked={fixedAssetsShowYearly}
            />
        </SettingRow>

        <SettingRow title="资产卡片成本周期">
            <select bind:value={fixedAssetsItemCostPeriod} class="control-md">
                <option value="hour">小时成本</option>
                <option value="day">日均成本</option>
                <option value="week">周均成本</option>
                <option value="month">月均成本</option>
                <option value="quarter">季均成本</option>
                <option value="year">年均成本</option>
            </select>
        </SettingRow>
    </SettingSection>
{:else}
    <h3>会员专属功能</h3>
    <p>开通会员后可使用固定资产记录和动态成本计算。</p>
{/if}
