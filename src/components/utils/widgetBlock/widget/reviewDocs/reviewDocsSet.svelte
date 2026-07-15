<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import NotebookMultiSelectRow from "../../shared/NotebookMultiSelectRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import type { NotebookOption } from "../common/componentMigrationTypes";
    import { openReviewNotifySettingsDialog } from "@/features/review-notify";

    let {
        advancedEnabled = false,
        reviewDocsTitle = $bindable("📚复习文档"),
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
        reviewDocsSelectedNotebookIds = $bindable<NotebookOption[]>([]),
        notebooks = [],
    } = $props();
</script>

{#if advancedEnabled}
    <SettingSection title="复习文档">
        <SettingRow title="组件标题">
            <input type="text" bind:value={reviewDocsTitle} class="control-full" />
        </SettingRow>

        <SettingRow
            title="本地共享"
            description="复习计划使用本地索引，复习操作日志保存在插件本地，并由所有复习组件共享。"
        />

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

    <SettingSection title="复习通知">
        <SettingRow title="全局通知规则" description="所有复习文档组件和移动设备共享同一套通知规则">
            <button type="button" class="b3-button b3-button--text" onclick={() => openReviewNotifySettingsDialog(advancedEnabled)}>打开复习通知设置</button>
        </SettingRow>
    </SettingSection>

    <SettingSection title="范围配置">
        <NotebookMultiSelectRow
            title="复习笔记本范围"
            description="留空表示不限制范围；选择后仅显示所选笔记本中的复习计划。"
            notebooks={notebooks}
            bind:selected={reviewDocsSelectedNotebookIds}
            placeholder="选择笔记本..."
        />
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
