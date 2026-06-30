export type DragPositionCallback = (position: { scrollTop: number }) => Promise<void>;
export type LoadPositionCallback = () => Promise<{ scrollTop: number } | null>;

export interface HandleLoadOptions {
    onLoadPosition?: LoadPositionCallback;
    onSavePosition?: DragPositionCallback;
}

// 横幅拖动逻辑
export function handleLoad(
    plugin: any,
    bannerImage: HTMLImageElement | null,
    options?: HandleLoadOptions
): (() => void) | undefined {
    if (bannerImage && bannerImage.parentElement) {
        const dragInstance = initDrag(bannerImage, plugin, options?.onSavePosition, options?.onLoadPosition);
        return dragInstance?.destroy;
    }
    return undefined;
}

function initDrag(
    imageElement: HTMLImageElement,
    plugin: any,
    onSavePosition?: DragPositionCallback,
    onLoadPosition?: LoadPositionCallback
) {
    let isDragging = false;
    let startY = 0;
    let scrollTop = 0;
    const dragSurface = imageElement.parentElement;
    let resizeObserver: ResizeObserver | null = null;

    if (!dragSurface) return undefined;

    function fitImageToSurface(): void {
        const containerWidth = dragSurface.clientWidth;
        const containerHeight = dragSurface.clientHeight;
        const naturalWidth = imageElement.naturalWidth;
        const naturalHeight = imageElement.naturalHeight;

        if (containerWidth <= 0 || containerHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
            return;
        }

        const imageRatio = naturalWidth / naturalHeight;
        const containerRatio = containerWidth / containerHeight;

        if (imageRatio > containerRatio) {
            const renderedWidth = Math.ceil(containerHeight * imageRatio);
            imageElement.style.width = `${renderedWidth}px`;
            imageElement.style.height = `${containerHeight}px`;
            imageElement.style.marginLeft = `${Math.floor((containerWidth - renderedWidth) / 2)}px`;
        } else {
            const renderedHeight = Math.ceil(containerWidth / imageRatio);
            imageElement.style.width = `${containerWidth}px`;
            imageElement.style.height = `${renderedHeight}px`;
            imageElement.style.marginLeft = "0";
        }
    }

    function getTranslateY(): number {
        const computedStyle = window.getComputedStyle(imageElement);
        try {
            const matrix = new DOMMatrixReadOnly(computedStyle.transform);
            return matrix.m42;
        } catch {
            return 0;
        }
    }

    function clampTranslateY(value: number): number {
        const containerHeight = dragSurface.clientHeight;
        const imageHeight = imageElement.offsetHeight;
        if (containerHeight <= 0 || imageHeight <= 0) return 0;
        const minY = Math.min(0, containerHeight - imageHeight);
        return Math.min(0, Math.max(minY, value));
    }

    function setImageTranslateY(value: number): number {
        const clampedY = clampTranslateY(value);
        imageElement.style.transform = `translateY(${clampedY}px)`;
        return clampedY;
    }

    function syncImagePositionBounds(): void {
        fitImageToSurface();
        scrollTop = setImageTranslateY(getTranslateY());
    }

    function isInteractiveDragTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        return Boolean(target.closest(
            'button, a, input, select, textarea, [role="button"], .button-wrapper, .nav-button, .more-menu, .more-menu-item, .stats-info-refresh'
        ));
    }

    function handleMove(e: MouseEvent | TouchEvent) {
        if (!isDragging || !imageElement) return;
        e.preventDefault();

        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        const deltaY = clientY - startY;
        const newY = scrollTop + deltaY;
        setImageTranslateY(newY);
    }

    async function initImagePosition() {
        if (imageElement.naturalHeight === 0) return;
        fitImageToSurface();

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

        scrollTop = setImageTranslateY(initialY);
        imageElement.style.willChange = "transform";
    }

    function startDrag(e: MouseEvent | TouchEvent) {
        if (isInteractiveDragTarget(e.target)) return;
        e.preventDefault();
        isDragging = true;
        startY = "touches" in e ? e.touches[0].clientY : e.clientY;

        scrollTop = getTranslateY();

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

        const finalY = setImageTranslateY(getTranslateY());

        if (onSavePosition) {
            await onSavePosition({ scrollTop: finalY });
        } else {
            try {
                await plugin.saveData("bannerPosition.json", { scrollTop: finalY });
            } catch (e) {
                console.error("保存位置失败", e);
            }
        }

        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("touchmove", handleMove);
        window.removeEventListener("mouseup", endDrag);
        window.removeEventListener("touchend", endDrag);
    }

    dragSurface.addEventListener("mousedown", startDrag);
    dragSurface.addEventListener("touchstart", startDrag);
    imageElement.addEventListener("load", initImagePosition);
    resizeObserver = new ResizeObserver(() => {
        syncImagePositionBounds();
    });
    resizeObserver.observe(dragSurface);

    if (imageElement.complete) {
        initImagePosition();
    }

    return {
        destroy: () => {
            dragSurface.removeEventListener("mousedown", startDrag);
            dragSurface.removeEventListener("touchstart", startDrag);
            imageElement.removeEventListener("load", initImagePosition);
            resizeObserver?.disconnect();
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("touchmove", handleMove);
            window.removeEventListener("mouseup", endDrag);
            window.removeEventListener("touchend", endDrag);
        }
    };
}
