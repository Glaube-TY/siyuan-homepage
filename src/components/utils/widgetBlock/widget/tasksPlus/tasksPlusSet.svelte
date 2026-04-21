<script lang="ts">
    interface Props {
        TaskManPlusTitle?: string;
        isCustomFilter?: boolean;
        internalFilter?: string;
        customFilter?: string;
        tasksSort?: string;
    }

    let {
        TaskManPlusTitle = $bindable("📋任务管理Plus"),
        isCustomFilter = $bindable(false),
        internalFilter = $bindable("all"),
        customFilter = $bindable(""),
        tasksSort = $bindable("startdate")
    }: Props = $props();
</script>

<div class="tasks-plus-settings">
    <div class="setting-item">
        <label for="task-plus-title">组件标题：</label>
        <input
            type="text"
            bind:value={TaskManPlusTitle}
            placeholder="📋任务管理Plus"
        />
    </div>

    <div class="setting-item">
        <label>
            <input type="checkbox" bind:checked={isCustomFilter} />
            自定义筛选条件
        </label>
    </div>

    {#if !isCustomFilter}
        <div class="setting-item">
            <label for="internal-filter">筛选条件：</label>
            <select bind:value={internalFilter}>
                <option value="all">所有任务</option>
                <option value="uncompleted">未完成任务</option>
                <option value="completed">已完成任务</option>
                <option value="today">今天任务</option>
                <option value="tomorrow">明天任务</option>
                <option value="mostImportant">❗❗❗❗任务</option>
            </select>
        </div>
    {:else}
        <div class="setting-item">
            <label for="custom-filter">筛选语法：</label>
            <textarea
                id="custom-filter"
                placeholder="输入筛选语法"
                bind:value={customFilter}
            ></textarea>
            <p>
                使用前请先了解<a
                    href="https://blog.glaube-ty.top/archives/019d2a3a-61a5-75d7-b349-73a2a6d482bb"
                    target="_blank">筛选语法</a
                >，并根据需求进行调整。
            </p>
        </div>
    {/if}

    <div class="setting-item">
        <label for="tasks-sort">排序方式：</label>
        <select bind:value={tasksSort}>
            <option value="startdate">开始日期</option>
            <option value="deadline">截止日期</option>
            <option value="priority">优先级❗</option>
        </select>
    </div>
</div>
