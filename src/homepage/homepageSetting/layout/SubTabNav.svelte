<script lang="ts">
    import type { HomepageSettingSubTab } from '../types';
    import { subTabs } from '../tabDefs';

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
            >{tab.label}</button
        >
    {/each}
</div>

<style lang="scss">
    .sub-tab-nav {
        button.locked {
            opacity: 0.6;
        }
    }
</style>