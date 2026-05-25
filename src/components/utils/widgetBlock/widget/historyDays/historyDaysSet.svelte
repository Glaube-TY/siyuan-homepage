<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

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
    <AdvancedFeatureLock
        title="历史上的今天"
        subtitle="每日历史事件回顾，了解历史大事记。"
        icon="history"
        features={[
            "每日历史事件回顾",
            "历史大事记展示",
            "适合历史爱好者和知识拓展"
        ]}
        highlights={["历史事件", "每日更新", "知识拓展"]}
    />
{/if}
