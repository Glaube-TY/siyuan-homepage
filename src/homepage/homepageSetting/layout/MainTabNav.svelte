<script lang="ts">
    import type { HomepageSettingMainTab } from '../types';
    import { mainTabs } from '../tabDefs';

    interface Props {
        activeTab: HomepageSettingMainTab;
        onTabChange: (tab: HomepageSettingMainTab) => void;
        showRobotAssistant?: boolean;
    }

    let { activeTab, onTabChange, showRobotAssistant = true }: Props = $props();
</script>

<!-- 分类导航栏 -->
<div class="tab-nav">
    {#each mainTabs as tab}
        {#if tab.key !== "robotAssistant" || showRobotAssistant}
            <button
                onclick={() => onTabChange(tab.key)}
                class:active={activeTab === tab.key}>{tab.label}</button
            >
        {/if}
    {/each}
</div>
