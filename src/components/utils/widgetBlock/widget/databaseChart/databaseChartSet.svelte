<script lang="ts">
    export let plugin: any;
    export let advancedEnabled: boolean;
    export let databaseChartID: string = "";
    export let databaseChartTitle: string = "";
    export let databaseChartType: string = "line";
    export let databaseChartLineType: string = "XY";
    export let databaseChartLineXAxisSource: string = "";
    export let databaseChartLineXAxisTitle: string = "";
    export let databaseChartLineYAxisSource: string[] = [];
    export let databaseChartLineYAxisTitle: string = "";
    export let databaseChartLineCountColumn: string = "";
    export let databaseChartLineCountXAxisTitle: string = "";
    export let databaseChartLineCountYAxisTitle: string = "";
    export let databaseChartLineSmooth: boolean = false;
    export let databaseChartLineWidth: number = 2;
    export let databaseChartLineStyle: string = "solid";
    export let databaseChartLineMarkPoint: string = "circle";
    export let databaseChartLineMarkPointSize: number = 8;
    export let databaseChartLineCountSort: string = "none";

    let databaseChartInfo: any[] = [];
    let confirmDatabaseChartID: boolean = false;

    async function getDatabase() {
        if (!databaseChartID) return;
        try {
            const response = await fetch(
                "/api/av/getAttributeView",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Token ${plugin?.app?.api?.token}`,
                    },
                    body: JSON.stringify({
                        id: databaseChartID,
                    }),
                }
            );
            const data = await response.json();
            if (data.code === 0) {
                databaseChartInfo = data.data.keyValues || [];
                confirmDatabaseChartID = true;
            } else {
                confirmDatabaseChartID = false;
            }
        } catch (error) {
            confirmDatabaseChartID = false;
        }
    }

    $: if (databaseChartID) {
        getDatabase();
    }
</script>

{#if advancedEnabled}
    <div class="content-panel databaseChart">
        <div class="form-group">
            <label for="">数据库ID：</label>
            <input
                type="text"
                placeholder="请输入数据库ID"
                bind:value={databaseChartID}
            />
        </div>
        {#if confirmDatabaseChartID}
            <div class="form-group">
                <label for="">图表类型：</label>
                <select bind:value={databaseChartType}>
                    <option value="line">折线图</option>
                    <option value="bar">柱状图</option>
                    <option value="pie">饼图</option>
                    <option value="point">散点图</option>
                </select>
            </div>
            <div class="form-group">
                <label for="">图表标题：</label>
                <input
                    type="text"
                    placeholder="请输入图表标题"
                    bind:value={databaseChartTitle}
                />
            </div>
            {#if databaseChartType === "line"}
                <div class="database-chart-line-config">
                    <div class="form-group">
                        <label for="">数据类型：</label>
                        <select bind:value={databaseChartLineType}>
                            <option value="XY">XY轴</option>
                            <option value="count">数量</option>
                        </select>
                    </div>
                    {#if databaseChartLineType === "XY"}
                        <div class="database-chart-line-XY">
                            <div class="database-chart-x-axis">
                                <label for="">
                                    X轴来源：
                                    <select
                                        bind:value={
                                            databaseChartLineXAxisSource
                                        }
                                    >
                                        {#each databaseChartInfo as column}
                                            {#if column.type === "block" || column.type === "text" || column.type === "number" || column.type === "date" || column.type === "select" || column.type === "url" || column.type === "email" || column.type === "phone"}
                                                <option
                                                    value={column.id}
                                                >
                                                    {column.name}
                                                    ({column.type})
                                                </option>
                                            {/if}
                                        {/each}
                                    </select>
                                </label>
                                <label for="">X轴标题：</label>
                                <input
                                    type="text"
                                    placeholder="请输入X轴标题"
                                    bind:value={
                                        databaseChartLineXAxisTitle
                                    }
                                />
                            </div>
                            <div class="database-chart-y-axis">
                                <label for="">
                                    Y轴来源（多选）：
                                    <div
                                        class="multi-select-wrapper"
                                    >
                                        <select
                                            multiple
                                            bind:value={
                                                databaseChartLineYAxisSource
                                            }
                                            size="2.5"
                                            class="collapsed-multiselect"
                                        >
                                            {#each databaseChartInfo as column}
                                                {#if column.type === "number"}
                                                    <option
                                                        value={column.id}
                                                    >
                                                        {column.name}
                                                        ({column.type})
                                                    </option>
                                                {/if}
                                            {/each}
                                        </select>
                                    </div>
                                </label>
                                <label for="">Y轴标题：</label>
                                <input
                                    type="text"
                                    placeholder="请输入Y轴标题"
                                    bind:value={
                                        databaseChartLineYAxisTitle
                                    }
                                />
                            </div>
                        </div>
                    {:else if databaseChartLineType === "count"}
                        <div class="database-chart-count">
                            <label for=""
                                >统计列：
                                <select
                                    bind:value={
                                        databaseChartLineCountColumn
                                    }
                                >
                                    {#each databaseChartInfo as column}
                                        {#if column.type === "block" || column.type === "text" || column.type === "number" || column.type === "date" || column.type === "select" || column.type === "url" || column.type === "email" || column.type === "phone"}
                                            <option
                                                value={column.id}
                                            >
                                                {column.name}
                                                ({column.type})
                                            </option>
                                        {/if}
                                    {/each}
                                </select>
                            </label>
                            <div
                                class="database-chart-count-axis"
                            >
                                <label for="">X轴标题： </label>
                                <input
                                    type="text"
                                    bind:value={
                                        databaseChartLineCountXAxisTitle
                                    }
                                />
                                <label for="">Y轴标题： </label>
                                <input
                                    type="text"
                                    bind:value={
                                        databaseChartLineCountYAxisTitle
                                    }
                                />
                            </div>
                        </div>
                    {/if}
                    <div class="line-chart-style">
                        <div class="line-chart-style-item">
                            <label for=""
                                >平滑曲线：<input
                                    type="checkbox"
                                    bind:checked={
                                        databaseChartLineSmooth
                                    }
                                /></label
                            >
                            <label for=""
                                >线条宽度：
                                <input
                                    type="number"
                                    bind:value={
                                        databaseChartLineWidth
                                    }
                                />
                            </label>
                            <label for=""
                                >线条样式：
                                <select
                                    bind:value={
                                        databaseChartLineStyle
                                    }
                                >
                                    <option value="solid"
                                        >实线</option
                                    >
                                    <option value="dashed"
                                        >虚线</option
                                    >
                                    <option value="dotted"
                                        >点线</option
                                    >
                                </select>
                            </label>
                        </div>

                        <div class="line-chart-style-item">
                            <label for=""
                                >标记点：
                                <select
                                    bind:value={
                                        databaseChartLineMarkPoint
                                    }
                                >
                                    <option value="circle"
                                        >圆点</option
                                    >
                                    <option value="rect"
                                        >矩形</option
                                    >
                                    <option value="roundRect"
                                        >圆角矩形</option
                                    >
                                    <option value="triangle"
                                        >三角形</option
                                    >
                                    <option value="diamond"
                                        >菱形</option
                                    >
                                    <option value="pin"
                                        >大头针</option
                                    >
                                    <option value="arrow"
                                        >箭头</option
                                    >
                                    <option value="none"
                                        >无</option
                                    >
                                </select>
                            </label>
                            <label for=""
                                >标记点大小：
                                <input
                                    type="number"
                                    bind:value={
                                        databaseChartLineMarkPointSize
                                    }
                                />
                            </label>
                        </div>
                        <label for=""
                            >排序方式：
                            <select
                                bind:value={
                                    databaseChartLineCountSort
                                }
                            >
                                <option value="none">无</option>
                                <option value="asc">升序</option
                                >
                                <option value="desc"
                                    >降序</option
                                >
                            </select>
                        </label>
                    </div>
                </div>
            {:else if databaseChartType === "bar"}
                <div>
                    开发中……
                </div>
            {:else if databaseChartType === "pie"}
                <div>
                    开发中……
                </div>
            {:else if databaseChartType === "point"}
                <div>开发中……</div>
            {/if}
        {/if}
    </div>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
<hr>
<div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/TVpYw7TRPiG6hRksrYKc7oBjnmd?from=from_copylink" target="_blank">数据库图表</a></div>
<p>组件开发中~</p>

<style lang="scss">
    .content-panel.databaseChart {
        .form-group {
            margin-bottom: 15px;
            
            label {
                display: inline-block;
                margin-bottom: 5px;
                font-weight: 500;
            }
            
            input[type="text"],
            input[type="number"],
            select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                background-color: var(--b3-theme-background);
                color: var(--b3-theme-on-background);
                
                &:focus {
                    outline: none;
                    border-color: var(--b3-theme-primary);
                }
            }
            
            select[multiple] {
                height: auto;
                min-height: 80px;
            }
            
            .multi-select-wrapper {
                position: relative;
                
                select.collapsed-multiselect {
                    height: 38px;
                    overflow: hidden;
                    
                    &:focus {
                        height: auto;
                        min-height: 80px;
                        overflow: visible;
                    }
                }
            }
        }
        
        .database-chart-line-config,
        .database-chart-line-XY,
        .database-chart-count {
            margin-top: 15px;
            padding: 15px;
            border: 1px solid var(--b3-border-color);
            border-radius: 6px;
            background-color: var(--b3-theme-surface);
            
            .database-chart-x-axis,
            .database-chart-y-axis {
                margin-bottom: 15px;
                
                &:last-child {
                    margin-bottom: 0;
                }
            }
        }
        
        .line-chart-style {
            margin-top: 15px;
            padding: 15px;
            border: 1px solid var(--b3-border-color);
            border-radius: 6px;
            background-color: var(--b3-theme-surface);
            
            .line-chart-style-item {
                display: flex;
                gap: 15px;
                margin-bottom: 10px;
                
                &:last-child {
                    margin-bottom: 0;
                }
                
                label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    
                    input[type="checkbox"] {
                        margin: 0;
                    }
                    
                    input[type="number"] {
                        width: 80px;
                    }
                    
                    select {
                        width: auto;
                        min-width: 100px;
                    }
                }
            }
            
            > label {
                display: flex;
                align-items: center;
                gap: 8px;
                
                select {
                    width: auto;
                    min-width: 120px;
                }
            }
        }
    }
    
    @media (max-width: 768px) {
        .content-panel.databaseChart {
            .line-chart-style-item {
                flex-direction: column;
                gap: 10px;
            }
        }
    }
</style>