<script lang="ts">
    import {
        ROBOT_ASSISTANT_SUB_TABS,
        type RobotAssistantSubTab,
    } from "../robotAssistantTabs";

    interface Props {
        activeTab: RobotAssistantSubTab;
        onTabChange: (tab: RobotAssistantSubTab) => void;
    }

    let { activeTab, onTabChange }: Props = $props();
</script>

<nav class="sub-tab-nav" aria-label="机器人助手设置分类">
    {#each ROBOT_ASSISTANT_SUB_TABS as tab (tab.id)}
        <button
            type="button"
            class:active={activeTab === tab.id}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onclick={() => onTabChange(tab.id)}
        >{tab.label}</button>
    {/each}
</nav>
