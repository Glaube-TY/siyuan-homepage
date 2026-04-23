<script lang="ts">
    import { run } from 'svelte/legacy';

    import MultiSelect from "svelte-multiselect";
    import { onMount } from "svelte";
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

    // 初始化选择状态
    function initializeSelectedNotebooks() {
        if (
            docNotebookId &&
            notebooks.length > 0 &&
            selectedTasksNotebookIds.length === 0
        ) {
            selectedTasksNotebookIds = docNotebookId
                .split(",")
                .filter((id) => id.trim())
                .map((id) => {
                    const notebook = notebooks.find(
                        (notebook) => notebook.id === id,
                    );
                    return {
                        label: notebook ? notebook.name : id,
                        value: id,
                    };
                });
        }
    }

    onMount(() => {
        initializeSelectedNotebooks();
    });

    // 监听变化，确保状态正确恢复
    run(() => {
        if (docNotebookId && notebooks.length > 0) {
            initializeSelectedNotebooks();
        }
    });
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

    <SettingRow title="任务笔记本">
        {#if notebooks.length > 0}
            <MultiSelect
                bind:selected={selectedTasksNotebookIds}
                options={notebooks.map((notebook) => ({
                    label: notebook.name,
                    value: notebook.id,
                }))}
                placeholder="选择笔记本..."
            />
        {:else}
            <span>笔记本加载中...</span>
        {/if}
    </SettingRow>
</SettingSection>
