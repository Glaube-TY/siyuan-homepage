<script lang="ts">
    
    interface Props {
        // 热力图配置变量
        heatmapTitle?: string;
        pastMonthCount?: number;
        showLabel?: boolean;
        selectedColorPreset?: "github" | "blue" | "custom";
        customColor?: string;
        heatmapCountType?: string;
    }

    let {
        heatmapTitle = $bindable("📅创作热力图"),
        pastMonthCount = $bindable(6),
        showLabel = $bindable(true),
        selectedColorPreset = $bindable("github"),
        customColor = $bindable("#1ea769"),
        heatmapCountType = $bindable("block")
    }: Props = $props();
</script>

<div class="content-panel heatmap">
    <div class="form-group">
        <label for="heatmap-title">热力图标题：</label>
        <input type="text" id="heatmap-title" bind:value={heatmapTitle} />
    </div>
    <div class="form-group">
        <label for="month-count">显示范围：</label>
        <select id="month-count" bind:value={pastMonthCount}>
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as month}
                <option value={month}>前 {month} 个月</option>
            {/each}
        </select>

        <label for="show-label">
            显示标签：
            <input type="checkbox" id="show-label" bind:checked={showLabel} />
        </label>
    </div>

    <!-- 颜色选择 -->
    <div class="form-group">
        <label for="color-preset-select">选择区块颜色：</label>
        <select id="color-preset-select" bind:value={selectedColorPreset}>
            <option value="github">GitHub 绿色</option>
            <option value="blue">蓝色</option>
            <option value="custom">自定义颜色</option>
        </select>
    </div>

    <!-- 自定义颜色选择器 -->
    {#if selectedColorPreset === "custom"}
        <div class="form-group">
            <label for="custom-color-picker">选择基础颜色：</label>
            <input
                id="custom-color-picker"
                type="color"
                bind:value={customColor}
            />
        </div>
    {/if}

    <div class="form-group">
        <label for=""
            >计数类型：<select bind:value={heatmapCountType}>
                <option value="block">内容块</option>
                <option value="words">字数👑</option>
            </select></label
        >
        {#if heatmapCountType === "words"}
            <p>👑订阅会员专属</p>
            <p>字数统计的块类型为：</p>
            <p>段落块、标题块、列表块、代码块、公式块、引注块、表格块</p>
        {/if}
    </div>

    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/W2QjwU3DkiCMaok69yqcfV5knLc?from=from_copylink"
            target="_blank">热力图</a
        >
    </div>
</div>

<style lang="scss">
</style>