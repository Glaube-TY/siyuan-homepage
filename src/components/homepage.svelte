<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    import { writable } from "svelte/store";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
    } from "./utils/widgetBlock/utils/layout-handler";
    import { handleLoad } from "./utils/topBanner/drag";
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
    import { MD2HTML } from "@/components/tools/MD2HTML";
    import { getImage } from "@/components/tools/getImage";

    import "./style/homepage.scss";

    export const app = undefined;
    export let plugin: any;
    export let showIcon = writable(true);

    let showBanner = writable(true);
    let bannerImage: HTMLImageElement;
    let bannerGlobalType = "custom";
    let bannerImgSrc = "";
    let remoteBannerImageData: string = "";
    let bannerLocalData: string;
    let bannerRemoteUrl: string;
    let bingApiType = "POD_UHD";

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let statsData: StatsData = {
        startDate: "(日期)",
        notesCount: 0,
        notebooksCount: 0,
        DocsCount: 0,
        nowDate: "(日期)",
    };

    let titleIconType: "emoji" | "image" = "emoji";
    let tempTitleIconEmoji = "🏠";
    let tempTitleIconImage: string | null = null;
    let pageTitle = "思源笔记首页";
    let tempTitleIconStyle: string = "square";

    let statsInfoText =
        "自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{notesCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{DocsCount}} 篇笔记。\n感谢自己的坚持！❤";

    let footerEnabled = true;
    let footerContent = "";

    let mouseIcon = "default";
    let mouseGlobalEnabled = false;
    let MouseTrailEnabled = false;
    let ClickEffectEnabled = false;
    let ClickEffectContent = "";
    let FallEffectsEnabled = false;
    let GlobalFallingEffectsEnabled = false;
    let FallingIcon = "snow";
    let FallingDensity = "medium";
    let FallingSpeed = "medium";
    let advanced = false;

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

    let widgetLayoutNumber = 4;
    let widgetGap = 0.2;

    onMount(async () => {
        // 页面加载完成后初始化拖拽
        if (document.readyState === "complete") {
            handleLoad(plugin, bannerImage);
        } else {
            window.addEventListener("load", () =>
                handleLoad(plugin, bannerImage),
            );
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

        setTimeout(async () => {
            await updateHomepage();
        }, 100);

        reRegisterAllShortcuts(buttonsList);
        document.addEventListener("click", handleDocumentClick);

        preloadFallingIcons();
        animationFrameId = requestAnimationFrame(animateFalling);
        document.addEventListener("click", createClickEffect);
        document.addEventListener("mousemove", createMouseTrail);
    });

    onDestroy(() => {
        document
            .querySelectorAll(".falling-flake")
            .forEach((el) => el.remove());
        window.removeEventListener("load", () =>
            handleLoad(plugin, bannerImage),
        );
        document.removeEventListener("click", handleDocumentClick);
        document.removeEventListener("click", createClickEffect);
        document.removeEventListener("mousemove", createMouseTrail);
        unregisterAllShortcuts();
        cancelAnimationFrame(animationFrameId);
    });

    // 光标样式监听
    $: {
        if (
            window.navigator.userAgent.includes("Electron") ||
            typeof window.require === "function"
        ) {
            if (advanced) {
                let containertext = ".homepage-container";
                if (mouseGlobalEnabled) {
                    containertext = "body";
                }
                const container = document.querySelector(
                    containertext,
                ) as HTMLElement;
                if (container) {
                    if (mouseIcon === "default") {
                        container.style.cursor = "auto";
                    } else if (mouseIcon === "CYWL1") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/CYWL1.png`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "CYWL2") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/CYWL2.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "WDSJsword") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/WDSJsword.cur`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "WDSJpickaxe") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/WDSJpickaxe.cur`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "cat1") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/cat1.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "cat2") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/cat2.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "cat3") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/cat3.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "arrow1") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/arrow1.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "arrow2") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/arrow2.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "arrow3") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/arrow3.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "arrow4") {
                        container.style.cursor = `url('${encodeURI(`/plugins/siyuan-homepage/asset/mouseIcon/arrow4.ico`.replace(/\\/g, "/"))}'), auto`;
                    } else if (mouseIcon === "arrow5") {
                        container.style.cursor = `url('${encodeURI(`/plugins/siyuan-homepage/asset/mouseIcon/arrow5.ico`.replace(/\\/g, "/"))}'), auto`;
                    } else if (mouseIcon === "arrow6") {
                        container.style.cursor = `url('${encodeURI(`/plugins/siyuan-homepage/asset/mouseIcon/arrow6.ico`.replace(/\\/g, "/"))}'), auto`;
                    } else if (mouseIcon === "arrow7") {
                        container.style.cursor = `url('${encodeURI(`/plugins/siyuan-homepage/asset/mouseIcon/arrow7.ico`.replace(/\\/g, "/"))}'), auto`;
                    } else if (mouseIcon === "LOL1") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/LOL1.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "LOL2") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/LOL2.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "LOL3") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/LOL3.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "LOL4") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/LOL4.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    } else if (mouseIcon === "CBPK2077") {
                        const pointerIconPath = `/plugins/siyuan-homepage/asset/mouseIcon/CBPK2077.ico`;
                        container.style.cursor = `url('${encodeURI(pointerIconPath)}'), auto`;
                    }
                }
            }
        }
    }

    // 点击特效逻辑
    const defaultClickEffects = [
        "(￣▽￣)~*",
        "(>_<)",
        "٩(◕‿◕｡)۶",
        "(；´д｀)ゞ",
        "☆*:.｡.o(≧▽≦)o.｡.:*☆",
        "ヾ(•ω•`)o",
        "ヽ(￣ω￣(。。 )ゝ",
        "(´• ω •`)",
        "(╯°□°）╯︵ ┻━┻",
        "¯_(ツ)_/¯",
        "(✧ω✧)",
        "(￢_￢)",
        "ಠ_ಠ",
        "(⁄ ⁄•⁄ω⁄•⁄ ⁄)",
        "ヾ(⌐■_■)ノ♪",
        "༼ つ ◕_◕ ༽つ",
        "(◕‿◕✿)",
        "｡：ﾟ(;´∩`;)ﾟ：｡",
        "ヽ(￣д￣;)ノ=3=3=3",
        "(๑•̀ㅂ•́)و✧",
        "╮(─▽─)╭",
        "(。>︿<)_θ",
        "٩(｡•́‿•̀｡)۶",
        "ヽ(￣▽￣)ﾉ",
        "(´･ω･`)",
        "(◐ω◑ )",
        "(◞‸◟ )",
        "Σ(っ°Д°;)っ",
        "⊙▃⊙",
        "(ノへ￣、)",
        "(づ￣ ³￣)づ",
        "٩(˘◡˘)۶",
        "Ｏ(≧口≦)Ｏ",
        "★~(◠﹏⊙✿)",
        "✪ ω ✪",
        "●﹏●",
        "（>ω<）",
        "｡ﾟ( ﾟஇ‸இﾟ)ﾟ｡",
        "(*/ω＼*)",
        "(,,•́ . •̀,,)",
    ];
    let effectIndex = 0;
    function createClickEffect(e: MouseEvent) {
        if (!advanced) return;
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            return;
        }
        if (!ClickEffectEnabled) return;

        const customEffects = ClickEffectContent
            ? ClickEffectContent.split("\n").filter((line) => line.trim())
            : defaultClickEffects;

        const effectsToUse =
            customEffects.length > 0 ? customEffects : defaultClickEffects;

        let container = document.querySelector(
            ".homepage-container",
        ) as HTMLElement;
        if (!mouseGlobalEnabled && container) {
            const rect = container.getBoundingClientRect();
            if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            ) {
                return;
            }
        }

        const span = document.createElement("span");
        span.textContent = effectsToUse[effectIndex];
        effectIndex = (effectIndex + 1) % effectsToUse.length;

        const x = e.pageX;
        const y = e.pageY;
        span.style.cssText = `
            z-index: 999999;
            top: ${y - 20}px;
            left: ${x}px;
            position: fixed;
            font-weight: bold;
            color: rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255});
            transition: all 1.5s ease-out;
            pointer-events: none;
        `;

        document.body.appendChild(span);

        requestAnimationFrame(() => {
            span.style.top = `${y - 180}px`;
            span.style.opacity = "0";
        });

        setTimeout(() => span.remove(), 1500);
    }

    // 鼠标轨迹特效逻辑
    let trailElements: HTMLElement[] = [];
    function createMouseTrail(e: MouseEvent) {
        if (!advanced) return;
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            return;
        }
        if (!MouseTrailEnabled) return;
        let containertext = ".homepage-container";
        if (mouseGlobalEnabled) {
            containertext = "body";
        }
        const container = document.querySelector(containertext);
        if (!container) return;

        const rect = container.getBoundingClientRect();

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const trail = document.createElement("div");
        trail.className = "mouse-trail";
        trail.style.cssText = `
            left: ${x}px;
            top: ${y}px;
            opacity: 0.7;
        `;

        container?.appendChild(trail);
        trailElements.push(trail);

        if (trailElements.length > 1000) {
            const old = trailElements.shift();
            old?.remove();
        }

        requestAnimationFrame(() => {
            trail.style.opacity = "0";
            trail.style.transform = "scale(2)";
        });

        setTimeout(() => trail.remove(), 1000);
    }

    // 飘落特效逻辑
    let fallingIconCache: { [key: string]: string } = {};
    function preloadFallingIcons() {
        const icons = [
            "snow",
            "cherry",
            "cherryPetal",
            "greenery",
            "mapleLeaf",
            "bodhiLeaf",
            "ginkgoLeaf",
            "dandelion",
            "bambooLeaf",
            "QZHIHE",
            "paperPlane",
            "HMBB",
            "PDX",
            "Rinka",
            "heart",
            "rose",
            "star",
        ];

        icons.forEach((icon) => {
            const iconPath =
                `/plugins/siyuan-homepage/asset/fallingIcon/${icon}.png`.replace(
                    /\\/g,
                    "/",
                );
            fallingIconCache[icon] = iconPath;
        });
    }
    let animationFrameId: number;
    const fallingFlakesPool: HTMLImageElement[] = [];
    const maxFallingElement = 1000;
    let minInterval = 500;
    $: {
        if (FallingDensity === "low") {
            minInterval = 2000;
        } else if (FallingDensity === "medium") {
            minInterval = 100;
        } else if (FallingDensity === "high") {
            minInterval = 200;
        }
    }
    let densityBasedDuration = 5;
    $: {
        if (FallingSpeed === "low") {
            densityBasedDuration = 10;
        } else if (FallingSpeed === "medium") {
            densityBasedDuration = 5;
        } else if (FallingSpeed === "high") {
            densityBasedDuration = 2;
        }
    }
    function createFallingFlake() {
        if (!advanced) return;
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            return;
        }
        if (!FallEffectsEnabled) return;

        const container = GlobalFallingEffectsEnabled
            ? document.body
            : document.querySelector(".homepage-container");
        if (!container) return;

        const activeFlakes = container.querySelectorAll("img").length;
        if (activeFlakes >= maxFallingElement) return;

        const iconSrc =
            fallingIconCache[FallingIcon] || fallingIconCache["snow"];

        let flake: HTMLImageElement;

        if (fallingFlakesPool.length > 0) {
            flake = fallingFlakesPool.pop()!;
            flake.style.display = "block";
        } else {
            flake = document.createElement("img");
            flake.style.position = "fixed";
            flake.style.zIndex = "9999";
            flake.style.pointerEvents = "none";
            flake.style.opacity = "1";
            flake.style.animation = `falling ${densityBasedDuration}s linear forwards`;
            flake.style.animationTimingFunction = "linear";
            flake.style.animationFillMode = "forwards";
        }

        flake.src = iconSrc;

        const randomSize = Math.floor(Math.random() * 20) + 10;
        flake.style.width = `${randomSize}px`;
        flake.style.height = "auto";

        const wind = `${(Math.random() - 0.5) * 100}px`;
        const rotation = `${Math.random() * 360}deg`;
        flake.style.setProperty("--wind", wind);
        flake.style.setProperty("--rotation", rotation);

        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;

        const startX = Math.random() * containerWidth;
        flake.style.left = `${startX}px`;
        flake.style.top = "-10vh";
        flake.style.position = "absolute";

        animateVisibilityCheck(flake);

        flake.addEventListener("animationiteration", () => {
            const rect = flake.getBoundingClientRect();
            const isInViewport =
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= window.innerHeight &&
                rect.right <= window.innerWidth;

            if (!isInViewport) {
                flake.style.display = "none";
                fallingFlakesPool.push(flake);
            }
        });

        container.appendChild(flake);
    }
    function animateVisibilityCheck(flake: HTMLImageElement) {
        const check = () => {
            const rect = flake.getBoundingClientRect();
            if (rect.top > window.innerHeight * 0.85) {
                flake.style.display = "none";
                fallingFlakesPool.push(flake);
            } else {
                requestAnimationFrame(check);
            }
        };
        check();
    }
    let lastTime = 0;
    function animateFalling(timestamp: number) {
        if (!lastTime || timestamp - lastTime > minInterval) {
            createFallingFlake();
            lastTime = timestamp;
        }
        animationFrameId = requestAnimationFrame(animateFalling);
    }

    // 更新加载主页配置
    async function updateHomepage() {
        const config =
            (await plugin.loadData("homepageSettingConfig.json")) || {};

        // 组件设置
        widgetLayoutNumber = config.widgetLayoutNumber || 4;
        widgetGap = config.widgetGap || 0.2;

        advanced = plugin.ADVANCED;

        // 横幅相关配置
        showBanner.set(config.bannerEnabled !== false);
        bannerGlobalType = config.bannerGlobalType || "custom";
        bannerLocalData = config.bannerLocalData || "";
        bannerRemoteUrl = config.bannerRemoteUrl || "";
        bingApiType = config.bingApiType || "POD_UHD";

        showIcon.set(config.showIcon !== false);
        // 标题区域配置
        tempTitleIconEmoji = config.TitleIconEmoji;
        tempTitleIconImage = config.TitleIconImage;
        titleIconType = config.titleIconType || "emoji";
        pageTitle = config.customTitle || "思源笔记首页";
        tempTitleIconStyle = config.tempTitleIconStyle || "square";

        statsInfoText = config.statsInfoText;

        // 页脚配置
        footerEnabled = config.footerEnabled ?? true;
        footerContent = config.footerContent || "";

        // 鼠标特效配置
        mouseIcon = config.mouseIcon || "default";
        MouseTrailEnabled = config.MouseTrailEnabled ?? false;
        mouseGlobalEnabled = config.mouseGlobalEnabled ?? true;
        ClickEffectEnabled = config.ClickEffectEnabled ?? false;
        ClickEffectContent = config.ClickEffectContent || "";
        FallEffectsEnabled = config.FallEffectsEnabled ?? false;
        GlobalFallingEffectsEnabled =
            config.GlobalFallingEffectsEnabled ?? false;
        FallingIcon = config.FallingIcon || "snow";
        FallingDensity = config.FallingDensity || "medium";
        FallingSpeed = config.FallingSpeed || "medium";

        const bannerElement =
            document.querySelector<HTMLElement>(".top-banner");
        if (bannerElement) {
            if (config.bannerHeight && !isNaN(parseInt(config.bannerHeight))) {
                bannerElement.style.height = `${parseInt(config.bannerHeight)}px`;
            } else {
                bannerElement.style.height = "300px";
            }
        }

        if (config.buttonsList) {
            buttonsList = config.buttonsList.map((item) => ({
                id: item.id,
                label: item.label,
                checked: item.checked,
                shortcut: item.shortcut || "",
            }));

            // 重置远程图片数据
            remoteBannerImageData = "";

            if (config.bannerEnabled) {
                if (bannerGlobalType === "custom") {
                    if (config.bannerType === "local") {
                        bannerImgSrc = bannerLocalData;
                    } else if (config.bannerType === "remote") {
                        if (
                            !window.navigator.userAgent.includes("Electron") ||
                            typeof window.require !== "function"
                        ) {
                            // 使用 getImage 获取远程图片
                            remoteBannerImageData =
                                await getImage(bannerRemoteUrl);
                        }
                        bannerImgSrc = remoteBannerImageData || bannerRemoteUrl;
                    }
                } else if (bannerGlobalType === "bing" && advanced) {
                    let bingImageUrl = "";
                    if (bingApiType === "POD_UHD") {
                        bingImageUrl = "https://bing.img.run/uhd.php";
                    } else if (bingApiType === "POD_1K") {
                        bingImageUrl = "https://bing.img.run/1920x1080.php";
                    } else if (bingApiType === "POD_Normal") {
                        bingImageUrl = "https://bing.img.run/1366x768.php";
                    } else if (bingApiType === "rand_uhd") {
                        bingImageUrl = "https://bing.img.run/rand_uhd.php";
                    } else if (bingApiType === "rand_1K") {
                        bingImageUrl = "https://bing.img.run/rand.php";
                    } else if (bingApiType === "rand_Normal") {
                        bingImageUrl = "https://bing.img.run/rand_1366x768.php";
                    } else if (bingApiType === "ECY1") {
                        bingImageUrl = "https://www.dmoe.cc/random.php";
                    } else if (bingApiType === "RAND1") {
                        bingImageUrl = "https://api.btstu.cn/sjbz/api.php";
                    }

                    // 使用 getImage 获取 Bing 图片
                    if (bingImageUrl) {
                        if (
                            !window.navigator.userAgent.includes("Electron") ||
                            typeof window.require !== "function"
                        ) {
                            remoteBannerImageData =
                                await getImage(bingImageUrl);
                        }
                        bannerImgSrc = remoteBannerImageData || bingImageUrl;
                    }
                } else if (bannerGlobalType === "bing" && !advanced) {
                    const notVIPImagePath = `/plugins/siyuan-homepage/asset/bannerImg/notVIP.jpg`;
                    bannerImgSrc = notVIPImagePath;
                }
            }
        } else {
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
    }

    // 格式化状态语言，将变量替换为统计信息
    $: formattedStatsInfoText = (statsInfoText || "")
        .replace("{{startDate}}", statsData.startDate || "")
        .replace("{{notesCount}}", statsData.notesCount.toString())
        .replace("{{notebooksCount}}", statsData.notebooksCount.toString())
        .replace("{{DocsCount}}", statsData.DocsCount.toString())
        .replace("{{nowDate}}", statsData.nowDate || "")
        .replace(/\$\$(.*?)\$\$/g, (_, expr) => {
            return parseDurationExpression(expr.trim(), statsData) || "";
        });

    // 过滤按钮列表，只显示未选中的按钮
    $: filteredButtons = buttonsList.filter((b) => b.checked === false);

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
    <div class="section top-banner" class:hide-top-banner={!$showBanner}>
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
