<script lang="ts">
    export let customWeatherCityName: string = "";
    export let customWeatherCityCode: string = "";
    export let weatherStyle: string = "default";
</script>

<div class="weather-settings">
    <div class="setting-item">
        <div class="form-group">
            <label for="weather-city">样式：</label>
            <select id="weather-style" bind:value={weatherStyle}>
                <option value="default">默认</option>
                <option value="simple1">简约1👑</option>
                <option value="simple2">简约2👑</option>
            </select>
        </div>
    </div>
    {#if weatherStyle === "default" || weatherStyle === "simple1" || weatherStyle === "simple2"}
        <div class="setting-item">
            <div class="form-group">
                <label for="weather-city">城市名称：</label>
                <input
                    id="weather-city"
                    type="text"
                    bind:value={customWeatherCityName}
                    placeholder="例如：北京"
                />
            </div>
        </div>
        <div class="setting-item">
            <div class="form-group">
                <label for="weather-city">城市编码：</label>
                <input
                    id="weather-city"
                    type="text"
                    bind:value={customWeatherCityCode}
                    placeholder="例如：110000"
                />
            </div>
        </div>
        <div class="setting-item">
            城市编码为 6 位数字，例如：110000 为北京，即当地身份证前 6 位。<br
            />
            若两个都填写，则优先用城市编码查询，因为这会更加精确。
        </div>
    {/if}

    <div class="component-help">
        <hr />
        <div>
            组件说明：<a
                href="https://ttl8ygt82u.feishu.cn/wiki/ER44wITRDi0m8okvcsGcxtZInix?from=from_copylink"
                target="_blank">今日天气</a
            >
        </div>
    </div>
</div>

<style lang="scss">
</style>
