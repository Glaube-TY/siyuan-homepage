<script lang="ts">
    import { onMount, untrack } from "svelte";
    import type { Swiper } from "swiper/types";
    import { loadPicCaroImages, picCaroPlaybackImages, type PicCaroImage } from "./picCaroData";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    interface Props { plugin: any; contentTypeJson?: string }
    let { plugin, contentTypeJson = "{}" }: Props = $props();
    let data = $derived.by(() => {
        try { const config = JSON.parse(contentTypeJson); return config.data === undefined ? {} : config.data; } catch { return null; }
    });
    let PicAutoPlay = $derived(data?.PicAutoPlay ?? false);
    let PicInterval = $derived(data?.PicInterval || 3);
    let PicNavigation = $derived(data?.PicNavigation ?? false);
    let PicPagination = $derived(data?.PicPagination ?? false);
    let PicPaginationType = $derived(data?.PicPaginationType || "bullets");
    let PicPaginationDyBu = $derived(data?.PicPaginationDyBu ?? false);
    let PicPaginationPrOp = $derived(data?.PicPaginationPrOp ?? false);
    let PicEffect = $derived(data?.PicEffect || "slide");
    let PicSlidesPerView = $derived(data?.PicSlidesPerView || "1");
    let advancedEnabled = $state(false);
    let runtimeUnsupported = $state(false);
    let images: PicCaroImage[] = $state([]);
    let failedPaths: string[] = $state([]);
    let loading = $state(true);
    let error = $state("");
    let rootElement: HTMLElement;
    let swiperElement: (HTMLElement & { swiper?: Swiper }) | null = null;
    let mounted = $state(false);
    let widgetVisible = $state(typeof IntersectionObserver === "undefined");
    let documentVisible = $state(true);
    let loadedContent: string | null = null;

    function syncAutoplay(): void {
        const shouldPlay = advancedEnabled && PicAutoPlay && widgetVisible && documentVisible && failedPaths.length < images.length;
        const autoplay = swiperElement?.swiper?.autoplay;
        if (!autoplay) return;
        if (shouldPlay) {
            if (!autoplay.running) autoplay.start();
        } else if (autoplay.running) autoplay.stop();
    }

    function initializeSwiper(node: HTMLElement) {
        let disposed = false;
        swiperElement = node;
        void (async () => {
            try {
                const [element, modules, ...styles] = await Promise.all([
                    import("swiper/element"), import("swiper/modules"),
                    import("swiper/element/css/a11y?inline"), import("swiper/element/css/effect-coverflow?inline"),
                    import("swiper/element/css/effect-cube?inline"), import("swiper/element/css/effect-fade?inline"),
                    import("swiper/element/css/effect-flip?inline"), import("swiper/element/css/navigation?inline"),
                    import("swiper/element/css/pagination?inline"),
                ]);
                if (disposed || !advancedEnabled) return;
                element.register();
                const swiper = node as HTMLElement & { modules: unknown[]; injectStyles: string[]; initialize: () => void };
                swiper.modules = [modules.A11y, modules.Autoplay, modules.EffectCoverflow, modules.EffectCube,
                    modules.EffectFade, modules.EffectFlip, modules.Navigation, modules.Pagination];
                swiper.injectStyles = styles.map((style) => style.default);
                swiper.initialize();
                syncAutoplay();
            } catch { if (!disposed) error = "轮播展示能力加载失败，请重新加载组件"; }
        })();
        return { destroy() {
            disposed = true;
            const swiper = (node as HTMLElement & { swiper?: Swiper }).swiper;
            if (swiper && !swiper.destroyed) swiper.destroy(true, true);
            if (swiperElement === node) swiperElement = null;
        } };
    }

    function loadImages(): void {
        loading = true;
        error = "";
        failedPaths = [];
        images = [];
        runtimeUnsupported = false;
        try {
            const result = loadPicCaroImages(data);
            runtimeUnsupported = result.unsupported;
            images = picCaroPlaybackImages(result.images, Boolean(data.PicRandomSwitch));
            if (!result.unsupported && images.length === 0) error = result.mode === "workspaceAssets"
                ? "尚未配置资源图片，请在组件设置中添加图片"
                : data.PicFolderPath ? "文件夹中没有找到图片文件" : "请配置图片文件夹路径";
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "图片来源读取失败，原配置已保留";
        } finally { loading = false; }
    }

    function imageFailed(path: string): void {
        if (!failedPaths.includes(path)) failedPaths = [...failedPaths, path];
    }
    function imageLoaded(path: string): void { failedPaths = failedPaths.filter((failed) => failed !== path); }

    $effect(() => {
        if (mounted && advancedEnabled && widgetVisible && documentVisible && loadedContent !== contentTypeJson) {
            loadedContent = contentTypeJson;
            untrack(loadImages);
        }
    });
    $effect(syncAutoplay);
    onMount(() => {
        advancedEnabled = Boolean(plugin?.ADVANCED);
        mounted = true;
        documentVisible = document.visibilityState !== "hidden";
        const visibility = () => { documentVisible = document.visibilityState !== "hidden"; };
        const enable = () => { advancedEnabled = true; };
        const disable = () => { advancedEnabled = false; };
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("homepage-advanced-ready", enable);
        window.addEventListener("homepage-advanced-unavailable", disable);
        const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
            widgetVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        });
        observer?.observe(rootElement);
        return () => {
            mounted = false;
            observer?.disconnect();
            document.removeEventListener("visibilitychange", visibility);
            window.removeEventListener("homepage-advanced-ready", enable);
            window.removeEventListener("homepage-advanced-unavailable", disable);
        };
    });
</script>

<div class="content-display" bind:this={rootElement}>
    {#if advancedEnabled}
        {#if runtimeUnsupported}
            <div class="runtime-unsupported">
                <h2>🖥️ 仅桌面端支持</h2>
                <h3>本地图片文件夹需要桌面 Electron。网页端、Docker 和移动端请在组件设置中切换为思源资源图片。</h3>
            </div>
        {:else if loading}
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>正在加载图片...</p>
            </div>
        {:else if error}
            <div class="error-container">
                <p class="error-message">{error}</p>
            </div>
        {:else if images.length > 0}
            <div class="carousel-container">
                {#if failedPaths.length > 0}
                    <p class="image-load-status" role="status">{failedPaths.length === images.length
                        ? "全部图片无法显示" : `部分图片加载失败（${failedPaths.length}/${images.length}）`}。
                        {data.PicSourceMode === "workspaceAssets" ? "资源可能尚未同步到当前工作空间或已经不存在，请检查同步状态。" : "请检查本地文件是否仍可读取。"}列表已保留。</p>
                {/if}
                <swiper-container
                    init="false"
                    use:initializeSwiper
                    class="piccaro-swiper"
                    slides-per-view={PicEffect === "slide" ? PicSlidesPerView : "1"}
                    speed="800"
                    loop="true"
                    autoplay={PicAutoPlay}
                    autoplay-delay={PicAutoPlay ? PicInterval * 1000 : 0}
                    autoplay-disable-on-interaction="false"
                    pagination={PicPagination}
                    pagination-clickable={PicPagination}
                    pagination-type={PicPaginationType}
                    pagination-dynamic-bullets={PicPaginationDyBu ? "true" : "false"}
                    pagination-progressbar-opposite={PicPaginationPrOp ? "true" : "false"}
                    navigation={PicNavigation}
                    space-between="20"
                    effect={PicEffect}
                    fade-effect-cross-fade={PicEffect === "fade" ? "true" : "false"}
                >
                    {#each images as image}
                        <swiper-slide>
                            <div class="slide-wrapper">
                                <img
                                    src={image.path}
                                    alt={image.name}
                                    class="carousel-image"
                                    draggable="false"
                                    loading="lazy"
                                    onerror={() => imageFailed(image.path)}
                                    onload={() => imageLoaded(image.path)}
                                />
                                {#if failedPaths.includes(image.path)}<p class="ft__secondary">此图片暂时无法读取</p>{/if}
                            </div>
                        </swiper-slide>
                    {/each}
                </swiper-container>
            </div>
        {:else}
            <div class="empty-container">
                <p>没有找到图片文件</p>
            </div>
        {/if}
    {:else}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="图片轮播"
                subtitle="精美图片自动轮播，让主页更有视觉冲击力。"
                icon="image"
                features={[
                    "自动轮播展示图片",
                    "支持多种切换动画效果",
                    "适合摄影作品和壁纸展示"
                ]}
                highlights={["自动轮播", "动画效果", "视觉展示"]}
                compact
            />
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        border-radius: 12px;
    }

    .content-not-advanced {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        text-align: center;
        color: #666;
    }

    .runtime-unsupported {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
    }

    .loading-container,
    .error-container,
    .empty-container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .error-message {
        color: #e74c3c;
        font-size: 14px;
        text-align: center;
        padding: 0 20px;
    }

    .carousel-container {
        width: 100%;
        height: 100%;
        padding: 20px;
        box-sizing: border-box;
    }

    .image-load-status { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 12px; }

    .piccaro-swiper {
        width: 100%;
        height: 100%;
        border-radius: 12px;
        overflow: hidden;
    }

    .slide-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .carousel-image {
        max-width: 100%;
        max-height: 100%;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: transform 0.3s ease;
        user-select: none;
    }

    .carousel-image:hover {
        transform: scale(1.02);
    }

    // 自定义Swiper样式
    :global(.piccaro-swiper .swiper-pagination-bullet) {
        background: #fff;
        opacity: 0.7;
        width: 8px;
        height: 8px;
    }

    :global(.piccaro-swiper .swiper-pagination-bullet-active) {
        opacity: 1;
        background: #3498db;
    }

    :global(.piccaro-swiper .swiper-button-next),
    :global(.piccaro-swiper .swiper-button-prev) {
        color: #fff;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        width: 40px;
        height: 40px;
        backdrop-filter: blur(10px);
    }

    :global(.piccaro-swiper .swiper-button-next:hover),
    :global(.piccaro-swiper .swiper-button-prev:hover) {
        background: rgba(0, 0, 0, 0.5);
    }

    :global(.piccaro-swiper .swiper-button-next::after),
    :global(.piccaro-swiper .swiper-button-prev::after) {
        font-size: 16px;
        font-weight: bold;
    }
</style>
