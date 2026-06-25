<script lang="ts">
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

    interface Props {
        tempAutoOpenHomepage: boolean;
        sidebarEnabled: boolean;
        autoOpenMobileHomepage: boolean;
        showMobilePreview?: boolean;
        onTempAutoOpenHomepageChange: (value: boolean) => void;
        onSidebarEnabledChange: (value: boolean) => void;
        onAutoOpenMobileHomepageChange: (value: boolean) => void;
        onOpenMobileHomepagePreview?: () => void;
    }

    let {
        tempAutoOpenHomepage,
        sidebarEnabled,
        autoOpenMobileHomepage,
        showMobilePreview = false,
        onTempAutoOpenHomepageChange,
        onSidebarEnabledChange,
        onAutoOpenMobileHomepageChange,
        onOpenMobileHomepagePreview
    }: Props = $props();
</script>

<SettingSection title="主页行为">
    <SettingRow
        title="自动打开主页"
        description="启动思源后自动进入主页"
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={tempAutoOpenHomepage}
            onchange={(e) => onTempAutoOpenHomepageChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    <SettingRow
        title="开启侧边栏👑"
        description="在桌面端启用主页侧边栏"
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={sidebarEnabled}
            onchange={(e) => onSidebarEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    <SettingRow
        title="自动打开移动端主页👑"
        description="移动端启动后自动进入主页"
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={autoOpenMobileHomepage}
            onchange={(e) => onAutoOpenMobileHomepageChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if showMobilePreview}
        <SettingRow
            title="打开手机端主页"
            description="在电脑上以手机尺寸编辑移动端主页"
        >
            <button type="button" class="b3-button b3-button--text" onclick={() => onOpenMobileHomepagePreview?.()}>
                打开
            </button>
        </SettingRow>
    {/if}
</SettingSection>
