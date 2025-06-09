<script lang="ts">
    import { onMount } from "svelte";
    import { svelteDialog } from "@/libs/dialog";
    import { writable } from "svelte/store";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
    } from "./utils/widgetBlock/utils/layout-handler";
    import { initDrag } from "./utils/topBanner/drag";
    import { resetBannerPosition } from "./utils/topBanner/image-handler";
    import {
        triggerSearchNotes,
        triggerOpenTodayDiary,
    } from "./utils/keyboard-handler";
    import { loadStatsData, type StatsData } from "./utils/stats-loader";
    import { addCustomBlock } from "./utils/widgetBlock/utils/block-creator";

    import HomepageSetting from "./utils/homepageSetting.svelte";

    import "./style/homepage.scss";

    export const app = undefined;
    export let plugin: any;

    let bannerImage: HTMLImageElement;
    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let statsData: StatsData = {
        startDate: "(日期)",
        totalNotes: 0,
        notebooksCount: 0,
        notesCount: 0,
    };

    let showBanner = writable(true);

    function OpenHomepageSetting() {
        const dialog = svelteDialog({
            title: "主页设置",
            constructor: (containerEl: HTMLElement) => {
                return new HomepageSetting({
                    target: containerEl,
                    props: {
                        plugin: plugin,
                        close: () => {
                            dialog.close();
                        },
                    },
                });
            },
        });
    }

    // 初始化拖拽
    function handleLoad() {
        if (bannerImage && bannerImage.parentElement) {
            initDrag(bannerImage, plugin);
        }
    }

    const updateBannerStyle = async () => {
        const config =
            (await plugin.loadData("homepageSettingConfig.json")) || {};
        showBanner.set(config.bannerEnabled !== false);

        const bannerElement =
            document.querySelector<HTMLElement>(".top-banner");
        if (bannerElement) {
            if (config.bannerHeight && !isNaN(parseInt(config.bannerHeight))) {
                bannerElement.style.height = `${parseInt(config.bannerHeight)}px`;
            } else {
                bannerElement.style.height = "300px"; // 默认值兜底
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
    };

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
            const container = document.querySelector(
                ".custom-content",
            ) as HTMLElement;
            new Sortable(container, {
                animation: 150,
                ghostClass: "sortable-ghost",
                onEnd: () => saveLayout(plugin),
            });

            await restoreLayout(plugin, { value: container });
        })();

        updateBannerStyle();

        return () => {
            window.removeEventListener("load", handleLoad);
        };
    });
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
                on:click={resetBannerPosition(bannerImage)}
                class="img-button"
                aria-label="恢复默认位置"
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
                <span class="tooltip">恢复图片默认位置</span>
            </button>
        </div>
    </div>

    <!-- 头部快捷区域 -->
    <div class="section workspace-header">
        <div class="header-content">
            <div class="icon-title">🏠</div>
            <h1 class="section-title">思源笔记首页</h1>
        </div>
        <div class="stats-info">
            自 <span class="highlight">{statsData.startDate}</span>
            写下第一条笔记以来，你已累计记录笔记
            <span class="highlight">{statsData.totalNotes}</span>
            条。<br />
            当前共有
            <span class="highlight">{statsData.notebooksCount}</span>
            个笔记本和
            <span class="highlight">{statsData.notesCount}</span> 篇笔记。<br />
            感谢自己的坚持！❤
        </div>
        <!-- 导航栏 -->
        <div class="nav-bar">
            <button class="nav-button" on:click={triggerSearchNotes}>
                🔍 搜索笔记
            </button>
            <button class="nav-button" on:click={triggerOpenTodayDiary}>
                📅 打开今日日记
            </button>
            <button
                class="nav-button"
                on:click={() => {
                    addCustomBlock(plugin, currentBlockForSettingsRef);
                    saveLayout(plugin);
                }}
            >
                ➕ 添加区块
            </button>
            <button class="nav-button" on:click={OpenHomepageSetting}
                >⚙️ 打开设置</button
            >
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
            <div class="plugin-name">💖思源笔记首页插件</div>
            <div class="plugin-author">作者: Glaube-TY</div>
            <div class="plugin-support">
                <a
                    href="https://ttl8ygt82u.feishu.cn/wiki/XNDewmTaEid9AzkaUk2cgciQnMg"
                    class="support-link">赞助支持 💸</a
                >
            </div>
        </div>
    </div>
</div>
