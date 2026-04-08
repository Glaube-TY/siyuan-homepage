<script lang="ts">
    interface Props {
        visualChartType?: string;
    }

    let { visualChartType = $bindable("progressBar") }: Props = $props();
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
</div>

<style lang="scss">
    
</style>
