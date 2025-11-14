<script lang="ts">
    export let TaskManPlusTitle: string = "📋任务管理Plus";
    export let isCustomFilter: boolean = false;
    export let internalFilter: string = "all";
    export let customFilter: string = "";
    export let tasksSort: string = "startdate";
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
                    href="https://ttl8ygt82u.feishu.cn/wiki/CCwfwq75Ziu8m5kQ0HXcnVbfnod?from=from_copylink"
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

    <div class="component-help">
        <hr />
        <div>
            组件说明：<a
                href="https://ttl8ygt82u.feishu.cn/wiki/CCwfwq75Ziu8m5kQ0HXcnVbfnod?from=from_copylink"
                target="_blank">任务管理Plus</a
            >
        </div>
    </div>
</div>

<style lang="scss">
</style>
