<script lang="ts">
    import { onMount } from "svelte";

    export let city: string;
    export let temperature: string;
    export let weather: string;
    export let humidity: string;
    export let wind_direction: string;
    export let wind_power: string;
    export let plugin: any;

    let weatherIconPath: string = "";
    let displayCity: string = "";

    let advancedEnabled = false;

    // 城市名称裁剪函数
    function truncateCityName(cityName: string): string {
        if (cityName.length > 5) {
            return cityName.substring(0, 5) + "…";
        }
        return cityName;
    }

    // 天气渐变颜色映射表（右上角颜色）- 极低饱和度版本
    const weatherGradientMap: { [key: string]: string } = {
        // 晴天相关 - 极柔和的暖色调
        晴: "#FFF5CC",
        晴天: "#FFF5CC",
        晴朗: "#FFF5CC",
        多云: "#E6F3FF",
        少云: "#E6F3FF",
        疏云: "#E6F3FF",
        晴间多云: "#E6F3FF",
        晴转多云: "#E6F3FF",

        // 阴天相关 - 极柔和的灰色调
        阴: "#F0F0F0",
        阴天: "#F0F0F0",
        阴霾: "#F0F0F0",
        阴郁: "#F0F0F0",
        阴转晴: "#F0F0F0",
        晴转阴: "#F0F0F0",

        // 雪天相关 - 极柔和的冷色调
        小雪: "#F5F9FF",
        中雪: "#F0F5FF",
        大雪: "#EBF0FF",
        暴雪: "#E6EBFF",
        雪: "#F5F9FF",
        阵雪: "#F5F9FF",
        雨夹雪: "#F5F9FF",
        小雪转中雪: "#F0F5FF",
        中雪转大雪: "#EBF0FF",

        // 雨天相关 - 极柔和的蓝色调
        小雨: "#E6F0FF",
        中雨: "#E0EBFF",
        大雨: "#DAE6FF",
        暴雨: "#D4E1FF",
        雷阵雨: "#E6E6FF",
        阵雨: "#E6F0FF",
        雨: "#E6F0FF",
        雷雨: "#E6E6FF",
        雷暴: "#E6E6FF",
        强降雨: "#DAE6FF",
        暴雨到大暴雨: "#D4E1FF",
        大暴雨: "#D4E1FF",

        // 雾天相关 - 极柔和的浅灰色调
        雾: "#F8F8F8",
        浓雾: "#F0F0F0",
        薄雾: "#FCFCFC",
        雾霾: "#E0E0E0",
        霾: "#E0E0E0",
        雾霾天气: "#E0E0E0",
        重度雾霾: "#C0C0C0",
        轻度雾霾: "#E8E8E8",

        // 极端天气 - 极柔和的深色调
        沙尘暴: "#F0E6D6",
        沙尘: "#F0E6D6",
        扬沙: "#F0E6D6",
        龙卷风: "#E8DED0",
        台风: "#E8DED0",
        飓风: "#E8DED0",
        冰雹: "#F0F2F5",
        霜冻: "#F0F2F5",
        霜: "#F0F2F5",
        结冰: "#F0F2F5",

        // 默认颜色
        default: "#E6F3FF",
    };

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
        advancedEnabled = plugin.ADVANCED;

        // 裁剪城市名称
        setInterval(() => {
            displayCity = truncateCityName(city);
        }, 1000);

        // 定时更新图标
        setInterval(() => {
            const iconFile =
                weatherIconMap[weather] || weatherIconMap["default"];
            weatherIconPath = `/plugins/siyuan-homepage/asset/Icon/${iconFile}`;
        }, 500);
    });
</script>

<div class="content-display-simple1">
    {#if advancedEnabled}
        <svg viewBox="0 0 100 100">
            <!-- 渐变定义 -->
            <defs>
                <linearGradient
                    id="weatherGradient"
                    x1="100%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                >
                    <stop
                        offset="0%"
                        stop-color={weatherGradientMap[weather] ||
                            weatherGradientMap["default"]}
                    />
                    <stop offset="50%" stop-color="#C0E3FF" />
                    <stop offset="100%" stop-color="#C0E3FF" />
                </linearGradient>
            </defs>

            <!-- 使用渐变填充的背景矩形 -->
            <rect
                x="0"
                y="0"
                width="100"
                height="100"
                fill="url(#weatherGradient)"
            />

            <text
                x="10"
                y="30"
                font-size="25"
                font-weight="bold"
                font-family="Arial"
                fill="black">{temperature}°</text
            >

            {#if weatherIconPath}
                <image
                    href={weatherIconPath}
                    x="60"
                    y="10"
                    width="30"
                    height="30"
                />
            {/if}

            <text x="10" y="40" font-size="8" fill="black">{displayCity}</text>

            <text x="10" y="52" font-size="8" fill="black">{weather}</text>

            <rect
                x="5"
                y="65"
                width="90"
                height="30"
                fill="white"
                rx="5"
                ry="5"
            />

            <text x="20" y="76" font-size="6" fill="black" text-anchor="middle"
                >{humidity}%</text
            >
            <text
                x="20"
                y="86"
                font-size="5"
                fill="#2A2B2E"
                text-anchor="middle">湿度</text
            >

            <text x="50" y="76" font-size="6" fill="black" text-anchor="middle"
                >{wind_direction}</text
            >
            <text
                x="50"
                y="86"
                font-size="5"
                fill="#2A2B2E"
                text-anchor="middle">风向</text
            >

            <text x="80" y="76" font-size="6" fill="black" text-anchor="middle"
                >{wind_power}级</text
            >
            <text
                x="80"
                y="86"
                font-size="5"
                fill="#2A2B2E"
                text-anchor="middle">风力</text
            >
        </svg>
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在"主页设置"→"会员服务"中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display-simple1 {
        width: 100%;
        height: 100%;

        .content-not-advanced {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            text-align: center;
            color: #666;
        }
    }
</style>
