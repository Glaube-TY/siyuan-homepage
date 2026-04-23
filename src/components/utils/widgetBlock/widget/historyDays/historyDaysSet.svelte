<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled: boolean;
        historyDaysType: string;
    }

    let { advancedEnabled, historyDaysType = $bindable() }: Props = $props();
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示类型">
            <select bind:value={historyDaysType} class="control-sm">
                <option value="list">列表</option>
                <option value="img">图片</option>
            </select>
        </SettingRow>
    </SettingSection>
    <p>注：若接口失效请联系我更新~</p>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
