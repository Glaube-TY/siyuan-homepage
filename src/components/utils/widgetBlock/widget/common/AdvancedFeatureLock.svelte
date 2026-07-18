<script lang="ts">
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        title: string;
        subtitle?: string;
        icon?: string;
        features?: string[];
        highlights?: string[];
        note?: string;
        compact?: boolean;
        tutorialUrl?: string;
        tutorialLabel?: string;
    }

    let {
        title,
        subtitle = "",
        icon = "star",
        features = [],
        highlights = [],
        note = "",
        compact = false,
        tutorialUrl = "",
        tutorialLabel = "点击查看教程",
    }: Props = $props();

    // 图标名称归一化：将营销卡片常用的 icon 名映射到项目已存在的安全图标
    function resolveFeatureLockIcon(name: string): string {
        const map: Record<string, string> = {
            notebrain: "iconNotebrain",
            lock: "vip",
            check: "confirm",
            star: "vip",
            time: "calendar",
            clock: "calendar",
            quote: "records",
            format: "records",
            edit: "records",
            chart: "overview",
            barChart: "overview",
            database: "overview",
            history: "calendar",
            music: "diary",
            globe: "notifications",
            image: "template",
            cloud: "calendar",
            mobile: "overview",
            layout: "overview",
            style: "style",
        };
        return map[name] || "vip";
    }

    const resolvedIcon = $derived(resolveFeatureLockIcon(icon));

    // compact 模式下精简展示
    const visibleHighlights = $derived(compact ? highlights.slice(0, 2) : highlights);
    const visibleFeatures = $derived(compact ? features.slice(0, 2) : features);
    const ctaText = $derived(
        compact ? "高级会员专属 · 在会员服务中开通" : "请在「主页设置」→「会员服务」中开通高级会员后使用"
    );
</script>

<div class="feature-lock" class:compact>
    <div class="lock-badge">
        <SiyuanIcon name="vip" size={compact ? 12 : 16} />
    </div>
    <div class="lock-icon-wrap">
        <SiyuanIcon name={resolvedIcon} size={compact ? 20 : 36} />
    </div>
    <h3 class="lock-title">{title}</h3>
    {#if subtitle}
        <p class="lock-subtitle">{subtitle}</p>
    {/if}
    {#if visibleHighlights.length > 0}
        <div class="lock-highlights">
            {#each visibleHighlights as tag}
                <span class="highlight-tag">{tag}</span>
            {/each}
        </div>
    {/if}
    {#if visibleFeatures.length > 0}
        <ul class="lock-features">
            {#each visibleFeatures as feature}
                <li>
                    <SiyuanIcon name="confirm" size={compact ? 12 : 14} />
                    <span>{feature}</span>
                </li>
            {/each}
        </ul>
    {/if}
    <div class="lock-cta">
        {ctaText}
    </div>
    {#if tutorialUrl}
        <a class="lock-tutorial" href={tutorialUrl} target="_blank" rel="noopener noreferrer">
            <SiyuanIcon name="help" size={compact ? 12 : 14} />
            <span>{tutorialLabel}</span>
        </a>
    {/if}
    {#if note && !compact}
        <p class="lock-note">{note}</p>
    {/if}
</div>

<style>
    .feature-lock {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 14px;
        background: var(--b3-theme-surface);
        padding: 28px 24px 24px;
        position: relative;
        overflow: hidden;
        container-type: inline-size;
    }

    .feature-lock::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, var(--b3-theme-primary), color-mix(in srgb, var(--b3-theme-primary) 60%, transparent));
    }

    .feature-lock.compact {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        justify-content: center;
        overflow: hidden;
        padding: 12px 10px;
        border-radius: 10px;
    }

    .lock-badge {
        position: absolute;
        top: 10px;
        right: 12px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .lock-icon-wrap {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
    }

    .compact .lock-icon-wrap {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        margin-bottom: 6px;
    }

    .lock-title {
        margin: 0 0 6px;
        font-size: 16px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .compact .lock-title {
        font-size: 13px;
        line-height: 1.25;
        margin-bottom: 4px;
    }

    .lock-subtitle {
        margin: 0 0 12px;
        font-size: 13px;
        line-height: 1.55;
        color: var(--b3-theme-on-surface);
        opacity: 0.66;
        max-width: 360px;
    }

    .compact .lock-subtitle {
        font-size: 11px;
        line-height: 1.35;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .lock-highlights {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
        margin-bottom: 14px;
    }

    .compact .lock-highlights {
        gap: 4px;
        margin-bottom: 6px;
    }

    .highlight-tag {
        font-size: 11px;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
        border-radius: 20px;
        padding: 2px 10px;
    }

    .compact .highlight-tag {
        font-size: 10px;
        padding: 1px 6px;
    }

    .lock-features {
        list-style: none;
        margin: 0 0 16px;
        padding: 0;
        text-align: left;
        display: inline-flex;
        flex-direction: column;
        gap: 8px;
        max-width: 320px;
    }

    .compact .lock-features {
        gap: 4px;
        margin-bottom: 6px;
        max-width: 100%;
    }

    .lock-features li {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        line-height: 1.5;
    }

    .compact .lock-features li {
        font-size: 10.5px;
        line-height: 1.25;
    }

    .lock-features li :global(svg) {
        color: var(--b3-theme-primary);
        flex-shrink: 0;
    }

    .lock-cta {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        padding: 10px 16px;
        border-radius: 8px;
        background: var(--b3-theme-background);
        border: 1px dashed var(--b3-border-color);
        max-width: 340px;
    }

    .compact .lock-cta {
        font-size: 10px;
        padding: 5px 8px;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .lock-note {
        margin: 10px 0 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.45;
    }

    .compact .lock-note {
        font-size: 11px;
        margin-top: 6px;
    }

    .lock-tutorial {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
        font-size: 13px;
        color: var(--b3-theme-primary);
        text-decoration: none;
        padding: 6px 14px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
        transition: all 0.2s ease;

        &:hover {
            background: color-mix(in srgb, var(--b3-theme-primary) 15%, transparent);
            transform: translateY(-1px);
        }
    }

    .compact .lock-tutorial {
        font-size: 11px;
        margin-top: 6px;
        padding: 4px 8px;
    }

    @container (max-width: 220px) {
        .lock-features {
            display: none;
        }
        .lock-subtitle {
            -webkit-line-clamp: 1;
        }
        .lock-icon-wrap {
            width: 28px;
            height: 28px;
            margin-bottom: 4px;
        }
    }
</style>
