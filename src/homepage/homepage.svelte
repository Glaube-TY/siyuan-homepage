<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy, tick } from "svelte";

    import { writable } from "svelte/store";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
    } from "../components/utils/widgetBlock/utils/layout-handler";
    import { loadWidgetLayoutSettings, buildHomepageAppliedSignature, computeMusicPlayerAffectingSignature, type WidgetLayoutData } from "../components/utils/widgetBlock/utils/layout-shared";
    import { handleLoad } from "./topBanner/drag";
    import {
        loadStatsData,
        parseDurationExpression,
    } from "./header/stats-loader";
    import {
        buildHomepageStatusAiCacheKey,
        generateHomepageStatusText,
        loadHomepageStatusFacts,
        type HomepageStatusAiConfig,
    } from "./header/status-ai-generator";
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
        type HomepageStatusTextMode,
    } from "./configLoader";
    import {
        DEFAULT_BANNER_GLASS_BLUR,
        DEFAULT_BANNER_GLASS_COLOR,
        DEFAULT_BANNER_GLASS_COLOR_MODE,
        DEFAULT_BANNER_GLASS_OPACITY,
        DEFAULT_BANNER_INTEGRATED_COLOR,
        DEFAULT_HOMEPAGE_TITLE_ALIGN,
        DEFAULT_QUICK_BUTTON_STYLE,
        type BannerDeviceProfile,
        type BannerGlassColorMode,
        type HomepageTitleAlign,
        type QuickButtonStyle,
    } from "./homepageSetting/config";
    import {
        DEFAULT_STATS_INFO_TEXT,
        DEFAULT_STATUS_AI_MAX_CHARS,
        DEFAULT_STATUS_AI_PROMPT,
        normalizeHomepageStatusTextMode,
        normalizeStatusAiMaxChars,
        normalizeStatusAiModelId,
        normalizeStatusAiPrompt,
        normalizeStatusAiThinkingEnabled,
    } from "./status-text-config";
    import {
        getCurrentDeviceInfo,
        isDesktopDeviceProfileEnabled,
        updateDeviceProfile,
        findExistingDeviceByHardware,
        deduplicateDeviceProfiles,
    } from "./utils/deviceProfile";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    import "./style/homepage.scss"

    export const app = undefined;
    interface Props {
        plugin: any;
        showIcon?: any;
    }

    let { plugin, showIcon = writable(true) }: Props = $props();

    const BANNER_TITLE_INTEGRATED_MIN_HEIGHT = 240;

    let showBanner = writable(true);
    let bannerEnabled = $state(true);
    let bannerImage: HTMLImageElement = $state();
    let bannerHeight = $state(300);
    let bannerImgSrc = $state("");
    let bannerTitleIntegrated = $state(false);
    let homepageTitleAlign = $state<HomepageTitleAlign>("center");
    let quickButtonStyle = $state<QuickButtonStyle>("default");
    let bannerTitleColor = $state("#ffffff");
    let bannerStatusColor = $state("#ffffff");
    let bannerButtonColor = $state("#ffffff");
    let bannerGlassEnabled = $state(false);
    let bannerGlassColorMode = $state<BannerGlassColorMode>("theme");
    let bannerGlassColor = $state("#ffffff");
    let bannerGlassOpacity = $state(18);
    let bannerGlassBlur = $state(12);
    let effectiveBannerHeight = $derived(
        bannerTitleIntegrated && bannerEnabled
            ? Math.max(bannerHeight, BANNER_TITLE_INTEGRATED_MIN_HEIGHT)
            : bannerHeight
    );

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let titleIconType: "emoji" | "image" = $state("emoji");
    let tempTitleIconEmoji = $state("🏠");
    let tempTitleIconImage: string | null = $state(null);
    let pageTitle = $state("思源笔记首页");

    function getButtonIconName(button: { action?: string; label?: string }): string {
        const action = button.action || "";
        if (action === "search" || button.label?.includes("搜索笔记")) return "search";
        if (action === "diary" || button.label?.includes("今日日记")) return "diary";
        if (action === "aiKnowledgeBase" || button.label?.includes("AI 知识库") || button.label?.includes("AI知识库")) return "iconSparkles";
        if (action === "addWidget" || button.label?.includes("添加组件")) return "create";
        if (action === "settings" || button.label?.includes("主页设置")) return "settings";
        if (action === "cleanEmptyDocs" || button.label?.includes("清理空文档")) return "delete";
        if (action === "templateCenter" || button.label?.includes("布局模板")) return "style";
        return "";
    }

    function getButtonDisplayLabel(button: { action?: string; label: string }): string {
        const actionLabelMap: Record<string, string> = {
            search: "搜索笔记",
            diary: "今日日记",
            aiKnowledgeBase: "AI 知识库",
            addWidget: "添加组件",
            settings: "主页设置",
            cleanEmptyDocs: "清理空文档",
            templateCenter: "布局模板",
        };
        if (button.action && actionLabelMap[button.action]) {
            return actionLabelMap[button.action];
        }
        return button.label || '';
    }
    let tempTitleIconStyle: string = $state("square");

    let statsInfoText = $state(DEFAULT_STATS_INFO_TEXT);
    let statusTextMode = $state<HomepageStatusTextMode>("custom");
    let statusAiPrompt = $state(DEFAULT_STATUS_AI_PROMPT);
    let statusAiMaxChars = $state(DEFAULT_STATUS_AI_MAX_CHARS);
    let statusAiProviderId = $state("");
    let statusAiModelId = $state("");
    let statusAiThinkingEnabled = $state(false);
    const STATUS_AI_LOADING_TEXT = "AI 状态语生成中...";
    type HomepageStatusAiRuntimeState =
        | "idle"
        | "disabled"
        | "no_premium"
        | "no_model"
        | "generating"
        | "success"
        | "failed"
        | "aborted";
    let statusAiRuntimeState = $state<HomepageStatusAiRuntimeState>("idle");
    let statusAiVisibleErrorMessage = $state("");
    let isRefreshingStatusText = $state(false);
    let homepageConfigLoaded = $state(false);

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
    let destroyBannerDrag: (() => void) | null = null;

    // 本地容器引用：避免全局 selector 在实例重叠时命中错容器
    let customContentContainer: HTMLElement | null = null;

    // 初始化状态标记：确保只初始化一次
    let customContentInitialized = false;

    // CSS 变量更新：统一基础格子高度
    function updateCustomGridMetrics() {
        if (!customContentContainer) return;
        const container = customContentContainer;
        const clientWidth = container.clientWidth;
        if (clientWidth <= 0) return;

        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const gapPx = widgetGap * rootFontSize;
        const cellSize = (clientWidth - gapPx * (widgetLayoutNumber - 1)) / widgetLayoutNumber;

        if (cellSize > 0) {
            container.style.setProperty("--widget-cell-size", `${cellSize}px`);
        }
    }

    // 异步请求版本戳，用于丢弃过期结果
    let updateHomepageVersion = 0;
    let updateStatsVersion = 0;

    // ResizeObserver for custom-content container
    let customContentResizeObserver: ResizeObserver | null = null;

    // 前台同步检测定时器
    let foregroundSyncWatchTimer: ReturnType<typeof setInterval> | null = null;

    // 首次初始化标记：用于确保只在启动期写盘动作完成后记录一次签名基线
    let initialSignaturesRecorded = false;
    let homepageComponentDestroyed = false;

    // 局部热刷新失败后整页自愈的冷却与锁，避免连续重建导致音乐播放中断
    const HOMEPAGE_SELF_HEAL_COOLDOWN_MS = 30000;
    let homepageSelfHealLocked = false;
    let homepageSelfHealLastTime = 0;
    let pendingHotReloadMusicAffectingSignature = "";

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
    // 只负责飘落特效的暂停/恢复，不再触发签名检测或前台轮询
    function handleVisibilityChange(): void {
        if (document.visibilityState === "visible") {
            const config = getFallingConfig();
            if (config.advanced && config.FallEffectsEnabled) {
                startFallingEffects();
            }
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

    function isSameDeviceHardwareProfile(a: any, b: any): boolean {
        return Boolean(a && b
            && a.hostname === b.hostname
            && a.platform === b.platform
            && a.arch === b.arch
            && a.isMobile === b.isMobile);
    }

    function mergeBannerDeviceProfile(config: any, fromDeviceId: string, toDeviceId: string): boolean {
        if (!fromDeviceId || !toDeviceId || fromDeviceId === toDeviceId) {
            return false;
        }

        const bannerProfiles = config.bannerDeviceProfiles;
        if (!bannerProfiles?.[fromDeviceId]) {
            return false;
        }

        const source = bannerProfiles[fromDeviceId] as BannerDeviceProfile;
        const target = (bannerProfiles[toDeviceId] || {}) as BannerDeviceProfile;

        bannerProfiles[toDeviceId] = {
            bannerHeight: target.bannerHeight ?? source.bannerHeight,
            scrollTop: target.scrollTop ?? source.scrollTop,
        };
        delete bannerProfiles[fromDeviceId];
        return true;
    }

    // 计算布局签名
    function computeLayoutSignature(layout: any): string {
        try {
            return JSON.stringify(layout);
        } catch {
            return "";
        }
    }

    // 停止前台同步检测
    function stopForegroundSyncWatch(): void {
        if (foregroundSyncWatchTimer) {
            clearInterval(foregroundSyncWatchTimer);
            foregroundSyncWatchTimer = null;
        }
    }

    // 外部同步变化时局部热刷新：不整页 reload，局部刷新配置、布局和组件内容
    async function handleExternalSyncChanged(event: CustomEvent<{ reason: string }>): Promise<void> {
        const reason = event.detail?.reason || "unknown";
        if (homepageComponentDestroyed) {
            // 组件已销毁时也要释放热刷新锁，避免旧实例遗留状态导致锁永久占用
            plugin.markHomepageHotReloadFinished?.(reason);
            return;
        }

        // 二次校验：若当前签名已等于 applied 基线，说明是运行态变化导致的误触发，直接释放锁
        try {
            const latestConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
            const latestLayout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
            const latestDeviceId = getLocalDeviceIdForSignature();
            const currentCompositeSig = await buildHomepageAppliedSignature(plugin, latestConfig, latestLayout, latestDeviceId);
            const appliedSigs = plugin.getAppliedSignatures();
            if (appliedSigs.composite && currentCompositeSig === appliedSigs.composite) {
                plugin.markHomepageHotReloadFinished?.(reason);
                return;
            }
            // 记录热刷新前的音乐相关签名，失败自愈时用于判断是否与音乐播放器布局/静态配置有关
            pendingHotReloadMusicAffectingSignature = await computeMusicPlayerAffectingSignature(plugin, latestLayout, latestDeviceId);
        } catch {
            // 签名校验失败时继续执行刷新，避免遗漏真正的同步变化
            pendingHotReloadMusicAffectingSignature = "";
        }

        try {
            invalidateStatusAiCache();
            await updateHomepage();
            if (homepageComponentDestroyed) return;
            await updateDisplayedStatsInfoText();
            if (homepageComponentDestroyed) return;
            await tick();
            if (homepageComponentDestroyed) return;
            const container = customContentContainer;
            if (container) {
                await restoreLayout(plugin, { value: container as HTMLElement }, container as HTMLElement);
            }
            if (homepageComponentDestroyed) return;
            updateCustomGridMetrics();
            reRegisterAllShortcuts(buttonsList);
            // 重启飘落/鼠标等副作用
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
            // 更新已应用签名
            const latestConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
            if (homepageComponentDestroyed) return;
            const latestLayoutForSig = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
            if (homepageComponentDestroyed) return;
            const deviceIdForSig = getLocalDeviceIdForSignature();
            const compositeSig = await buildHomepageAppliedSignature(plugin, latestConfig, latestLayoutForSig, deviceIdForSig);
            plugin.updateAppliedSignatures("", "", compositeSig);
            console.debug(`[Homepage] 局部热刷新完成: ${reason}`);
        } catch (e) {
            console.warn("[Homepage] 局部热刷新失败:", e);

            // 谨慎自愈：只有在确认存在真实变化且不是运行态误触发时才允许整页重建，
            // 避免音乐播放等运行态被连续中断。
            if (homepageComponentDestroyed) {
                // 组件已销毁，无需重建，由后续挂载流程处理
                return;
            }

            try {
                const latestConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
                const latestLayout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
                const latestDeviceId = getLocalDeviceIdForSignature();
                const currentCompositeSig = await buildHomepageAppliedSignature(plugin, latestConfig, latestLayout, latestDeviceId);
                const appliedSigs = plugin.getAppliedSignatures();
                if (appliedSigs.composite && currentCompositeSig === appliedSigs.composite) {
                    // 签名已一致，说明只是运行态/容器暂不可用导致的误判，不重建
                    return;
                }
                // 若热刷新失败前后音乐相关签名未变，说明变化与音乐播放器布局/静态配置无关，
                // 优先不整页重建，避免打断正在播放的音乐
                if (pendingHotReloadMusicAffectingSignature) {
                    const currentMusicAffectingSig = await computeMusicPlayerAffectingSignature(plugin, latestLayout, latestDeviceId);
                    if (currentMusicAffectingSig === pendingHotReloadMusicAffectingSignature) {
                        return;
                    }
                }
            } catch {
                // 签名校验失败继续尝试自愈，但受冷却保护
            }

            if (homepageSelfHealLocked) {
                return;
            }
            const now = Date.now();
            if (now - homepageSelfHealLastTime < HOMEPAGE_SELF_HEAL_COOLDOWN_MS) {
                return;
            }

            homepageSelfHealLocked = true;
            homepageSelfHealLastTime = now;
            try {
                if (typeof plugin.reloadHomepageInstance === "function") {
                    plugin.reloadHomepageInstance();
                } else {
                    plugin.ensureHomepageMounted?.('hot-reload-failed');
                }
            } catch (healErr) {
                console.warn("[Homepage] 自愈失败:", healErr);
            } finally {
                window.setTimeout(() => {
                    homepageSelfHealLocked = false;
                }, HOMEPAGE_SELF_HEAL_COOLDOWN_MS);
            }
        } finally {
            // 释放热刷新短期锁
            try {
                plugin.markHomepageHotReloadFinished?.(reason);
            } catch {
                // 忽略释放锁的异常
            }
        }
    }

    // 会员验证成功后重新加载配置
    async function handleAdvancedReady() {
        invalidateStatusAiCache();
        await updateHomepage();
        await updateDisplayedStatsInfoText();

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
        invalidateStatusAiCache();
        await updateHomepage();
        await updateDisplayedStatsInfoText();

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
        invalidateStatusAiCache();
        await updateHomepage();
        await updateDisplayedStatsInfoText();

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
        const originalDeviceProfiles = deviceProfiles;
        const { cleanedProfiles, deletedIds } = deduplicateDeviceProfiles(deviceProfiles);
        if (deletedIds.length > 0) {
            for (const deletedId of deletedIds) {
                const deletedProfile = originalDeviceProfiles[deletedId];
                const retainedEntry = Object.entries(cleanedProfiles).find(([, profile]) =>
                    isSameDeviceHardwareProfile(profile, deletedProfile)
                );
                if (retainedEntry && mergeBannerDeviceProfile(config, deletedId, retainedEntry[0])) {
                    hasConfigChanged = true;
                }
            }
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

                    if (mergeBannerDeviceProfile(config, oldDeviceId, deviceInfo.deviceId)) {
                        hasConfigChanged = true;
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

    // 初始化主页组件区布局（Sortable、ResizeObserver、restoreLayout）
    async function initCustomContentLayout(): Promise<void> {
        if (homepageComponentDestroyed) return;
        await tick();
        if (homepageComponentDestroyed) return;
        const container = customContentContainer;
        if (!container) {
            console.warn("[Homepage] customContentContainer 不存在，跳过布局初始化");
            return;
        }
        if (customContentInitialized) {
            return;
        }
        customContentInitialized = true;

        // 清理旧对象
        customContentResizeObserver?.disconnect();
        sortable?.destroy();

        // 初始化 ResizeObserver
        customContentResizeObserver = new ResizeObserver(() => {
            updateCustomGridMetrics();
        });
        customContentResizeObserver.observe(container);

        // 初始化 Sortable
        sortable = new Sortable(container, {
            animation: 150,
            ghostClass: "sortable-ghost",
            handle: ".drag-handle",
            onEnd: () => {
                saveLayout(plugin, customContentContainer);
            },
        });

        // 恢复布局
        await restoreLayout(plugin, { value: container }, customContentContainer);
        if (homepageComponentDestroyed) return;

        await tick();
        if (homepageComponentDestroyed) return;
        updateCustomGridMetrics();

        // restoreLayout 完成后，启动期写盘动作已结束，此时记录签名基线
        if (!initialSignaturesRecorded) {
            initialSignaturesRecorded = true;
            // 重新读取最新文件内容，确保签名基线与实际落盘数据一致
            const latestConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
            if (homepageComponentDestroyed) return;
            const latestLayout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
            if (homepageComponentDestroyed) return;
            const deviceId = getLocalDeviceIdForSignature();
            const compositeSig = await buildHomepageAppliedSignature(plugin, latestConfig, latestLayout, deviceId);
            plugin.updateAppliedSignatures("", "", compositeSig);
        }
    }

    async function refreshCustomContentLayoutFromTemplate() {
        if (homepageComponentDestroyed) return;
        const container = customContentContainer;
        if (!container) return;

        try {
            const layoutSettings = await loadWidgetLayoutSettings(plugin);
            if (homepageComponentDestroyed) return;
            widgetLayoutNumber = layoutSettings.widgetLayoutNumber;
            widgetGap = layoutSettings.widgetGap;

            await tick();
            if (homepageComponentDestroyed) return;

            await restoreLayout(plugin, { value: container as HTMLElement }, container as HTMLElement);
            if (homepageComponentDestroyed) return;
            await tick();
            if (homepageComponentDestroyed) return;

            updateCustomGridMetrics();
        } catch (e) {
            console.warn("[Homepage] 模板应用后刷新组件区失败:", e);
        }
    }

    async function handleTemplateLayoutChanged() {
        await refreshCustomContentLayoutFromTemplate();
    }

    onMount(async () => {
        homepageComponentDestroyed = false;
        // 先添加事件监听器，确保不会错过 VIP 状态变化事件
        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
        window.addEventListener("homepage-settings-saved", handleHomepageSettingsSaved);
        window.addEventListener("homepage-template-layout-changed", handleTemplateLayoutChanged);
        // 监听 plugin 侧派发的外部同步变化事件（主通道：window）
        window.addEventListener("homepage-external-sync-changed", handleExternalSyncChanged as EventListener);

        // 首设备首次冷启动：初始化 widgetLayout.json 最小结构
        const existingLayout = await plugin.loadData("widgetLayout.json");
        if (homepageComponentDestroyed) return;
        if (!existingLayout) {
            await plugin.saveData("widgetLayout.json", {
                defaultOrder: [],
                profiles: {},
            });
            if (homepageComponentDestroyed) return;
            console.info("[Homepage] 已初始化 widgetLayout.json");
        }

        // 注册当前设备到同步配置（必须在加载配置之前，确保设备 profile 已就绪）
        const rawConfig = (await plugin.loadData("homepageSettingConfig.json")) || {};
        if (homepageComponentDestroyed) return;
        await registerCurrentDevice(rawConfig);
        if (homepageComponentDestroyed) return;

        // 加载配置（此时设备已注册，loadWidgetLayoutSettings 可正确读取设备 profile）
        await updateHomepage();
        if (homepageComponentDestroyed) return;

        // 注意：此时不立即记录已应用签名，因为后续 restoreLayout 可能还会写盘
        // 签名基线将在 restoreLayout 完成后统一记录

        // 不再启动前台同步轮询，避免切换软件/放后台/可见性变化时误刷新主页

        await tick();
        if (homepageComponentDestroyed) return;

        // 页面加载完成后初始化拖拽
        if (document.readyState === "complete") {
            initBannerDrag();
        } else {
            window.addEventListener("load", onWindowLoad);
        }

        // 初始化主页组件区布局
        await initCustomContentLayout();
        if (homepageComponentDestroyed) return;

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
        homepageComponentDestroyed = true;
        if (sortable) {
            sortable.destroy();
            sortable = null;
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
        window.removeEventListener("homepage-template-layout-changed", handleTemplateLayoutChanged);
        window.removeEventListener("homepage-external-sync-changed", handleExternalSyncChanged as EventListener);
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
        abortStatusAiRequest();

        // 显式销毁所有 widget 实例，触发各自的 onDestroy
        const container = customContentContainer;
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
        if (customContentResizeObserver) {
            customContentResizeObserver.disconnect();
            customContentResizeObserver = null;
        }
    });

    // 监听 widgetLayoutNumber / widgetGap 变化，更新格子尺寸
    $effect(() => {
        widgetLayoutNumber;
        widgetGap;
        tick().then(() => {
            updateCustomGridMetrics();
        });
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
        const previousStatusAiConfigSignature = getStatusAiConfigSignature();
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
        bannerEnabled = config.bannerEnabled;
        showBanner.set(config.bannerEnabled);

        showIcon.set(config.showIcon);
        // 标题区域配置
        tempTitleIconEmoji = config.TitleIconEmoji;
        tempTitleIconImage = config.TitleIconImage;
        titleIconType = config.titleIconType;
        pageTitle = config.customTitle;
        bannerTitleIntegrated = advanced && config.bannerTitleIntegrated;
        homepageTitleAlign = advanced ? config.homepageTitleAlign : DEFAULT_HOMEPAGE_TITLE_ALIGN;
        quickButtonStyle = advanced ? config.quickButtonStyle : DEFAULT_QUICK_BUTTON_STYLE;
        bannerTitleColor = advanced ? config.bannerTitleColor : DEFAULT_BANNER_INTEGRATED_COLOR;
        bannerStatusColor = advanced ? config.bannerStatusColor : DEFAULT_BANNER_INTEGRATED_COLOR;
        bannerButtonColor = advanced ? config.bannerButtonColor : DEFAULT_BANNER_INTEGRATED_COLOR;
        bannerGlassEnabled = advanced && config.bannerGlassEnabled;
        bannerGlassColorMode = advanced ? config.bannerGlassColorMode : DEFAULT_BANNER_GLASS_COLOR_MODE;
        bannerGlassColor = advanced ? config.bannerGlassColor : DEFAULT_BANNER_GLASS_COLOR;
        bannerGlassOpacity = advanced ? config.bannerGlassOpacity : DEFAULT_BANNER_GLASS_OPACITY;
        bannerGlassBlur = advanced ? config.bannerGlassBlur : DEFAULT_BANNER_GLASS_BLUR;
        tempTitleIconStyle = config.tempTitleIconStyle;

        statsInfoText = config.statsInfoText;
        statusTextMode = normalizeHomepageStatusTextMode(config.statusTextMode);
        statusAiPrompt = normalizeStatusAiPrompt(config.statusAiPrompt);
        statusAiMaxChars = normalizeStatusAiMaxChars(config.statusAiMaxChars);
        statusAiProviderId = normalizeStatusAiModelId(config.statusAiProviderId);
        statusAiModelId = normalizeStatusAiModelId(config.statusAiModelId);
        statusAiThinkingEnabled = normalizeStatusAiThinkingEnabled(config.statusAiThinkingEnabled);
        if (previousStatusAiConfigSignature !== getStatusAiConfigSignature()) {
            invalidateStatusAiCache();
        }
        homepageConfigLoaded = true;

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
    let statusAiCacheKey = "";
    let statusAiCachedText = "";
    let statusAiAbortController: AbortController | null = null;

    function setStatusAiRuntimeState(state: HomepageStatusAiRuntimeState, message = ""): void {
        statusAiRuntimeState = state;
        if (message) {
            console.debug(`[Homepage] AI 状态语状态: ${statusAiRuntimeState} - ${message}`);
        }
    }

    function sanitizeStatusAiDiagnosticMessage(value: unknown): string {
        const raw = value instanceof Error ? value.message : String(value || "未知错误");
        return raw
            .replace(/\s+/g, " ")
            .replace(/Bearer\s+[^\s]+/gi, "Bearer ***")
            .replace(/sk-[A-Za-z0-9_-]+/gi, "sk-***")
            .replace(/(api[-_\s]?key\s*[:=]\s*)[^\s,;]+/gi, "$1***")
            .replace(/(baseUrl|baseURL|base_url)\s*[:=]\s*[^\s,;]+/gi, "$1=***")
            .replace(/https?:\/\/[^\s)]+/gi, "[url]")
            .replace(/[A-Za-z]:\\[^\s)]+/g, "[path]")
            .replace(/\/(?:Users|home|mnt|var|tmp|src|dist|node_modules)\/[^\s)]+/g, "[path]")
            .replace(/[A-Za-z0-9_-]{32,}/g, "***")
            .slice(0, 240);
    }

    function getHomepageStatusAiFailureText(reason: "not_premium" | "no_model" | "model_error" | "empty_output" | "aborted" | "unknown"): string {
        if (reason === "not_premium") return "AI 状态语生成失败：未开通会员。";
        if (reason === "no_model") return "AI 状态语生成失败：未选择可用模型。";
        if (reason === "aborted") return "AI 状态语生成失败：请求已取消。";
        if (reason === "empty_output") return "AI 状态语生成失败：模型没有返回可显示内容。";
        return "AI 状态语生成失败：模型调用失败，请检查大模型配置。";
    }

    function setVisibleStatusTextError(message: string): void {
        statusAiVisibleErrorMessage = message;
        formattedStatsInfoText = message;
    }

    function getStatusAiConfigSignature(): string {
        return JSON.stringify(getHomepageStatusAiConfig());
    }

    function invalidateStatusAiCache(): void {
        statusAiCacheKey = "";
        statusAiCachedText = "";
        abortStatusAiRequest();
    }

    async function formatCustomStatsInfoText(template: string): Promise<string> {
        if (!template) return "";

        let result = template;

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

        return result;
    }

    function getHomepageStatusAiConfig(): HomepageStatusAiConfig {
        return {
            prompt: statusAiPrompt,
            maxChars: statusAiMaxChars,
            providerId: statusAiProviderId,
            modelId: statusAiModelId,
            thinkingEnabled: statusAiThinkingEnabled,
        };
    }

    function abortStatusAiRequest(): void {
        if (statusAiAbortController) {
            statusAiAbortController.abort();
            statusAiAbortController = null;
        }
    }

    async function updateDisplayedStatsInfoText(options: { forceRefresh?: boolean } = {}) {
        const currentVersion = ++updateStatsVersion;
        abortStatusAiRequest();

        if (options.forceRefresh) {
            statusAiCacheKey = "";
            statusAiCachedText = "";
        }

        if (statusTextMode !== "ai") {
            setStatusAiRuntimeState("disabled");
            statusAiVisibleErrorMessage = "";
            const customText = await formatCustomStatsInfoText(statsInfoText);
            if (currentVersion !== updateStatsVersion) return;
            formattedStatsInfoText = customText;
            return;
        }

        statusAiVisibleErrorMessage = "";
        formattedStatsInfoText = STATUS_AI_LOADING_TEXT;
        setStatusAiRuntimeState("generating");

        if (!advanced) {
            setStatusAiRuntimeState("no_premium");
            setVisibleStatusTextError(getHomepageStatusAiFailureText("not_premium"));
            console.warn("[Homepage] AI 状态语未生成：会员状态不可用。");
            return;
        }

        const aiConfig = getHomepageStatusAiConfig();
        if (!aiConfig.providerId || !aiConfig.modelId) {
            setStatusAiRuntimeState("no_model");
            setVisibleStatusTextError(getHomepageStatusAiFailureText("no_model"));
            console.warn("[Homepage] AI 状态语未生成：未选择可用模型。");
            return;
        }

        const abortController = new AbortController();
        statusAiAbortController = abortController;

        try {
            const facts = await loadHomepageStatusFacts(plugin);
            if (currentVersion !== updateStatsVersion || abortController.signal.aborted) {
                return;
            }

            const cacheKey = buildHomepageStatusAiCacheKey(aiConfig, facts);
            if (!options.forceRefresh && cacheKey === statusAiCacheKey && statusAiCachedText) {
                formattedStatsInfoText = statusAiCachedText;
                setStatusAiRuntimeState("success", "命中缓存");
                return;
            }

            const result = await generateHomepageStatusText({
                plugin,
                config: aiConfig,
                facts,
                abortSignal: abortController.signal,
            });

            if (currentVersion !== updateStatsVersion || abortController.signal.aborted) {
                return;
            }

            if (result.ok === false) {
                const reason = result.reason;
                const message = result.message;
                if (reason === "aborted") {
                    setStatusAiRuntimeState("aborted");
                    setVisibleStatusTextError(getHomepageStatusAiFailureText("aborted"));
                } else {
                    setStatusAiRuntimeState(reason === "no_model" ? "no_model" : reason === "not_premium" ? "no_premium" : "failed");
                    setVisibleStatusTextError(getHomepageStatusAiFailureText(reason));
                    console.warn(
                        "[Homepage] AI 状态语生成失败:",
                        sanitizeStatusAiDiagnosticMessage(message),
                    );
                }
                return;
            }

            statusAiCacheKey = result.cacheKey;
            statusAiCachedText = result.text;
            formattedStatsInfoText = result.text;
            setStatusAiRuntimeState("success");
        } catch (error) {
            if (!abortController.signal.aborted) {
                setStatusAiRuntimeState("failed");
                setVisibleStatusTextError(getHomepageStatusAiFailureText("unknown"));
                console.warn(
                    "[Homepage] AI 状态语生成异常:",
                    sanitizeStatusAiDiagnosticMessage(error),
                );
            }
        } finally {
            if (statusAiAbortController === abortController) {
                statusAiAbortController = null;
            }
        }
    }

    async function refreshStatusText(): Promise<void> {
        if (isRefreshingStatusText) return;

        isRefreshingStatusText = true;
        try {
            invalidateStatusAiCache();
            await updateDisplayedStatsInfoText({ forceRefresh: true });
        } finally {
            isRefreshingStatusText = false;
        }
    }

    // 当状态语相关配置变化时更新显示文本
    run(() => {
        statsInfoText;
        statusTextMode;
        statusAiPrompt;
        statusAiMaxChars;
        statusAiProviderId;
        statusAiModelId;
        statusAiThinkingEnabled;
        advanced;
        homepageConfigLoaded;
        if (!homepageConfigLoaded) return;
        updateDisplayedStatsInfoText();
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

<div
    class="homepage-container"
    class:banner-title-integrated={bannerTitleIntegrated && $showBanner}
    class:title-align-left={homepageTitleAlign === "left"}
    class:title-align-center={homepageTitleAlign === "center"}
    class:title-align-right={homepageTitleAlign === "right"}
    class:quick-buttons-flat={quickButtonStyle === "flat"}
    class:quick-buttons-glass={quickButtonStyle === "glass"}
    class:banner-glass-enabled={bannerTitleIntegrated && $showBanner && bannerGlassEnabled}
    class:banner-glass-custom={bannerGlassColorMode === "custom"}
    style={`--homepage-banner-title-color: ${bannerTitleColor}; --homepage-banner-status-color: ${bannerStatusColor}; --homepage-banner-button-color: ${bannerButtonColor}; --homepage-banner-glass-color: ${bannerGlassColor}; --homepage-banner-glass-opacity: ${bannerGlassOpacity}%; --homepage-banner-glass-blur: ${bannerGlassBlur}px;`}
>
    <!-- 头部横幅区域 -->
    <div
        class="section top-banner"
        class:hide-top-banner={!$showBanner}
        style:height={`${effectiveBannerHeight}px`}
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
        {#if bannerTitleIntegrated && $showBanner && bannerGlassEnabled}
            <div class="banner-glass-layer" aria-hidden="true"></div>
        {/if}
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

        {#if bannerTitleIntegrated && $showBanner}
            <div class="banner-title-layer">
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

                <div class="stats-info-wrap">
                    <div
                        class="stats-info"
                        class:error={Boolean(statusAiVisibleErrorMessage)}
                        style="white-space: pre-line"
                    >
                        {formattedStatsInfoText}
                    </div>

                    <button
                        class="stats-info-refresh"
                        class:is-refreshing={isRefreshingStatusText}
                        type="button"
                        title="刷新状态语"
                        aria-label="刷新状态语"
                        disabled={isRefreshingStatusText || statusAiRuntimeState === "generating"}
                        onclick={() => void refreshStatusText()}
                    >
                        <SiyuanIcon name="refresh" size={14} />
                    </button>
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
                                    {#if getButtonIconName(sortedButtons)}
                                        <SiyuanIcon name={getButtonIconName(sortedButtons)} size={14} />
                                    {/if}
                                    <span>{getButtonDisplayLabel(sortedButtons)}</span>
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
                                        {#if getButtonIconName(item)}
                                            <SiyuanIcon name={getButtonIconName(item)} size={14} />
                                        {/if}
                                        <span>{getButtonDisplayLabel(item)}</span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <!-- 头部快捷区域 -->
    {#if !(bannerTitleIntegrated && $showBanner)}
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

            <div class="stats-info-wrap">
                <div
                    class="stats-info"
                    class:error={Boolean(statusAiVisibleErrorMessage)}
                    style="white-space: pre-line"
                >
                    {formattedStatsInfoText}
                </div>

                <button
                    class="stats-info-refresh"
                    class:is-refreshing={isRefreshingStatusText}
                    type="button"
                    title="刷新状态语"
                    aria-label="刷新状态语"
                    disabled={isRefreshingStatusText || statusAiRuntimeState === "generating"}
                    onclick={() => void refreshStatusText()}
                >
                    <SiyuanIcon name="refresh" size={14} />
                </button>
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
                                {#if getButtonIconName(sortedButtons)}
                                    <SiyuanIcon name={getButtonIconName(sortedButtons)} size={14} />
                                {/if}
                                <span>{getButtonDisplayLabel(sortedButtons)}</span>
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
                                    {#if getButtonIconName(item)}
                                        <SiyuanIcon name={getButtonIconName(item)} size={14} />
                                    {/if}
                                    <span>{getButtonDisplayLabel(item)}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- 自定义组件区域 -->
    <div
        bind:this={customContentContainer}
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
    <div class="shp-falling-container">
        {#each Array(20) as _, i}
            <div
                class="shp-falling-flake"
                style="--animation-delay: {i * 0.2}s"
            ></div>
        {/each}
    </div>
</div>
