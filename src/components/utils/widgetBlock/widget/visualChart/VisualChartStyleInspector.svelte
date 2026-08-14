<script lang="ts">
    import { VISUAL_CHART_PALETTE_PRESETS, VISUAL_CHART_TYPE_HELP } from "@/features/visual-chart/visual-chart-presets";
    import { VISUAL_CHART_TYPE_OPTIONS, type VisualChartConfig } from "@/features/visual-chart/visual-chart-types";

    interface Props { config: VisualChartConfig }
    let { config = $bindable() }: Props = $props();

    const chartMeta = $derived(VISUAL_CHART_TYPE_OPTIONS.find((item) => item.value === config.chartType) || VISUAL_CHART_TYPE_OPTIONS[0]);
    const lineChart = $derived(config.chartType === "line" || config.chartType === "area");
    const barChart = $derived(config.chartType === "bar" || config.chartType === "horizontalBar");
    const pieChart = $derived(config.chartType === "pie" || config.chartType === "donut");
    const axisChart = $derived(["line", "area", "bar", "horizontalBar", "scatter", "heatmap"].includes(config.chartType));
    const supportsLegend = $derived(["line", "area", "bar", "horizontalBar", "pie", "donut", "scatter", "radar", "funnel"].includes(config.chartType));
    const supportsLabels = $derived(!["progress", "gauge", "wordCloud"].includes(config.chartType));

    function applyPalette(colors: readonly string[]): void {
        config.appearance.palette = [...colors];
    }

    function setPaletteColor(index: number, event: Event): void {
        const colors = [...config.appearance.palette];
        colors[index] = (event.currentTarget as HTMLInputElement).value;
        config.appearance.palette = colors;
    }

    function removePaletteColor(index: number): void {
        if (config.appearance.palette.length <= 2) return;
        config.appearance.palette = config.appearance.palette.filter((_, itemIndex) => itemIndex !== index);
    }

    function addPaletteColor(): void {
        if (config.appearance.palette.length >= 12) return;
        const fallback = VISUAL_CHART_PALETTE_PRESETS[0].colors[config.appearance.palette.length % VISUAL_CHART_PALETTE_PRESETS[0].colors.length];
        config.appearance.palette = [...config.appearance.palette, fallback];
    }

    function setTransparent(event: Event): void {
        config.appearance.background = (event.currentTarget as HTMLInputElement).checked ? "transparent" : "#ffffff";
    }

    function setThemeText(event: Event): void {
        config.appearance.textColor = (event.currentTarget as HTMLInputElement).checked ? "" : "#2f3441";
    }

    function setPieOuterRadius(event: Event): void {
        config.detail.pieOuterRadius = Number((event.currentTarget as HTMLInputElement).value);
        config.appearance.donutInnerRadius = Math.min(config.appearance.donutInnerRadius, config.detail.pieOuterRadius - 5);
    }
</script>

<div class="style-inspector">
    <section class="chart-context">
        <div><span>{chartMeta.group}图表</span><strong>{chartMeta.label}专属外观</strong><p>{VISUAL_CHART_TYPE_HELP[config.chartType]}</p></div>
        <span class="live-badge">实时预览</span>
    </section>

    <section class="specific-settings">
        <div class="section-heading"><div><h3>{chartMeta.label}设置</h3><p>这里只显示当前图表真正支持的选项。</p></div></div>

        {#if axisChart}<div class="two-fields axis-titles"><label>横轴标题<input bind:value={config.detail.xAxisTitle} placeholder="可留空" /></label><label>纵轴标题<input bind:value={config.detail.yAxisTitle} placeholder="可留空" /></label></div>{/if}

        {#if lineChart}
            <fieldset><legend>线条走向</legend><div class="choice-grid three">
                {#each [{value:"straight",label:"直线"},{value:"smooth",label:"平滑"},{value:"step",label:"阶梯"}] as item}
                    <button type="button" class:active={config.detail.lineCurve === item.value} aria-pressed={config.detail.lineCurve === item.value} onclick={() => config.detail.lineCurve = item.value as typeof config.detail.lineCurve}>{item.label}</button>
                {/each}
            </div></fieldset>
            <fieldset><legend>线条样式</legend><div class="choice-grid three">
                {#each [{value:"solid",label:"实线"},{value:"dashed",label:"虚线"},{value:"dotted",label:"点线"}] as item}
                    <button type="button" class:active={config.detail.lineStyle === item.value} aria-pressed={config.detail.lineStyle === item.value} onclick={() => config.detail.lineStyle = item.value as typeof config.detail.lineStyle}>{item.label}</button>
                {/each}
            </div></fieldset>
            <label class="range-field"><span>线条粗细 <output>{config.appearance.lineWidth}px</output></span><input type="range" min="1" max="10" bind:value={config.appearance.lineWidth} /></label>
            <label class="switch-row"><span><strong>显示数据点</strong><small>在每个数据位置显示标记</small></span><input type="checkbox" bind:checked={config.detail.lineShowSymbols} /></label>
            {#if config.detail.lineShowSymbols}<fieldset><legend>数据点形状</legend><div class="choice-grid three">
                {#each [{value:"circle",label:"圆形"},{value:"rect",label:"方形"},{value:"triangle",label:"三角"},{value:"diamond",label:"菱形"},{value:"pin",label:"图钉"},{value:"arrow",label:"箭头"}] as item}
                    <button type="button" class:active={config.detail.lineSymbol === item.value} aria-pressed={config.detail.lineSymbol === item.value} onclick={() => config.detail.lineSymbol = item.value as typeof config.detail.lineSymbol}>{item.label}</button>
                {/each}
            </div></fieldset><label class="range-field"><span>数据点大小 <output>{config.appearance.symbolSize}px</output></span><input type="range" min="2" max="30" bind:value={config.appearance.symbolSize} /></label>{/if}
            {#if config.chartType === "line"}<label class="switch-row"><span><strong>填充线下区域</strong><small>让折线图同时表现数值规模</small></span><input type="checkbox" bind:checked={config.appearance.showArea} /></label>{/if}
            {#if config.chartType === "area" || config.appearance.showArea}<label class="range-field"><span>填充深浅 <output>{config.detail.lineAreaOpacity}%</output></span><input type="range" min="5" max="70" bind:value={config.detail.lineAreaOpacity} /></label>{/if}
            <label class="switch-row"><span><strong>堆叠多个系列</strong><small>把各系列累加展示</small></span><input type="checkbox" bind:checked={config.appearance.stacked} /></label>
        {:else if barChart}
            <label class="range-field"><span>柱条宽度 <output>{config.detail.barWidth}px</output></span><input type="range" min="8" max="100" bind:value={config.detail.barWidth} /></label>
            <label class="range-field"><span>柱条间距 <output>{config.detail.barGap}%</output></span><input type="range" min="-50" max="100" bind:value={config.detail.barGap} /></label>
            <label class="range-field"><span>圆角大小 <output>{config.appearance.barRadius}px</output></span><input type="range" min="0" max="30" bind:value={config.appearance.barRadius} /></label>
            <label class="switch-row"><span><strong>显示柱条背景</strong><small>更容易看出各项剩余空间</small></span><input type="checkbox" bind:checked={config.detail.barShowBackground} /></label>
            <label class="switch-row"><span><strong>堆叠多个系列</strong><small>适合比较总量与内部构成</small></span><input type="checkbox" bind:checked={config.appearance.stacked} /></label>
        {:else if config.chartType === "progress"}
            <fieldset><legend>数值显示</legend><div class="choice-grid three">
                {#each [{value:"valueTarget",label:"当前值 / 目标"},{value:"percent",label:"完成百分比"},{value:"value",label:"仅当前值"}] as item}
                    <button type="button" class:active={config.detail.progressLabelMode === item.value} aria-pressed={config.detail.progressLabelMode === item.value} onclick={() => config.detail.progressLabelMode = item.value as typeof config.detail.progressLabelMode}>{item.label}</button>
                {/each}
            </div></fieldset>
            <fieldset><legend>数值位置</legend><div class="choice-grid two-column"><button type="button" class:active={config.detail.progressLabelPosition === "right"} aria-pressed={config.detail.progressLabelPosition === "right"} onclick={() => config.detail.progressLabelPosition = "right"}>进度条右侧</button><button type="button" class:active={config.detail.progressLabelPosition === "inside"} aria-pressed={config.detail.progressLabelPosition === "inside"} onclick={() => config.detail.progressLabelPosition = "inside"}>进度条内部</button></div></fieldset>
            <label>没有目标字段时，默认目标值<input type="number" min="0.000001" bind:value={config.detail.progressDefaultTarget} /></label>
            <label class="range-field"><span>进度条粗细 <output>{config.detail.progressBarHeight}px</output></span><input type="range" min="6" max="48" bind:value={config.detail.progressBarHeight} /></label>
            <label class="range-field"><span>轨道深浅 <output>{config.detail.progressTrackOpacity}%</output></span><input type="range" min="5" max="60" bind:value={config.detail.progressTrackOpacity} /></label>
            <label class="switch-row"><span><strong>使用圆角进度条</strong><small>关闭后显示为直角条形</small></span><input type="checkbox" bind:checked={config.detail.progressRounded} /></label>
        {:else if pieChart}
            <fieldset><legend>扇区形态</legend><div class="choice-grid three">
                {#each [{value:"none",label:"标准"},{value:"radius",label:"半径玫瑰"},{value:"area",label:"面积玫瑰"}] as item}
                    <button type="button" class:active={config.detail.pieRoseType === item.value} aria-pressed={config.detail.pieRoseType === item.value} onclick={() => config.detail.pieRoseType = item.value as typeof config.detail.pieRoseType}>{item.label}</button>
                {/each}
            </div></fieldset>
            <fieldset><legend>标签内容</legend><div class="choice-grid two-column">
                {#each [{value:"namePercent",label:"名称 + 占比"},{value:"name",label:"仅名称"},{value:"percent",label:"仅占比"},{value:"value",label:"仅数值"}] as item}
                    <button type="button" class:active={config.detail.pieLabelContent === item.value} aria-pressed={config.detail.pieLabelContent === item.value} onclick={() => config.detail.pieLabelContent = item.value as typeof config.detail.pieLabelContent}>{item.label}</button>
                {/each}
            </div></fieldset>
            <label class="range-field"><span>图形大小 <output>{config.detail.pieOuterRadius}%</output></span><input type="range" min="40" max="90" value={config.detail.pieOuterRadius} oninput={setPieOuterRadius} /></label>
            {#if config.chartType === "donut"}<label class="range-field"><span>中心留白 <output>{config.appearance.donutInnerRadius}%</output></span><input type="range" min="10" max={config.detail.pieOuterRadius - 5} bind:value={config.appearance.donutInnerRadius} /></label>{/if}
            <label class="range-field"><span>扇区间隔 <output>{config.detail.pieBorderWidth}px</output></span><input type="range" min="0" max="12" bind:value={config.detail.pieBorderWidth} /></label>
        {:else if config.chartType === "scatter"}
            <fieldset><legend>数据点形状</legend><div class="choice-grid three">
                {#each [{value:"circle",label:"圆形"},{value:"rect",label:"方形"},{value:"triangle",label:"三角"},{value:"diamond",label:"菱形"},{value:"pin",label:"图钉"}] as item}
                    <button type="button" class:active={config.detail.scatterSymbol === item.value} aria-pressed={config.detail.scatterSymbol === item.value} onclick={() => config.detail.scatterSymbol = item.value as typeof config.detail.scatterSymbol}>{item.label}</button>
                {/each}
            </div></fieldset>
            <label class="range-field"><span>数据点大小 <output>{config.appearance.symbolSize}px</output></span><input type="range" min="3" max="30" bind:value={config.appearance.symbolSize} /></label>
            <label class="range-field"><span>数据点透明度 <output>{config.detail.scatterOpacity}%</output></span><input type="range" min="10" max="100" bind:value={config.detail.scatterOpacity} /></label>
        {:else if config.chartType === "radar"}
            <fieldset><legend>网格形状</legend><div class="choice-grid two-column">
                <button type="button" class:active={config.detail.radarShape === "polygon"} aria-pressed={config.detail.radarShape === "polygon"} onclick={() => config.detail.radarShape = "polygon"}>多边形</button>
                <button type="button" class:active={config.detail.radarShape === "circle"} aria-pressed={config.detail.radarShape === "circle"} onclick={() => config.detail.radarShape = "circle"}>圆形</button>
            </div></fieldset>
            <label class="range-field"><span>网格层数 <output>{config.detail.radarSplitNumber}</output></span><input type="range" min="2" max="10" bind:value={config.detail.radarSplitNumber} /></label>
            <label class="range-field"><span>区域填充 <output>{config.detail.radarFillOpacity}%</output></span><input type="range" min="0" max="70" bind:value={config.detail.radarFillOpacity} /></label>
        {:else if config.chartType === "heatmap"}
            <label class="switch-row"><span><strong>显示颜色刻度</strong><small>帮助理解颜色代表的数值范围</small></span><input type="checkbox" bind:checked={config.detail.heatmapShowScale} /></label>
            <label class="switch-row"><span><strong>反转颜色方向</strong><small>让低值与高值交换颜色</small></span><input type="checkbox" bind:checked={config.detail.heatmapReverse} /></label>
            <label class="range-field"><span>单元格间隔 <output>{config.detail.heatmapBorderWidth}px</output></span><input type="range" min="0" max="8" bind:value={config.detail.heatmapBorderWidth} /></label>
        {:else if config.chartType === "funnel"}
            <fieldset><legend>阶段顺序</legend><div class="choice-grid three">
                {#each [{value:"descending",label:"从大到小"},{value:"ascending",label:"从小到大"},{value:"none",label:"按数据顺序"}] as item}
                    <button type="button" class:active={config.detail.funnelSort === item.value} aria-pressed={config.detail.funnelSort === item.value} onclick={() => config.detail.funnelSort = item.value as typeof config.detail.funnelSort}>{item.label}</button>
                {/each}
            </div></fieldset>
            <fieldset><legend>对齐方式</legend><div class="choice-grid three">
                {#each [{value:"left",label:"靠左"},{value:"center",label:"居中"},{value:"right",label:"靠右"}] as item}
                    <button type="button" class:active={config.detail.funnelAlign === item.value} aria-pressed={config.detail.funnelAlign === item.value} onclick={() => config.detail.funnelAlign = item.value as typeof config.detail.funnelAlign}>{item.label}</button>
                {/each}
            </div></fieldset>
            <label class="range-field"><span>阶段间距 <output>{config.detail.funnelGap}px</output></span><input type="range" min="0" max="30" bind:value={config.detail.funnelGap} /></label>
        {:else if config.chartType === "gauge"}
            <div class="two-fields"><label>最小值<input type="number" bind:value={config.detail.gaugeMin} /></label><label>最大值<input type="number" min={config.detail.gaugeMin + 1} bind:value={config.detail.gaugeMax} /></label></div>
            <label class="range-field"><span>仪表环宽度 <output>{config.detail.gaugeProgressWidth}px</output></span><input type="range" min="4" max="40" bind:value={config.detail.gaugeProgressWidth} /></label>
            <label class="switch-row"><span><strong>显示指针</strong><small>关闭后只显示进度环和数值</small></span><input type="checkbox" bind:checked={config.detail.gaugeShowPointer} /></label>
        {:else if config.chartType === "treemap"}
            <label class="range-field"><span>矩形间距 <output>{config.detail.treemapGap}px</output></span><input type="range" min="0" max="16" bind:value={config.detail.treemapGap} /></label>
            <label class="switch-row"><span><strong>允许缩放和平移</strong><small>查看层级较深的数据</small></span><input type="checkbox" bind:checked={config.detail.treemapRoam} /></label>
            <label class="switch-row"><span><strong>显示层级路径</strong><small>显示当前所处的数据层级</small></span><input type="checkbox" bind:checked={config.detail.treemapBreadcrumb} /></label>
        {:else if config.chartType === "sunburst"}
            <label class="range-field"><span>中心留白 <output>{config.detail.sunburstInnerRadius}%</output></span><input type="range" min="0" max="70" bind:value={config.detail.sunburstInnerRadius} /></label>
            <fieldset><legend>标签方向</legend><div class="choice-grid three">
                {#each [{value:"radial",label:"沿半径"},{value:"tangential",label:"沿圆弧"},{value:"none",label:"水平"}] as item}
                    <button type="button" class:active={config.detail.sunburstLabelRotate === item.value} aria-pressed={config.detail.sunburstLabelRotate === item.value} onclick={() => config.detail.sunburstLabelRotate = item.value as typeof config.detail.sunburstLabelRotate}>{item.label}</button>
                {/each}
            </div></fieldset>
        {:else if config.chartType === "wordCloud"}
            <fieldset><legend>词云轮廓</legend><div class="choice-grid three">
                {#each [{value:"circle",label:"圆形"},{value:"cardioid",label:"心形"},{value:"diamond",label:"菱形"},{value:"triangle-forward",label:"三角形"},{value:"pentagon",label:"五边形"},{value:"star",label:"星形"}] as item}
                    <button type="button" class:active={config.detail.wordCloudShape === item.value} aria-pressed={config.detail.wordCloudShape === item.value} onclick={() => config.detail.wordCloudShape = item.value as typeof config.detail.wordCloudShape}>{item.label}</button>
                {/each}
            </div></fieldset>
            <fieldset><legend>文字方向</legend><div class="choice-grid three">
                {#each [{value:"none",label:"全部水平"},{value:"rightAngle",label:"横竖混排"},{value:"free",label:"自由旋转"}] as item}
                    <button type="button" class:active={config.detail.wordCloudRotation === item.value} aria-pressed={config.detail.wordCloudRotation === item.value} onclick={() => config.detail.wordCloudRotation = item.value as typeof config.detail.wordCloudRotation}>{item.label}</button>
                {/each}
            </div></fieldset>
            <div class="two-ranges"><label class="range-field"><span>最小字号 <output>{config.detail.wordCloudMinSize}px</output></span><input type="range" min="8" max="60" bind:value={config.detail.wordCloudMinSize} /></label><label class="range-field"><span>最大字号 <output>{config.detail.wordCloudMaxSize}px</output></span><input type="range" min="12" max="160" bind:value={config.detail.wordCloudMaxSize} /></label></div>
            <label class="range-field"><span>词语间距 <output>{config.detail.wordCloudGap}px</output></span><input type="range" min="2" max="30" bind:value={config.detail.wordCloudGap} /></label>
        {/if}
    </section>

    <section>
        <div class="section-heading"><div><h3>一键配色</h3><p>选择喜欢的方案，也可以逐个调整颜色。</p></div></div>
        <div class="palette-presets">
            {#each VISUAL_CHART_PALETTE_PRESETS as preset}
                <button type="button" aria-label={`使用${preset.label}配色`} onclick={() => applyPalette(preset.colors)}><span class="palette-dots">{#each preset.colors.slice(0, 5) as color}<i style={`--swatch:${color}`}></i>{/each}</span><strong>{preset.label}</strong></button>
            {/each}
        </div>
        <div class="custom-palette"><span>系列颜色</span><div class="color-list">
            {#each config.appearance.palette as color, index (index)}
                <div class="color-item" style={`--swatch:${color}`}><input type="color" value={color} aria-label={`调整第 ${index + 1} 个系列颜色`} oninput={(event) => setPaletteColor(index, event)} /><button type="button" aria-label={`删除第 ${index + 1} 个系列颜色`} disabled={config.appearance.palette.length <= 2} onclick={() => removePaletteColor(index)}>×</button></div>
            {/each}
            {#if config.appearance.palette.length < 12}<button type="button" class="add-color" onclick={addPaletteColor}>+ 添加颜色</button>{/if}
        </div></div>
    </section>

    <section>
        <div class="section-heading"><div><h3>标题与文字</h3><p>留空即可隐藏标题。</p></div></div>
        <label>图表标题<input bind:value={config.appearance.title} /></label>
        <label>副标题<input bind:value={config.appearance.subtitle} /></label>
        <label class="range-field"><span>文字大小 <output>{config.appearance.fontSize}px</output></span><input type="range" min="9" max="28" bind:value={config.appearance.fontSize} /></label>
        <label class="switch-row"><span><strong>文字跟随主题</strong><small>自动适配浅色和深色主题</small></span><input type="checkbox" checked={!config.appearance.textColor} onchange={setThemeText} /></label>
        {#if config.appearance.textColor}<label class="color-field"><span>文字颜色</span><input type="color" bind:value={config.appearance.textColor} /></label>{/if}
    </section>

    <section>
        <div class="section-heading"><div><h3>显示内容</h3><p>控制图表周围的信息，不影响数据本身。</p></div></div>
        {#if supportsLabels}<label class="switch-row"><span><strong>显示数据标签</strong><small>直接在图形旁显示名称或数值</small></span><input type="checkbox" bind:checked={config.appearance.showLabels} /></label>{/if}
        {#if supportsLegend}
            <label class="switch-row"><span><strong>显示图例</strong><small>帮助区分不同数据系列</small></span><input type="checkbox" bind:checked={config.appearance.showLegend} /></label>
            {#if config.appearance.showLegend}<fieldset><legend>图例位置</legend><div class="choice-grid four">
                {#each [{value:"top",label:"顶部"},{value:"bottom",label:"底部"},{value:"left",label:"左侧"},{value:"right",label:"右侧"}] as item}
                    <button type="button" class:active={config.appearance.legendPosition === item.value} aria-pressed={config.appearance.legendPosition === item.value} onclick={() => config.appearance.legendPosition = item.value as typeof config.appearance.legendPosition}>{item.label}</button>
                {/each}
            </div></fieldset>{/if}
        {/if}
        <label class="switch-row"><span><strong>透明背景</strong><small>让图表自然融入组件主题</small></span><input type="checkbox" checked={config.appearance.background === "transparent"} onchange={setTransparent} /></label>
        {#if config.appearance.background !== "transparent"}<label class="color-field"><span>背景颜色</span><input type="color" bind:value={config.appearance.background} /></label>{/if}
    </section>
</div>

<style>
    .style-inspector{display:flex;flex-direction:column;gap:10px}.style-inspector section{padding:14px;border:1px solid color-mix(in srgb,var(--b3-border-color) 76%,transparent);border-radius:12px;background:var(--b3-theme-surface)}.chart-context{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-color:color-mix(in srgb,var(--b3-theme-primary) 32%,var(--b3-border-color))!important;background:color-mix(in srgb,var(--b3-theme-primary) 7%,var(--b3-theme-surface))!important}.chart-context div{min-width:0;display:flex;flex-direction:column;gap:3px}.chart-context div>span{font-size:10px;color:var(--b3-theme-primary);font-weight:650}.chart-context strong{font-size:14px}.chart-context p,.section-heading p{margin:0;color:var(--b3-theme-on-surface);font-size:11px;line-height:1.5}.live-badge{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);font-size:9px}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px}.section-heading h3{margin:0 0 2px;font-size:13px}.style-inspector label{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;color:var(--b3-theme-on-surface);font-size:11px}.style-inspector label:last-child{margin-bottom:0}.style-inspector input:not([type="checkbox"]):not([type="range"]):not([type="color"]){width:100%;min-height:36px;box-sizing:border-box;border:1px solid var(--b3-border-color);border-radius:8px;padding:7px 9px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);font:inherit}.style-inspector fieldset{min-width:0;margin:0 0 12px;padding:0;border:0}.style-inspector legend{margin:0 0 6px;padding:0;color:var(--b3-theme-on-surface);font-size:11px}.choice-grid{display:grid;gap:6px}.choice-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.choice-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.choice-grid.two-column{grid-template-columns:repeat(2,minmax(0,1fr))}.choice-grid button,.palette-presets button,.add-color{min-height:36px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);font:inherit;font-size:10px;cursor:pointer;transition:border-color .18s ease,background .18s ease,color .18s ease}.choice-grid button:hover,.palette-presets button:hover,.add-color:hover{border-color:color-mix(in srgb,var(--b3-theme-primary) 55%,var(--b3-border-color))}.choice-grid button.active{border-color:var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 11%,transparent);color:var(--b3-theme-primary);font-weight:650}.range-field>span{display:flex;align-items:center;justify-content:space-between}.range-field output{color:var(--b3-theme-on-background);font-variant-numeric:tabular-nums}.range-field input{width:100%}.switch-row{min-height:42px;flex-direction:row!important;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--b3-border-color) 55%,transparent)}.switch-row>span{min-width:0;display:flex;flex-direction:column;gap:2px}.switch-row strong{color:var(--b3-theme-on-background);font-size:11px;font-weight:600}.switch-row small{font-size:9px;line-height:1.4}.switch-row input{flex:0 0 auto}.palette-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.palette-presets button{display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding:9px}.palette-presets strong{font-size:10px}.palette-dots{width:100%;display:flex;overflow:hidden;border-radius:5px}.palette-dots i{height:12px;flex:1;background:var(--swatch)}.custom-palette{margin-top:13px}.custom-palette>span{display:block;margin-bottom:7px;color:var(--b3-theme-on-surface);font-size:11px}.color-list{display:flex;flex-wrap:wrap;gap:7px}.color-item{position:relative;width:34px;height:34px;border:1px solid var(--b3-border-color);border-radius:9px;background:var(--swatch);overflow:visible}.color-item input{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;opacity:0;cursor:pointer}.color-item button{position:absolute;right:-5px;top:-7px;width:17px;height:17px;padding:0;border:1px solid var(--b3-border-color);border-radius:50%;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);font-size:12px;line-height:14px;cursor:pointer}.color-item button:disabled{display:none}.add-color{padding:0 9px}.color-field{min-height:42px;flex-direction:row!important;align-items:center;justify-content:space-between}.color-field input{width:48px;height:32px;padding:2px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background)}.two-fields,.two-ranges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.specific-settings{box-shadow:inset 3px 0 0 color-mix(in srgb,var(--b3-theme-primary) 68%,transparent)}button:focus-visible,input:focus-visible{outline:2px solid var(--b3-theme-primary);outline-offset:2px}@media(max-width:720px){.choice-grid.four{grid-template-columns:repeat(2,minmax(0,1fr))}.two-ranges{grid-template-columns:1fr}}
    @media(max-width:720px){.choice-grid button,.palette-presets button,.add-color{min-height:44px}.color-item{width:40px;height:40px}}
    @media(prefers-reduced-motion:reduce){.choice-grid button,.palette-presets button,.add-color{transition:none}}
</style>
