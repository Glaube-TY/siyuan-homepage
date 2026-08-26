<script lang="ts">
    import {
        ROBOT_ASSISTANT_SUB_TABS,
        type RobotAssistantSubTab,
    } from "../robotAssistantTabs";
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";

    interface Props {
        activeTab: RobotAssistantSubTab;
        advancedEnabled: boolean;
        onTabChange: (tab: RobotAssistantSubTab) => void;
    }

    let { activeTab, advancedEnabled, onTabChange }: Props = $props();
</script>

<nav class="sub-tab-nav" aria-label="机器人助手设置分类">
    {#each ROBOT_ASSISTANT_SUB_TABS as tab (tab.id)}
        <button
            type="button"
            class:active={activeTab === tab.id}
            class:locked={tab.requiresAdvanced && !advancedEnabled}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onclick={() => onTabChange(tab.id)}
        >
            <span>{tab.label}</span>
            {#if tab.requiresAdvanced}<PremiumMark />{/if}
        </button>
    {/each}
</nav>

<style>
    button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    button.locked {
        opacity: 0.6;
    }
</style>
