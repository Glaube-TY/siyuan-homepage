<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    let {
        advancedEnabled = false,
        reviewDocsTitle = $bindable("📚复习文档"),
        reviewDocsDatabaseId = $bindable(""),
        reviewDocsLimit = $bindable(20),
        reviewDocsDefaultView = $bindable("due"),
        reviewDocsShowFuture = $bindable(true),
        reviewDocsFutureDays = $bindable(7),
        reviewDocsShowDocs = $bindable(true),
        reviewDocsShowBlocks = $bindable(true),
        reviewDocsShowNote = $bindable(true),
        reviewDocsShowPath = $bindable(true),
        reviewDocsShowStats = $bindable(true),
        reviewDocsSortBy = $bindable("dueAsc"),
        reviewDocsShowFloatDoc = $bindable(true),
        reviewDocsFloatDocShowTime = $bindable(0.1),
        reviewDocsDefaultIntervals = $bindable("0,1,2,4,7,15,30,60"),
    } = $props();
</script>

{#if advancedEnabled}
    <SettingSection title="复习文档">
        <SettingRow title="组件标题">
            <input type="text" bind:value={reviewDocsTitle} class="control-full" />
        </SettingRow>

        <SettingRow
            title="复习日志数据库 ID"
            description="可选。填写后会把标记、完成、推迟、编辑、移除等操作追加到思源数据库。同一类组件会自动共用已有数据库 ID。"
        >
            <input
                type="text"
                bind:value={reviewDocsDatabaseId}
                class="control-full"
                placeholder="输入复习日志数据库 ID"
            />
        </SettingRow>

        <SettingRow title="显示数量">
            <input
                type="number"
                min="1"
                max="100"
                bind:value={reviewDocsLimit}
                class="control-xs"
            />
        </SettingRow>

        <SettingRow title="默认视图">
            <select bind:value={reviewDocsDefaultView} class="control-md">
                <option value="due">待复习</option>
                <option value="today">今日</option>
                <option value="overdue">逾期</option>
                <option value="future">未来</option>
                <option value="all">全部</option>
            </select>
        </SettingRow>

        <SettingRow title="默认排序">
            <select bind:value={reviewDocsSortBy} class="control-md">
                <option value="dueAsc">到期优先</option>
                <option value="priorityDesc">优先级优先</option>
                <option value="updatedDesc">最近更新</option>
                <option value="createdDesc">最近标记</option>
                <option value="reviewCountAsc">复习次数少优先</option>
            </select>
        </SettingRow>
    </SettingSection>

    <SettingSection title="展示范围">
        <SettingRow title="显示文档">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={reviewDocsShowDocs} />
        </SettingRow>

        <SettingRow title="显示块">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={reviewDocsShowBlocks} />
        </SettingRow>

        <SettingRow title="显示未来项目">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={reviewDocsShowFuture} />
        </SettingRow>

        <SettingRow title="未来天数">
            <input
                type="number"
                min="1"
                max="365"
                bind:value={reviewDocsFutureDays}
                class="control-xs"
            />
        </SettingRow>
    </SettingSection>

    <SettingSection title="列表细节">
        <SettingRow title="显示备注">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={reviewDocsShowNote} />
        </SettingRow>

        <SettingRow title="显示路径">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={reviewDocsShowPath} />
        </SettingRow>

        <SettingRow title="显示统计卡片">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={reviewDocsShowStats} />
        </SettingRow>

        <SettingRow title="启用悬浮预览">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={reviewDocsShowFloatDoc} />
        </SettingRow>

        <SettingRow title="悬浮预览延迟">
            <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                bind:value={reviewDocsFloatDocShowTime}
                class="control-xs"
            />
        </SettingRow>
    </SettingSection>

    <SettingSection title="默认复习计划">
        <SettingRow
            title="默认艾宾浩斯间隔"
            description="英文逗号分隔，最多 20 个非负整数。"
        >
            <input
                type="text"
                bind:value={reviewDocsDefaultIntervals}
                class="control-full"
                placeholder="0,1,2,4,7,15,30,60"
            />
        </SettingRow>
    </SettingSection>
{:else}
    <AdvancedFeatureLock
        title="复习文档"
        subtitle="手动标记文档和块的复习日期，在主页集中提醒。"
        icon="review"
        features={["文档和块复习计划", "艾宾浩斯/自定义间隔", "操作日志与统计"]}
        highlights={["复习提醒", "属性驱动", "数据库日志"]}
    />
{/if}
