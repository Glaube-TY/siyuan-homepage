<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled: boolean;
        almanacStyle?: string;
    }

    let { advancedEnabled, almanacStyle = $bindable("") }: Props = $props();
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="黄历样式">
            <select bind:value={almanacStyle} class="control-sm">
                <option value="classic">经典</option>
                <option value="tradition1">传统1</option>
            </select>
        </SettingRow>
    </SettingSection>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
