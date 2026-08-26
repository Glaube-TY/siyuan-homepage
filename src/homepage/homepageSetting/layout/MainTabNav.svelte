<script lang="ts">
    import type { HomepageSettingMainTab } from '../types';
    import { mainTabs } from '../tabDefs';
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";

    interface Props {
        activeTab: HomepageSettingMainTab;
        onTabChange: (tab: HomepageSettingMainTab) => void;
        showRobotAssistant?: boolean;
        advancedEnabled: boolean;
    }

    let { activeTab, onTabChange, showRobotAssistant = true, advancedEnabled }: Props = $props();
</script>

<!-- 分类导航栏 -->
<div class="tab-nav">
    {#each mainTabs as tab}
        {#if tab.key !== "robotAssistant" || showRobotAssistant}
            <button
                onclick={() => onTabChange(tab.key)}
                class:active={activeTab === tab.key}
                class:locked={tab.requiresAdvanced && !advancedEnabled}
            >
                <span class="tab-label">{tab.label}</span>
                {#if tab.requiresAdvanced}<PremiumMark />{/if}
            </button>
        {/if}
    {/each}
</div>

<style>
    .tab-nav button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
    }

    .tab-nav button.locked {
        opacity: 0.75;
    }
</style>
