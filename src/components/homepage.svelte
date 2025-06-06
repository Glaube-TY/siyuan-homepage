<script lang="ts">
    import { onMount } from "svelte";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
    } from "./utils/widgetBlock/utils/layout-handler";
    import { initDrag } from "./utils/topBanner/drag";
    import {
        handleLocalImageUpload,
        promptForRemoteImage,
        resetBannerPosition,
    } from "./utils/topBanner/image-handler";
    import {
        triggerSearchNotes,
        triggerOpenTodayDiary,
    } from "./utils/keyboard-handler";
    import { loadStatsData, type StatsData } from "./utils/stats-loader";
    import { addCustomBlock } from "./utils/widgetBlock/utils/block-creator";

    import "./style/homepage.scss";

    export const app = undefined;
    export let plugin;

    let bannerImage: HTMLImageElement;
    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let statsData: StatsData = {
        startDate: "(日期)",
        totalNotes: 0,
        notebooksCount: 0,
        notesCount: 0,
    };

    // 初始化拖拽
    function handleLoad() {
        if (bannerImage && bannerImage.parentElement) {
            initDrag(bannerImage, plugin);
        }
    }

    onMount(() => {
        (async () => {
            // 加载用户设置的图片
            const imageData = await plugin.loadData("bannerImage.json");
            if (imageData?.url) {
                bannerImage.src = imageData.url;
            }

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

        // 返回的清理函数必须是同步的
        return () => {
            window.removeEventListener("load", handleLoad);
        };
    });
</script>

<div class="container">
    <!-- 头部横幅区域 -->
    <div class="section top-banner">
        <img
            bind:this={bannerImage}
            src="assets/topbanner/top.jpg"
            crossorigin="anonymous"
            alt="Header Banner"
            class="banner-image"
            style="transition:transform 0.1s ease-out;"
            aria-hidden="true"
        />
        <div class="banner-overlay"></div>
        <!-- 按钮容器 -->
        <div class="button-wrapper">
            <input
                type="file"
                id="localImageInput"
                accept="image/*"
                on:change={handleLocalImageUpload(plugin, bannerImage)}
            />
            <button
                on:click={() =>
                    document.getElementById("localImageInput")?.click()}
                class="img-button local-image-btn"
                aria-label="选择本地图片"
            >
                🖼
                <span class="tooltip">选择本地图片</span>
            </button>
            <button
                on:click={promptForRemoteImage(plugin, bannerImage)}
                class="img-button remote-image-btn"
                aria-label="选择网络图片"
            >
                🌐
                <span class="tooltip">选择网络图片</span>
            </button>
            <button
                on:click={resetBannerPosition(bannerImage)}
                class="img-button"
                aria-label="恢复默认位置"
            >
                ♻️
                <span class="tooltip">恢复默认位置</span>
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

    <!-- 自适应区域 -->
    <div class="section plugin-footer"></div>
</div>
