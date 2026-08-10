export type WidgetAppearanceMode = "inherit" | "custom";

export interface WidgetAppearanceClassification {
    mode: WidgetAppearanceMode;
    geometryDeclarations: string;
    customAppearanceDeclarations: string;
    unknownDeclarations: string;
    runtimeStyle: string;
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
