<script lang="ts">
    import type { HomepageThemeDefinition, HomepageThemeFallbackReason } from "../../theme/api/types";
    import "../homepageSettingStyle/_appearance.scss";

    interface Props {
        themes: readonly HomepageThemeDefinition[];
        preferredThemeId: string;
        effectiveThemeId: string;
        fallbackReason?: HomepageThemeFallbackReason;
        advancedEnabled: boolean;
        onSelectTheme: (themeId: string) => void;
    }

    let { themes, preferredThemeId, effectiveThemeId, fallbackReason, advancedEnabled, onSelectTheme }: Props = $props();

    const reasonLabel: Record<HomepageThemeFallbackReason, string> = {
        not_registered: "首选主题当前未安装，已临时使用经典主题",
        unsupported_surface: "首选主题不支持桌面主页，已临时使用经典主题",
        vip_required: "会员权限当前不可用，已临时使用经典主题；恢复会员后会自动恢复",
        invalid_definition: "主题加载失败，已安全回退经典主题",
    };
</script>

<section class="appearance-settings">
    <div class="appearance-settings__intro">
        <h3>外观与主题</h3>
        <p>主题只改变主页外观与入口组织，不会改动组件数量、顺序、大小、分区或组件数据。</p>
        {#if fallbackReason}<div class="appearance-settings__notice">{reasonLabel[fallbackReason]}</div>{/if}
    </div>
    <div class="theme-card-grid">
        {#each themes as theme (theme.id)}
            {@const locked = theme.access === "vip" && !advancedEnabled}
            <article class="theme-card" class:theme-card--preferred={theme.id === preferredThemeId} class:theme-card--effective={theme.id === effectiveThemeId} class:theme-card--locked={locked}>
                <div class="theme-card__preview">
                    {#if theme.preview?.thumbnail}
                        <img src={theme.preview.thumbnail} alt={`${theme.name}主题预览`} />
                    {:else}
                        <div class="theme-card__fallback" aria-hidden="true"><span></span><span></span><span></span></div>
                    {/if}
                    {#if locked}<div class="theme-card__lock" aria-label="需要会员权限"><span aria-hidden="true">🔒</span><strong>VIP 主题</strong></div>{/if}
                </div>
                <div class="theme-card__head">
                    <strong>{theme.name}</strong>
                    <span class:theme-card__vip={theme.access === "vip"}>{theme.access === "vip" ? "VIP" : "免费"}</span>
                </div>
                <p>{theme.description ?? "主页主题"}</p>
                <div class="theme-card__meta">{theme.author} · v{theme.version}</div>
                <div class="theme-card__badges" aria-label="主题状态">
                    {#if theme.id === effectiveThemeId}<span class="theme-card__badge theme-card__badge--effective">正在使用</span>{/if}
                    {#if theme.id === preferredThemeId && theme.id !== effectiveThemeId}<span class="theme-card__badge">已设为首选</span>{/if}
                </div>
                <button type="button" disabled={theme.id === preferredThemeId || locked} onclick={() => onSelectTheme(theme.id)}>
                    {theme.id === preferredThemeId ? "已选择" : locked ? "会员主题" : "立即使用"}
                </button>
            </article>
        {/each}
    </div>
</section>
