<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled?: boolean;
        countdownTimerStyle?: string;
    }

    let { advancedEnabled = false, countdownTimerStyle = $bindable("default") }: Props = $props();
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="倒计时样式">
            <select bind:value={countdownTimerStyle} class="control-sm">
                <option value="default">默认</option>
                <option value="ring1">圆环1</option>
            </select>
        </SettingRow>
    </SettingSection>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
