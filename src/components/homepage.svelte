<script lang="ts">
    import { onMount } from "svelte";

    import { writable } from "svelte/store";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
    } from "./utils/widgetBlock/utils/layout-handler";
    import { initDrag } from "./utils/topBanner/drag";
    import {
        loadStatsData,
        type StatsData,
        parseDurationExpression,
    } from "./utils/stats-loader";
    import {
        handleMoreButtonClick,
        handleButtonClick,
        reRegisterAllShortcuts,
        unregisterAllShortcuts,
    } from "./utils/quickButton";

    import "./style/homepage.scss";

    export const app = undefined;
    export let plugin: any;
    export let showIcon = writable(true);

    let bannerImage: HTMLImageElement;
    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let statsData: StatsData = {
        startDate: "(日期)",
        notesCount: 0,
        notebooksCount: 0,
        DocsCount: 0,
        nowDate: "(日期)",
    };

    let showBanner = writable(true);
    let titleIconType: "emoji" | "image" = "emoji";
    let tempTitleIconEmoji = "🏠";
    let tempTitleIconImage: string | null = null;
    let pageTitle = "思源笔记首页";
    let tempTitleIconStyle: string = "square";

    let statsInfoText =
        "自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{notesCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{DocsCount}} 篇笔记。\n感谢自己的坚持！❤";

    type ButtonItem = {
        id: number;
        label: string;
        checked: boolean;
        shortcut?: string;
        order: number;
    };
    let buttonsList: ButtonItem[] = [];
    let showMoreMenu = false;
    let isHoveringNavBar = false;

    const handleDocumentClick = (event: MouseEvent) => {
        const target = event.target as Node;
        const isMoreButton = document
            .querySelector(".more-button")
            ?.contains(target);
        if (!isMoreButton && showMoreMenu) {
            showMoreMenu = false;
        }
    };

    $: filteredButtons = buttonsList.filter((b) => b.checked === false);

    $: formattedStatsInfoText = (statsInfoText || "")
        .replace("{{startDate}}", statsData.startDate || "")
        .replace("{{notesCount}}", statsData.notesCount.toString())
        .replace("{{notebooksCount}}", statsData.notebooksCount.toString())
        .replace("{{DocsCount}}", statsData.DocsCount.toString())
        .replace("{{nowDate}}", statsData.nowDate || "")
        .replace(/\$\$(.*?)\$\$/g, (_, expr) => {
            return parseDurationExpression(expr.trim(), statsData) || "";
        });

    onMount(() => {
        (async () => {
            // 页面加载完成后初始化拖拽
            if (document.readyState === "complete") {
                handleLoad();
            } else {
                window.addEventListener("load", handleLoad);
            }

            // 加载统计数据
            statsData = await loadStatsData();

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
        })();

        setTimeout(async () => {
            await updateHomepage();
        }, 100);

        document.addEventListener("click", handleDocumentClick);
        reRegisterAllShortcuts(buttonsList);

        return () => {
            window.removeEventListener("load", handleLoad);
            document.removeEventListener("click", handleDocumentClick);
            unregisterAllShortcuts();
        };
    });

    const updateHomepage = async () => {
        const config =
            (await plugin.loadData("homepageSettingConfig.json")) || {};

        // 标题相关配置
        showBanner.set(config.bannerEnabled !== false);
        showIcon.set(config.showIcon !== false);

        // 标题区域配置
        tempTitleIconEmoji = config.TitleIconEmoji;
        tempTitleIconImage = config.TitleIconImage;
        titleIconType = config.titleIconType || "emoji";
        pageTitle = config.customTitle || "思源笔记首页";
        tempTitleIconStyle = config.tempTitleIconStyle || "square";

        statsInfoText = config.statsInfoText;

        const bannerElement =
            document.querySelector<HTMLElement>(".top-banner");
        if (bannerElement) {
            if (config.bannerHeight && !isNaN(parseInt(config.bannerHeight))) {
                bannerElement.style.height = `${parseInt(config.bannerHeight)}px`;
            } else {
                bannerElement.style.height = "300px";
            }
        }

        if (config.bannerEnabled) {
            if (config.bannerType === "local" && config.bannerLocalData) {
                bannerImage.src = config.bannerLocalData;
            } else if (
                config.bannerType === "remote" &&
                config.bannerRemoteUrl
            ) {
                bannerImage.src = config.bannerRemoteUrl;
            }
        } else {
            bannerImage.style.display = "none";
        }

        if (config.buttonsList) {
            buttonsList = config.buttonsList.map((item) => ({
                id: item.id,
                label: item.label,
                checked: item.checked,
                shortcut: item.shortcut || "",
            }));
        } else {
            // 默认按钮数据
            buttonsList = [
                {
                    id: 1728000000000,
                    label: "🔍 搜索笔记",
                    checked: true,
                    shortcut: "Ctrl+P",
                    order: 0,
                },
                {
                    id: 1728000001000,
                    label: "📅 今日日记",
                    checked: true,
                    shortcut: "Alt+5",
                    order: 1,
                },
                {
                    id: 1728000002000,
                    label: "➕ 添加组件",
                    checked: true,
                    order: 2,
                },
                {
                    id: 1728000003000,
                    label: "⚙ 主页设置",
                    checked: true,
                    order: 3,
                },
            ];
        }
    };

    function handleLoad() {
        if (bannerImage && bannerImage.parentElement) {
            initDrag(bannerImage, plugin);
        }
    }
</script>

<div class="container">
    <!-- 头部横幅区域 -->
    <div class="section top-banner" class:hide-top-banner={!$showBanner}>
        <img
            bind:this={bannerImage}
            src="https://haowallpaper.com/link/common/file/previewFileImg/16994939099139456"
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
                on:click={() => (
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
            on:mouseenter={() => (isHoveringNavBar = true)}
            on:mouseleave={() => (isHoveringNavBar = false)}
        >
            <div class="nav-bar-left"></div>
            <div class="nav-buttons">
                {#each [...buttonsList].sort((a, b) => a.order - b.order) as sortedButtons}
                    {#if sortedButtons.checked}
                        <button
                            class="nav-button"
                            on:click={() =>
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
                    on:click={() => {
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
                                on:click={() => {
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
    ></div>

    <!-- 插件信息底部区域 -->
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
</div>
