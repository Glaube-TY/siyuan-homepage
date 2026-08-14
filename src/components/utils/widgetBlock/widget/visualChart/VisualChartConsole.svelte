<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { showMessage } from "siyuan";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { lsNotebooks } from "@/api";
    import { normalizeVisualChartConfig } from "@/features/visual-chart/visual-chart-config";
    import { loadVisualChartData, transformVisualChartData } from "@/features/visual-chart/visual-chart-data";
    import { VISUAL_CHART_TYPE_OPTIONS, type VisualChartConfig, type VisualChartDataset } from "@/features/visual-chart/visual-chart-types";
    import VisualChartCanvas from "./VisualChartCanvas.svelte";
    import VisualChartStyleInspector from "./VisualChartStyleInspector.svelte";

    interface Props {
        initialConfig: VisualChartConfig;
        onSave: (config: VisualChartConfig) => void | Promise<void>;
        onClose: () => void;
    }
    let { initialConfig, onSave, onClose }: Props = $props();
    type Tab = "data" | "mapping" | "style" | "interaction";
    let tab = $state<Tab>("data");
    let config = $state<VisualChartConfig>(untrack(() => normalizeVisualChartConfig(initialConfig)));
    let dataset = $state<VisualChartDataset>({ columns: [], rows: [], sourceLabel: "" });
    let loading = $state(false);
    let saving = $state(false);
    let error = $state("");
    let notebooks = $state<Array<{ id: string; name: string }>>([]);
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    let reloadGeneration = 0;
    let mappedChartType = untrack(() => config.chartType);
    const previewConfig = $derived(normalizeVisualChartConfig(config));
    const previewData = $derived(transformVisualChartData(dataset, previewConfig));
    const sourceSignature = $derived(JSON.stringify({ source: config.source, documentLimit: config.transform.limit }));
    const simpleMapping = $derived(["pie", "donut", "funnel", "gauge", "treemap", "sunburst", "wordCloud"].includes(config.chartType));
    const zoomSupported = $derived(["line", "area", "bar", "horizontalBar", "scatter", "heatmap"].includes(config.chartType));

    function autoMap(force = false): void {
        const columns = dataset.columns;
        if (!columns.length) return;
        const numericColumns = columns.filter((column) => dataset.rows.some((row) => row[column] !== "" && Number.isFinite(Number(row[column]))));
        const textColumns = columns.filter((column) => !numericColumns.includes(column));
        const choose = (current: string, preferred: string[], fallback = columns[0]) => !force && columns.includes(current) ? current : preferred[0] || fallback;
        const chooseMany = (current: string[], preferred: string[]) => !force && current.length && current.every((field) => columns.includes(field)) ? current : preferred.slice(0, 4);

        if (config.chartType === "scatter") {
            config.mapping.category = choose(config.mapping.category, numericColumns);
            config.mapping.values = chooseMany(config.mapping.values, numericColumns.filter((field) => field !== config.mapping.category));
            config.mapping.name = choose(config.mapping.name, textColumns, "");
        } else if (config.chartType === "heatmap") {
            config.mapping.category = choose(config.mapping.category, textColumns);
            config.mapping.secondaryValue = choose(config.mapping.secondaryValue, textColumns.filter((field) => field !== config.mapping.category), columns.find((field) => field !== config.mapping.category) || "");
            config.mapping.value = choose(config.mapping.value, numericColumns);
            config.mapping.values = [config.mapping.value];
        } else if (config.chartType === "radar") {
            config.mapping.category = choose(config.mapping.category, textColumns);
            config.mapping.values = chooseMany(config.mapping.values, numericColumns.filter((field) => field !== config.mapping.category));
        } else if (config.chartType === "progress") {
            config.mapping.name = choose(config.mapping.name, textColumns);
            config.mapping.category = config.mapping.name;
            config.mapping.value = choose(config.mapping.value, numericColumns, columns.find((field) => field !== config.mapping.name) || columns[0]);
            if (force || (config.mapping.secondaryValue && !columns.includes(config.mapping.secondaryValue))) {
                config.mapping.secondaryValue = numericColumns.find((field) => field !== config.mapping.value) || "";
            }
            config.mapping.values = [config.mapping.value];
        } else if (["pie", "donut", "funnel", "gauge", "treemap", "sunburst", "wordCloud"].includes(config.chartType)) {
            config.mapping.name = choose(config.mapping.name, textColumns);
            config.mapping.value = choose(config.mapping.value, numericColumns, columns.find((field) => field !== config.mapping.name) || columns[0]);
            config.mapping.category = config.mapping.name;
            config.mapping.values = [config.mapping.value];
        } else {
            config.mapping.category = choose(config.mapping.category, textColumns);
            config.mapping.values = chooseMany(config.mapping.values, numericColumns.filter((field) => field !== config.mapping.category));
        }

        if (!config.mapping.values.length) config.mapping.values = columns.filter((field) => field !== config.mapping.category).slice(0, 1);
        if (!columns.includes(config.mapping.name)) config.mapping.name = textColumns[0] || config.mapping.category;
        if (!columns.includes(config.mapping.value)) config.mapping.value = config.mapping.values[0] || columns[0];
    }

    async function reload(forceMap = false): Promise<void> {
        const generation = ++reloadGeneration;
        loading = true;
        error = "";
        try {
            const result = await loadVisualChartData(normalizeVisualChartConfig(config));
            if (generation !== reloadGeneration) return;
            dataset = result;
            if (result.resolvedDatabaseId) config.source.databaseId = result.resolvedDatabaseId;
            autoMap(forceMap);
        } catch (reason) {
            if (generation !== reloadGeneration) return;
            dataset = { columns: [], rows: [], sourceLabel: "" };
            error = reason instanceof Error ? reason.message : "数据读取失败";
        } finally {
            if (generation === reloadGeneration) loading = false;
        }
    }

    async function save(): Promise<void> {
        saving = true;
        try {
            await onSave(normalizeVisualChartConfig(config));
            showMessage("可视化图表已保存", 2200, "info");
            onClose();
        } catch (reason) {
            showMessage(reason instanceof Error ? reason.message : "图表保存失败", 4000, "error");
        } finally { saving = false; }
    }

    onMount(() => {
        void lsNotebooks().then((result) => { notebooks = result.notebooks.map((item) => ({ id: item.id, name: item.name })); }).catch(() => {});
    });

    $effect(() => {
        sourceSignature;
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => void reload(false), 450);
        return () => {
            if (reloadTimer) clearTimeout(reloadTimer);
            reloadTimer = null;
        };
    });

    $effect(() => {
        const nextChartType = config.chartType;
        if (nextChartType === mappedChartType) return;
        mappedChartType = nextChartType;
        untrack(() => autoMap(true));
    });

    onDestroy(() => {
        reloadGeneration += 1;
        if (reloadTimer) clearTimeout(reloadTimer);
    });
</script>

<div class="chart-studio">
    <header>
        <div class="heading"><span>VISUAL CHART STUDIO</span><h2>可视化图表工作台</h2><p>连接数据、映射字段并实时调整呈现效果</p></div>
        <div class="header-actions"><button type="button" class="primary" onclick={save} disabled={saving}>{saving ? "保存中…" : "保存图表"}</button><button type="button" class="icon" aria-label="关闭" onclick={onClose}><SiyuanIcon name="close" size={18} /></button></div>
    </header>

    <div class="studio-body">
        <aside class="chart-picker" aria-label="图表类型">
            <strong>图表类型</strong>
            <div class="chart-types">
                {#each VISUAL_CHART_TYPE_OPTIONS as item (item.value)}
                    <button class:active={config.chartType === item.value} type="button" onclick={() => config.chartType = item.value}><span>{item.label}</span><small>{item.group}</small></button>
                {/each}
            </div>
        </aside>

        <main class="preview-panel">
            <div class="preview-meta"><div><strong>{config.appearance.title || "未命名图表"}</strong><span>{dataset.sourceLabel || "等待数据"} · {previewData.rows.length} 行</span></div><button type="button" onclick={() => autoMap(true)}>自动映射</button></div>
            <div class="preview-stage">
                {#if loading}<div class="state">正在读取并分析数据…</div>
                {:else if error}<div class="state error"><strong>数据暂时无法呈现</strong><span>{error}</span><button type="button" onclick={() => reload(false)}>重试</button></div>
                {:else if !previewData.rows.length}<div class="state"><strong>没有可绘制的数据</strong><span>检查数据源或查询条件，修改后会自动重新读取</span></div>
                {:else}<VisualChartCanvas config={previewConfig} dataset={previewData} />{/if}
            </div>
        </main>

        <aside class="inspector">
            <nav aria-label="图表设置"><button class:active={tab === "data"} onclick={() => tab = "data"}>数据</button><button class:active={tab === "mapping"} onclick={() => tab = "mapping"}>字段</button><button class:active={tab === "style"} onclick={() => tab = "style"}>外观</button><button class:active={tab === "interaction"} onclick={() => tab = "interaction"}>动态</button></nav>
            <div class="settings-scroll">
                {#if tab === "data"}
                    <section><h3>数据来源</h3><div class="source-grid">
                        {#each [{value:"database",label:"思源数据库"},{value:"sql",label:"SQL 结果"},{value:"documents",label:"文档信息"},{value:"tags",label:"笔记标签"},{value:"manual",label:"手动数据"}] as source}
                            <button class:active={config.source.type === source.value} type="button" onclick={() => config.source.type = source.value as any}>{source.label}</button>
                        {/each}
                    </div></section>
                    {#if config.source.type === "database"}<section><label>数据库块 ID / 属性视图 ID<input bind:value={config.source.databaseId} placeholder="粘贴数据库块 ID，系统会自动解析" /></label><p class="hint">支持直接粘贴页面中的数据库块 ID，也支持属性视图 ID。</p></section>
                    {:else if config.source.type === "sql"}<section><label>SQL 查询<textarea bind:value={config.source.sql} rows="9" spellcheck="false"></textarea></label><p class="hint">查询结果的每一列都会成为可映射字段。</p></section>
                    {:else if config.source.type === "documents"}<section><label>限定笔记本<select multiple bind:value={config.source.notebookIds}>{#each notebooks as notebook}<option value={notebook.id}>{notebook.name}</option>{/each}</select></label><label>标题关键词<input bind:value={config.source.documentKeyword} placeholder="留空表示全部文档" /></label><label>排序<select bind:value={config.source.documentSort}><option value="updated">最近更新</option><option value="created">最近创建</option><option value="title">标题</option></select></label></section>
                    {:else if config.source.type === "tags"}<section><p class="hint">读取思源中的标签名称和引用数量，可映射为词云、条形图、饼图等任意图表。</p></section>
                    {:else}<section><label>JSON 或 CSV<textarea bind:value={config.source.manualData} rows="12" spellcheck="false"></textarea></label><p class="hint">支持对象数组、二维数组，以及首行为字段名的 CSV。</p></section>{/if}
                    <section class="live-hint"><strong>实时预览已开启</strong><span>数据源变化后会自动读取并重新映射有效字段，无需手动刷新。</span></section>
                {:else if tab === "mapping"}
                    <section><h3>{VISUAL_CHART_TYPE_OPTIONS.find((item) => item.value === config.chartType)?.label}需要哪些字段</h3>{#if !dataset.columns.length}<p class="hint">先在“数据”中载入数据源。</p>{:else if config.chartType === "progress"}
                        <label>项目名称来自<select bind:value={config.mapping.name}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>当前值来自<select bind:value={config.mapping.value}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>目标值来自<select bind:value={config.mapping.secondaryValue}><option value="">使用固定目标值</option>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <p class="hint">没有目标值列时，会使用“样式 → 进度图设置”中的固定目标值。</p>
                    {:else if simpleMapping}
                        <label>名称来自哪一列<select bind:value={config.mapping.name}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>数值来自哪一列<select bind:value={config.mapping.value}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        {#if config.chartType === "gauge"}<p class="hint">仪表盘读取第一行数值；可以在“字段”下方设置排序，决定使用哪一行。</p>{:else if config.chartType === "treemap" || config.chartType === "sunburst"}<p class="hint">名称中使用“/”分隔层级，例如“工作/项目 A”。</p>{/if}
                    {:else if config.chartType === "scatter"}
                        <label>横轴数值来自<select bind:value={config.mapping.category}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>纵轴数值来自<select multiple bind:value={config.mapping.values}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>数据点名称来自<select bind:value={config.mapping.name}><option value="">不显示名称</option>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                    {:else if config.chartType === "heatmap"}
                        <label>横向分类来自<select bind:value={config.mapping.category}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>纵向分类来自<select bind:value={config.mapping.secondaryValue}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>颜色深浅根据<select bind:value={config.mapping.value}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                    {:else if config.chartType === "radar"}
                        <label>对比对象名称来自<select bind:value={config.mapping.category}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>需要比较的指标<select multiple bind:value={config.mapping.values}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                    {:else}
                        <label>横轴分类来自<select bind:value={config.mapping.category}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                        <label>需要展示的数值<select multiple bind:value={config.mapping.values}>{#each dataset.columns as column}<option value={column}>{column}</option>{/each}</select></label>
                    {/if}</section>
                    <section><h3>数据处理</h3><label>聚合方式<select bind:value={config.transform.aggregate}><option value="none">不聚合</option><option value="count">计数</option><option value="sum">求和</option><option value="average">平均值</option><option value="min">最小值</option><option value="max">最大值</option></select></label><label>排序<select bind:value={config.transform.sort}><option value="none">原始顺序</option><option value="categoryAsc">分类升序</option><option value="categoryDesc">分类降序</option><option value="valueAsc">数值升序</option><option value="valueDesc">数值降序</option></select></label><label>最多显示<input type="number" min="1" max="5000" bind:value={config.transform.limit} /></label><label class="check"><input type="checkbox" bind:checked={config.transform.emptyAsZero} />空值按 0 处理</label></section>
                {:else if tab === "style"}
                    <VisualChartStyleInspector bind:config />
                {:else}
                    <section><h3>动态刷新</h3><label>自动刷新间隔（秒）<input type="number" min="0" max="3600" bind:value={config.source.refreshSeconds} /></label><p class="hint">设为 0 关闭；数据库、SQL 与文档数据会按间隔重新获取。</p></section>
                    <section><h3>交互</h3><label class="check"><input type="checkbox" bind:checked={config.interaction.animation} />启用动态图形过渡</label>{#if config.interaction.animation}<label>动画速度<input type="range" min="150" max="1800" step="50" bind:value={config.interaction.animationDuration} /><output>{config.interaction.animationDuration <= 400 ? "轻快" : config.interaction.animationDuration <= 900 ? "自然" : "舒缓"}</output></label>{/if}<label class="check"><input type="checkbox" bind:checked={config.interaction.tooltip} />鼠标指向时显示详细数值</label>{#if zoomSupported}<label class="check"><input type="checkbox" bind:checked={config.interaction.dataZoom} />允许缩放与滑动查看</label>{/if}<label class="check"><input type="checkbox" bind:checked={config.interaction.toolbox} />显示保存图片等工具</label></section>
                {/if}
            </div>
        </aside>
    </div>
</div>

<style>
    .chart-studio{width:100%;height:100%;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--b3-theme-background);color:var(--b3-theme-on-background);overflow:hidden}.chart-studio>header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px 22px;border-bottom:1px solid var(--b3-border-color);background:color-mix(in srgb,var(--b3-theme-surface) 82%,transparent)}.heading{min-width:0}.heading>span{display:block;font-size:9px;letter-spacing:.14em;color:var(--b3-theme-primary);font-weight:700}.heading h2{margin:2px 0 1px;font-size:20px;letter-spacing:-.025em}.heading p{margin:0;font-size:11px;color:var(--b3-theme-on-surface)}.header-actions{display:flex;align-items:center;gap:7px}.header-actions button{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.studio-body{min-height:0;flex:1;display:grid;grid-template-columns:170px minmax(320px,1fr) 330px}.chart-picker,.inspector{min-height:0;background:var(--b3-theme-surface)}.chart-picker{padding:16px 12px;border-right:1px solid var(--b3-border-color);overflow:auto}.chart-picker>strong{display:block;margin:0 6px 10px;font-size:11px;color:var(--b3-theme-on-surface)}.chart-types{display:grid;grid-template-columns:1fr;gap:4px}.chart-types button{display:flex;align-items:center;justify-content:space-between;padding:8px 9px;border:1px solid transparent;border-radius:8px;background:transparent;text-align:left}.chart-types button:hover{background:var(--b3-list-hover)}.chart-types button.active{border-color:color-mix(in srgb,var(--b3-theme-primary) 38%,transparent);background:color-mix(in srgb,var(--b3-theme-primary) 10%,transparent);color:var(--b3-theme-primary)}.chart-types span{font-size:12px}.chart-types small{font-size:9px;opacity:.55}.preview-panel{min-width:0;min-height:0;display:flex;flex-direction:column;padding:16px;background:color-mix(in srgb,var(--b3-theme-surface) 45%,var(--b3-theme-background))}.preview-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px 10px}.preview-meta>div{min-width:0;display:flex;flex-direction:column}.preview-meta strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.preview-meta span{font-size:10px;color:var(--b3-theme-on-surface)}.preview-meta button{border:0;background:transparent;color:var(--b3-theme-primary);font-size:11px}.preview-stage{position:relative;min-height:0;flex:1;border:1px solid var(--b3-border-color);border-radius:14px;background:var(--b3-theme-surface);overflow:hidden;box-shadow:0 14px 32px rgba(31,42,68,.06)}.state{width:100%;height:100%;min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center;color:var(--b3-theme-on-surface);font-size:12px}.state strong{color:var(--b3-theme-on-background);font-size:14px}.state button{margin-top:6px}.state.error strong{color:var(--b3-theme-error)}.inspector{display:flex;flex-direction:column;border-left:1px solid var(--b3-border-color)}.inspector nav{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:10px 10px 0;border-bottom:1px solid var(--b3-border-color)}.inspector nav button{border:0;border-radius:7px 7px 0 0;padding:8px 2px;background:transparent;color:var(--b3-theme-on-surface);font-size:11px}.inspector nav button.active{color:var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 9%,transparent);font-weight:650}.settings-scroll{min-height:0;overflow:auto;padding:12px}.settings-scroll section{padding:12px;border:1px solid color-mix(in srgb,var(--b3-border-color) 72%,transparent);border-radius:10px;margin-bottom:10px}.settings-scroll h3{margin:0 0 10px;font-size:12px}.settings-scroll label{position:relative;display:flex;flex-direction:column;gap:5px;margin:0 0 10px;font-size:10px;color:var(--b3-theme-on-surface)}.settings-scroll label:last-child{margin-bottom:0}.settings-scroll input:not([type="checkbox"]):not([type="range"]),.settings-scroll select,.settings-scroll textarea{width:100%;box-sizing:border-box;border:1px solid var(--b3-border-color);border-radius:7px;padding:7px 8px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);font:inherit;font-size:11px}.settings-scroll textarea{resize:vertical;line-height:1.55;font-family:var(--b3-font-family-code,monospace)}.settings-scroll select[multiple]{min-height:78px}.settings-scroll .check{flex-direction:row;align-items:center;color:var(--b3-theme-on-background);font-size:11px}.settings-scroll input[type="checkbox"]{margin:0}.settings-scroll input[type="range"]{width:calc(100% - 50px)}.settings-scroll output{position:absolute;right:0;bottom:1px;font-size:10px}.hint{margin:-3px 0 10px;font-size:10px;line-height:1.45;color:var(--b3-theme-on-surface)}.source-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.source-grid button{padding:8px 5px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background);color:inherit;font-size:10px}.source-grid button.active{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 8%,transparent)}.live-hint{display:flex;flex-direction:column;gap:4px;border-color:color-mix(in srgb,var(--b3-theme-primary) 24%,var(--b3-border-color))!important;background:color-mix(in srgb,var(--b3-theme-primary) 6%,transparent)}.live-hint strong{font-size:11px;color:var(--b3-theme-primary)}.live-hint span{font-size:10px;line-height:1.5;color:var(--b3-theme-on-surface)}button{font:inherit;cursor:pointer;color:inherit}.primary,.icon,.state button{border:1px solid var(--b3-border-color);border-radius:8px;padding:8px 12px;background:var(--b3-theme-surface)}.primary{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary);color:var(--b3-theme-on-primary)}.icon{width:36px;padding:8px;justify-content:center}.primary:disabled{opacity:.55;cursor:wait}@media(max-width:900px){.studio-body{grid-template-columns:128px minmax(280px,1fr) 290px}.chart-picker{padding-inline:8px}.chart-types small{display:none}}@media(max-width:720px){.chart-studio>header{padding:12px}.heading p{display:none!important}.studio-body{display:flex;flex-direction:column;overflow:auto}.chart-picker{flex:0 0 auto;border:0;border-bottom:1px solid var(--b3-border-color);overflow:visible}.chart-picker>strong{display:none}.chart-types{display:flex;overflow:auto}.chart-types button{flex:0 0 auto}.preview-panel{flex:0 0 330px}.inspector{flex:0 0 520px;border-left:0;border-top:1px solid var(--b3-border-color)}.settings-scroll{overflow:visible}.header-actions .primary{padding-inline:10px}}
</style>
