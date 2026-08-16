export type WidgetAppearanceMode = "inherit" | "custom";

export interface WidgetAppearanceClassification {
    mode: WidgetAppearanceMode;
    geometryDeclarations: string;
    customAppearanceDeclarations: string;
    unknownDeclarations: string;
    runtimeStyle: string;
}

export interface WidgetStyleSnapshot {
    appearanceMode: WidgetAppearanceMode;
    rowSize: number | null;
    colSize: number | null;
    backgroundColor: string | null;
    backgroundOpacity: number | null;
    borderColor: string | null;
    borderWidth: number | null;
}

export interface WidgetStylePatch {
    rowSize?: number;
    colSize?: number;
    appearanceMode?: WidgetAppearanceMode;
    backgroundColor?: string;
    backgroundOpacity?: number;
    borderColor?: string;
    borderWidth?: number;
}

interface Declaration { property: string; value: string; raw: string; }

const GEOMETRY_PROPERTIES = new Set([
    "grid-column", "grid-column-start", "grid-column-end",
    "grid-row", "grid-row-start", "grid-row-end",
    "aspect-ratio", "width", "height", "min-width", "min-height", "max-width", "max-height",
]);

const APPEARANCE_PROPERTIES = new Set([
    "background", "background-color", "background-image", "background-opacity",
    "border", "border-color", "border-width", "border-style", "border-radius",
    "box-shadow", "transition", "opacity", "color",
]);

const HISTORICAL_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
    "background-color": ["rgba(0,0,0,0.03)"],
    border: ["2pxsolidvar(--b3-theme-primary)"],
    "box-shadow": ["02px6pxrgba(0,0,0,0.1)"],
    transition: ["all0.2sease-in-out"],
    "border-radius": ["8px"],
};

function compact(value: string): string {
    return value.toLowerCase().replace(/\s+/g, "");
}

function parseDeclarations(style: string | null | undefined): Declaration[] {
    if (!style) return [];
    const declarations: Declaration[] = [];
    for (const part of style.split(";")) {
        const separator = part.indexOf(":");
        if (separator <= 0) continue;
        const property = part.slice(0, separator).trim().toLowerCase();
        const value = part.slice(separator + 1).trim();
        if (!property || !value) continue;
        declarations.push({ property, value, raw: `${property}: ${value};` });
    }
    return declarations;
}

function lastValue(declarations: Declaration[], property: string): string | null {
    for (let index = declarations.length - 1; index >= 0; index -= 1) {
        if (declarations[index].property === property) return declarations[index].value;
    }
    return null;
}

function parseSpan(value: string | null): number | null {
    const size = Number(value?.match(/\bspan\s+(\d+)\b/i)?.[1]);
    return Number.isInteger(size) && size > 0 ? size : null;
}

function parseColor(value: string | null): { color: string | null; opacity: number | null } {
    if (!value) return { color: null, opacity: null };
    const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
    if (hex) return { color: `#${hex.toLowerCase()}`, opacity: 1 };
    const rgba = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i);
    if (!rgba) return { color: value, opacity: null };
    const toPair = (part: string) => Math.min(255, Math.max(0, Math.round(Number(part))))
        .toString(16)
        .padStart(2, "0");
    return {
        color: `#${toPair(rgba[1])}${toPair(rgba[2])}${toPair(rgba[3])}`,
        opacity: rgba[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgba[4]))),
    };
}

function rgba(hex: string, opacity: number): string {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("颜色必须是 #RRGGBB 格式");
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

/** 读取布局样式中的可编辑组件样式；配置中的尺寸用于兼容旧布局。 */
export function readWidgetStyle(
    style: string | null | undefined,
    config?: Record<string, unknown> | null,
): WidgetStyleSnapshot {
    const declarations = parseDeclarations(style);
    const background = parseColor(lastValue(declarations, "background-color"));
    const configuredRow = Number(config?.rowSize);
    const configuredCol = Number(config?.colSize);
    const borderWidth = Number.parseFloat(lastValue(declarations, "border-width") ?? "");
    return {
        appearanceMode: classifyWidgetAppearance(style).mode,
        rowSize: parseSpan(lastValue(declarations, "grid-row"))
            ?? (Number.isInteger(configuredRow) && configuredRow > 0 ? configuredRow : null),
        colSize: parseSpan(lastValue(declarations, "grid-column"))
            ?? (Number.isInteger(configuredCol) && configuredCol > 0 ? configuredCol : null),
        backgroundColor: background.color,
        backgroundOpacity: background.opacity,
        borderColor: lastValue(declarations, "border-color"),
        borderWidth: Number.isFinite(borderWidth) ? borderWidth : null,
    };
}

/** 在保留未知声明的前提下，只更新 Agent/UI 共同支持的组件样式字段。 */
export function applyWidgetStylePatch(
    style: string | null | undefined,
    patch: WidgetStylePatch,
): string | null {
    let declarations = parseDeclarations(style);
    const remove = (properties: ReadonlySet<string>) => {
        declarations = declarations.filter((item) => !properties.has(item.property));
    };
    const append = (property: string, value: string) => {
        declarations.push({ property, value, raw: `${property}: ${value};` });
    };

    if (patch.appearanceMode === "inherit") remove(APPEARANCE_PROPERTIES);
    if (patch.colSize !== undefined) {
        remove(new Set(["grid-column", "grid-column-start", "grid-column-end"]));
        append("grid-column", `span ${patch.colSize}`);
    }
    if (patch.rowSize !== undefined) {
        remove(new Set(["grid-row", "grid-row-start", "grid-row-end"]));
        append("grid-row", `span ${patch.rowSize}`);
    }

    if (patch.appearanceMode !== "inherit") {
        if (patch.backgroundColor !== undefined || patch.backgroundOpacity !== undefined) {
            const current = parseColor(lastValue(declarations, "background-color"));
            const color = patch.backgroundColor ?? (current.color?.match(/^#[0-9a-f]{6}$/i) ? current.color : "#ffffff");
            const opacity = patch.backgroundOpacity ?? current.opacity ?? 1;
            remove(new Set(["background-color", "background-opacity"]));
            append("background-color", rgba(color, opacity));
        }
        if (patch.borderColor !== undefined) {
            remove(new Set(["border-color"]));
            append("border-color", patch.borderColor);
        }
        if (patch.borderWidth !== undefined) {
            remove(new Set(["border-width", "border-style"]));
            append("border-width", `${patch.borderWidth}px`);
            append("border-style", patch.borderWidth > 0 ? "solid" : "none");
        }
    }

    const result = declarations.map((item) => item.raw).join(" ");
    return result || null;
}

function isHistoricalDefault(declaration: Declaration): boolean {
    return Boolean(HISTORICAL_DEFAULTS[declaration.property]?.includes(compact(declaration.value)));
}

export function classifyWidgetAppearance(style: string | null | undefined): WidgetAppearanceClassification {
    const geometry: Declaration[] = [];
    const appearance: Declaration[] = [];
    const unknown: Declaration[] = [];
    for (const declaration of parseDeclarations(style)) {
        if (GEOMETRY_PROPERTIES.has(declaration.property)) geometry.push(declaration);
        else if (APPEARANCE_PROPERTIES.has(declaration.property)) appearance.push(declaration);
        else if (declaration.property !== "draggable") unknown.push(declaration);
    }

    const containsCustomAppearance = appearance.some((declaration) => !isHistoricalDefault(declaration));
    const mode: WidgetAppearanceMode = containsCustomAppearance || unknown.length > 0 ? "custom" : "inherit";
    const runtimeDeclarations = mode === "inherit"
        ? [...geometry, ...unknown]
        : [...geometry, ...appearance, ...unknown];

    return {
        mode,
        geometryDeclarations: geometry.map((item) => item.raw).join(" "),
        customAppearanceDeclarations: appearance.map((item) => item.raw).join(" "),
        unknownDeclarations: unknown.map((item) => item.raw).join(" "),
        runtimeStyle: runtimeDeclarations.map((item) => item.raw).join(" "),
    };
}

export function applyWidgetAppearanceCompatibility(element: HTMLElement, style?: string | null): WidgetAppearanceClassification {
    const classification = classifyWidgetAppearance(style ?? element.getAttribute("style"));
    element.dataset.hpWidgetAppearance = classification.mode;
    if (classification.mode === "inherit") {
        if (classification.runtimeStyle) element.setAttribute("style", classification.runtimeStyle);
        else element.removeAttribute("style");
    }
    return classification;
}

export function setWidgetAppearanceMode(element: HTMLElement, mode: WidgetAppearanceMode): void {
    if (mode === "inherit") {
        const declarations = parseDeclarations(element.getAttribute("style"));
        const kept = declarations.filter((declaration) => !APPEARANCE_PROPERTIES.has(declaration.property));
        const style = kept.map((item) => item.raw).join(" ");
        if (style) element.setAttribute("style", style);
        else element.removeAttribute("style");
    }
    element.dataset.hpWidgetAppearance = mode;
}
