<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    let city: string = "加载中...";
    let temperature: string = "加载中...";
    let weather: string = "加载中...";
    let fengdu: string = "加载中...";
    let pm: string = "加载中...";
    let result: WeatherResponse | null = null;

    $: parsedContent = (() => {
        try {
            return JSON.parse(contentTypeJson);
        } catch (e) {
            console.error("解析配置失败:", e);
            return { data: {} };
        }
    })();
    $: cityName = parsedContent?.data?.city || "西安";

    // 定义天气数据接口
    interface WeatherItem {
        riqi: string;
        wendu: string;
        tianqi: string;
        fengdu: string;
        pm: string;
    }

    interface WeatherResponse {
        code: string | number;
        data?: WeatherItem[];
    }

    async function loadWeather(): Promise<WeatherResponse> {
        const url = `https://v.api.aa1.cn/api/api-tianqi-3/index.php?msg=${encodeURIComponent(cityName)}&type=1`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("请求失败");
        }

        return await response.json();
    }

    onMount(async () => {
        try {
            result = await loadWeather();

            if (
                (result.code === "1" || result.code === 1) &&
                result.data?.length > 0
            ) {
                const today = result.data[1];
                city = cityName;
                temperature = today.wendu;
                weather = today.tianqi;
                fengdu = today.fengdu;
                pm = today.pm;
            } else {
                city = temperature = weather = fengdu = pm = "获取失败";
            }
        } catch (error) {
            console.error("获取天气数据出错:", error);
            city = temperature = weather = "网络错误";
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
    <h3 class="widget-title">🌦{city}的天气</h3>

    <!-- 新增的天气内容容器 -->
    <div class="weather-content-container">
        <div class="weather-info-grid">
            <div class="info-item">
                <i class="fas fa-thermometer-half"></i>
                <span id="temperature">{temperature}</span>
            </div>
            <div class="info-item">
                <i class="fas fa-cloud-sun"></i>
                <span id="weather">{weather}</span>
            </div>
            <div class="info-item">
                <i class="fas fa-wind"></i>
                <span id="fengdu">{fengdu}</span>
            </div>
            <div class="info-item">
                <i class="fas fa-smog"></i>
                <span id="pm">{pm}</span>
            </div>
        </div>

        <div class="forecast">
            <h4>未来天气</h4>
            {#if result?.data}
                {#each result.data.slice(2) as forecasts}
                    {#if forecasts}
                        <div class="forecast-day">
                            <strong>{forecasts.riqi}</strong>: {forecasts.tianqi},
                            {forecasts.wendu}
                        </div>
                    {/if}
                {/each}
            {/if}
        </div>
    </div>
</div>

<style>
    .widget-title {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b; /* 深灰色 */
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid #e2e8f0; /* 淡灰色下边框 */
        text-align: center;
        display: inline-block;
        line-height: 1.2;
    }

    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        background-color: var(--bg3-color-dark);
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
        background-color: #f8fafc;
        padding: 0.75rem;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        font-size: 1rem;
        color: var(--text-primary);
    }

    .info-item i {
        margin-right: 8px;
        color: var(--accent-icon);
        min-width: 20px;
        text-align: center;
    }

    .info-item i:hover {
        transform: scale(1.1);
        transition: transform 0.2s ease-in-out;
        color: var(--primary-color);
    }

    .forecast {
        margin-top: 1rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-color);
        font-size: 0.9rem;
        color: var(--text-secondary);
    }

    .forecast h4 {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: var(--text-primary);
    }

    .forecast-day {
        margin-bottom: 0.5rem;
        line-height: 1.4;
        background-color: #f1f5f9;
        padding: 0.5rem;
        border-radius: 6px;
    }

    @media (max-width: 480px) {
        .widget-title {
            font-size: 16px;
        }

        .weather-info p {
            font-size: 0.95rem;
        }
    }
</style>
