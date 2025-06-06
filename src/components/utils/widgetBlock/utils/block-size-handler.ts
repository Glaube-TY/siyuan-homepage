// 设置区块尺寸
export function setBlockSize(blockElement: HTMLElement | null, size: number): void {
    if (!blockElement) return;

    blockElement.style.position = "relative";
    blockElement.style.overflow = "hidden";

    switch (size) {
        case 1:
            blockElement.style.gridColumn = "span 1";
            blockElement.style.gridRow = "span 1";
            blockElement.style.aspectRatio = "1 / 1";
            break;

        case 2:
            blockElement.style.gridColumn = "span 2";
            blockElement.style.gridRow = "span 1";
            blockElement.style.aspectRatio = "2 / 1";
            break;

        case 3:
            blockElement.style.gridColumn = "span 1";
            blockElement.style.gridRow = "span 2";
            blockElement.style.aspectRatio = "1 / 2";
            break;

        case 4:
            blockElement.style.gridColumn = "span 2";
            blockElement.style.gridRow = "span 2";
            blockElement.style.aspectRatio = "1 / 1";
            break;

        default:
            console.warn("未知的区块尺寸:", size);
    }

    const inner = blockElement.querySelector(".widget-inner");
    if (inner instanceof HTMLElement) {
        inner.style.width = "100%";
        inner.style.height = "100%";
    }
}