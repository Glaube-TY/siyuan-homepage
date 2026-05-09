<script lang="ts">
    import NotebookMultiSelectRow from "../../shared/NotebookMultiSelectRow.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        notebooks?: any[];
        // 任务管理配置
        TaskManTitle?: string;
        showCompletedTasks?: boolean;
        showTasksDetails?: boolean;
        selectedTasksNotebookIds?: any[];
        docNotebookId?: string;
    }

    let {
        notebooks = [],
        TaskManTitle = $bindable("📋任务管理"),
        showCompletedTasks = $bindable(false),
        showTasksDetails = $bindable(false),
        selectedTasksNotebookIds = $bindable([]),
        docNotebookId = $bindable("")
    }: Props = $props();
</script>

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={TaskManTitle}
            placeholder="输入组件标题"
            class="control-full"
        />
    </SettingRow>

    <SettingRow title="显示已完成的任务" description="在列表中显示已完成的任务">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showCompletedTasks} />
    </SettingRow>

    <SettingRow title="显示任务详情" description="显示任务的详细信息">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showTasksDetails} />
    </SettingRow>

    <NotebookMultiSelectRow
        title="任务笔记本"
        notebooks={notebooks}
        bind:selected={selectedTasksNotebookIds}
        initialNotebookIds={docNotebookId}
        placeholder="选择笔记本..."
    />
</SettingSection>
