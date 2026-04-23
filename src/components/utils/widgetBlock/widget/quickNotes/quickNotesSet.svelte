<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        quickNotesTitle: string;
        quickNotesSort: string;
    }

    let { quickNotesTitle = $bindable(), quickNotesSort = $bindable() }: Props = $props();
</script>

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={quickNotesTitle}
            placeholder="输入组件标题"
            class="control-full"
        />
    </SettingRow>
    <SettingRow title="排序方式">
        <select bind:value={quickNotesSort} class="control-sm">
            <option value="DOC_ASC">文档正序</option>
            <option value="DOC_INV">文档逆序</option>
            <option value="UPD">更新时间</option>
            <option value="CRE">创建时间</option>
        </select>
    </SettingRow>
</SettingSection>
