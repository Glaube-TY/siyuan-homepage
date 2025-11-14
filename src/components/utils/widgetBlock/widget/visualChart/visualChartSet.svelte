<script lang="ts">
    export let visualChartType: string = "progressBar";
</script>

<div class="visualChart-settings">
    <div class="setting-item">
        <div class="form-group">
            <label for="visualChart-type">
                图表类型：
                <select id="visualChart-type" bind:value={visualChartType}>
                    <option value="progressBar">进度条</option>
                    <option value="tagCloud">标签云图</option>
                </select>
            </label>
        </div>
    </div>

    <div class="component-help">
        <hr />
        <div>
            组件说明：<a
                href="https://ttl8ygt82u.feishu.cn/wiki/M7FzwiwMQiNdKXkrIrucpOtenxb?from=from_copylink"
                target="_blank">可视化图表</a
            >
        </div>
    </div>
</div>

<style lang="scss">
    
</style>
