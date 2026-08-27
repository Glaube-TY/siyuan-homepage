<script lang="ts">
    interface Props {
        data: Record<string, any>;
    }

    let { data }: Props = $props();

    const indexItems = [
        { key: "all", label: "整体指数" },
        { key: "health", label: "健康指数" },
        { key: "love", label: "爱情指数" },
        { key: "money", label: "财运指数" },
        { key: "work", label: "事业指数" },
    ] as const;

    const detailItems = [
        { key: "all", label: "整体运势" },
        { key: "health", label: "健康运势" },
        { key: "love", label: "爱情运势" },
        { key: "money", label: "财富运势" },
        { key: "work", label: "事业运势" },
    ] as const;

    function display(value: unknown): string {
        return value === undefined || value === null || value === "" ? "N/A" : String(value);
    }
</script>

<div class="fortune-card">
    <section class="fortune-card1" aria-label="运势指数">
        {#each indexItems as item}
            <div class="fortune-item">
                <span><strong>{item.label}</strong>：{display(data.index?.[item.key])}</span>
            </div>
        {/each}
    </section>

    <section class="fortune-card1" aria-label="幸运信息">
        <div class="fortune-item">
            <span><strong>幸运颜色</strong>：{display(data.luckycolor)}</span>
        </div>
        <div class="fortune-item">
            <span><strong>幸运数字</strong>：{display(data.luckynumber)}</span>
        </div>
        <div class="fortune-item">
            <span><strong>贵人星座</strong>：{display(data.luckyconstellation)}</span>
        </div>
        <div class="fortune-item">
            <span><strong>今日建议</strong>：宜 {display(data.todo?.yi)}，忌 {display(data.todo?.ji)}</span>
        </div>
        <div class="fortune-item">
            <span><strong>简短评语</strong>：{display(data.shortcomment)}</span>
        </div>
    </section>

    <section class="fortune-card2" aria-label="详细运势">
        {#each detailItems as item}
            <article class="fortune-item">
                <h4>{item.label}</h4>
                <p>{display(data.fortunetext?.[item.key])}</p>
            </article>
        {/each}
    </section>
</div>

<style lang="scss">
    .fortune-card {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 1rem;
    }

    .fortune-card1,
    .fortune-card2 {
        display: grid;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr);
        gap: 0.65rem;
    }

    .fortune-item {
        min-width: 0;
        padding: 0.65rem 0.75rem;
        overflow-wrap: anywhere;
        background-color: var(--b3-theme-surface);
        border-left: 3px solid var(--b3-theme-primary);
        border-radius: 8px;
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        line-height: 1.45;
    }

    h4 {
        margin: 0 0 0.35rem;
        color: var(--b3-theme-on-surface);
        font-size: 15px;
        font-weight: 600;
    }

    p {
        margin: 0;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.55;
    }

    @container constellation-widget (min-width: 520px) {
        .fortune-card1,
        .fortune-card2 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
