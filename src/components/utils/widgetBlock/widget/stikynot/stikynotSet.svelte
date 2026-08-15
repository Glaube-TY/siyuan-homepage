<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import { STIKYNOT_STYLE_PRESETS } from "./stikynotPresets";

    let { advancedEnabled, stikynotStyle = $bindable() } = $props();
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="便签样式">
            <select bind:value={stikynotStyle} class="control-sm">
                {#each STIKYNOT_STYLE_PRESETS as preset}
                    <option value={preset.value}>{preset.label}</option>
                {/each}
            </select>
        </SettingRow>
    </SettingSection>
{:else}
    <AdvancedFeatureLock
        title="便签"
        subtitle="快速记录灵感和备忘，支持富文本编辑。"
        icon="edit"
        features={[
            "快速记录灵感和备忘",
            "支持富文本编辑",
            "适合日常笔记和待办"
        ]}
        highlights={["快速记录", "富文本", "备忘录"]}
    />
{/if}
