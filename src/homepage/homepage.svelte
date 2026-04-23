<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy, tick } from "svelte";

    import { writable } from "svelte/store";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
    } from "../components/utils/widgetBlock/utils/layout-handler";
    import { loadWidgetLayoutSettings } from "../components/utils/widgetBlock/utils/layout-shared";
    import { handleLoad } from "./topBanner/drag";
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
    import { normalizeSiyuanDocIcon } from "@/components/tools/docIcon";
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
        loadBannerDisplaySettings,
        saveBannerDisplaySettings,
    } from "./configLoader";
    import {
        getCurrentDeviceInfo,
        isDesktopDeviceProfileEnabled,
        updateDeviceProfile,
        findExistingDeviceByHardware,
        deduplicateDeviceProfiles,
    } from "./utils/deviceProfile";

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
        $state("自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{blocksCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{docsCount}} 篇笔记。\n感谢自己的坚持！❤");

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
    let sortable: Sortable | null = null;
    let layoutObserver: MutationObserver | null = null;
    let destroyBannerDrag: (() => void) | null = null;

    // 本地容器引用：避免全局 selector 在实例重叠时命中错容器
    let customContentContainer: HTMLElement | null = null;

    // 异步请求版本戳，用于丢弃过期结果
    let updateHomepageVersion = 0;
    let updateStatsVersion = 0;

    // 前台同步检测定时器
    let foregroundSyncWatchTimer: ReturnType<typeof setInterval> | null = null;
    const FOREGROUND_SYNC_WATCH_INTERVAL = 30000; // 30 秒检测一次

    // 首次初始化标记：用于确保只在启动期写盘动作完成后记录一次签名基线
    let initialSignaturesRecorded = false;

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

    // 横幅拖拽配置选项（设备级存储）
    const bannerDragOptions = {
        onLoadPosition: async () => {
            const settings = await loadBannerDisplaySettings(plugin);
            return { scrollTop: settings.scrollTop };
        },
        onSavePosition: async (position) => {
            await saveBannerDisplaySettings(plugin, { scrollTop: position.scrollTop });
        },
    };

    // 初始化横幅拖拽（带清理闭环）
    function initBannerDrag() {
        destroyBannerDrag?.();
        destroyBannerDrag = handleLoad(plugin, bannerImage, bannerDragOptions) ?? null;
    }

    // 具名函数用于 window load 监听器
    const onWindowLoad = () => {
        initBannerDrag();
    };

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
    // 注意：plugin 侧（src/index.ts）是签名检测主入口，homepage.svelte 侧只是补充检测
    function handleVisibilityChange(): void {
        if (document.visibilityState === "visible") {
            const config = getFallingConfig();
            if (config.advanced && config.FallEffectsEnabled) {
                startFallingEffects();
            }
            // 启动前台同步检测（补充检测）
            startForegroundSyncWatch();
            // 立即检查一次签名变化
            checkAndReloadIfSignatureChanged("visibility-visible");
        } else {
            // 页面不可见时停止前台检测
            stopForegroundSyncWatch();
        }
    }

    // 计算配置签名（归一化后）：排除设备管理态字段，避免误判
    function computeConfigSignature(config: any): string {
        try {
            const normalized = normalizeConfigForSignature(config);
            return JSON.stringify(normalized);
        } catch {
            return "";
        }
    }

    // 归一化配置用于签名：排除不应触发 reload 的设备管理态字段
    // 与 src/index.ts 中的逻辑保持一致
    function normalizeConfigForSignature(config: any): any {
        if (!config || typeof config !== 'object') {
            return config;
        }

        // 获取当前设备 ID 用于提取当前设备的 banner 配置
        const deviceId = getLocalDeviceIdForSignature();

        // 构建归一化后的配置对象
        const normalized: any = {};

        for (const key of Object.keys(config)) {
            // 完全排除 deviceProfiles
            if (key === 'deviceProfiles') {
                continue;
            }

            // bannerDeviceProfiles 只保留当前设备的 bannerHeight，排除 scrollTop
            if (key === 'bannerDeviceProfiles') {
                if (deviceId && config[key]?.[deviceId]?.bannerHeight !== undefined) {
                    normalized[key] = {
                        [deviceId]: {
                            bannerHeight: config[key][deviceId].bannerHeight
                        }
                    };
                }
                continue;
            }

            // 其他字段原样保留
            normalized[key] = config[key];
        }

        return normalized;
    }

    // 获取本地设备 ID（用于签名归一化）
    function getLocalDeviceIdForSignature(): string | null {
        try {
            // 优先从 localStorage 读取
            const storedId = localStorage.getItem('syhomepage-device-id');
            if (storedId) {
                return storedId;
            }
        } catch {
            // localStorage 不可用，忽略
        }
        return null;
    }

    // 计算布局签名
    function computeLayoutSignature(layout: any): string {
        try {
            return JSON.stringify(layout);
        } catch {
            return "";
        }
    }

    // 检查签名变化，如有变化则触发整页 reload
    async function checkAndReloadIfSignatureChanged(reason: string): Promise<void> {
        try {
            const rawConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
            const layoutSettings = await loadWidgetLayoutSettings(plugin);

            const currentConfigSig = computeConfigSignature(rawConfig);
            const currentLayoutSig = computeLayoutSignature(layoutSettings);

            const appliedSigs = plugin.getAppliedSignatures();

            // 如果已应用签名为空（首次加载），只更新不 reload
            if (!appliedSigs.config && !appliedSigs.layout) {
                plugin.updateAppliedSignatures(currentConfigSig, currentLayoutSig);
                return;
            }

            // 检查签名是否变化
            if (currentConfigSig !== appliedSigs.config || currentLayoutSig !== appliedSigs.layout) {
                console.debug(`[Homepage] 签名变化 detected: ${reason}`);
                plugin.triggerHomepageFullReload(`signature-changed: ${reason}`);
            }
        } catch (e) {
            console.warn('[Homepage] 签名检查失败:', e);
        }
    }

    // 启动前台轻量同步检测（补充检测）
    // 注意：plugin 侧（src/index.ts）是签名检测主入口，homepage.svelte 侧只是补充检测
    function startForegroundSyncWatch(): void {
        if (foregroundSyncWatchTimer) {
            return;
        }
        foregroundSyncWatchTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                checkAndReloadIfSignatureChanged("foreground-sync-watch");
            }
        }, FOREGROUND_SYNC_WATCH_INTERVAL);
    }

    // 停止前台同步检测
    function stopForegroundSyncWatch(): void {
        if (foregroundSyncWatchTimer) {
            clearInterval(foregroundSyncWatchTimer);
            foregroundSyncWatchTimer = null;
        }
    }

    // 会员验证成功后重新加载配置
    async function handleAdvancedReady() {
        await updateHomepage();

        // 重应用 advanced 相关副作用
        cleanupFallingEffects();
        startFallingEffects();
        updateCursorStyle({
            advanced: getAdvancedEnabled(),
            mouseIcon,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            MouseTrailEnabled,
        });
    }

    // 会员状态不可用时重新加载配置
    async function handleAdvancedUnavailable() {
        await updateHomepage();

        // 清理 advanced 相关副作用
        cleanupFallingEffects();
        updateCursorStyle({
            advanced: getAdvancedEnabled(),
            mouseIcon,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            MouseTrailEnabled,
        });
    }

    // 处理主页设置保存事件 - 本地热应用配置
    async function handleHomepageSettingsSaved() {
        // 1. 重新读取并应用最新配置
        await updateHomepage();

        // 2. 等待 DOM 更新
        await tick();

        // 3. 重新注册快捷按钮
        reRegisterAllShortcuts(buttonsList);

        // 4. 重新处理飘落特效
        cleanupFallingEffects();
        startFallingEffects();

        // 5. 重新应用鼠标样式
        updateCursorStyle({
            advanced: getAdvancedEnabled(),
            mouseIcon,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            MouseTrailEnabled,
        });

        // 6. 同步更新已应用签名，避免后续检测误判成本地刚保存的配置为外部同步变化
        const rawConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
        const layoutSettings = await loadWidgetLayoutSettings(plugin);
        plugin.updateAppliedSignatures(
            computeConfigSignature(rawConfig),
            computeLayoutSignature(layoutSettings)
        );
    }

    // 注册当前设备到同步配置（带同机匹配和去重）
    async function registerCurrentDevice(config: any): Promise<void> {
        if (!isDesktopDeviceProfileEnabled()) {
            return;
        }

        const deviceInfo = getCurrentDeviceInfo();
        if (!deviceInfo.deviceId) {
            return;
        }

        let deviceProfiles = config.deviceProfiles || {};
        let hasConfigChanged = false;
        let hasWidgetLayoutChanged = false;
        
        // 先做一次去重清理
        const { cleanedProfiles, deletedIds } = deduplicateDeviceProfiles(deviceProfiles);
        if (deletedIds.length > 0) {
            deviceProfiles = cleanedProfiles;
            hasConfigChanged = true;
            
            // 同步清理 widgetLayout.json 中的重复 profiles
            const widgetLayout = await plugin.loadData("widgetLayout.json");
            if (widgetLayout?.profiles) {
                for (const oldId of deletedIds) {
                    if (widgetLayout.profiles[oldId]) {
                        delete widgetLayout.profiles[oldId];
                        hasWidgetLayoutChanged = true;
                    }
                }
                if (hasWidgetLayoutChanged) {
                    await plugin.saveData("widgetLayout.json", widgetLayout);
                }
            }
        }
        
        // 先按当前 deviceId 查找
        let existingProfile = deviceProfiles[deviceInfo.deviceId];
        let oldDeviceId: string | null = null;
        
        // 如果没找到，尝试同机匹配（修复 localStorage 漂移）
        if (!existingProfile) {
            const matchedId = findExistingDeviceByHardware(deviceProfiles, deviceInfo);
            if (matchedId) {
                existingProfile = deviceProfiles[matchedId];
                oldDeviceId = matchedId;
                hasConfigChanged = true;
            }
        }
        
        if (existingProfile) {
            // 检查设备信息字段是否需要更新
            const needsUpdate = 
                existingProfile.deviceName !== deviceInfo.deviceName ||
                existingProfile.platform !== deviceInfo.platform ||
                existingProfile.arch !== deviceInfo.arch ||
                existingProfile.hostname !== deviceInfo.hostname;
            
            // 检查 lastSeenAt 是否需要更新（至少间隔 1 分钟才更新，避免频繁写盘）
            const now = new Date();
            const lastSeen = existingProfile.lastSeenAt ? new Date(existingProfile.lastSeenAt) : null;
            const needsUpdateLastSeen = !lastSeen || (now.getTime() - lastSeen.getTime() > 60000);
            
            if (needsUpdate || oldDeviceId || needsUpdateLastSeen) {
                // 更新设备信息（不含 layout，layout 已移到 widgetLayout.json）
                const updatedProfile = updateDeviceProfile(existingProfile, deviceInfo);
                deviceProfiles[deviceInfo.deviceId] = updatedProfile;
                hasConfigChanged = true;
                
                // 如果发生了迁移，删除旧 key
                if (oldDeviceId && oldDeviceId !== deviceInfo.deviceId) {
                    delete deviceProfiles[oldDeviceId];
                    
                    // 同步迁移 widgetLayout.json 中的 profile
                    const widgetLayout = await plugin.loadData("widgetLayout.json");
                    if (widgetLayout?.profiles?.[oldDeviceId]) {
                        widgetLayout.profiles[deviceInfo.deviceId] = widgetLayout.profiles[oldDeviceId];
                        delete widgetLayout.profiles[oldDeviceId];
                        await plugin.saveData("widgetLayout.json", widgetLayout);
                    }
                }
            }
        } else {
            // 新设备：只保存设备信息，layout 从 widgetLayout.json 读取
            deviceProfiles[deviceInfo.deviceId] = {
                deviceId: deviceInfo.deviceId,
                deviceName: deviceInfo.deviceName,
                platform: deviceInfo.platform,
                arch: deviceInfo.arch,
                hostname: deviceInfo.hostname,
                isMobile: deviceInfo.isMobile,
                lastSeenAt: new Date().toISOString(),
            };
            hasConfigChanged = true;
        }

        // 只有真正有变化时才保存
        if (hasConfigChanged) {
            config.deviceProfiles = deviceProfiles;
            await plugin.saveData("homepageSettingConfig.json", config);
        } else {
            return;
        }
    }

    onMount(async () => {
        // 先添加事件监听器，确保不会错过 VIP 状态变化事件
        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
        window.addEventListener("homepage-settings-saved", handleHomepageSettingsSaved);

        // 首设备首次冷启动：初始化 widgetLayout.json 最小结构
        const existingLayout = await plugin.loadData("widgetLayout.json");
        if (!existingLayout) {
            await plugin.saveData("widgetLayout.json", {
                defaultOrder: [],
                profiles: {},
            });
            console.info("[Homepage] 已初始化 widgetLayout.json");
        }

        // 注册当前设备到同步配置（必须在加载配置之前，确保设备 profile 已就绪）
        const rawConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
        await registerCurrentDevice(rawConfig);

        // 加载配置（此时设备已注册，loadWidgetLayoutSettings 可正确读取设备 profile）
        await updateHomepage();

        // 注意：此时不立即记录已应用签名，因为后续 restoreLayout 可能还会写盘
        // 签名基线将在 restoreLayout 完成后统一记录

        // 启动前台同步检测
        startForegroundSyncWatch();

        await tick();

        // 页面加载完成后初始化拖拽
        if (document.readyState === "complete") {
            initBannerDrag();
        } else {
            window.addEventListener("load", onWindowLoad);
        }

        // 初始化区块拖拽排序
        layoutObserver = new MutationObserver(async () => {
            const container = document.querySelector(
                ".custom-content",
            ) as HTMLElement;
            if (container) {
                layoutObserver?.disconnect();
                customContentContainer = container;

                sortable = new Sortable(container, {
                    animation: 150,
                    ghostClass: "sortable-ghost",
                    handle: ".drag-handle",
                    onEnd: () => {
                        saveLayout(plugin, customContentContainer);
                    },
                });

                await restoreLayout(plugin, { value: container }, customContentContainer);

                // restoreLayout 完成后，启动期写盘动作已结束，此时记录签名基线
                if (!initialSignaturesRecorded) {
                    initialSignaturesRecorded = true;
                    // 重新读取最新文件内容，确保签名基线与实际落盘数据一致
                    const latestConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
                    const latestLayout = await loadWidgetLayoutSettings(plugin);
                    plugin.updateAppliedSignatures(
                        computeConfigSignature(latestConfig),
                        computeLayoutSignature(latestLayout)
                    );
                }
            }
        });

        layoutObserver.observe(document.body, { childList: true, subtree: true });

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
    });

    onDestroy(() => {
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }
        if (layoutObserver) {
            layoutObserver.disconnect();
            layoutObserver = null;
        }
        if (destroyBannerDrag) {
            destroyBannerDrag();
            destroyBannerDrag = null;
        }
        cleanupFallingEffects();
        window.removeEventListener("load", onWindowLoad);
        window.removeEventListener(
            "homepage-advanced-ready",
            handleAdvancedReady,
        );
        window.removeEventListener(
            "homepage-advanced-unavailable",
            handleAdvancedUnavailable,
        );
        window.removeEventListener("homepage-settings-saved", handleHomepageSettingsSaved);
        document.removeEventListener("click", handleDocumentClick);
        document.removeEventListener("click", handleClickEffect);
        document.removeEventListener("mousemove", handleMouseMoveTrail);
        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );
        stopForegroundSyncWatch();
        unregisterAllShortcuts();
        cleanupMouseEffects();

        // 显式销毁所有 widget 实例，触发各自的 onDestroy
        const container = customContentContainer || document.querySelector(".custom-content");
        if (container) {
            const widgetBlocks = container.querySelectorAll(".widget-block");
            widgetBlocks.forEach((block) => {
                const instance = (block as any).__widgetBlockInstance;
                if (instance && typeof instance.destroy === "function") {
                    try {
                        instance.destroy();
                    } catch {
                        // 忽略销毁错误
                    }
                }
            });
        }
        customContentContainer = null;
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
        const currentVersion = ++updateHomepageVersion;
        const config = await loadHomepageConfig(plugin);

        // 丢弃过期请求结果
        if (currentVersion !== updateHomepageVersion) return;

        // 组件设置 - 优先从 widgetLayout.json 读取（与组件顺序存储方式一致）
        const layoutSettings = await loadWidgetLayoutSettings(plugin);
        if (currentVersion !== updateHomepageVersion) return;
        widgetLayoutNumber = layoutSettings.widgetLayoutNumber;
        widgetGap = layoutSettings.widgetGap;

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

        // 横幅高度配置 - 优先使用当前桌面设备的配置
        try {
            const displaySettings = await loadBannerDisplaySettings(plugin);
            if (currentVersion !== updateHomepageVersion) return;
            bannerHeight = displaySettings.bannerHeight;
        } catch (e) {
            if (currentVersion !== updateHomepageVersion) return;
            console.warn("[Homepage] 加载设备横幅配置失败，回退到全局配置:", e);
            bannerHeight = config.bannerHeight;
        }

        // 按钮列表
        buttonsList = resolveButtonsList(config);

        // 横幅图片
        const bannerResult = await resolveBannerImage(
            config,
            getAdvancedEnabled(),
        );
        if (currentVersion !== updateHomepageVersion) return;
        bannerImgSrc = bannerResult.bannerImgSrc;
    }

    // 格式化状态语言，将变量替换为统计信息（异步处理）
    let formattedStatsInfoText = $state("");

    async function updateFormattedStatsInfoText() {
        const currentVersion = ++updateStatsVersion;

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

        // 兼容旧写法：统一替换为当前支持的变量名
        result = result
            .replace(/\{\{notesCount\}\}/g, "{{blocksCount}}")
            .replace(/\{\{DocsCount\}\}/g, "{{docsCount}}");

        // 替换所有变量（使用正则全局替换，确保同一变量多次出现都能替换）
        result = result
            .replace(/\{\{startDate\}\}/g, startDate?.toString() || "")
            .replace(/\{\{blocksCount\}\}/g, blocksCount?.toString() || "")
            .replace(/\{\{notebooksCount\}\}/g, notebooksCount?.toString() || "")
            .replace(/\{\{docsCount\}\}/g, docsCount?.toString() || "")
            .replace(/\{\{nowDate\}\}/g, nowDate?.toString() || "")
            .replace(/\{\{tasksCount\}\}/g, tasksCount?.toString() || "")
            .replace(/\{\{doneTasksCount\}\}/g, doneTasksCount?.toString() || "")
            .replace(/\{\{undoneTasksCount\}\}/g, undoneTasksCount?.toString() || "")
            .replace(/\{\{dailynotesCount\}\}/g, dailynotesCount?.toString() || "")
            .replace(/\{\{tagsCount\}\}/g, tagsCount?.toString() || "")
            .replace(/\{\{codeBlocksCount\}\}/g, codeBlocksCount?.toString() || "")
            .replace(/\{\{mathBlocksCount\}\}/g, mathBlocksCount?.toString() || "")
            .replace(/\{\{citationCount\}\}/g, citationCount?.toString() || "");

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

        // 丢弃过期请求结果
        if (currentVersion !== updateStatsVersion) return;

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
                onclick={async () => {
                if (bannerImage) {
                    bannerImage.style.transform = "translateY(0)";
                }
                await saveBannerDisplaySettings(plugin, { scrollTop: 0 });
            }}
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
                        {@html normalizeSiyuanDocIcon(tempTitleIconEmoji) || "🏠"}
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
                                href="https://blog.glaube-ty.top/da-shang"
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
                        href="https://blog.glaube-ty.top/da-shang"
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
