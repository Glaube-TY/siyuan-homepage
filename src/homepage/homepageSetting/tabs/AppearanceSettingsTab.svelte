<script lang="ts">
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";
    import type { HomepageThemeDefinition, HomepageThemeFallbackReason } from "../../theme/api/types";
    import "../homepageSettingStyle/_appearance.scss";

    interface Props {
        themes: readonly HomepageThemeDefinition[];
        preferredThemeId: string;
        effectiveThemeId: string;
        fallbackReason?: HomepageThemeFallbackReason;
        advancedEnabled: boolean;
        switchingThemeId?: string | null;
        switchingFirstActivation?: boolean;
        onSelectTheme: (themeId: string) => void;
    }

    let {
        themes,
        preferredThemeId,
        effectiveThemeId,
        fallbackReason,
        advancedEnabled,
        switchingThemeId = null,
        switchingFirstActivation = false,
        onSelectTheme,
    }: Props = $props();
    const themeSwitchInProgress = $derived(Boolean(switchingThemeId));
    const switchingTheme = $derived(themes.find((theme) => theme.id === switchingThemeId));

    const reasonLabel: Record<HomepageThemeFallbackReason, string> = {
        not_registered: "首选主题当前未安装，已临时使用经典主题",
        unsupported_surface: "首选主题不支持桌面主页，已临时使用经典主题",
        vip_required: "会员权限当前不可用，已临时使用经典主题；恢复会员后会自动恢复",
        invalid_definition: "主题加载失败，已安全回退经典主题",
    };
</script>

<section class="appearance-settings" data-homepage-setting-section="主页主题" tabindex="-1">
    <div class="appearance-settings__intro">
        <h3>外观与主题</h3>
        <p>主题只改变主页外观与入口组织，不会改动组件数量、顺序、大小、分区或组件数据。</p>
        {#if fallbackReason}<div class="appearance-settings__notice">{reasonLabel[fallbackReason]}</div>{/if}
        {#if switchingThemeId}
            <div class="appearance-settings__switching" role="status" aria-live="polite">
                <span class="appearance-settings__switching-indicator" aria-hidden="true"></span>
                <span>
                    <strong>正在切换到“{switchingTheme?.name ?? "主页主题"}”</strong>
                    <small>{switchingFirstActivation ? "首次使用需要准备主题界面，请稍候。" : "正在确认组件与布局状态。"}</small>
                </span>
            </div>
        {/if}
    </div>
    <div class="theme-card-grid">
        {#each themes as theme (theme.id)}
            {@const locked = theme.access === "vip" && !advancedEnabled}
            {@const switching = theme.id === switchingThemeId}
            <article class="theme-card" class:theme-card--preferred={theme.id === preferredThemeId} class:theme-card--effective={theme.id === effectiveThemeId} class:theme-card--locked={locked} class:theme-card--switching={switching} aria-busy={switching}>
                <div class="theme-card__head">
                    <strong class="theme-card__title">
                        <span>{theme.name}</span>
                        {#if theme.access === "vip"}<PremiumMark />{/if}
                    </strong>
                </div>
                {#if switching}
                    <div class="theme-card__progress" aria-hidden="true">
                        <span class="theme-card__loading-indicator"></span>
                        <strong>正在准备</strong>
                    </div>
                {/if}
                <p>{theme.description ?? "主页主题"}</p>
                <div class="theme-card__meta">{theme.author} · v{theme.version}</div>
                <div class="theme-card__badges" aria-label="主题状态">
                    {#if switching}<span class="theme-card__badge theme-card__badge--switching">正在切换</span>{/if}
                    {#if theme.id === effectiveThemeId && !switching}<span class="theme-card__badge theme-card__badge--effective">正在使用</span>{/if}
                    {#if theme.id === preferredThemeId && theme.id !== effectiveThemeId}<span class="theme-card__badge">已设为首选</span>{/if}
                </div>
                <button
                    type="button"
                    class="b3-button theme-card__action"
                    class:theme-card__action--selected={theme.id === preferredThemeId}
                    class:theme-card__action--locked={locked}
                    aria-pressed={theme.id === preferredThemeId}
                    aria-label={locked ? "需要高级会员" : undefined}
                    title={locked ? "需要高级会员" : undefined}
                    disabled={themeSwitchInProgress || theme.id === preferredThemeId || locked}
                    onclick={() => onSelectTheme(theme.id)}
                >
                    {switching ? "正在切换…" : themeSwitchInProgress ? "请稍候" : theme.id === preferredThemeId ? "已选择" : "立即使用"}
                </button>
            </article>
        {/each}
    </div>
</section>
