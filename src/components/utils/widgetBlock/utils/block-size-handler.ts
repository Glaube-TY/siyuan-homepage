// 设置区块尺寸
export async function setBlockSize(
    blockElement: HTMLElement | null,
    size: number,
    widgetLayoutNumber: number
): Promise<void> {
    if (!blockElement) return;

    blockElement.style.position = "relative";
    blockElement.style.overflow = "hidden";

    // 解析行数和列数
    const rowSize = Math.floor(size / 10);
    const colSize = size % 10;

    // 确保行数和列数不超过 widgetLayoutNumber
    const clampedRowSize = Math.min(rowSize, widgetLayoutNumber);
    const clampedColSize = Math.min(colSize, widgetLayoutNumber);

    // 设置网格跨度
    blockElement.style.gridColumn = `span ${clampedColSize}`;
    blockElement.style.gridRow = `span ${clampedRowSize}`;

    // 设置宽高比
    if (clampedRowSize === clampedColSize) {
        blockElement.style.aspectRatio = "1 / 1";
    } else {
        blockElement.style.aspectRatio = `${clampedColSize} / ${clampedRowSize}`;
    }

    const inner = blockElement.querySelector(".widget-inner");
    if (inner instanceof HTMLElement) {
        inner.style.width = "100%";
        inner.style.height = "100%";
    }
}