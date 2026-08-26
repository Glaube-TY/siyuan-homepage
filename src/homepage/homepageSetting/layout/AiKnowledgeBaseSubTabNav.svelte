<script lang="ts">
    import {
        AI_KNOWLEDGE_BASE_SUB_TABS,
        type AiKnowledgeBaseSubTab,
    } from "../aiKnowledgeBaseTabs";
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";

    interface Props {
        activeTab: AiKnowledgeBaseSubTab;
        advancedEnabled: boolean;
        onTabChange: (tab: AiKnowledgeBaseSubTab) => void;
    }

    let { activeTab, advancedEnabled, onTabChange }: Props = $props();
</script>

<nav class="sub-tab-nav" aria-label="AI 中心设置分类">
    {#each AI_KNOWLEDGE_BASE_SUB_TABS as tab (tab.id)}
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
