<script lang="ts">
    import MultiSelect from "svelte-multiselect";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    type NotebookOption = { label: string; value: string };

    interface Props {
        title?: string;
        description?: string;
        notebooks?: any[];
        selected?: NotebookOption[];
        initialNotebookIds?: string;
        placeholder?: string;
        loadingText?: string;
    }

    let {
        title = "笔记本",
        description = "",
        notebooks = [],
        selected = $bindable<NotebookOption[]>([]),
        initialNotebookIds = "",
        placeholder = "选择笔记本...",
        loadingText = "笔记本加载中..."
    }: Props = $props();

    let appliedInitialNotebookIds = $state<string | null>(null);

    function toNotebookOptions(ids: string): NotebookOption[] {
        return ids
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

    $effect(() => {
        if (
            initialNotebookIds &&
            notebooks.length > 0 &&
            appliedInitialNotebookIds !== initialNotebookIds &&
            selected.length === 0
        ) {
            selected = toNotebookOptions(initialNotebookIds);
        }
        appliedInitialNotebookIds = initialNotebookIds;
    });
</script>

<SettingRow {title} {description}>
    {#if notebooks.length > 0}
        <MultiSelect
            bind:selected
            options={notebooks.map((notebook) => ({
                label: notebook.name,
                value: notebook.id,
            }))}
            {placeholder}
        />
    {:else}
        <span>{loadingText}</span>
    {/if}
</SettingRow>
