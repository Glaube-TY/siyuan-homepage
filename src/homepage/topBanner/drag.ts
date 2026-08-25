export type DragPositionCallback = (position: { scrollTop: number }) => Promise<void>;
export type LoadPositionCallback = () => Promise<{ scrollTop: number } | null>;

export interface HandleLoadOptions {
    onLoadPosition?: LoadPositionCallback;
    onSavePosition?: DragPositionCallback;
}

export interface DragController {
    destroy: () => void;
    setPosition: (position: number) => void;
}

const BANNER_POSITION_EPSILON = 0.01;

// 横幅拖动逻辑
export function handleLoad(
    plugin: any,
    bannerImage: HTMLImageElement | null,
    options?: HandleLoadOptions
): DragController | undefined {
    if (bannerImage && bannerImage.parentElement) {
        const dragInstance = initDrag(bannerImage, plugin, options?.onSavePosition, options?.onLoadPosition);
        return dragInstance;
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
    let currentTranslateY = 0;
    let minTranslateY = 0;
    let dragStartTranslateY = 0;
    let pendingTranslateY: number | null = null;
    let moveRaf: number | null = null;
    let geometryRaf: number | null = null;
    let pendingSurfaceWidth: number | null = null;
    let pendingSurfaceHeight: number | null = null;
    let surfaceWidth = 0;
    let surfaceHeight = 0;
    let renderedImageHeight = 0;
    let geometryReady = false;
    let willChangeApplied = false;
    let positionLoadRequest = 0;
    let destroyed = false;
    const dragSurface = imageElement.parentElement;
    let resizeObserver: ResizeObserver | null = null;
    const originalWillChange = imageElement.style.willChange;

    if (!dragSurface) return undefined;

    function updateImageGeometry(containerWidth: number, containerHeight: number): void {
        const naturalWidth = imageElement.naturalWidth;
        const naturalHeight = imageElement.naturalHeight;

        if (containerWidth <= 0 || containerHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
            geometryReady = false;
            return;
        }

        const imageRatio = naturalWidth / naturalHeight;
        const containerRatio = containerWidth / containerHeight;
        let renderedWidth: number;
        let marginLeft: string;

        if (imageRatio > containerRatio) {
            renderedWidth = Math.ceil(containerHeight * imageRatio);
            renderedImageHeight = containerHeight;
            marginLeft = `${Math.floor((containerWidth - renderedWidth) / 2)}px`;
        } else {
            renderedWidth = containerWidth;
            renderedImageHeight = Math.ceil(containerWidth / imageRatio);
            marginLeft = "0";
        }

        surfaceWidth = containerWidth;
        surfaceHeight = containerHeight;
        minTranslateY = Math.min(0, surfaceHeight - renderedImageHeight);
        geometryReady = true;
        imageElement.style.width = `${renderedWidth}px`;
        imageElement.style.height = `${renderedImageHeight}px`;
        imageElement.style.marginLeft = marginLeft;
        setImageTranslateY(currentTranslateY);
        if (pendingTranslateY !== null) pendingTranslateY = clampTranslateY(pendingTranslateY);
    }

    function initializeImageGeometry(): void {
        updateImageGeometry(dragSurface.clientWidth, dragSurface.clientHeight);
    }

    function hasImageGeometry(): boolean {
        return geometryReady && surfaceWidth > 0 && surfaceHeight > 0 && renderedImageHeight > 0;
    }

    function scheduleGeometryUpdate(width: number, height: number): void {
        pendingSurfaceWidth = width;
        pendingSurfaceHeight = height;
        if (geometryRaf !== null) return;
        geometryRaf = requestAnimationFrame(() => {
            geometryRaf = null;
            const nextWidth = pendingSurfaceWidth;
            const nextHeight = pendingSurfaceHeight;
            pendingSurfaceWidth = null;
            pendingSurfaceHeight = null;
            if (nextWidth === null || nextHeight === null || destroyed) return;
            updateImageGeometry(nextWidth, nextHeight);
        });
    }

    function cancelGeometryRaf(): void {
        if (geometryRaf === null) return;
        cancelAnimationFrame(geometryRaf);
        geometryRaf = null;
    }

    function clampTranslateY(value: number): number {
        const safeValue = Number.isFinite(value) ? value : 0;
        return Math.min(0, Math.max(minTranslateY, safeValue));
    }

    function setImageTranslateY(value: number): number {
        const clampedY = clampTranslateY(value);
        currentTranslateY = clampedY;
        imageElement.style.transform = `translate3d(0, ${clampedY}px, 0)`;
        return clampedY;
    }

    function cancelMoveRaf(): void {
        if (moveRaf === null) return;
        cancelAnimationFrame(moveRaf);
        moveRaf = null;
    }

    function flushPendingTranslate(): void {
        const nextTranslateY = pendingTranslateY;
        pendingTranslateY = null;
        if (nextTranslateY !== null) setImageTranslateY(nextTranslateY);
    }

    function getClientY(e: MouseEvent | TouchEvent): number | undefined {
        return "touches" in e ? e.touches[0]?.clientY : e.clientY;
    }

    function attachDragWindowListeners(): void {
        detachDragWindowListeners();
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("touchmove", handleMove, { passive: false });
        window.addEventListener("mouseup", endDrag);
        window.addEventListener("touchend", endDrag);
        window.addEventListener("touchcancel", endDrag);
    }

    function detachDragWindowListeners(): void {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("touchmove", handleMove, false);
        window.removeEventListener("mouseup", endDrag);
        window.removeEventListener("touchend", endDrag);
        window.removeEventListener("touchcancel", endDrag);
    }

    function isInteractiveDragTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        return Boolean(target.closest(
            'button, a, input, select, textarea, [role="button"]'
        ));
    }

    function handleMove(e: MouseEvent | TouchEvent) {
        if (!isDragging || destroyed || !hasImageGeometry()) return;
        e.preventDefault();

        const clientY = getClientY(e);
        if (clientY === undefined) return;
        pendingTranslateY = clampTranslateY(dragStartTranslateY + clientY - startY);
        if (moveRaf !== null) return;
        moveRaf = requestAnimationFrame(() => {
            moveRaf = null;
            const nextTranslateY = pendingTranslateY;
            pendingTranslateY = null;
            if (!isDragging || destroyed || nextTranslateY === null) return;
            setImageTranslateY(nextTranslateY);
        });
    }

    async function initImagePosition() {
        if (destroyed || imageElement.naturalHeight === 0) return;
        const requestId = ++positionLoadRequest;
        initializeImageGeometry();
        if (!willChangeApplied && hasImageGeometry()) {
            imageElement.style.willChange = "transform";
            willChangeApplied = true;
        }

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

        if (destroyed || requestId !== positionLoadRequest || isDragging) return;
        const savedPosition = savedData?.scrollTop;
        setImageTranslateY(typeof savedPosition === "number" && Number.isFinite(savedPosition) ? savedPosition : 0);
    }

    function startDrag(e: MouseEvent | TouchEvent) {
        if (destroyed || isDragging || isInteractiveDragTarget(e.target)) return;
        const clientY = getClientY(e);
        if (clientY === undefined) return;
        e.preventDefault();
        isDragging = true;
        startY = clientY;
        dragStartTranslateY = currentTranslateY;
        pendingTranslateY = null;
        dragSurface.classList.add("hp-banner--dragging");
        attachDragWindowListeners();
    }

    function persistPosition(finalY: number): void {
        try {
            const saveResult = onSavePosition
                ? onSavePosition({ scrollTop: finalY })
                : plugin.saveData("bannerPosition.json", { scrollTop: finalY });
            void Promise.resolve(saveResult).catch((error) => {
                console.error("[Homepage Banner] 保存横幅位置失败", error);
            });
        } catch (error) {
            console.error("[Homepage Banner] 保存横幅位置失败", error);
        }
    }

    function endDrag(): void {
        if (!isDragging) return;
        flushPendingTranslate();
        isDragging = false;
        cancelMoveRaf();
        pendingTranslateY = null;
        detachDragWindowListeners();
        dragSurface.classList.remove("hp-banner--dragging");
        const finalY = currentTranslateY;
        if (Math.abs(finalY - dragStartTranslateY) > BANNER_POSITION_EPSILON) {
            persistPosition(finalY);
        }
    }

    function setPosition(position: number): void {
        if (destroyed) return;
        positionLoadRequest += 1;
        cancelMoveRaf();
        pendingTranslateY = null;
        setImageTranslateY(position);
        if (isDragging) dragStartTranslateY = currentTranslateY;
    }

    function handleImageLoad(): void {
        void initImagePosition().catch((error) => {
            console.error("[Homepage Banner] 加载横幅位置失败", error);
        });
    }

    dragSurface.addEventListener("mousedown", startDrag);
    dragSurface.addEventListener("touchstart", startDrag);
    imageElement.addEventListener("load", handleImageLoad);
    resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        scheduleGeometryUpdate(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(dragSurface);

    if (imageElement.complete) {
        handleImageLoad();
    }

    return {
        destroy: () => {
            destroyed = true;
            positionLoadRequest += 1;
            isDragging = false;
            cancelMoveRaf();
            cancelGeometryRaf();
            pendingSurfaceWidth = null;
            pendingSurfaceHeight = null;
            pendingTranslateY = null;
            detachDragWindowListeners();
            dragSurface.classList.remove("hp-banner--dragging");
            imageElement.style.willChange = originalWillChange;
            dragSurface.removeEventListener("mousedown", startDrag);
            dragSurface.removeEventListener("touchstart", startDrag);
            imageElement.removeEventListener("load", handleImageLoad);
            resizeObserver?.disconnect();
            resizeObserver = null;
        },
        setPosition,
    };
}
