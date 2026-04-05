<script lang="ts">
    interface Props {
        tempAutoOpenHomepage: boolean;
        sidebarEnabled: boolean;
        autoOpenMobileHomepage: boolean;
        onTempAutoOpenHomepageChange: (value: boolean) => void;
        onSidebarEnabledChange: (value: boolean) => void;
        onAutoOpenMobileHomepageChange: (value: boolean) => void;
    }

    let {
        tempAutoOpenHomepage,
        sidebarEnabled,
        autoOpenMobileHomepage,
        onTempAutoOpenHomepageChange,
        onSidebarEnabledChange,
        onAutoOpenMobileHomepageChange
    }: Props = $props();
</script>

<div class="homepage-global-settings">
    <label for="auto-open-homepage"
        >自动打开主页：<input
            type="checkbox"
            id="auto-open-homepage"
            checked={tempAutoOpenHomepage}
            onchange={(e) => onTempAutoOpenHomepageChange((e.currentTarget as HTMLInputElement).checked)}
        /></label
    >
    <label for=""
        >开启侧边栏👑：<input
            type="checkbox"
            checked={sidebarEnabled}
            onchange={(e) => onSidebarEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        /></label
    >
    <label for=""
        >自动打开移动端主页👑：<input
            type="checkbox"
            checked={autoOpenMobileHomepage}
            onchange={(e) => onAutoOpenMobileHomepageChange((e.currentTarget as HTMLInputElement).checked)}
        /></label
    >
</div>