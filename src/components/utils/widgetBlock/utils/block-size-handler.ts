// 设置区块尺寸
export function setBlockSize(blockElement: HTMLElement | null, size: number): void {
    if (!blockElement) return;

    blockElement.style.position = "relative";
    blockElement.style.overflow = "hidden";

    switch (size) {
        case 11:
            blockElement.style.gridColumn = "span 1";
            blockElement.style.gridRow = "span 1";
            blockElement.style.aspectRatio = "1 / 1";
            break;

        case 12:
            blockElement.style.gridColumn = "span 2";
            blockElement.style.gridRow = "span 1";
            blockElement.style.aspectRatio = "2 / 1";
            break;

        case 21:
            blockElement.style.gridColumn = "span 1";
            blockElement.style.gridRow = "span 2";
            blockElement.style.aspectRatio = "1 / 2";
            break;

        case 22:
            blockElement.style.gridColumn = "span 2";
            blockElement.style.gridRow = "span 2";
            blockElement.style.aspectRatio = "1 / 1";
            break;

        case 13:
            blockElement.style.gridColumn = "span 3";
            blockElement.style.gridRow = "span 1";
            blockElement.style.aspectRatio = "3 / 1";
            break;

        case 31:
            blockElement.style.gridColumn = "span 1";
            blockElement.style.gridRow = "span 3";
            blockElement.style.aspectRatio = "1 / 3";
            break;

        case 23:
            blockElement.style.gridColumn = "span 3";
            blockElement.style.gridRow = "span 2";
            blockElement.style.aspectRatio = "3 / 2";
            break;

        case 32:
            blockElement.style.gridColumn = "span 2";
            blockElement.style.gridRow = "span 3";
            blockElement.style.aspectRatio = "2 / 3";
            break;

        case 33:
            blockElement.style.gridColumn = "span 3";
            blockElement.style.gridRow = "span 3";
            blockElement.style.aspectRatio = "1 / 1";
            break;

        case 24:
            blockElement.style.gridColumn = "span 4";
            blockElement.style.gridRow = "span 2";
            blockElement.style.aspectRatio = "2 / 1";
            break;

        case 42:
            blockElement.style.gridColumn = "span 2";
            blockElement.style.gridRow = "span 4";
            blockElement.style.aspectRatio = "1 / 2";
            break;

        case 44:
            blockElement.style.gridColumn = "span 4";
            blockElement.style.gridRow = "span 4";
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