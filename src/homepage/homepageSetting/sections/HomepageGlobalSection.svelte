<script lang="ts">
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

    interface Props {
        tempAutoOpenHomepage: boolean;
        sidebarEnabled: boolean;
        autoOpenMobileHomepage: boolean;
        allowHomepageGlobalSqlQuery: boolean;
        showMobilePreview?: boolean;
        onTempAutoOpenHomepageChange: (value: boolean) => void;
        onSidebarEnabledChange: (value: boolean) => void;
        onAutoOpenMobileHomepageChange: (value: boolean) => void;
        onAllowHomepageGlobalSqlQueryChange: (value: boolean) => void;
        onOpenMobileHomepagePreview?: () => void;
    }

    let {
        tempAutoOpenHomepage,
        sidebarEnabled,
        autoOpenMobileHomepage,
        allowHomepageGlobalSqlQuery,
        showMobilePreview = false,
        onTempAutoOpenHomepageChange,
        onSidebarEnabledChange,
        onAutoOpenMobileHomepageChange,
        onAllowHomepageGlobalSqlQueryChange,
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

    <SettingRow
        title="允许主页组件使用全库 SQL 兼容模式"
        description="开启后，任务、收藏、复习、热力图、统计等组件可使用全库 SQL 查询以显示完整数据；大库可能增加 kernel 内存和 CPU 压力。"
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={allowHomepageGlobalSqlQuery}
            onchange={(e) => onAllowHomepageGlobalSqlQueryChange((e.currentTarget as HTMLInputElement).checked)}
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
