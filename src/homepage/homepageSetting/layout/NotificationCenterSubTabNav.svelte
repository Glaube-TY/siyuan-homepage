<script lang="ts">
    import {
        NOTIFICATION_CENTER_SUB_TABS,
        type NotificationCenterSubTab,
    } from "../notificationCenterTabs";

    interface Props {
        activeTab: NotificationCenterSubTab;
        onTabChange: (tab: NotificationCenterSubTab) => void;
    }

    let { activeTab, onTabChange }: Props = $props();
</script>

<nav class="sub-tab-nav" aria-label="通知中心设置分类">
    {#each NOTIFICATION_CENTER_SUB_TABS as tab (tab.id)}
        <button
            type="button"
            class:active={activeTab === tab.id}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onclick={() => onTabChange(tab.id)}
        >{tab.label}</button>
    {/each}
</nav>
