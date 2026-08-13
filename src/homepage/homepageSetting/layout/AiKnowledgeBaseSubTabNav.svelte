<script lang="ts">
    import {
        AI_KNOWLEDGE_BASE_SUB_TABS,
        type AiKnowledgeBaseSubTab,
    } from "../aiKnowledgeBaseTabs";

    interface Props {
        activeTab: AiKnowledgeBaseSubTab;
        onTabChange: (tab: AiKnowledgeBaseSubTab) => void;
    }

    let { activeTab, onTabChange }: Props = $props();
</script>

<nav class="sub-tab-nav" aria-label="AI 中心设置分类">
    {#each AI_KNOWLEDGE_BASE_SUB_TABS as tab (tab.id)}
        <button
            type="button"
            class:active={activeTab === tab.id}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onclick={() => onTabChange(tab.id)}
        >{tab.label}</button>
    {/each}
</nav>
