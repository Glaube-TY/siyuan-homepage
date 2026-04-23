<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

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

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={TaskManPlusTitle}
            placeholder="📋任务管理Plus"
            class="control-full"
        />
    </SettingRow>

    <SettingRow title="自定义筛选条件" description="使用自定义筛选语法替代内置筛选">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={isCustomFilter} />
    </SettingRow>
</SettingSection>

{#if !isCustomFilter}
    <SettingSection>
        <SettingRow title="筛选条件">
            <select bind:value={internalFilter} class="control-md">
                <option value="all">所有任务</option>
                <option value="uncompleted">未完成任务</option>
                <option value="completed">已完成任务</option>
                <option value="today">今天任务</option>
                <option value="tomorrow">明天任务</option>
                <option value="mostImportant">❗❗❗❗任务</option>
            </select>
        </SettingRow>
    </SettingSection>
{:else}
    <SettingSection>
        <SettingRow title="筛选语法" description="使用前请先了解<a href='https://blog.glaube-ty.top/archives/019d2a3a-61a5-75d7-b349-73a2a6d482bb' target='_blank'>筛选语法</a>，并根据需求进行调整">
            <textarea
                placeholder="输入筛选语法"
                bind:value={customFilter}
            ></textarea>
        </SettingRow>
    </SettingSection>
{/if}

<SettingSection>
    <SettingRow title="排序方式">
        <select bind:value={tasksSort} class="control-md">
            <option value="startdate">开始日期</option>
            <option value="deadline">截止日期</option>
            <option value="priority">优先级❗</option>
        </select>
    </SettingRow>
</SettingSection>

<style lang="scss">
    textarea {
        width: 100%;
        min-height: 100px;
        padding: 0.5rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-background);
        font-family: inherit;
        resize: vertical;
    }
</style>
