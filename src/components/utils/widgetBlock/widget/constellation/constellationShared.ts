export const CONSTELLATION_OPTIONS = [
    { value: "aries", label: "白羊" },
    { value: "taurus", label: "金牛" },
    { value: "gemini", label: "双子" },
    { value: "cancer", label: "巨蟹" },
    { value: "leo", label: "狮子" },
    { value: "virgo", label: "处女" },
    { value: "libra", label: "天秤" },
    { value: "scorpio", label: "天蝎" },
    { value: "sagittarius", label: "射手" },
    { value: "capricorn", label: "摩羯" },
    { value: "aquarius", label: "水瓶" },
    { value: "pisces", label: "双鱼" },
] as const;

export type ConstellationValue = (typeof CONSTELLATION_OPTIONS)[number]["value"];

export const CONSTELLATION_STYLE_OPTIONS = [
    { value: "classic", label: "经典" },
    { value: "elegant", label: "高级" },
] as const;

export type ConstellationStyle = (typeof CONSTELLATION_STYLE_OPTIONS)[number]["value"];

const DEFAULT_CONSTELLATION: ConstellationValue = "capricorn";

export function normalizeConstellationValue(raw: unknown): ConstellationValue {
    const text = typeof raw === "string" ? raw.trim() : "";
    const value = text.toLowerCase();
    const label = text.endsWith("座") ? text.slice(0, -1) : text;
    return (
        CONSTELLATION_OPTIONS.find(
            (option) => option.value === value || option.label === text || option.label === label,
        )?.value ?? DEFAULT_CONSTELLATION
    );
}

export function getConstellationDisplayName(value: unknown): string {
    const normalized = normalizeConstellationValue(value);
    return CONSTELLATION_OPTIONS.find((option) => option.value === normalized)?.label ?? "摩羯";
}

export function getConstellationApiValue(value: unknown): string {
    return normalizeConstellationValue(value);
}

export function normalizeConstellationStyle(raw: unknown): ConstellationStyle {
    return typeof raw === "string" && raw.trim().toLowerCase() === "elegant" ? "elegant" : "classic";
}
