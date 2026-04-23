<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        isRandomDoc?: boolean;
        customBlockID?: string;
    }

    let { isRandomDoc = $bindable(false), customBlockID = $bindable("") }: Props = $props();
</script>

<SettingSection>
    <SettingRow title="随机漫游文档">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={isRandomDoc} />
    </SettingRow>
    {#if !isRandomDoc}
        <SettingRow title="文档块 ID">
            <input
                type="text"
                bind:value={customBlockID}
                placeholder="例如：20250310094404-1yla4zz"
                class="control-full"
            />
        </SettingRow>
    {/if}
</SettingSection>
