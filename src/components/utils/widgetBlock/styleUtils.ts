export interface StyleSettings {
    backgroundColor: string;
    backgroundOpacity: number;
    borderColor: string;
    borderWidth: number;
    rowSize: number;
    colSize: number;
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

    const aspectRatio = computedStyle.aspectRatio;
    if (aspectRatio) {
        const [widthRatio, heightRatio] = aspectRatio.split("/").map((s) => s.trim());
        if (widthRatio && heightRatio) {
            result.colSize = parseInt(widthRatio);
            result.rowSize = parseInt(heightRatio);
        }
    }

    return result;
}

export async function loadWidgetSize(
    plugin: any,
    currentBlockId: string,
    defaultRowSize: number = 1,
    defaultColSize: number = 1
): Promise<{ rowSize: number; colSize: number }> {
    try {
        const widgetConfig = await plugin.loadData(`widget-${currentBlockId}.json`);
        if (widgetConfig && widgetConfig.rowSize && widgetConfig.colSize) {
            return {
                rowSize: widgetConfig.rowSize,
                colSize: widgetConfig.colSize
            };
        }
    } catch (error) {
        console.warn(`Failed to load saved size for widget ${currentBlockId}:`, error);
    }

    const styles = loadElementStyles(currentBlockId);
    if (styles) {
        return {
            rowSize: styles.rowSize,
            colSize: styles.colSize
        };
    }

    return { rowSize: defaultRowSize, colSize: defaultColSize };
}

export async function saveWidgetSize(
    plugin: any,
    currentBlockId: string,
    rowSize: number,
    colSize: number
): Promise<void> {
    const widgetConfig = await plugin.loadData(`widget-${currentBlockId}.json`);
    const updatedConfig = {
        ...widgetConfig,
        rowSize,
        colSize
    };
    await plugin.saveData(`widget-${currentBlockId}.json`, updatedConfig);
}