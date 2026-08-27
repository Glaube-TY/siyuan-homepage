<script lang="ts">
    import { getConstellationDisplayName } from "./constellationShared";

    interface Props {
        data: Record<string, any>;
        selectedConstellation: string;
    }

    let { data, selectedConstellation }: Props = $props();

    const metricItems = [
        { key: "all", label: "整体" },
        { key: "health", label: "健康" },
        { key: "love", label: "爱情" },
        { key: "money", label: "财富" },
        { key: "work", label: "事业" },
    ] as const;

    const detailItems = [
        { key: "all", label: "整体运势" },
        { key: "health", label: "健康运势" },
        { key: "love", label: "爱情运势" },
        { key: "money", label: "财富运势" },
        { key: "work", label: "事业运势" },
    ] as const;

    function display(value: unknown, fallback = "暂无"): string {
        return value === undefined || value === null || value === "" ? fallback : String(value);
    }

    function parsePercentage(value: unknown): number | null {
        if (typeof value !== "string") return null;
        const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
        if (!match) return null;
        const score = Number(match[1]);
        return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
    }

    function safeColor(value: unknown): string | null {
        if (typeof value !== "string") return null;
        const color = value.trim();
        return color && typeof CSS !== "undefined" && CSS.supports("color", color) ? color : null;
    }
</script>

<div class="elegant-content">
    <header class="elegant-hero">
        <div class="hero-copy">
            <span class="hero-kicker">Today · {display(data.time, "今日")}</span>
            <h3>{getConstellationDisplayName(selectedConstellation)}</h3>
        </div>
    </header>

    <div class="elegant-main">
        <section class="metrics-panel" aria-label="今日指数">
            <div class="section-heading">
                <h4>今日指数</h4>
                <span>五维状态</span>
            </div>

            <div class="metrics-grid">
                {#each metricItems as item}
                    {@const rawScore = data.index?.[item.key]}
                    {@const progress = parsePercentage(rawScore)}
                    <div class="metric-row" class:metric-row-primary={item.key === "all"}>
                        <div class="metric-row-heading">
                            <span>{item.label}</span>
                            <strong>{display(rawScore)}</strong>
                        </div>
                        {#if progress !== null}
                            <div
                                class="metric-rule"
                                role="progressbar"
                                aria-label={`${item.label}指数`}
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-valuenow={progress}
                            >
                                <span style={`width: ${progress}%`}></span>
                            </div>
                        {:else}
                            <div class="metric-rule metric-rule-empty" aria-hidden="true"></div>
                        {/if}
                    </div>
                {/each}
            </div>
        </section>

        <section class="elegant-section" aria-label="幸运信息">
            <div class="section-heading">
                <h4>幸运信息</h4>
            </div>

            <div class="lucky-strip">
                <div class="lucky-item">
                    <span class="lucky-label">幸运颜色</span>
                    <strong class="lucky-value">
                        {#if safeColor(data.luckycolor)}
                            <span
                                class="lucky-dot"
                                aria-hidden="true"
                                style={`background-color: ${safeColor(data.luckycolor)}`}
                            ></span>
                        {/if}
                        {display(data.luckycolor)}
                    </strong>
                </div>
                <div class="lucky-item">
                    <span class="lucky-label">幸运数字</span>
                    <strong class="lucky-value">{display(data.luckynumber)}</strong>
                </div>
                <div class="lucky-item">
                    <span class="lucky-label">贵人星座</span>
                    <strong class="lucky-value">{display(data.luckyconstellation)}</strong>
                </div>
            </div>
        </section>

        <section class="editorial-highlights" aria-label="今日提示">
            <article class="advice-block">
                <div class="highlight-heading">
                    <span class="highlight-label">今日建议</span>
                </div>
                <div class="advice-list">
                    <div class="advice-row">
                        <span class="advice-key">宜</span>
                        <span>{display(data.todo?.yi)}</span>
                    </div>
                    <div class="advice-row">
                        <span class="advice-key">忌</span>
                        <span>{display(data.todo?.ji)}</span>
                    </div>
                </div>
            </article>

            <article class="comment-block">
                <span class="highlight-label">简短评语</span>
                <blockquote class="comment-copy">“{display(data.shortcomment)}”</blockquote>
            </article>
        </section>

        <section class="reading-section" aria-label="详细运势">
            <div class="section-heading">
                <h4>详细运势</h4>
            </div>

            <div class="reading-grid">
                {#each detailItems as item}
                    <article class="reading-item">
                        <h5>{item.label}</h5>
                        <p>{display(data.fortunetext?.[item.key])}</p>
                    </article>
                {/each}
            </div>
        </section>
    </div>
</div>

<style lang="scss">
    .elegant-content {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 1.25rem;
        color: var(--b3-theme-on-surface);
    }

    .elegant-hero {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        align-items: end;
        gap: 0.9rem;
        padding: 0.25rem 0 1rem;
        border-bottom: 1px solid color-mix(in srgb, var(--b3-theme-primary) 22%, transparent);
    }

    .hero-copy {
        min-width: 0;
    }

    .hero-kicker,
    .lucky-label {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        letter-spacing: 0.04em;
    }

    .hero-kicker {
        display: block;
    }

    h3,
    h4,
    h5,
    p,
    blockquote {
        margin: 0;
    }

    h3 {
        margin-top: 0.15rem;
        font-size: 1.5rem;
        line-height: 1.15;
        letter-spacing: -0.03em;
    }

    .elegant-main,
    .elegant-section,
    .reading-section {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.65rem;
    }

    .elegant-main {
        gap: 1.25rem;
    }

    .section-heading,
    .highlight-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
        min-width: 0;
    }

    .section-heading {
        padding-bottom: 0.55rem;
        border-bottom: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent);
    }

    .section-heading h4 {
        font-size: 14px;
        font-weight: 650;
    }

    .metrics-panel {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.9rem 1rem 0.45rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent);
        border-radius: 7px;
        background: color-mix(in srgb, var(--b3-theme-surface) 94%, var(--b3-theme-primary));
    }

    .metrics-grid {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        column-gap: 1.5rem;
    }

    .metric-row {
        min-width: 0;
        padding: 0.7rem 0;
        border-bottom: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 9%, transparent);
    }

    .metric-row-heading {
        display: flex;
        min-width: 0;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
    }

    .metric-row-heading span {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .metric-row-heading strong {
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        font-weight: 650;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    .metric-rule {
        height: 3px;
        margin-top: 0.55rem;
        overflow: hidden;
        background: color-mix(in srgb, var(--b3-theme-on-surface) 12%, transparent);
    }

    .metric-rule span {
        display: block;
        height: 100%;
        background: var(--b3-theme-primary);
    }

    .metric-rule-empty {
        opacity: 0.55;
    }

    .lucky-strip {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        padding: 0.1rem 0;
        border-top: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent);
    }

    .lucky-item {
        display: flex;
        min-width: 0;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.8rem;
        padding: 0.7rem 0;
    }

    .lucky-item + .lucky-item {
        border-top: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 9%, transparent);
    }

    .lucky-value {
        display: flex;
        max-width: 70%;
        min-width: 0;
        align-items: center;
        overflow-wrap: anywhere;
        font-size: 13px;
        font-weight: 650;
        text-align: right;
    }

    .lucky-dot {
        width: 0.55rem;
        height: 0.55rem;
        flex: 0 0 auto;
        margin-right: 0.35rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 18%, transparent);
        border-radius: 50%;
    }

    .editorial-highlights {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        gap: 1rem;
    }

    .advice-block,
    .comment-block {
        min-width: 0;
    }

    .advice-block {
        padding: 0.85rem 0.75rem 0.9rem;
        border-top: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
        background: color-mix(in srgb, var(--b3-theme-surface) 96%, var(--b3-theme-primary));
    }

    .comment-block {
        padding: 0.85rem 0 0.9rem;
        border-top: 1px solid color-mix(in srgb, var(--b3-theme-primary) 25%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--b3-theme-primary) 25%, transparent);
    }

    .highlight-label {
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        font-weight: 650;
    }

    .advice-list {
        display: flex;
        flex-direction: column;
        margin-top: 0.55rem;
    }

    .advice-row {
        display: grid;
        min-width: 0;
        grid-template-columns: 1.6rem minmax(0, 1fr);
        gap: 0.55rem;
        padding: 0.42rem 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        line-height: 1.5;
    }

    .advice-row + .advice-row {
        border-top: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 9%, transparent);
    }

    .advice-key {
        color: var(--b3-theme-primary);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.1em;
    }

    .comment-copy {
        margin-top: 0.55rem;
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface);
        font-size: 1rem;
        font-weight: 500;
        line-height: 1.5;
    }

    .reading-grid {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        column-gap: 1.5rem;
    }

    .reading-item {
        min-width: 0;
        padding: 0.8rem 0 0.95rem;
        border-top: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent);
    }

    .reading-item h5 {
        margin-bottom: 0.35rem;
        font-size: 13px;
        font-weight: 650;
    }

    .reading-item p {
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        line-height: 1.65;
    }

    @container constellation-widget (max-width: 360px) {
        .elegant-hero {
            gap: 0.75rem;
        }

        .metrics-panel {
            padding-right: 0.8rem;
            padding-left: 0.8rem;
        }
    }

    @container constellation-widget (min-width: 520px) {
        .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .metric-row-primary {
            grid-column: 1 / -1;
        }

        .metric-row-primary .metric-row-heading strong {
            font-size: 15px;
        }

        .metric-row-primary .metric-rule {
            height: 4px;
        }

        h3 {
            font-size: 1.9rem;
        }

        .comment-copy {
            font-size: 1.1rem;
        }

        .lucky-strip {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .lucky-item + .lucky-item {
            border-top: 0;
            border-left: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 9%, transparent);
            padding-left: 1rem;
        }

        .editorial-highlights {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .reading-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>

