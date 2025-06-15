export type DragPositionCallback = (position: { scrollTop: number }) => Promise<void>;
export type LoadPositionCallback = () => Promise<{ scrollTop: number } | null>;

export function initDrag(
    imageElement: HTMLImageElement,
    plugin: any,
    onSavePosition?: DragPositionCallback,
    onLoadPosition?: LoadPositionCallback
) {
    let isDragging = false;
    let startY = 0;
    let scrollTop = 0;

    function handleMove(e: MouseEvent | TouchEvent) {
        if (!isDragging || !imageElement) return;
        e.preventDefault();

        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        const deltaY = clientY - startY;
        const newY = scrollTop + deltaY;
        imageElement.style.transform = `translateY(${newY}px)`;
    }

    async function initImagePosition() {
        if (imageElement.naturalHeight === 0) return;

        let savedData: { scrollTop: number } | null = null;

        if (onLoadPosition) {
            savedData = await onLoadPosition();
        } else {
            try {
                const data = await plugin.loadData("bannerPosition.json");
                savedData = data ? { scrollTop: data.scrollTop } : null;
            } catch (e) {
                console.error("加载位置数据失败", e);
            }
        }

        const initialY = savedData?.scrollTop || 0;

        imageElement.style.transform = `translateY(${initialY}px)`;
        scrollTop = initialY;
        imageElement.style.willChange = "transform";
    }

    function startDrag(e: MouseEvent | TouchEvent) {
        if (!(e.target as HTMLElement).closest('.banner-image')) return;
        e.preventDefault();
        isDragging = true;
        startY = "touches" in e ? e.touches[0].clientY : e.clientY;

        const computedStyle = window.getComputedStyle(imageElement);
        const matrix = new DOMMatrixReadOnly(computedStyle.transform);
        scrollTop = matrix.m42;

        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("touchmove", handleMove);
        window.removeEventListener("mouseup", endDrag);
        window.removeEventListener("touchend", endDrag);

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("touchmove", handleMove, { passive: false });
        window.addEventListener("mouseup", endDrag);
        window.addEventListener("touchend", endDrag);
    }

    async function endDrag() {
        if (!isDragging) return;
        isDragging = false;

        const computedStyle = window.getComputedStyle(imageElement);
        let matrix: DOMMatrixReadOnly;

        try {
            matrix = new DOMMatrixReadOnly(computedStyle.transform);
        } catch (e) {
            console.error("transform解析失败", computedStyle.transform);
            matrix = new DOMMatrixReadOnly();
        }

        if (onSavePosition) {
            await onSavePosition({ scrollTop: matrix.m42 });
        } else {
            try {
                await plugin.saveData("bannerPosition.json", { scrollTop: matrix.m42 });
            } catch (e) {
                console.error("保存位置失败", e);
            }
        }

        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("touchmove", handleMove);
        window.removeEventListener("mouseup", endDrag);
        window.removeEventListener("touchend", endDrag);
    }

    imageElement.addEventListener("mousedown", startDrag);
    imageElement.addEventListener("touchstart", startDrag);
    imageElement.addEventListener("load", initImagePosition);

    if (imageElement.complete) {
        initImagePosition();
    }

    return {
        destroy: () => {
            imageElement.removeEventListener("mousedown", startDrag);
            imageElement.removeEventListener("touchstart", startDrag);
            imageElement.removeEventListener("load", initImagePosition);
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("touchmove", handleMove);
            window.removeEventListener("mouseup", endDrag);
            window.removeEventListener("touchend", endDrag);
        }
    };
}