<script lang="ts">
    import {
        NOTIFICATION_CENTER_SUB_TABS,
        type NotificationCenterSubTab,
    } from "../notificationCenterTabs";
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";

    interface Props {
        activeTab: NotificationCenterSubTab;
        advancedEnabled: boolean;
        onTabChange: (tab: NotificationCenterSubTab) => void;
    }

    let { activeTab, advancedEnabled, onTabChange }: Props = $props();
</script>

<nav class="sub-tab-nav" aria-label="通知中心设置分类">
    {#each NOTIFICATION_CENTER_SUB_TABS as tab (tab.id)}
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
