<script lang="ts">
    export let customWeatherCity: string = "北京";
</script>

<div class="weather-settings">
    <div class="setting-item">
        <div class="form-group">
            <label for="weather-city">城市名称：</label>
            <input
                id="weather-city"
                type="text"
                bind:value={customWeatherCity}
                placeholder="例如：北京"
            />
        </div>
    </div>

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
    .weather {
        input[type="text"] {
            max-width: 100px;
        }
    }
</style>
