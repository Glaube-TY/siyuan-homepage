<script lang="ts">
    import { onMount } from "svelte";

    export let city: string;
    export let temperature: string;
    export let weather: string;
    export let plugin: any;

    let locationIconPath: string = "";
    let weatherIconPath: string = "";
    let BGImgPath: string = "";
    let displayCity: string = "";

    // 城市名称裁剪函数
    function truncateCityName(cityName: string): string {
        if (cityName.length > 5) {
            return cityName.substring(0, 5) + "…";
        }
        return cityName;
    }

    // 天气图标映射表
    const weatherIconMap: { [key: string]: string } = {
        // 晴天相关
        晴: "晴.svg",
        晴天: "晴.svg",
        晴朗: "晴.svg",
        多云: "多云.svg",
        少云: "多云.svg",
        疏云: "多云.svg",
        晴间多云: "多云.svg",
        晴转多云: "多云.svg",

        // 阴天相关
        阴: "阴.svg",
        阴天: "阴.svg",
        阴霾: "阴.svg",
        阴郁: "阴.svg",
        阴转晴: "阴.svg",
        晴转阴: "阴.svg",

        // 雪天相关
        小雪: "小雪.svg",
        中雪: "中雪.svg",
        大雪: "大雪.svg",
        暴雪: "大雪.svg",
        雪: "小雪.svg",
        阵雪: "小雪.svg",
        雨夹雪: "小雪.svg",
        小雪转中雪: "中雪.svg",
        中雪转大雪: "大雪.svg",

        // 雨天相关（使用对应的雨图标）
        小雨: "小雨.svg",
        中雨: "中雨.svg",
        大雨: "大雨.svg",
        暴雨: "暴雨.svg",
        雷阵雨: "雷阵雨.svg",
        阵雨: "阵雨.svg",
        雨: "小雨.svg",
        雷雨: "雷阵雨.svg",
        雷暴: "雷阵雨.svg",
        强降雨: "大雨.svg",
        暴雨到大暴雨: "暴雨.svg",
        大暴雨: "暴雨.svg",

        // 雾天相关
        雾: "雾.svg",
        浓雾: "雾.svg",
        薄雾: "雾.svg",
        雾霾: "霾.svg",
        霾: "霾.svg",
        雾霾天气: "霾.svg",
        重度雾霾: "霾.svg",
        轻度雾霾: "霾.svg",

        // 极端天气
        沙尘暴: "沙尘暴 .svg",
        沙尘: "沙尘暴 .svg",
        扬沙: "沙尘暴 .svg",
        龙卷风: "龙卷风.svg",
        台风: "龙卷风.svg",
        飓风: "龙卷风.svg",
        冰雹: "冰雹.svg",
        霜冻: "霜冻.svg",
        霜: "霜冻.svg",
        结冰: "霜冻.svg",

        // 默认图标
        default: "多云.svg",
    };

    onMount(() => {
        // 裁剪城市名称
        setInterval(() => {
            displayCity = truncateCityName(city);
        }, 1000);

        locationIconPath =
            `${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/Icon/location1.svg`.replace(
                /\\/g,
                "/",
            );

        // 定时更新图标
        setInterval(() => {
            const iconFile =
                weatherIconMap[weather] || weatherIconMap["default"];
            weatherIconPath =
                `${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/Icon/${iconFile}`.replace(
                    /\\/g,
                    "/",
                );
        }, 1000);

        BGImgPath =
            `${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/weatherImg/BGImg1.jpg`.replace(
                /\\/g,
                "/",
            );
    });
</script>

<div class="content-display-tradition1">
    <svg viewBox="0 0 100 100">
        <image href={BGImgPath} x="0" y="0" width="100" height="100" />

        {#if weatherIconPath}
            <image href={weatherIconPath} x="50" y="5" width="40" height="40" />
        {/if}

        {#if locationIconPath}
            <image
                href={locationIconPath}
                x="5"
                y="50"
                width="12"
                height="12"
            />
        {/if}

        <text x="20" y="58" font-size="8" fill="#FDFFFE">{displayCity}</text>
        <text
            x="5"
            y="85"
            font-size="25"
            font-weight="bold"
            font-family="Arial"
            fill="white">{temperature}℃</text
        >
        <text x="5" y="95" font-size="8" font-family="Arial" fill="white"
            >C U R R E N T</text
        >
    </svg>
</div>

<style lang="scss">
    .content-display-tradition1 {
        width: 100%;
        height: 100%;
    }
</style>
