<script lang="ts">
    import { onMount } from "svelte";
    import { UapiClient } from "uapi-sdk-typescript";

    import Simple1 from "./_simple1.svelte";
    import Simple2 from "./_simple2.svelte";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin = $bindable(), contentTypeJson = "{}" }: Props = $props();

    const parsedContent = JSON.parse(contentTypeJson);
    const cityName = parsedContent?.data?.cityName || "";
    const cityCode = parsedContent?.data?.cityCode || "";
    const weatherStyle = parsedContent?.data?.weatherStyle || "default";

    let city: string = $state("加载中...");
    let temperature: string = $state("加载中...");
    let weather: string = $state("加载中...");
    let wind_direction: string = $state("加载中...");
    let wind_power: string = $state("加载中...");
    let humidity: string = $state("加载中...");
    let reportTime: string = $state("加载中...");
    let result: WeatherResponse | null = null;

    // 定义新的天气数据接口
    interface WeatherResponse {
        province: string;
        city: string;
        adcode: string;
        weather: string;
        temperature: number;
        wind_direction: string;
        wind_power: string;
        humidity: number;
        report_time: string;
    }

    async function loadWeather() {
        try {
            const client = new UapiClient("https://uapis.cn");
            const payload = {
                city: cityName,
                adcode: cityCode,
            };
            // @ts-ignore - 临时忽略类型检查
            const response = await client.misc.getMiscWeather(payload);

            return response;
        } catch (error) {
            console.error("uapis API调用失败:", error);
            // 可以在这里添加备用处理逻辑
        }
    }

    onMount(async () => {
        try {
            result = await loadWeather();

            // 处理新的接口数据格式
            if (result) {
                city = result.city || "未知城市";
                temperature =
                    result.temperature !== undefined
                        ? `${result.temperature}`
                        : "未知";
                weather = result.weather || "未知";

                wind_direction =
                    result.wind_direction && result.wind_direction !== "无"
                        ? `${result.wind_direction}`
                        : "未知";
                wind_power =
                    result.wind_power && result.wind_power !== "无"
                        ? `${result.wind_power}`
                        : "未知";
                humidity =
                    result.humidity !== undefined
                        ? `${result.humidity}`
                        : "未知";
                reportTime = result.report_time ? `${result.report_time}` : "";
            }
        } catch (error) {
            console.error("获取天气数据出错:", error);
            city =
                temperature =
                weather =
                wind_direction =
                wind_power =
                humidity =
                    "网络错误";
        }
    });
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
</svelte:head>

<div class="content-display">
    {#if weatherStyle === "default"}
        <div
            style="display: flex; flex-direction: column; padding: 1rem; overflow: auto;"
        >
            <h3 class="widget-title">🌦{city}的天气</h3>
            <div class="weather-content-container">
                <div class="weather-info-grid">
                    <div class="info-item">
                        <i class="fas fa-thermometer-half"></i>
                        <span id="temperature">{temperature}℃</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-cloud-sun"></i>
                        <span id="weather">{weather}</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-wind"></i>
                        <span id="wind-direction">{wind_direction}</span>
                        <span id="wind-power">{wind_power}级</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-tint"></i>
                        <span id="humidity">{humidity}%</span>
                    </div>
                </div>
                {#if reportTime}
                    <div class="report-time">更新时间：{reportTime}</div>
                {/if}
            </div>
        </div>
    {:else if weatherStyle === "simple1"}
        <Simple1 bind:city bind:temperature bind:weather bind:plugin />
    {:else if weatherStyle === "simple2"}
        <Simple2 bind:city bind:temperature bind:weather bind:humidity bind:wind_direction bind:wind_power bind:plugin />
    {/if}
</div>

<style lang="scss">
    .widget-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--b3-border-color);
        text-align: center;
        display: inline-block;
        line-height: 1.2;
    }

    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .weather-content-container {
        flex: 1;
        overflow-y: auto;
    }

    .weather-info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .info-item {
        background-color: var(--b3-theme-surface);
        padding: 0.75rem;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        font-size: 1rem;
        color: var(--b3-theme-primary);
        font-weight: bold;
    }

    .info-item i {
        margin-right: 8px;
        min-width: 20px;
        text-align: center;
    }

    .info-item i:hover {
        transform: scale(1.1);
        transition: transform 0.2s ease-in-out;
    }

    @media (max-width: 480px) {
        .widget-title {
            font-size: 16px;
        }
    }
</style>
