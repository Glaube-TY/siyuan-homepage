<script lang="ts">
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

    interface Props {
        tempAutoOpenHomepage: boolean;
        sidebarEnabled: boolean;
        onTempAutoOpenHomepageChange: (value: boolean) => void;
        onSidebarEnabledChange: (value: boolean) => void;
    }

    let {
        tempAutoOpenHomepage,
        sidebarEnabled,
        onTempAutoOpenHomepageChange,
        onSidebarEnabledChange
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
</SettingSection>
