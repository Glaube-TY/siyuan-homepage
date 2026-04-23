<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        sqlTitle: string;
        sqlInput: string;
        columnOrder: string;
        hiddenFields: string;
    }

    let {
        sqlTitle = $bindable(),
        sqlInput = $bindable(),
        columnOrder = $bindable(),
        hiddenFields = $bindable()
    }: Props = $props();
</script>

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={sqlTitle}
            placeholder="输入组件标题"
            class="control-full"
        />
    </SettingRow>
</SettingSection>

<SettingSection>
    <SettingRow title="SQL 语句" description="输入查询 SQL 语句">
        <textarea
            bind:value={sqlInput}
            placeholder="请输入 SQL 语句"
        ></textarea>
    </SettingRow>
</SettingSection>

<SettingSection>
    <SettingRow title="列排序" description="用逗号分隔列名，例如：id,alias">
        <input
            type="text"
            placeholder="例如：id,alias"
            bind:value={columnOrder}
            class="control-full"
        />
    </SettingRow>

    <SettingRow title="隐藏字段" description="用逗号分隔字段名，例如：alias,path">
        <input
            type="text"
            placeholder="例如：alias,path"
            bind:value={hiddenFields}
            class="control-full"
        />
    </SettingRow>
</SettingSection>

<style lang="scss">
    textarea {
        width: 100%;
        min-height: 120px;
        padding: 0.5rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-background);
        font-family: inherit;
        resize: vertical;
    }
</style>
