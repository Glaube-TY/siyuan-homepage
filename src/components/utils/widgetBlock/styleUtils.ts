import { normalizeWidgetConfigData } from "./utils/layout-shared";

export interface StyleSettings {
    backgroundColor: string;
    backgroundOpacity: number;
    borderColor: string;
    borderWidth: number;
    rowSize: number;
    colSize: number;
}

interface WidgetGridSize {
    rowSize: number;
    colSize: number;
}

function parseGridSpan(...values: Array<string | null | undefined>): number | null {
    for (const value of values) {
        const match = value?.match(/span\s+(\d+)/i);
        const span = match ? Number(match[1]) : 0;
        if (Number.isInteger(span) && span > 0) return span;
    }
    return null;
}

function readElementGridSize(blockElement: HTMLElement): WidgetGridSize | null {
    const computedStyle = window.getComputedStyle(blockElement);
    const colSize = parseGridSpan(
        blockElement.style.gridColumn,
        blockElement.style.gridColumnStart,
        blockElement.style.gridColumnEnd,
        computedStyle.gridColumn,
        computedStyle.gridColumnStart,
        computedStyle.gridColumnEnd,
    );
    const rowSize = parseGridSpan(
        blockElement.style.gridRow,
        blockElement.style.gridRowStart,
        blockElement.style.gridRowEnd,
        computedStyle.gridRow,
        computedStyle.gridRowStart,
        computedStyle.gridRowEnd,
    );
    if (rowSize && colSize) return { rowSize, colSize };

    // 侧边栏等非主页网格仍可能使用宽高比表示尺寸。
    if (!blockElement.closest(".custom-content")) {
        const [widthRatio, heightRatio] = computedStyle.aspectRatio.split("/").map((part) => Number(part.trim()));
        if (
            Number.isInteger(widthRatio) && widthRatio > 0 &&
            Number.isInteger(heightRatio) && heightRatio > 0
        ) {
            return { rowSize: heightRatio, colSize: widthRatio };
        }
    }

    return null;
}

function normalizeStoredWidgetSize(config: Record<string, unknown> | null): WidgetGridSize | null {
    const rowSize = Number(config?.rowSize);
    const colSize = Number(config?.colSize);
    if (
        !Number.isInteger(rowSize) || rowSize < 1 ||
        !Number.isInteger(colSize) || colSize < 1
    ) {
        return null;
    }
    return { rowSize, colSize };
}

async function loadWidgetConfigForUpdate(plugin: any, currentBlockId: string): Promise<Record<string, unknown> | null> {
    const delays = [0, 80, 200];
    let lastError: unknown = null;
    for (const delayMs of delays) {
        if (delayMs > 0) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
        }
        try {
            const normalized = normalizeWidgetConfigData(await plugin.loadData(`widget-${currentBlockId}.json`));
            if (normalized) return normalized;
            lastError = null;
        } catch (error) {
            lastError = error;
        }
    }
    if (lastError) throw lastError;
    return null;
}

export function hexToRgba(hex: string, opacity: number): string {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function convertToHex(color: string): string | null {
    const matches = color.match(/(\d+(\.\d+)?)/g);
    if (!matches) return null;

    const values = matches.map(Number);

    function toHex(value: number): string {
        const hex = Math.min(255, Math.max(0, Math.round(value))).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }

    if (values.length === 3) {
        const [r, g, b] = values;
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    if (values.length === 4) {
        const [r, g, b, a] = values;
        const blend = (c: number) => Math.round((1 - a) * 255 + a * c);
        return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`;
    }

    return null;
}

export function updateElementBackground(
    elementId: string,
    backgroundColor: string,
    backgroundOpacity: number
): void {
    const rgbaColor = hexToRgba(backgroundColor, backgroundOpacity);
    const blockElement = document.getElementById(elementId);
    if (blockElement) {
        blockElement.style.backgroundColor = rgbaColor;
    }
}

export function updateElementBorder(
    elementId: string,
    borderColor: string,
    borderWidth: number
): void {
    const blockElement = document.getElementById(elementId);
    if (blockElement) {
        blockElement.style.borderColor = borderColor;
        blockElement.style.borderWidth = `${borderWidth}px`;
        blockElement.style.borderStyle = "solid";
    }
}

export function loadElementStyles(elementId: string): StyleSettings | null {
    const blockElement = document.getElementById(elementId);
    if (!blockElement) return null;

    const computedStyle = window.getComputedStyle(blockElement);
    const result: StyleSettings = {
        backgroundColor: "#ffffff",
        backgroundOpacity: 0.5,
        borderColor: "#000000",
        borderWidth: 1,
        rowSize: 1,
        colSize: 1
    };

    const bgColor = computedStyle.backgroundColor;
    const rgbaMatch = bgColor.match(
        /rgba?\((\d+[\d.]*),\s*(\d+[\d.]*),\s*(\d+[\d.]*)[\s,]*(\d*\.?\d*)?\)/i
    );
    if (rgbaMatch) {
        const r = parseFloat(rgbaMatch[1]);
        const g = parseFloat(rgbaMatch[2]);
        const b = parseFloat(rgbaMatch[3]);
        const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

        result.backgroundColor = convertToHex(`rgb(${r},${g},${b})`) || "#ffffff";
        result.backgroundOpacity = a;
    }

    const currentBorderColor = computedStyle.borderColor;
    if (currentBorderColor && currentBorderColor !== "transparent") {
        result.borderColor = convertToHex(currentBorderColor) || result.borderColor;
    }

    const currentBorderWidth = computedStyle.borderWidth;
    if (currentBorderWidth) {
        const widthValue = parseFloat(currentBorderWidth);
        if (!isNaN(widthValue)) {
            result.borderWidth = widthValue;
        }
    }

    const gridSize = readElementGridSize(blockElement);
    if (gridSize) {
        result.rowSize = gridSize.rowSize;
        result.colSize = gridSize.colSize;
    }

    return result;
}

export async function loadWidgetSize(
    plugin: any,
    currentBlockId: string,
    defaultRowSize: number = 1,
    defaultColSize: number = 1
): Promise<{ rowSize: number; colSize: number }> {
    const blockElement = document.getElementById(currentBlockId);
    const renderedSize = blockElement instanceof HTMLElement ? readElementGridSize(blockElement) : null;

    try {
        const widgetConfig = normalizeWidgetConfigData(await plugin.loadData(`widget-${currentBlockId}.json`));
        const storedSize = normalizeStoredWidgetSize(widgetConfig);

        // 当前页面实际采用的网格跨度是尺寸设置弹窗的权威来源。
        if (renderedSize) {
            if (
                widgetConfig &&
                (!storedSize || storedSize.rowSize !== renderedSize.rowSize || storedSize.colSize !== renderedSize.colSize)
            ) {
                await plugin.saveData(`widget-${currentBlockId}.json`, {
                    ...widgetConfig,
                    ...renderedSize,
                });
            }
            return renderedSize;
        }

        if (storedSize) return storedSize;
    } catch (error) {
        console.warn(`Failed to load saved size for widget ${currentBlockId}:`, error);
    }

    if (renderedSize) return renderedSize;

    return { rowSize: defaultRowSize, colSize: defaultColSize };
}

export async function saveWidgetSize(
    plugin: any,
    currentBlockId: string,
    rowSize: number,
    colSize: number
): Promise<void> {
    const base = await loadWidgetConfigForUpdate(plugin, currentBlockId) || {};
    const updatedConfig = {
        ...base,
        rowSize,
        colSize
    };
    await plugin.saveData(`widget-${currentBlockId}.json`, updatedConfig);
}

export async function saveWidgetContentPreservingSize(
    plugin: any,
    currentBlockId: string,
    contentConfig: Record<string, unknown>,
): Promise<void> {
    const existingConfig = await loadWidgetConfigForUpdate(plugin, currentBlockId);
    const existingSize = normalizeStoredWidgetSize(existingConfig);
    const blockElement = document.getElementById(currentBlockId);
    const renderedSize = blockElement instanceof HTMLElement ? readElementGridSize(blockElement) : null;
    const contentSize = normalizeStoredWidgetSize(contentConfig);
    const sizeToKeep = renderedSize || existingSize || contentSize;
    await plugin.saveData(`widget-${currentBlockId}.json`, {
        ...contentConfig,
        ...(sizeToKeep || {}),
    });
}
