export type ProtyleDisplayPreset = "standard" | "compact" | "immersive" | "custom";
export type ProtyleContentWidthMode = "system" | "full";
export type ProtyleContentPadding = "system" | 0 | 4 | 8 | 12 | 16 | 24;
export type ProtyleOuterPadding = 0 | 4 | 8 | 12 | 16 | 24;

export interface ProtyleDisplayConfig {
    displayPreset: ProtyleDisplayPreset;
    showBreadcrumb: boolean;
    showDocumentTitle: boolean;
    contentWidthMode: ProtyleContentWidthMode;
    outerPadding: ProtyleOuterPadding;
    contentPadding: ProtyleContentPadding;
    innerCard: boolean;
}

export const PROTYLE_OUTER_PADDING_OPTIONS: readonly ProtyleOuterPadding[] = [0, 4, 8, 12, 16, 24];
export const PROTYLE_CONTENT_PADDING_OPTIONS: readonly ProtyleContentPadding[] = ["system", 0, 4, 8, 12, 16, 24];

export const PROTYLE_DISPLAY_PRESETS: Readonly<Record<Exclude<ProtyleDisplayPreset, "custom">, ProtyleDisplayConfig>> = {
    standard: {
        displayPreset: "standard",
        showBreadcrumb: true,
        showDocumentTitle: true,
        contentWidthMode: "system",
        outerPadding: 16,
        contentPadding: "system",
        innerCard: true,
    },
    compact: {
        displayPreset: "compact",
        showBreadcrumb: true,
        showDocumentTitle: true,
        contentWidthMode: "full",
        outerPadding: 8,
        contentPadding: 12,
        innerCard: false,
    },
    immersive: {
        displayPreset: "immersive",
        showBreadcrumb: false,
        showDocumentTitle: false,
        contentWidthMode: "full",
        outerPadding: 0,
        contentPadding: 8,
        innerCard: false,
    },
};

const PRESET_NAMES = new Set<ProtyleDisplayPreset>(["standard", "compact", "immersive", "custom"]);
const WIDTH_MODES = new Set<ProtyleContentWidthMode>(["system", "full"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOuterPadding(value: unknown, fallback: ProtyleOuterPadding): ProtyleOuterPadding {
    return PROTYLE_OUTER_PADDING_OPTIONS.includes(value as ProtyleOuterPadding)
        ? value as ProtyleOuterPadding
        : fallback;
}

function normalizeContentPadding(value: unknown, fallback: ProtyleContentPadding): ProtyleContentPadding {
    return PROTYLE_CONTENT_PADDING_OPTIONS.includes(value as ProtyleContentPadding)
        ? value as ProtyleContentPadding
        : fallback;
}

export function getProtyleDisplayPreset(
    preset: Exclude<ProtyleDisplayPreset, "custom">,
): ProtyleDisplayConfig {
    return { ...PROTYLE_DISPLAY_PRESETS[preset] };
}

/**
 * 旧组件没有任何显示字段时按 standard 解析，保证升级前后的视觉行为不变。
 * 新组件创建表单应显式传 compact 作为 fallbackPreset。
 */
export function normalizeProtyleDisplayConfig(
    raw: unknown,
    fallbackPreset: Exclude<ProtyleDisplayPreset, "custom"> = "standard",
): ProtyleDisplayConfig {
    const source = isRecord(raw) ? raw : {};
    const requestedPreset = typeof source.displayPreset === "string" && PRESET_NAMES.has(source.displayPreset as ProtyleDisplayPreset)
        ? source.displayPreset as ProtyleDisplayPreset
        : fallbackPreset;
    const basePreset = requestedPreset === "custom" ? fallbackPreset : requestedPreset;
    const base = getProtyleDisplayPreset(basePreset);
    return {
        displayPreset: requestedPreset,
        showBreadcrumb: typeof source.showBreadcrumb === "boolean" ? source.showBreadcrumb : base.showBreadcrumb,
        showDocumentTitle: typeof source.showDocumentTitle === "boolean" ? source.showDocumentTitle : base.showDocumentTitle,
        contentWidthMode: typeof source.contentWidthMode === "string" && WIDTH_MODES.has(source.contentWidthMode as ProtyleContentWidthMode)
            ? source.contentWidthMode as ProtyleContentWidthMode
            : base.contentWidthMode,
        outerPadding: normalizeOuterPadding(source.outerPadding, base.outerPadding),
        contentPadding: normalizeContentPadding(source.contentPadding, base.contentPadding),
        innerCard: typeof source.innerCard === "boolean" ? source.innerCard : base.innerCard,
    };
}

export function toCustomProtyleDisplayConfig(
    config: Omit<ProtyleDisplayConfig, "displayPreset">,
): ProtyleDisplayConfig {
    const { displayPreset: _ignored, ...values } = config as ProtyleDisplayConfig;
    return { ...values, displayPreset: "custom" };
}
