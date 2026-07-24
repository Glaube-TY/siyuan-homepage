/**
 * 天气配置统一解析入口。
 * 兼容 4.8.4 旧字段 data.city 和当前字段 data.cityName / data.cityCode / data.weatherStyle。
 */
export interface WeatherConfig {
    cityName: string;
    cityCode: string;
    weatherStyle: string;
}

const DEFAULT_WEATHER_STYLE = "default";

function trimString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * 从天气组件 data 中解析出 cityName、cityCode、weatherStyle。
 * 优先级：非空 data.cityName > 非空 data.city > ""。
 * cityCode 独立读取。
 */
export function parseWeatherConfig(data: Record<string, unknown> | undefined | null): WeatherConfig {
    if (!data || typeof data !== "object") {
        return { cityName: "", cityCode: "", weatherStyle: DEFAULT_WEATHER_STYLE };
    }

    const cityName = trimString(data.cityName) || trimString(data.city);
    const cityCode = trimString(data.cityCode);
    const weatherStyle = trimString(data.weatherStyle) || DEFAULT_WEATHER_STYLE;

    return { cityName, cityCode, weatherStyle };
}
