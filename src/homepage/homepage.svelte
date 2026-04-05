<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy, tick } from "svelte";

    import { writable } from "svelte/store";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
    } from "../components/utils/widgetBlock/utils/layout-handler";
    import { handleLoad } from "../components/utils/topBanner/drag";
    import {
        loadStatsData,
        parseDurationExpression,
    } from "./header/stats-loader";
    import {
        handleMoreButtonClick,
        handleButtonClick,
        reRegisterAllShortcuts,
        unregisterAllShortcuts,
    } from "./header/quick-button";
    import { MD2HTML } from "@/components/tools/MD2HTML";
    import {
        updateCursorStyle,
        createClickEffect,
        createMouseTrail,
        cleanupMouseEffects,
    } from "./effects/mouseEffects";
    import {
        preloadFallingIcons,
        animateFalling,
        cleanupFallingEffects,
    } from "./effects/fallingEffects";
    import type { FallingEffectConfig } from "./effects/fallingEffects";
    import {
        loadHomepageConfig,
        resolveBannerImage,
        resolveButtonsList,
    } from "./configLoader";

    import "./style/homepage.scss"

    export const app = undefined;
    interface Props {
        plugin: any;
        showIcon?: any;
    }

    let { plugin, showIcon = writable(true) }: Props = $props();

    let showBanner = writable(true);
    let bannerImage: HTMLImageElement = $state();
    let bannerHeight = $state(300);
    let bannerImgSrc = $state("");

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let titleIconType: "emoji" | "image" = $state("emoji");
    let tempTitleIconEmoji = $state("🏠");
    let tempTitleIconImage: string | null = $state(null);
    let pageTitle = $state("思源笔记首页");
    let tempTitleIconStyle: string = $state("square");

    let statsInfoText =
        $state("自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{notesCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{DocsCount}} 篇笔记。\n感谢自己的坚持！❤");

    let footerEnabled = $state(true);
    let footerContent = $state("");

    let mouseIcon = $state("default");
    let mouseGlobalEnabled = $state(false);
    let MouseTrailEnabled = $state(false);
    let ClickEffectEnabled = $state(false);
    let ClickEffectContent = $state("");
    let FallEffectsEnabled = false;
    let GlobalFallingEffectsEnabled = false;
    let FallingIcon = "snow";
    let FallingDensity = "medium";
    let FallingSpeed = "medium";
    let advanced = $state(false);

    type ButtonItem = {
        id: number;
        label: string;
        checked: boolean;
        shortcut?: string;
        order: number;
    };
    let buttonsList: ButtonItem[] = $state([]);
    let showMoreMenu = $state(false);
    let isHoveringNavBar = $state(false);

    let widgetLayoutNumber = $state(4);
    let widgetGap = $state(0.2);
    let advancedPollInterval: ReturnType<typeof setInterval> | null = null;

    // 实时获取高级功能启用状态
    function getAdvancedEnabled(): boolean {
        return Boolean(plugin?.ADVANCED);
    }

    // 点击特效包装函数
    function handleClickEffect(e: MouseEvent) {
        createClickEffect(e, {
            advanced: getAdvancedEnabled(),
            mouseIcon,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            MouseTrailEnabled,
        });
    }

    // 鼠标轨迹包装函数
    function handleMouseMoveTrail(e: MouseEvent) {
        createMouseTrail(e, {
            advanced: getAdvancedEnabled(),
            mouseIcon,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            MouseTrailEnabled,
        });
    }

    // 飘落特效配置
    function getFallingConfig(): FallingEffectConfig {
        return {
            advanced: getAdvancedEnabled(),
            FallEffectsEnabled,
            GlobalFallingEffectsEnabled,
            FallingIcon,
            FallingDensity,
            FallingSpeed,
        };
    }

    // 具名函数用于 window load 监听器
    const onWindowLoad = () => handleLoad(plugin, bannerImage);

    // 启动飘落特效
    function startFallingEffects(): void {
        cleanupFallingEffects();
        preloadFallingIcons();
        const config = getFallingConfig();
        if (config.advanced && config.FallEffectsEnabled) {
            requestAnimationFrame((ts) => animateFalling(ts, config));
        }
    }

    // 页面可见性变化处理
    function handleVisibilityChange(): void {
        if (document.visibilityState === "visible") {
            const config = getFallingConfig();
            if (config.advanced && config.FallEffectsEnabled) {
                startFallingEffects();
            }
        }
    }

    // 会员验证成功后重新加载配置
    async function handleAdvancedReady() {
        await updateHomepage();
    }

    onMount(async () => {
        // 先加载配置
        await updateHomepage();
        await tick();

        // 监听会员验证成功事件
        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);

        // 页面加载完成后初始化拖拽
        if (document.readyState === "complete") {
            handleLoad(plugin, bannerImage);
        } else {
            window.addEventListener("load", onWindowLoad);
        }

        // 初始化区块拖拽排序
        const observer = new MutationObserver(async () => {
            const container = document.querySelector(
                ".custom-content",
            ) as HTMLElement;
            if (container) {
                observer.disconnect();

                new Sortable(container, {
                    animation: 150,
                    ghostClass: "sortable-ghost",
                    handle: ".drag-handle",
                    onEnd: () => {
                        saveLayout(plugin);
                    },
                });

                await restoreLayout(plugin, { value: container });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // 配置加载完成后初始化特效和事件监听
        reRegisterAllShortcuts(buttonsList);
        document.addEventListener("click", handleDocumentClick);
        document.addEventListener("click", handleClickEffect);
        document.addEventListener("mousemove", handleMouseMoveTrail);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        // 启动飘落特效
        startFallingEffects();

        // 显式更新鼠标样式
        updateCursorStyle({
            advanced: getAdvancedEnabled(),
            mouseIcon,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            MouseTrailEnabled,
        });

        // 轮询检测高级功能状态变化
        let pollCount = 0;
        const maxPollCount = 20;
        advancedPollInterval = setInterval(() => {
            pollCount++;
            if (getAdvancedEnabled()) {
                startFallingEffects();
                updateCursorStyle({
                    advanced: true,
                    mouseIcon,
                    mouseGlobalEnabled,
                    ClickEffectEnabled,
                    ClickEffectContent,
                    MouseTrailEnabled,
                });
                clearInterval(advancedPollInterval!);
                advancedPollInterval = null;
            } else if (pollCount >= maxPollCount) {
                clearInterval(advancedPollInterval!);
                advancedPollInterval = null;
            }
        }, 500);
    });

    onDestroy(() => {
        if (advancedPollInterval) {
            clearInterval(advancedPollInterval);
            advancedPollInterval = null;
        }
        cleanupFallingEffects();
        window.removeEventListener("load", onWindowLoad);
        window.removeEventListener(
            "homepage-advanced-ready",
            handleAdvancedReady,
        );
        document.removeEventListener("click", handleDocumentClick);
        document.removeEventListener("click", handleClickEffect);
        document.removeEventListener("mousemove", handleMouseMoveTrail);
        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );
        unregisterAllShortcuts();
        cleanupMouseEffects();
    });

    // 光标样式监听
    run(() => {
        updateCursorStyle({
            advanced: getAdvancedEnabled(),
            mouseIcon,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            MouseTrailEnabled,
        });
    });

    // 更新加载主页配置
    async function updateHomepage() {
        const config = await loadHomepageConfig(plugin);

        // 组件设置
        widgetLayoutNumber = config.widgetLayoutNumber;
        widgetGap = config.widgetGap;

        advanced = getAdvancedEnabled();

        // 横幅相关配置
        showBanner.set(config.bannerEnabled);

        showIcon.set(config.showIcon);
        // 标题区域配置
        tempTitleIconEmoji = config.TitleIconEmoji;
        tempTitleIconImage = config.TitleIconImage;
        titleIconType = config.titleIconType;
        pageTitle = config.customTitle;
        tempTitleIconStyle = config.tempTitleIconStyle;

        statsInfoText = config.statsInfoText;

        // 页脚配置
        footerEnabled = config.footerEnabled;
        footerContent = config.footerContent;

        // 鼠标特效配置
        mouseIcon = config.mouseIcon;
        MouseTrailEnabled = config.MouseTrailEnabled;
        mouseGlobalEnabled = config.mouseGlobalEnabled;
        ClickEffectEnabled = config.ClickEffectEnabled;
        ClickEffectContent = config.ClickEffectContent;
        FallEffectsEnabled = config.FallEffectsEnabled;
        GlobalFallingEffectsEnabled = config.GlobalFallingEffectsEnabled;
        FallingIcon = config.FallingIcon;
        FallingDensity = config.FallingDensity;
        FallingSpeed = config.FallingSpeed;

        // 横幅高度配置
        bannerHeight = config.bannerHeight;

        // 按钮列表
        buttonsList = resolveButtonsList(config);

        // 横幅图片
        const bannerResult = await resolveBannerImage(
            config,
            getAdvancedEnabled(),
        );
        bannerImgSrc = bannerResult.bannerImgSrc;
    }

    // 格式化状态语言，将变量替换为统计信息（异步处理）
    let formattedStatsInfoText = $state("");

    async function updateFormattedStatsInfoText() {
        if (!statsInfoText) {
            formattedStatsInfoText = "";
            return;
        }

        let result = statsInfoText;

        // 异步加载所有统计数据
        const [
            startDate,
            blocksCount,
            notebooksCount,
            docsCount,
            nowDate,
            tasksCount,
            doneTasksCount,
            undoneTasksCount,
            dailynotesCount,
            tagsCount,
            codeBlocksCount,
            mathBlocksCount,
            citationCount,
        ] = await Promise.all([
            loadStatsData("startDate", plugin),
            loadStatsData("blocksCount", plugin),
            loadStatsData("notebooksCount", plugin),
            loadStatsData("docsCount", plugin),
            loadStatsData("nowDate", plugin),
            loadStatsData("tasksCount", plugin),
            loadStatsData("doneTasksCount", plugin),
            loadStatsData("undoneTasksCount", plugin),
            loadStatsData("dailynotesCount", plugin),
            loadStatsData("tagsCount", plugin),
            loadStatsData("codeBlocksCount", plugin),
            loadStatsData("mathBlocksCount", plugin),
            loadStatsData("citationCount", plugin),
        ]);

        // 替换所有变量
        result = result
            .replace("{{startDate}}", startDate?.toString() || "")
            .replace("{{blocksCount}}", blocksCount?.toString() || "")
            .replace("{{notebooksCount}}", notebooksCount?.toString() || "")
            .replace("{{docsCount}}", docsCount?.toString() || "")
            .replace("{{nowDate}}", nowDate?.toString() || "")
            .replace("{{tasksCount}}", tasksCount?.toString() || "")
            .replace("{{doneTasksCount}}", doneTasksCount?.toString() || "")
            .replace("{{undoneTasksCount}}", undoneTasksCount?.toString() || "")
            .replace("{{dailynotesCount}}", dailynotesCount?.toString() || "")
            .replace("{{tagsCount}}", tagsCount?.toString() || "")
            .replace("{{codeBlocksCount}}", codeBlocksCount?.toString() || "")
            .replace("{{mathBlocksCount}}", mathBlocksCount?.toString() || "")
            .replace("{{citationCount}}", citationCount?.toString() || "");

        // 处理 $...$ 表达式（异步）
        const durationRegex = /\$\$(.*?)\$\$/g;
        let match;
        const matches = [];
        while ((match = durationRegex.exec(result)) !== null) {
            matches.push({ full: match[0], expr: match[1].trim() });
        }

        for (const { full, expr } of matches) {
            const replacement =
                (await parseDurationExpression(expr, plugin)) || "";
            result = result.replace(full, replacement);
        }

        formattedStatsInfoText = result;
    }

    // 当 statsInfoText 变化时更新格式化文本
    run(() => {
        if (statsInfoText !== undefined) {
            updateFormattedStatsInfoText();
        }
    });

    // 过滤按钮列表，只显示未选中的按钮
    let filteredButtons = $derived(buttonsList.filter((b) => b.checked === false));

    // 更多按钮点击事件处理
    function handleDocumentClick(event: MouseEvent) {
        const target = event.target as Node;
        const isMoreButton = document
            .querySelector(".more-button")
            ?.contains(target);
        if (!isMoreButton && showMoreMenu) {
            showMoreMenu = false;
        }
    }
</script>

<div class="homepage-container">
    <!-- 头部横幅区域 -->
    <div
        class="section top-banner"
        class:hide-top-banner={!$showBanner}
        style:height={`${bannerHeight}px`}
    >
        <img
            bind:this={bannerImage}
            src={bannerImgSrc}
            crossorigin="anonymous"
            alt="Header Banner"
            class="banner-image"
            style="transition:transform 0.1s ease-out;"
            aria-hidden="true"
        />
        <div class="banner-overlay"></div>
        <!-- 按钮容器 -->
        <div class="button-wrapper">
            <button
                onclick={() => (
                    (bannerImage.style.transform = "translateY(0)"),
                    plugin.saveData("bannerPosition.json", { scrollTop: 0 })
                )}
                class="img-button"
                title="恢复默认位置"
            >
                <svg
                    data-t="1749395442435"
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    data-p-id="13980"
                    width="200"
                    height="200"
                >
                    <path
                        d="M787 787v-55h55v55h-55z m-55 55v-55h55v55h-55z m55-605h55v55h-55v-55z m-55-55h55v55h-55v-55zM237 787h55v55h-55v-55z m-55-55h55v55h-55v-55z m0-440v-55h55v55h-55z m55-110h55v55h-55v-55z"
                        fill="#DF4958"
                        data-p-id="13981"
                    ></path><path
                        d="M842 787V237h55v550h-55z m-55-605h55v55h-55v-55z m-605 55v-55h55v55h-55z m55 605h-55v-55h55v55z m605-55v55h-55v-55h55z m-55 110H237v-55h550v55zM127 787V237h55v550h-55z m110-660h550v55H237v-55z"
                        fill="#D53B4B"
                        data-p-id="13982"
                    ></path><path
                        d="M787 732v55h-55v55H292v-55h-55v-55h-55V292h55v-55h55v-55h440v55h55v55h55v440h-55z"
                        fill="#F36372"
                        data-p-id="13983"
                    ></path><path
                        d="M216.6 517.3h50.8v50.8h50.8V619H369v50.8h50.8v50.8h50.8V568.2h152.5v152.5h101.6v-305h-254V263.2h-50.8V314h-50.8v50.8h-50.8v50.8h-50.8v50.8h-50.8v50.9z"
                        fill="#FFFFFF"
                        data-p-id="13984"
                    ></path></svg
                >
            </button>
        </div>
    </div>

    <!-- 头部快捷区域 -->
    <div class="section workspace-header">
        <div class="header-content">
            {#if $showIcon}
                <div class="icon-title">
                    {#if titleIconType === "emoji"}
                        {@html tempTitleIconEmoji || "🏠"}
                    {:else if titleIconType === "image" && tempTitleIconImage}
                        <img
                            src={tempTitleIconImage}
                            alt="图标"
                            style="width: 32px; height: 32px; 
               border-radius: {tempTitleIconStyle === 'square'
                                ? '0%'
                                : tempTitleIconStyle === 'round'
                                  ? '20%'
                                  : '50%'};"
                        />
                    {/if}
                </div>
            {/if}
            <h1 class="section-title">{pageTitle}</h1>
        </div>

        <div class="stats-info" style="white-space: pre-line">
            {formattedStatsInfoText}
        </div>

        <!-- 快捷按钮栏 -->
        <div
            class="nav-bar"
            role="navigation"
            aria-label="主菜单导航栏"
            onmouseenter={() => (isHoveringNavBar = true)}
            onmouseleave={() => (isHoveringNavBar = false)}
        >
            <div class="nav-bar-left"></div>
            <div class="nav-buttons">
                {#each [...buttonsList].sort((a, b) => a.order - b.order) as sortedButtons}
                    {#if sortedButtons.checked}
                        <button
                            class="nav-button"
                            onclick={() =>
                                handleButtonClick(
                                    sortedButtons,
                                    plugin,
                                    currentBlockForSettingsRef,
                                    saveLayout,
                                )}
                        >
                            {sortedButtons.label}
                        </button>
                    {/if}
                {/each}
            </div>

            <div class="nav-bar-right">
                <button
                    class="nav-button more-button"
                    class:hidden={!isHoveringNavBar ||
                        filteredButtons.length === 0}
                    onclick={() => {
                        const newShowMoreMenu =
                            handleMoreButtonClick(showMoreMenu);
                        showMoreMenu = newShowMoreMenu;
                    }}
                >
                    更多
                </button>

                {#if showMoreMenu && filteredButtons.length > 0}
                    <div class="more-menu">
                        {#each filteredButtons as item}
                            <button
                                class="more-menu-item"
                                onclick={() => {
                                    handleButtonClick(
                                        item,
                                        plugin,
                                        currentBlockForSettingsRef,
                                        saveLayout,
                                    );
                                    showMoreMenu = false;
                                }}
                            >
                                {item.label}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- 自定义组件区域 -->
    <div
        class="section custom-content"
        role="region"
        aria-label="自定义组件区域"
        style="grid-template-columns: repeat({widgetLayoutNumber}, 1fr);
        gap: {widgetGap}rem;"
    ></div>

    <!-- 插件信息底部区域 -->
    {#if advanced}
        {#if footerEnabled}
            <div class="section plugin-footer">
                <div class="plugin-info">
                    {#if footerContent === ""}
                        <div class="plugin-name">🏠思源笔记主页插件</div>
                        <div class="plugin-author">作者: Glaube-TY</div>
                        <div class="plugin-support">
                            <a
                                href="https://ttl8ygt82u.feishu.cn/wiki/Skg2woe9DidYNNkQSiEcWRLrnRg#share-S7k1dPUtuomNB3x1hg8coMnunZf"
                                class="support-link">赞助支持 💸</a
                            >
                        </div>
                    {:else}
                        {@html MD2HTML(footerContent)}
                    {/if}
                </div>
            </div>
        {/if}
    {:else}
        <div class="section plugin-footer">
            <div class="plugin-info">
                <div class="plugin-name">🏠思源笔记主页插件</div>
                <div class="plugin-author">作者: Glaube-TY</div>
                <div class="plugin-support">
                    <a
                        href="https://ttl8ygt82u.feishu.cn/wiki/Skg2woe9DidYNNkQSiEcWRLrnRg#share-S7k1dPUtuomNB3x1hg8coMnunZf"
                        class="support-link">赞助支持 💸</a
                    >
                </div>
            </div>
        </div>
    {/if}

    <!-- 飘落背景层 -->
    <div class="falling-container">
        {#each Array(20) as _, i}
            <div
                class="falling-flake"
                style="--animation-delay: {i * 0.2}s"
            ></div>
        {/each}
    </div>
</div>
