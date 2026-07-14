<script lang="ts">
    import { onMount } from "svelte";
    import {
        HOMEPAGE_STATUS_STAT_DEFINITIONS,
        type HomepageStatusStatGroup,
        type HomepageStatusStatSource,
    } from "@/homepage/status-text-config";

    interface Props {
        onClose: () => void;
    }

    let { onClose }: Props = $props();
    let searchInput: HTMLInputElement | null = $state(null);
    let query = $state("");

    const groupLabels: Record<HomepageStatusStatGroup, string> = {
        time_notes: "时间与笔记",
        structure: "内容结构",
        tasks: "任务情况",
    };
    const sourceLabels: Record<HomepageStatusStatSource, string> = {
        local: "本地时间",
        start_cache: "一次检索后本地保存",
        official_api: "思源官方接口",
        stat_index: "统计索引",
        task_index: "任务索引",
    };
    const groups: HomepageStatusStatGroup[] = ["time_notes", "structure", "tasks"];
    const compatibilityVariables = [
        { key: "notesCount", target: "blocksCount", description: "旧版本兼容变量，建议新配置使用 blocksCount。" },
        { key: "DocsCount", target: "docsCount", description: "旧版本大小写兼容，建议新配置使用 docsCount。" },
    ];
    const normalizedQuery = $derived(query.trim().toLocaleLowerCase());
    const filteredDefinitions = $derived.by(() => {
        const keyword = normalizedQuery;
        if (!keyword) return HOMEPAGE_STATUS_STAT_DEFINITIONS;
        return HOMEPAGE_STATUS_STAT_DEFINITIONS.filter((item) => [
            item.key,
            `{{${item.key}}}`,
            item.label,
            item.description,
            sourceLabels[item.source],
        ].some((value) => value.toLocaleLowerCase().includes(keyword)));
    });
    const filteredCompatibilityVariables = $derived(compatibilityVariables.filter((item) => !normalizedQuery || [
        item.key, `{{${item.key}}}`, item.target, `{{${item.target}}}`, item.description, "兼容变量",
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))));
    const showDateHelp = $derived(!normalizedQuery || [
        "日期计算", "nowDate", "startDate", "时间差", "运算符", "格式", "已经记录", "今年已经过去",
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
    const hasSearchResults = $derived(filteredDefinitions.length > 0 || filteredCompatibilityVariables.length > 0 || showDateHelp);

    onMount(() => {
        searchInput?.focus();
        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeydown);
        return () => window.removeEventListener("keydown", handleKeydown);
    });

    function handleOverlayClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) onClose();
    }

    function handleOverlayKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="shp-status-vars-overlay" onclick={handleOverlayClick} onkeydown={handleOverlayKeydown}>
    <div
        class="shp-status-vars-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="状态语可用变量"
    >
        <header class="shp-status-vars-header">
            <div>
                <h2>状态语可用变量</h2>
                <p>变量会在主页显示时替换为当前可用的统计数据。</p>
            </div>
            <button type="button" class="shp-status-vars-close" onclick={onClose} title="关闭" aria-label="关闭">&times;</button>
        </header>

        <div class="shp-status-vars-search">
            <input
                bind:this={searchInput}
                bind:value={query}
                type="search"
                placeholder="搜索变量或说明"
                aria-label="搜索变量或说明"
            />
        </div>

        <div class="shp-status-vars-body">
            {#if !hasSearchResults}
                <div class="shp-status-vars-empty">未找到匹配变量。</div>
            {/if}
            {#each groups as group}
                {@const items = filteredDefinitions.filter((item) => item.group === group)}
                {#if items.length > 0}
                    <section class="shp-status-vars-section">
                        <h3>{groupLabels[group]}</h3>
                        <div class="shp-status-vars-table-wrap">
                            <table>
                                <thead><tr><th>变量</th><th>含义与说明</th><th>示例</th><th>数据来源</th></tr></thead>
                                <tbody>
                                    {#each items as item (item.key)}
                                        <tr>
                                            <td><code>{`{{${item.key}}}`}</code></td>
                                            <td><strong>{item.label}</strong><span>{item.description}</span></td>
                                            <td>{item.example}</td>
                                            <td><span class={`shp-status-vars-source ${item.source}`}>{sourceLabels[item.source]}</span></td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </section>
                {/if}
            {/each}

            {#if filteredCompatibilityVariables.length > 0}
                <section class="shp-status-vars-section">
                    <h3>兼容变量</h3>
                    <div class="shp-status-vars-compat">
                        {#each filteredCompatibilityVariables as item (item.key)}
                            <div><code>{`{{${item.key}}}`}</code><span>等价于 <code>{`{{${item.target}}}`}</code>。{item.description}</span></div>
                        {/each}
                    </div>
                </section>
            {/if}

            {#if showDateHelp}
                <section class="shp-status-vars-section">
                    <h3>日期计算</h3>
                    <div class="shp-status-vars-date-help">
                        <code>$$日期1 运算符 日期2 as 格式$$</code>
                        <p>支持变量：<code>nowDate</code>、<code>startDate</code>。运算符 <code>d</code> 计算两个日期的时间差；<code>p</code> 保留现有兼容行为。</p>
                        <p>格式：<code>Y</code> 年、<code>M</code> 月、<code>D</code> 日、<code>h</code> 小时、<code>m</code> 分钟、<code>s</code> 秒。</p>
                        <div><span>已经记录：</span><code>$$nowDate d startDate as D$$ 天</code></div>
                        <div><span>今年已经过去：</span><code>$$nowDate d 2026/1/1 as D$$ 天</code></div>
                    </div>
                </section>
            {/if}
        </div>

        <footer class="shp-status-vars-footer">
            <a href="https://blog.glaube-ty.top/archives/019d2484-7d4f-7573-89dd-772a2c600e2b" target="_blank" rel="noreferrer">查看完整教程</a>
            <button type="button" onclick={onClose}>关闭</button>
        </footer>
    </div>
</div>

<style>
    .shp-status-vars-overlay { position: fixed; inset: 0; z-index: 450; display: flex; align-items: center; justify-content: center; padding: 1rem; background: color-mix(in srgb, var(--b3-theme-on-background) 35%, transparent); }
    .shp-status-vars-dialog { display: flex; flex-direction: column; width: min(920px, 100%); max-height: min(860px, calc(100vh - 2rem)); overflow: hidden; border: 1px solid var(--b3-border-color); border-radius: 10px; background: var(--b3-theme-surface); box-shadow: 0 10px 36px color-mix(in srgb, var(--b3-theme-on-background) 20%, transparent); color: var(--b3-theme-on-surface); }
    .shp-status-vars-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 0.9rem 1rem; border-bottom: 1px solid var(--b3-border-color); }
    .shp-status-vars-header h2, .shp-status-vars-header p { margin: 0; }
    .shp-status-vars-header h2 { font-size: 16px; }
    .shp-status-vars-header p { margin-top: 0.25rem; font-size: 12px; color: var(--b3-theme-on-surface-light); }
    .shp-status-vars-close { flex: 0 0 auto; width: 30px; height: 30px; border: 0; border-radius: 5px; background: transparent; color: var(--b3-theme-on-surface-light); font-size: 20px; cursor: pointer; }
    .shp-status-vars-close:hover { background: var(--b3-list-hover); }
    .shp-status-vars-search { padding: 0.75rem 1rem; border-bottom: 1px solid var(--b3-border-color); }
    .shp-status-vars-search input { width: 100%; box-sizing: border-box; padding: 0.55rem 0.7rem; border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-background); color: var(--b3-theme-on-background); outline: none; }
    .shp-status-vars-search input:focus { border-color: var(--b3-theme-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 18%, transparent); }
    .shp-status-vars-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 1rem 1rem; }
    .shp-status-vars-section { margin-top: 1rem; }
    .shp-status-vars-section h3 { margin: 0 0 0.5rem; font-size: 13px; }
    .shp-status-vars-table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid var(--b3-border-color); border-radius: 7px; }
    .shp-status-vars-table-wrap table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .shp-status-vars-table-wrap th { position: sticky; top: 0; z-index: 1; background: var(--b3-theme-surface-light); text-align: left; }
    .shp-status-vars-table-wrap th, .shp-status-vars-table-wrap td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--b3-border-color); vertical-align: top; }
    .shp-status-vars-table-wrap tbody tr:last-child td { border-bottom: 0; }
    .shp-status-vars-table-wrap td strong, .shp-status-vars-table-wrap td span { display: block; }
    .shp-status-vars-table-wrap td span { margin-top: 0.15rem; color: var(--b3-theme-on-surface-light); line-height: 1.45; }
    .shp-status-vars-dialog code { padding: 0.1rem 0.3rem; border-radius: 3px; background: var(--b3-theme-surface-light); color: var(--b3-theme-primary); font-family: var(--b3-font-family-code); font-size: 11px; white-space: nowrap; }
    .shp-status-vars-source { display: inline-block !important; margin: 0 !important; padding: 0.15rem 0.4rem; border-radius: 999px; background: var(--b3-theme-surface-light); white-space: nowrap; }
    .shp-status-vars-compat, .shp-status-vars-date-help { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.7rem; border: 1px solid var(--b3-border-color); border-radius: 7px; font-size: 12px; line-height: 1.6; }
    .shp-status-vars-compat > div, .shp-status-vars-date-help > div { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; }
    .shp-status-vars-date-help p { margin: 0; }
    .shp-status-vars-empty { padding: 2rem 1rem; text-align: center; color: var(--b3-theme-on-surface-light); }
    .shp-status-vars-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 1rem; border-top: 1px solid var(--b3-border-color); }
    .shp-status-vars-footer a { color: var(--b3-theme-on-surface-light); font-size: 12px; text-decoration: none; }
    .shp-status-vars-footer a:hover { color: var(--b3-theme-primary); }
    .shp-status-vars-footer button { padding: 0.4rem 0.8rem; border: 1px solid var(--b3-border-color); border-radius: 5px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; }
    @media (max-width: 640px) {
        .shp-status-vars-overlay { padding: 0.5rem; }
        .shp-status-vars-dialog { max-height: calc(100vh - 1rem); }
        .shp-status-vars-table-wrap table, .shp-status-vars-table-wrap tbody, .shp-status-vars-table-wrap tr, .shp-status-vars-table-wrap td { display: block; width: 100%; box-sizing: border-box; }
        .shp-status-vars-table-wrap thead { display: none; }
        .shp-status-vars-table-wrap tr { padding: 0.45rem 0.55rem; border-bottom: 1px solid var(--b3-border-color); }
        .shp-status-vars-table-wrap tr:last-child { border-bottom: 0; }
        .shp-status-vars-table-wrap td { padding: 0.2rem 0; border: 0; }
    }
</style>
