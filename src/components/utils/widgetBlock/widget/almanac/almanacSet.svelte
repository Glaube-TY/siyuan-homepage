<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

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
    <AdvancedFeatureLock
        title="黄历"
        subtitle="每日黄历宜忌展示，传统日历风格。"
        icon="calendar"
        features={[
            "每日黄历宜忌展示",
            "传统与现代风格结合",
            "适合传统文化爱好者"
        ]}
        highlights={["黄历宜忌", "传统风格", "每日更新"]}
    />
{/if}
