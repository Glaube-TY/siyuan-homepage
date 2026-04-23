<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        visualChartType?: string;
    }

    let { visualChartType = $bindable("progressBar") }: Props = $props();
</script>

<SettingSection title="图表配置">
    <SettingRow title="图表类型">
        <select bind:value={visualChartType} class="control-sm">
            <option value="progressBar">进度条</option>
            <option value="tagCloud">标签云图</option>
        </select>
    </SettingRow>
</SettingSection>
