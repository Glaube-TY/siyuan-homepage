<script lang="ts">
    import { run } from 'svelte/legacy';
    import { getAttributeView } from "@/api";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled: boolean;
        databaseChartID?: string;
        databaseChartTitle?: string;
        databaseChartType?: string;
        databaseChartLineType?: string;
        databaseChartLineXAxisSource?: string;
        databaseChartLineXAxisTitle?: string;
        databaseChartLineYAxisSource?: string[];
        databaseChartLineYAxisTitle?: string;
        databaseChartLineCountColumn?: string;
        databaseChartLineCountXAxisTitle?: string;
        databaseChartLineCountYAxisTitle?: string;
        databaseChartLineSmooth?: boolean;
        databaseChartLineWidth?: number;
        databaseChartLineStyle?: string;
        databaseChartLineMarkPoint?: string;
        databaseChartLineMarkPointSize?: number;
        databaseChartLineCountSort?: string;
    }

    let {
        advancedEnabled,
        databaseChartID = $bindable(""),
        databaseChartTitle = $bindable(""),
        databaseChartType = $bindable("line"),
        databaseChartLineType = $bindable("XY"),
        databaseChartLineXAxisSource = $bindable(""),
        databaseChartLineXAxisTitle = $bindable(""),
        databaseChartLineYAxisSource = $bindable([]),
        databaseChartLineYAxisTitle = $bindable(""),
        databaseChartLineCountColumn = $bindable(""),
        databaseChartLineCountXAxisTitle = $bindable(""),
        databaseChartLineCountYAxisTitle = $bindable(""),
        databaseChartLineSmooth = $bindable(false),
        databaseChartLineWidth = $bindable(2),
        databaseChartLineStyle = $bindable("solid"),
        databaseChartLineMarkPoint = $bindable("circle"),
        databaseChartLineMarkPointSize = $bindable(8),
        databaseChartLineCountSort = $bindable("none")
    }: Props = $props();

    let databaseChartInfo: any[] = $state([]);
    let confirmDatabaseChartID: boolean = $state(false);

    async function getDatabase() {
        if (!databaseChartID) return;
        try {
            const av = await getAttributeView(databaseChartID);
            if (av) {
                databaseChartInfo = av.keyValues || [];
                confirmDatabaseChartID = true;
            } else {
                confirmDatabaseChartID = false;
            }
        } catch (error) {
            confirmDatabaseChartID = false;
        }
    }

    run(() => {
        if (databaseChartID) {
            getDatabase();
        }
    });
</script>

{#if advancedEnabled}
    <SettingSection title="基础配置">
        <SettingRow title="数据库ID">
            <input
                type="text"
                placeholder="请输入数据库ID"
                bind:value={databaseChartID}
                class="control-full"
            />
        </SettingRow>
    </SettingSection>

    {#if confirmDatabaseChartID}
        <SettingSection title="图表配置">
            <SettingRow title="图表类型">
                <select bind:value={databaseChartType} class="control-sm">
                    <option value="line">折线图</option>
                    <option value="bar">柱状图</option>
                    <option value="pie">饼图</option>
                    <option value="point">散点图</option>
                </select>
            </SettingRow>
            <SettingRow title="图表标题">
                <input
                    type="text"
                    placeholder="请输入图表标题"
                    bind:value={databaseChartTitle}
                    class="control-full"
                />
            </SettingRow>
        </SettingSection>

        {#if databaseChartType === "line"}
            <SettingSection title="折线图配置">
                <SettingRow title="数据类型">
                    <select bind:value={databaseChartLineType} class="control-sm">
                        <option value="XY">XY轴</option>
                        <option value="count">数量</option>
                    </select>
                </SettingRow>
            </SettingSection>

            {#if databaseChartLineType === "XY"}
                <SettingSection title="XY轴数据映射">
                    <div class="data-mapping-block">
                        <div class="mapping-row">
                            <span class="mapping-label">X轴来源</span>
                            <select bind:value={databaseChartLineXAxisSource}>
                                {#each databaseChartInfo as column}
                                    {#if column.key.type === "block" || column.key.type === "text" || column.key.type === "number" || column.key.type === "date" || column.key.type === "select" || column.key.type === "url" || column.key.type === "email" || column.key.type === "phone"}
                                        <option value={column.key.id}>
                                            {column.key.name} ({column.key.type})
                                        </option>
                                    {/if}
                                {/each}
                            </select>
                        </div>
                        <div class="mapping-row">
                            <span class="mapping-label">X轴标题</span>
                            <input
                                type="text"
                                placeholder="请输入X轴标题"
                                bind:value={databaseChartLineXAxisTitle}
                            />
                        </div>
                        <div class="mapping-row">
                            <span class="mapping-label">Y轴来源（多选）</span>
                            <div class="multi-select-wrapper">
                                <select
                                    multiple
                                    bind:value={databaseChartLineYAxisSource}
                                    size="3"
                                    class="mapping-multiselect"
                                >
                                    {#each databaseChartInfo as column}
                                        {#if column.key.type === "number"}
                                            <option value={column.key.id}>
                                                {column.key.name} ({column.key.type})
                                            </option>
                                        {/if}
                                    {/each}
                                </select>
                            </div>
                        </div>
                        <div class="mapping-row">
                            <span class="mapping-label">Y轴标题</span>
                            <input
                                type="text"
                                placeholder="请输入Y轴标题"
                                bind:value={databaseChartLineYAxisTitle}
                            />
                        </div>
                    </div>
                </SettingSection>
            {:else if databaseChartLineType === "count"}
                <SettingSection title="数量统计配置">
                    <div class="data-mapping-block">
                        <div class="mapping-row">
                            <span class="mapping-label">统计列</span>
                            <select bind:value={databaseChartLineCountColumn}>
                                {#each databaseChartInfo as column}
                                    {#if column.key.type === "block" || column.key.type === "text" || column.key.type === "number" || column.key.type === "date" || column.key.type === "select" || column.key.type === "url" || column.key.type === "email" || column.key.type === "phone"}
                                        <option value={column.key.id}>
                                            {column.key.name} ({column.key.type})
                                        </option>
                                    {/if}
                                {/each}
                            </select>
                        </div>
                        <div class="mapping-row">
                            <span class="mapping-label">X轴标题</span>
                            <input
                                type="text"
                                bind:value={databaseChartLineCountXAxisTitle}
                            />
                        </div>
                        <div class="mapping-row">
                            <span class="mapping-label">Y轴标题</span>
                            <input
                                type="text"
                                bind:value={databaseChartLineCountYAxisTitle}
                            />
                        </div>
                    </div>
                </SettingSection>
            {/if}

            <SettingSection title="样式配置">
                <SettingRow title="平滑曲线">
                    <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={databaseChartLineSmooth} />
                </SettingRow>
                <SettingRow title="线条宽度">
                    <input type="number" bind:value={databaseChartLineWidth} class="control-xs" />
                </SettingRow>
                <SettingRow title="线条样式">
                    <select bind:value={databaseChartLineStyle} class="control-sm">
                        <option value="solid">实线</option>
                        <option value="dashed">虚线</option>
                        <option value="dotted">点线</option>
                    </select>
                </SettingRow>
                <SettingRow title="标记点">
                    <select bind:value={databaseChartLineMarkPoint} class="control-sm">
                        <option value="circle">圆点</option>
                        <option value="rect">矩形</option>
                        <option value="roundRect">圆角矩形</option>
                        <option value="triangle">三角形</option>
                        <option value="diamond">菱形</option>
                        <option value="pin">大头针</option>
                        <option value="arrow">箭头</option>
                        <option value="none">无</option>
                    </select>
                </SettingRow>
                <SettingRow title="标记点大小">
                    <input type="number" bind:value={databaseChartLineMarkPointSize} class="control-xs" />
                </SettingRow>
                <SettingRow title="排序方式">
                    <select bind:value={databaseChartLineCountSort} class="control-sm">
                        <option value="none">无</option>
                        <option value="asc">升序</option>
                        <option value="desc">降序</option>
                    </select>
                </SettingRow>
            </SettingSection>
        {:else if databaseChartType === "bar"}
            <SettingSection>
                <div class="dev-notice">开发中……</div>
            </SettingSection>
        {:else if databaseChartType === "pie"}
            <SettingSection>
                <div class="dev-notice">开发中……</div>
            </SettingSection>
        {:else if databaseChartType === "point"}
            <SettingSection>
                <div class="dev-notice">开发中……</div>
            </SettingSection>
        {/if}
    {/if}
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
<p>组件开发中~</p>

<style lang="scss">
    .data-mapping-block {
        padding: 1rem;
        background-color: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        
        .mapping-row {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 0.75rem;
            
            &:last-child {
                margin-bottom: 0;
            }
            
            .mapping-label {
                min-width: 120px;
                font-weight: 500;
                color: var(--b3-theme-on-surface);
            }
            
            input[type="text"],
            select {
                flex: 1;
                padding: 6px 10px;
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
                min-height: 80px;
            }
        }
        
        .multi-select-wrapper {
            flex: 1;
        }
    }
    
    .dev-notice {
        padding: 1rem;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
    }
</style>