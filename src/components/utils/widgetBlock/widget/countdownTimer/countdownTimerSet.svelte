<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

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
    <AdvancedFeatureLock
        title="倒计时"
        subtitle="重要日期倒计时组件，多种样式可选。"
        icon="time"
        features={[
            "重要日期倒计时",
            "多种样式展示",
            "适合考试、DDL、纪念日"
        ]}
        highlights={["倒计时", "多样式", "纪念日"]}
    />
{/if}
