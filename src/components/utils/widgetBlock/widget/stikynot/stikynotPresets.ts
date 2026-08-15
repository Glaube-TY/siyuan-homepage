export interface StikynotStylePreset {
    value: string;
    label: string;
    image?: string;
    color?: "black" | "white";
}

export const STIKYNOT_STYLE_PRESETS: readonly StikynotStylePreset[] = Object.freeze([
    { value: "default", label: "默认" },
    { value: "kraftPaper", label: "牛皮纸", image: "kraftPaper.jpg", color: "black" },
    { value: "wood", label: "木纹", image: "wood.jpg", color: "white" },
    { value: "marble", label: "大理石", image: "marble.jpg", color: "black" },
    { value: "Ink", label: "水墨", image: "Ink.jpg", color: "black" },
    { value: "beach", label: "海滩", image: "beach.jpg", color: "black" },
    { value: "BlueSky", label: "蓝天", image: "BlueSky.jpg", color: "black" },
    { value: "sunsetHeart", label: "夕阳", image: "sunsetHeart.jpg", color: "black" },
    { value: "Stars", label: "星空", image: "Stars.jpg", color: "white" },
    { value: "waterDrop", label: "雨窗", image: "waterDrop.jpg", color: "black" },
    { value: "PinkPorcelain", label: "粉瓷", image: "PinkPorcelain.jpg", color: "black" },
]);

const PRESET_BY_VALUE = new Map(STIKYNOT_STYLE_PRESETS.map((preset) => [preset.value, preset]));

export function resolveStikynotStylePreset(value: unknown): StikynotStylePreset {
    return PRESET_BY_VALUE.get(typeof value === "string" ? value : "") ?? STIKYNOT_STYLE_PRESETS[0];
}
