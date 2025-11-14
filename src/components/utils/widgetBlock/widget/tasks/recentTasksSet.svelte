<script lang="ts">
    import MultiSelect from "svelte-multiselect";
    import { onMount } from "svelte";

    export let notebooks: any[] = [];

    // 任务管理配置
    export let TaskManTitle: string = "📋任务管理";
    export let showCompletedTasks: boolean = false;
    export let showTasksDetails: boolean = false;
    export let selectedTasksNotebookIds: any[] = [];
    export let docNotebookId: string = "";

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
    $: if (docNotebookId && notebooks.length > 0) {
        initializeSelectedNotebooks();
    }
</script>

<div class="content-panel TaskMan">
    <!-- 任务管理设置区域 -->
    <div class="form-group">
        <label for="TaskMan-title">
            组件标题：
            <input
                id="TaskMan-title"
                type="text"
                bind:value={TaskManTitle}
                placeholder="输入组件标题"
            />
        </label>
    </div>
    <div class="form-group TaskMan-checkbox">
        <label>
            <input type="checkbox" bind:checked={showCompletedTasks} />
            显示已完成的任务
        </label>
        <label>
            <input type="checkbox" bind:checked={showTasksDetails} />
            显示任务详情
        </label>
    </div>
    <div class="form-group TaskMan-notebook-id">
        <label for="TaskMan-notebook-id">任务笔记本：</label>
        <MultiSelect
            id="TaskMan-notebook-id"
            bind:selected={selectedTasksNotebookIds}
            options={notebooks.map((notebook) => ({
                label: notebook.name,
                value: notebook.id,
            }))}
            placeholder="选择笔记本..."
        />
    </div>
    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/T18vwmZeqinQW2kxoxccpYVHndf?from=from_copylink"
            target="_blank">任务管理</a
        >
    </div>
</div>

<style lang="scss">
    .TaskMan-checkbox {
        display: flex;
        gap: 1rem;
        align-items: center;
    }

    .TaskMan-notebook-id {
        display: flex;
        flex-direction: column;

        label {
            font-size: 14px;
            margin-right: 0.5rem;
            white-space: nowrap;
            width: auto;
        }
    }
</style>
