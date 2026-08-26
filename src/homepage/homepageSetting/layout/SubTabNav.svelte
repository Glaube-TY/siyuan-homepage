<script lang="ts">
    import type { HomepageSettingSubTab } from '../types';
    import { subTabs } from '../tabDefs';
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";

    interface Props {
        settingsActiveTab: HomepageSettingSubTab;
        advancedEnabled: boolean;
        onTabChange: (tab: HomepageSettingSubTab) => void;
    }

    let { settingsActiveTab, advancedEnabled, onTabChange }: Props = $props();
</script>

<!-- 子标签导航 -->
<div class="sub-tab-nav">
    {#each subTabs as tab}
        <button
            onclick={() => onTabChange(tab.key)}
            class:active={settingsActiveTab === tab.key}
            class:locked={tab.requiresAdvanced && !advancedEnabled}
            >
                <span class="tab-label">{tab.label}</span>
                {#if tab.requiresAdvanced}<PremiumMark />{/if}
            </button>
    {/each}
</div>

<style lang="scss">
    .sub-tab-nav {
        button {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        button.locked {
            opacity: 0.6;
        }
    }
</style>
