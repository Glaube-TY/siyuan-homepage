<script lang="ts">
    import type { HomepageSettingMainTab } from '../types';
    import { mainTabs } from '../tabDefs';

    interface Props {
        activeTab: HomepageSettingMainTab;
        onTabChange: (tab: HomepageSettingMainTab) => void;
    }

    let { activeTab, onTabChange }: Props = $props();
</script>

<!-- 分类导航栏 -->
<div class="tab-nav">
    {#each mainTabs as tab}
        <button
            onclick={() => onTabChange(tab.key)}
            class:active={activeTab === tab.key}>{tab.label}</button
        >
    {/each}
</div>