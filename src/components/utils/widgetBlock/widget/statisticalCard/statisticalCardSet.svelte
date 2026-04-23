<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    let {
        advancedEnabled,
        statisticalCardTitle = $bindable(),
        statisticalCardTitleSize = $bindable(),
        statisticalCardTitleColor = $bindable(),
        statisticalCardContent = $bindable(),
        statisticalCardCountSize = $bindable(),
        statisticalCardCountColor = $bindable(),
        customSQLCount = $bindable()
    } = $props();
</script>

{#if advancedEnabled}
    <SettingSection title="标题设置">
        <SettingRow title="标题文字">
            <input
                type="text"
                bind:value={statisticalCardTitle}
                class="control-full"
            />
        </SettingRow>

        <SettingRow title="标题大小">
            <input
                type="number"
                bind:value={statisticalCardTitleSize}
                class="control-xs"
            />
        </SettingRow>

        <SettingRow title="标题颜色">
            <input type="color" bind:value={statisticalCardTitleColor} />
        </SettingRow>
    </SettingSection>

    <SettingSection title="统计内容">
        <SettingRow title="统计类型">
            <select bind:value={statisticalCardContent} class="control-md">
                <option value="notebooksCount">笔记本数</option>
                <option value="docsCount">文档数</option>
                <option value="blocksCount">块数</option>
                <option value="wordsCount">字数</option>
                <option value="tasksCount">任务数</option>
                <option value="doneTasksCount">已完成任务数</option>
                <option value="undoneTasksCount">未完成任务数</option>
                <option value="dailynotesCount">日记数</option>
                <option value="tagsCount">标签数</option>
                <option value="citationCount">引述数</option>
                <option value="codeBlocksCount">代码数</option>
                <option value="mathBlocksCount">公式数</option>
                <option value="customSQLCount">SQL 查询结果数</option>
            </select>
        </SettingRow>
    </SettingSection>

    <SettingSection title="数字样式">
        <SettingRow title="数字大小">
            <input
                type="number"
                bind:value={statisticalCardCountSize}
                class="control-xs"
            />
        </SettingRow>

        <SettingRow title="数字颜色">
            <input type="color" bind:value={statisticalCardCountColor} />
        </SettingRow>
    </SettingSection>

    {#if statisticalCardContent === "customSQLCount"}
        <SettingSection title="自定义 SQL">
            <SettingRow title="SQL 查询语句">
                <textarea bind:value={customSQLCount}></textarea>
            </SettingRow>
        </SettingSection>
    {/if}
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}

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
