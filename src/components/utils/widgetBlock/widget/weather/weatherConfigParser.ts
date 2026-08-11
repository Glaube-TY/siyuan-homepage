/**
 * 天气配置统一解析入口。
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
 */
export function parseWeatherConfig(data: Record<string, unknown> | undefined | null): WeatherConfig {
    if (!data || typeof data !== "object") {
        return { cityName: "", cityCode: "", weatherStyle: DEFAULT_WEATHER_STYLE };
    }

    const cityName = trimString(data.cityName);
    const cityCode = trimString(data.cityCode);
    const weatherStyle = trimString(data.weatherStyle) || DEFAULT_WEATHER_STYLE;

    return { cityName, cityCode, weatherStyle };
}
