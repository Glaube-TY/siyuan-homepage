<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy, tick } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { showMessage } from "siyuan";

    import { writable } from "svelte/store";
    import Sortable from "sortablejs";

    import {
        saveLayout,
        restoreLayout,
        type HomepageLayoutRuntimeOptions,
    } from "../components/utils/widgetBlock/utils/layout-handler";
    import {
        DEFAULT_WIDGET_GAP,
        DEFAULT_WIDGET_LAYOUT_NUMBER,
        loadWidgetLayoutSettings,
        loadLayoutSnapshotForContext,
        setActiveComponentSectionForCurrentDevice,
        normalizeLayoutItems,
        readCoordinatedSnapshotForContext,
        resolveEffectiveWidgetLayoutSettings,
        validateLayoutViewSectionConsistency,
        type RestoreLayoutResult,
    } from "../components/utils/widgetBlock/utils/layout-shared";
    import { handleLoad } from "./topBanner/drag";
    import {
        loadStatsDataResult,
        parseDurationExpression,
        prepareHomepageStatistics,
    } from "./header/stats-loader";
    import {
        buildHomepageStatusAiCacheKey,
        generateHomepageStatusText,
        loadHomepageStatusFacts,
        type HomepageStatusAiConfig,
    } from "./header/status-ai-generator";
    import { STAT_INDEX_UPDATED_EVENT } from "@/components/tools/statisticalAPI";
    import {
        handleMoreButtonClick,
        handleButtonClick,
        reRegisterAllShortcuts,
        unregisterAllShortcuts,
    } from "./header/quick-button";
    import { getButtonDisplayLabel, getButtonIconName } from "./buttonRegistry";
    import { mdToHtml } from "@/components/tools/mdToHtml";
    import { normalizeSiyuanDocIcon } from "@/components/tools/docIcon";
    import {
        updateCursorStyle,
        createClickEffect,
        createMouseTrail,
        cleanupMouseEffects,
    } from "./effects/mouseEffects";
    import {
        updateHomepageBackgroundImageStyle,
        cleanupHomepageBackgroundImageStyle,
    } from "./effects/backgroundImage";
    import {
        preloadFallingIcons,
        animateFalling,
        cleanupFallingEffects,
    } from "./effects/fallingEffects";
    import type { FallingEffectConfig } from "./effects/fallingEffects";
    import {
        normalizeHomepageConfigData,
        resolveBannerImage,
        resolveBackgroundImage,
        resolveButtonsList,
        loadBannerDisplaySettings,
        saveBannerDisplaySettings,
        type HomepageStatusTextMode,
    } from "./configLoader";
    import { getCurrentDeviceViewContext } from "./deviceView/deviceViewContext";
    import { readWidgetInstanceDocument } from "./deviceView/widgetInstanceRepository";
    import { readDeviceViewManifest } from "./deviceView/deviceViewStorage";
    import { hasSameJsonSemantic } from "./deviceView/jsonSafe";
    import {
        DEFAULT_BACKGROUND_IMAGE_BLUR,
        DEFAULT_BACKGROUND_IMAGE_OPACITY,
        DEFAULT_BANNER_GLASS_BLUR,
        DEFAULT_BANNER_GLASS_COLOR,
        DEFAULT_BANNER_GLASS_COLOR_MODE,
        DEFAULT_BANNER_GLASS_OPACITY,
        DEFAULT_BANNER_INTEGRATED_COLOR,
        DEFAULT_HOMEPAGE_TITLE_ALIGN,
        DEFAULT_QUICK_BUTTON_STYLE,
        isComponentSectionsEffective,
        normalizeComponentSections,
        normalizeComponentSectionsNavAlign,
        type BannerGlassColorMode,
        type ComponentSection,
        type ComponentSectionsNavAlign,
        type HomepageTitleAlign,
        type QuickButtonStyle,
    } from "./homepageSetting/config";
    import {
        DEFAULT_STATS_INFO_TEXT,
        DEFAULT_STATUS_AI_MAX_CHARS,
        DEFAULT_STATUS_AI_PROMPT,
        DEFAULT_STATUS_AI_STAT_KEYS,
        HOMEPAGE_STATUS_STAT_DEFINITIONS,
        normalizeHomepageStatusTextMode,
        normalizeStatusAiMaxChars,
        normalizeStatusAiModelId,
        normalizeStatusAiPrompt,
        normalizeStatusAiThinkingEnabled,
        normalizeStatusAiStatKeys,
        type HomepageStatusStatKey,
    } from "./status-text-config";
    import { floatingPopoverAction } from "@/components/utils/shared/floating-popover-action";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { assertSectionLayoutInvariants } from "@/components/utils/widgetBlock/utils/layout-section-ops";
    import {
        clearPreservedWidgetElementAfterAppend,
        captureHomepageWidgetDomSnapshot,
        cleanupStalePreservedWidgetEntries,
        enumerateHomepageWidgetElements,
        getDirectWidgetElements,
        isElementDirectChildOfScopedContainer,
        matchesHomepageWidgetDomSnapshot,
        restoreHomepageWidgetDomSnapshot,
        storePreservedWidgetElement,
        type HomepageWidgetDomSnapshot,
    } from "./homepage-widget-dom";

    import "./style/homepage.scss"

    export const app = undefined;
    interface Props {
        plugin: any;
        showIcon?: any;
    }

    let { plugin, showIcon = writable(true) }: Props = $props();

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
    let backgroundImageEnabled = $state(false);
    let backgroundImageGlobalEnabled = $state(false);
    let backgroundImageSrc = $state("");
    let backgroundImageOpacity = $state(DEFAULT_BACKGROUND_IMAGE_OPACITY);
    let backgroundImageBlur = $state(DEFAULT_BACKGROUND_IMAGE_BLUR);
    let topBannerInlineStyle = $derived(
        bannerTitleIntegrated && bannerEnabled
            ? "--homepage-effective-banner-height: auto; height: auto; min-height: 0; flex-basis: auto;"
            : `--homepage-effective-banner-height: ${bannerHeight}px; height: var(--homepage-effective-banner-height); min-height: var(--homepage-effective-banner-height); flex-basis: var(--homepage-effective-banner-height);`
    );

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let titleIconType: "emoji" | "image" = $state("emoji");
    let tempTitleIconEmoji = $state("🏠");
    let tempTitleIconImage: string | null = $state(null);
    let pageTitle = $state("思源笔记首页");

    let tempTitleIconStyle: string = $state("square");

    let statsInfoText = $state(DEFAULT_STATS_INFO_TEXT);
    let statusTextMode = $state<HomepageStatusTextMode>("custom");
    let statusAiPrompt = $state(DEFAULT_STATUS_AI_PROMPT);
    let statusAiMaxChars = $state(DEFAULT_STATUS_AI_MAX_CHARS);
    let statusAiProviderId = $state("");
    let statusAiModelId = $state("");
    let statusAiThinkingEnabled = $state(false);
    let statusAiStatKeys = $state<HomepageStatusStatKey[]>([...DEFAULT_STATUS_AI_STAT_KEYS]);
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
        action?: string;
    };
    let buttonsList: ButtonItem[] = $state([]);
    let showMoreMenu = $state(false);
    let isHoveringNavBar = $state(false);
    let moreButtonEl: HTMLButtonElement | null = $state(null);

    let widgetLayoutNumber = $state(DEFAULT_WIDGET_LAYOUT_NUMBER);
    let widgetGap = $state(DEFAULT_WIDGET_GAP);
    let initialWidgetGridReady = $state(false);
    let componentSectionsEnabled = $state(false);
    let componentSections = $state<ComponentSection[]>(normalizeComponentSections(undefined));
    let componentSectionsNavAlign = $state<ComponentSectionsNavAlign>("left");
    let requestedComponentSectionId = $state<string | undefined>(undefined);
    let preparingComponentSectionId = $state<string | undefined>(undefined);
    let activeComponentSectionId = $state<string | undefined>(undefined);
    let effectiveComponentSectionsEnabled = $derived(
        isComponentSectionsEffective(
            { componentSectionsEnabled, componentSections },
            advanced,
        ),
    );
    let destroyBannerDrag: (() => void) | null = null;

    // 普通组件区不是分栏，使用空字符串作为内部运行时标识，不写入也不显示为导航项。
    const ROOT_COMPONENT_SECTION_ID = "";

    // 本地容器引用：避免全局 selector 在实例重叠时命中错容器
    const componentSectionContainers = new Map<string, HTMLElement>();
    type SectionRuntimeStatus = "unloaded" | "loading" | "ready" | "degraded" | "failed" | "stale";
    interface SectionRuntimeState {
        layoutRevision: number;
        sectionContentSignature: string;
        declaredWidgetIds: string[];
        expectedIds: string[];
        failedWidgetIds: string[];
        unresolvedWidgetIds: string[];
        effectiveColumns?: number;
        effectiveGap?: number;
        structuralComplete: boolean;
        status: SectionRuntimeStatus;
        reason?: string;
    }
    let sectionRuntimeStates = new SvelteMap<string, SectionRuntimeState>();
    const componentSectionRestoreInFlight = new Map<string, Promise<RestoreLayoutResult>>();
    const preservedWidgetElements = new Map<string, HTMLElement>();
    let preserveMountedWidgetsOnNextContainerDestroy = false;

    // 每个可见容器独立运行状态
    const sectionSortables = new Map<string, Sortable>();
    const sectionResizeObservers = new Map<string, ResizeObserver>();
    const sectionInfrastructureContainers = new Map<string, HTMLElement>();
    let sectionWidgetLayoutNumbers = new SvelteMap<string, number>();
    let sectionWidgetGaps = new SvelteMap<string, number>();

    // 普通组件区是否有可见组件；用于在分栏开启且根区为空时折叠空白。
    let rootComponentSectionHasWidgets = $state(false);

    function getCurrentHomepageDomScope(currentContainer?: HTMLElement | null) {
        return {
            componentSectionContainers,
            preservedWidgetElements,
            currentContainer,
        };
    }

    // 分栏真实生效时不再显示普通组件区，全部组件按全局 order 渲染在活动分栏中。
    let showRootComponentSection = $derived(!effectiveComponentSectionsEnabled);

    // 普通组件区已完成恢复且没有可见组件时才折叠自身；恢复前必须保持可见，避免 ECharts 拿不到尺寸。
    let rootComponentSectionCollapsed = $derived(
        showRootComponentSection &&
        ["ready", "degraded"].includes(sectionRuntimeStates.get(ROOT_COMPONENT_SECTION_ID)?.status || "") &&
        !rootComponentSectionHasWidgets
    );

    // 初始化状态标记：确保只初始化一次
    let customContentInitialized = false;

    // CSS 变量更新：统一基础格子高度，并同步 grid 列数与间距。
    // 返回 true 表示网格参数已成功写入容器；false 表示前置条件不满足。
    function updateCustomGridMetricsForContainer(container: HTMLElement | null, layoutNumber: number, gap: number): boolean {
        if (!container) return false;
        if (!Number.isInteger(layoutNumber) || layoutNumber <= 0) return false;
        if (!Number.isFinite(gap) || gap < 0) return false;
        if (!container.isConnected) return false;
        const clientWidth = container.clientWidth;
        if (clientWidth <= 0) return false;

        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const gapPx = gap * rootFontSize;
        const cellSize = (clientWidth - gapPx * (layoutNumber - 1)) / layoutNumber;

        if (!Number.isFinite(cellSize) || cellSize <= 0) return false;

        container.style.setProperty("--widget-cell-size", `${cellSize}px`);
        container.style.gridTemplateColumns = `repeat(${layoutNumber}, minmax(0, 1fr))`;
        container.style.gap = `${gap}rem`;
        return true;
    }

    function countVisibleWidgetsInContainer(container: HTMLElement | null): number {
        if (!container) return 0;
        return Array.from(container.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("widget-block"),
        ).length;
    }

    // 更新所有可见容器的网格参数；优先使用容器自身保存的列数/间距，未设置则回退到根布局值。
    function updateCustomGridMetrics(): void {
        const rootContainer = getComponentSectionContainer(ROOT_COMPONENT_SECTION_ID);
        if (rootContainer) {
            updateCustomGridMetricsForContainer(rootContainer, widgetLayoutNumber, widgetGap);
            rootComponentSectionHasWidgets = countVisibleWidgetsInContainer(rootContainer) > 0;
        } else {
            rootComponentSectionHasWidgets = false;
        }
        for (const sectionId of componentSections.map((section) => section.id)) {
            const container = getComponentSectionContainer(sectionId);
            if (!container || container.classList.contains("hidden")) continue;
            const layoutNumber = sectionWidgetLayoutNumbers.get(sectionId) ?? widgetLayoutNumber;
            const gap = sectionWidgetGaps.get(sectionId) ?? widgetGap;
            updateCustomGridMetricsForContainer(container, layoutNumber, gap);
        }
    }

    function getCurrentComponentSectionId(): string | undefined {
        return effectiveComponentSectionsEnabled ? activeComponentSectionId : ROOT_COMPONENT_SECTION_ID;
    }

    function normalizeRuntimeSectionId(sectionId: string | null | undefined): string {
        return typeof sectionId === "string" ? sectionId.trim() : "";
    }

    function setSectionRuntimeState(sectionId: string, state: SectionRuntimeState): void {
        sectionRuntimeStates.set(sectionId, {
            ...state,
            declaredWidgetIds: [...state.declaredWidgetIds],
            expectedIds: [...state.expectedIds],
            failedWidgetIds: [...state.failedWidgetIds],
            unresolvedWidgetIds: [...state.unresolvedWidgetIds],
        });
    }

    function markSectionRuntimeState(sectionId: string, status: SectionRuntimeStatus, reason?: string): void {
        const previous = sectionRuntimeStates.get(sectionId);
        setSectionRuntimeState(sectionId, {
            layoutRevision: previous?.layoutRevision ?? 0,
            sectionContentSignature: previous?.sectionContentSignature ?? "",
            declaredWidgetIds: previous?.declaredWidgetIds ?? [],
            expectedIds: previous?.expectedIds ?? [],
            failedWidgetIds: previous?.failedWidgetIds ?? [],
            unresolvedWidgetIds: previous?.unresolvedWidgetIds ?? [],
            effectiveColumns: previous?.effectiveColumns,
            effectiveGap: previous?.effectiveGap,
            structuralComplete: previous?.structuralComplete ?? false,
            status,
            ...(reason ? { reason } : {}),
        });
    }

    function clearSectionRuntimeState(sectionId: string): void {
        sectionRuntimeStates.delete(sectionId);
    }

    function haveSameOrderedIds(left: readonly string[], right: readonly string[]): boolean {
        return left.length === right.length && left.every((id, index) => id === right[index]);
    }

    function getContainerWidgetIds(container: HTMLElement): string[] {
        return Array.from(container.children)
            .filter((child): child is HTMLElement => (
                child instanceof HTMLElement && child.classList.contains("widget-block") && Boolean(child.id)
            ))
            .map((element) => element.id);
    }

    function snapshotComponentSectionsForRuntime(sections: ComponentSection[]): ComponentSection[] {
        return Array.from(sections, (section) => ({
            id: section.id,
            name: section.name,
            createdAt: section.createdAt,
            updatedAt: section.updatedAt,
        }));
    }

    function getComponentSectionContainer(sectionId: string): HTMLElement | null {
        return componentSectionContainers.get(sectionId) || null;
    }

    function activateComponentSectionContainer(sectionId: string | undefined = getCurrentComponentSectionId()): HTMLElement | null {
        const effectiveSectionId = sectionId ?? ROOT_COMPONENT_SECTION_ID;
        const container = getComponentSectionContainer(effectiveSectionId);
        if (!container) return null;
        setupContainerInfrastructure(container, effectiveSectionId);
        return container;
    }

    function registerCustomContentContainer(node: HTMLElement, sectionId: string) {
        const sectionsEnabledAtRegistration = effectiveComponentSectionsEnabled;
        componentSectionContainers.set(sectionId, node);

        return {
            destroy() {
                // 仅在“普通布局 ↔ 分栏布局”真实切换时暂存健康实例；普通配置更新和标签切换不触发。
                const shouldPreserve = (
                    !homepageComponentDestroyed
                    && (
                        preserveMountedWidgetsOnNextContainerDestroy
                        || sectionsEnabledAtRegistration !== effectiveComponentSectionsEnabled
                    )
                );
                const widgetElements = getDirectWidgetElements(node);
                const healthyElements = new Set(widgetElements.filter((element) => (
                    (element as any).__widgetBlockInstance?.hasMountedContent?.() === true
                )));
                let preservationSucceeded = false;
                let preservationFailure: string | undefined;

                try {
                    if (shouldPreserve) {
                        const scope = getCurrentHomepageDomScope(node);
                        const enumeration = enumerateHomepageWidgetElements(scope);
                        const duplicate = Array.from(enumeration.elementsById.entries())
                            .find(([, elements]) => elements.length > 1);
                        preservationFailure = enumeration.ownershipErrors[0]
                            ?? (duplicate ? `存在重复组件实例 ${duplicate[0]}` : undefined);
                        if (!preservationFailure) {
                            for (const element of healthyElements) {
                                const existing = preservedWidgetElements.get(element.id);
                                if (existing && existing !== element) {
                                    preservationFailure = `preserved Map 中已存在另一个组件实例 ${element.id}`;
                                    break;
                                }
                            }
                        }

                        if (!preservationFailure) {
                            const transactionSnapshot = captureHomepageWidgetDomSnapshot(scope);
                            const staleElements = new Set(
                                enumeration.stalePreservedEntries.map(([, element]) => element),
                            );
                            transactionSnapshot.preservedEntries = transactionSnapshot.preservedEntries
                                .filter(([, element]) => !staleElements.has(element));

                            const staleCleanup = cleanupStalePreservedWidgetEntries(
                                enumeration,
                                preservedWidgetElements,
                            );
                            if ("reason" in staleCleanup) {
                                preservationFailure = staleCleanup.reason;
                            } else {
                                for (const element of healthyElements) {
                                    const stored = storePreservedWidgetElement(
                                        element.id,
                                        element,
                                        scope,
                                    );
                                    if ("reason" in stored) {
                                        preservationFailure = stored.reason;
                                        break;
                                    }
                                }
                            }

                            if (preservationFailure) {
                                const rolledBack = restoreHomepageWidgetDomSnapshot(
                                    transactionSnapshot,
                                    scope,
                                );
                                if ("reason" in rolledBack) {
                                    preservationFailure = `${preservationFailure}；容器销毁交接回滚失败：${rolledBack.reason}`;
                                }
                            } else {
                                preservationSucceeded = true;
                            }
                        }
                    }
                } catch (error) {
                    preservationFailure = error instanceof Error ? error.message : String(error);
                } finally {
                    // Svelte action destroy 无法取消 node 拆除：未成功交接的实例必须在容器注销前显式销毁。
                    const elementsToDestroy = shouldPreserve && preservationSucceeded
                        ? widgetElements.filter((element) => !healthyElements.has(element))
                        : widgetElements;
                    for (const element of new Set(elementsToDestroy)) {
                        const preserved = preservedWidgetElements.get(element.id);
                        if (preserved === element) {
                            preservedWidgetElements.delete(element.id);
                        }
                        const instance = (element as any).__widgetBlockInstance;
                        try {
                            instance?.destroy?.();
                        } catch (error) {
                            console.warn(`[Homepage] 销毁已注销容器中的组件 ${element.id} 失败`, error);
                        }
                    }

                    const registeredContainer = componentSectionContainers.get(sectionId);
                    const ownsRegistration = registeredContainer === node;
                    if (ownsRegistration) {
                        componentSectionContainers.delete(sectionId);
                    }
                    cleanupContainerInfrastructure(sectionId, node);

                    // 若同一 section 已登记了更新的 node，旧 action 不覆盖新容器正在建立的 runtime 状态。
                    if (ownsRegistration || !registeredContainer) {
                        if (shouldPreserve && !preservationSucceeded) {
                            markSectionRuntimeState(
                                sectionId,
                                "failed",
                                preservationFailure || "容器销毁时健康组件未能安全交接",
                            );
                        } else {
                            clearSectionRuntimeState(sectionId);
                        }
                    }
                }
            },
        };
    }

    function setupContainerInfrastructure(container: HTMLElement, sectionId: string): void {
        cleanupContainerInfrastructure(sectionId);
        sectionInfrastructureContainers.set(sectionId, container);

        let resizeRafId = 0;
        const resizeObserver = new ResizeObserver(() => {
            if (resizeRafId) return;
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = 0;
                // 容器销毁后不再回调；确保仍然属于当前实例。
                if (!container.isConnected) return;
                if (sectionInfrastructureContainers.get(sectionId) !== container) return;
                const layoutNumber = sectionWidgetLayoutNumbers.get(sectionId) ?? widgetLayoutNumber;
                const gap = sectionWidgetGaps.get(sectionId) ?? widgetGap;
                updateCustomGridMetricsForContainer(container, layoutNumber, gap);
            });
        });
        resizeObserver.observe(container);
        sectionResizeObservers.set(sectionId, resizeObserver);

        const sortable = new Sortable(container, {
            animation: 150,
            ghostClass: "sortable-ghost",
            handle: ".drag-handle",
            onEnd: () => {
                const runtimeStatus = sectionRuntimeStates.get(sectionId)?.status;
                if (!["ready", "degraded"].includes(runtimeStatus || "")) {
                    return;
                }
                saveLayout(plugin, container, {
                    sectionsEnabled: sectionId !== ROOT_COMPONENT_SECTION_ID,
                    sectionId: sectionId === ROOT_COMPONENT_SECTION_ID ? null : sectionId,
                });
            },
        });
        sectionSortables.set(sectionId, sortable);
    }

    function cleanupContainerInfrastructure(sectionId: string, expectedContainer?: HTMLElement): void {
        if (
            expectedContainer
            && sectionInfrastructureContainers.get(sectionId) !== expectedContainer
        ) {
            return;
        }
        const existingObserver = sectionResizeObservers.get(sectionId);
        if (existingObserver) {
            try {
                existingObserver.disconnect();
            } catch (error) {
                console.warn(`[Homepage] 断开分栏 ${sectionId || "root"} ResizeObserver 失败`, error);
            } finally {
                sectionResizeObservers.delete(sectionId);
            }
        }
        const existingSortable = sectionSortables.get(sectionId);
        if (existingSortable) {
            try {
                existingSortable.destroy();
            } catch (error) {
                console.warn(`[Homepage] 销毁分栏 ${sectionId || "root"} Sortable 失败`, error);
            } finally {
                sectionSortables.delete(sectionId);
            }
        }
        sectionInfrastructureContainers.delete(sectionId);
    }

    interface SectionRestoreOptions {
        force?: boolean;
        fixedContext?: ReturnType<typeof getCurrentDeviceViewContext>;
        expectedLayoutRevision?: number;
        expectedWidgetIds?: readonly string[];
        expectedDeclaredWidgetIds?: readonly string[];
        sectionContentSignature?: string;
        effectiveColumns?: number;
        effectiveGap?: number;
        identityResolved?: boolean;
    }

    async function resolveSectionRestoreOptions(
        sectionId: string,
        options: SectionRestoreOptions,
    ): Promise<SectionRestoreOptions> {
        if (sectionId === ROOT_COMPONENT_SECTION_ID || options.identityResolved === true) {
            return options;
        }
        const fixedContext = options.fixedContext
            ?? getCurrentDeviceViewContext(plugin, "desktop-homepage");
        const snapshot = await loadLayoutSnapshotForContext(fixedContext, { assumeReady: true });
        if (
            options.expectedLayoutRevision !== undefined
            && options.expectedLayoutRevision !== snapshot.revision
        ) {
            throw new Error("分栏布局 revision 在身份计算前发生变化");
        }
        const manifest = await readDeviceViewManifest(fixedContext);
        if (!manifest) throw new Error("当前设备视图 manifest 缺失");
        const settings = resolveEffectiveWidgetLayoutSettings(
            snapshot.layout,
            fixedContext.scopeId,
            { sectionsEnabled: true, sectionId },
        );
        const identity = computeSectionIdentity(
            sectionId,
            snapshot.layout,
            fixedContext,
            new Set(manifest.migration?.unresolvedLegacyWidgetIds ?? []),
            componentSections.map((section) => section.id),
            settings.widgetLayoutNumber,
            settings.widgetGap,
        );
        return {
            ...options,
            fixedContext,
            expectedLayoutRevision: snapshot.revision,
            expectedWidgetIds: identity.renderableWidgetIds,
            expectedDeclaredWidgetIds: identity.declaredWidgetIds,
            sectionContentSignature: identity.sectionContentSignature,
            effectiveColumns: identity.effectiveColumns,
            effectiveGap: identity.effectiveGap,
            identityResolved: true,
        };
    }

    async function ensureComponentSectionRestored(
        sectionId: string | undefined,
        options: SectionRestoreOptions = {},
    ): Promise<RestoreLayoutResult> {
        const effectiveSectionId = sectionId ?? ROOT_COMPONENT_SECTION_ID;
        let resolvedOptions: SectionRestoreOptions;
        try {
            resolvedOptions = await resolveSectionRestoreOptions(effectiveSectionId, options);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            markSectionRuntimeState(effectiveSectionId, "failed", reason);
            return {
                status: "fatal",
                layoutRevision: options.expectedLayoutRevision ?? 0,
                expectedIds: [],
                failedWidgetIds: [],
                unresolvedWidgetIds: [],
                structuralComplete: false,
                reason,
            };
        }
        const cachedState = sectionRuntimeStates.get(effectiveSectionId);
        const cachedContainer = getComponentSectionContainer(effectiveSectionId);
        const cachedReuse = cachedState && cachedContainer
            ? canReuseSectionRuntime(
                effectiveSectionId,
                resolvedOptions.expectedWidgetIds ?? cachedState.expectedIds,
                resolvedOptions.sectionContentSignature ?? cachedState.sectionContentSignature,
                cachedContainer,
                resolvedOptions.fixedContext ?? getCurrentDeviceViewContext(plugin, "desktop-homepage"),
            )
            : SectionReuse.No;
        if (resolvedOptions.force !== true && cachedState && cachedReuse === SectionReuse.PureReuse) {
            return {
                status: cachedState.status === "ready" ? "complete" : "degraded",
                layoutRevision: cachedState.layoutRevision,
                expectedIds: [...cachedState.expectedIds],
                failedWidgetIds: [...cachedState.failedWidgetIds],
                unresolvedWidgetIds: [...cachedState.unresolvedWidgetIds],
                structuralComplete: cachedState.structuralComplete,
                ...(cachedState.reason ? { reason: cachedState.reason } : {}),
            };
        }
        const inFlight = componentSectionRestoreInFlight.get(effectiveSectionId);
        if (inFlight) {
            return await inFlight;
        }

        const restorePromise = restoreComponentSectionWithRetry(effectiveSectionId, resolvedOptions);
        componentSectionRestoreInFlight.set(effectiveSectionId, restorePromise);
        try {
            return await restorePromise;
        } finally {
            if (componentSectionRestoreInFlight.get(effectiveSectionId) === restorePromise) {
                componentSectionRestoreInFlight.delete(effectiveSectionId);
            }
        }
    }

    async function restoreComponentSectionWithRetry(
        sectionId: string,
        options: SectionRestoreOptions = {},
    ): Promise<RestoreLayoutResult> {
        let resolvedOptions: SectionRestoreOptions;
        try {
            resolvedOptions = await resolveSectionRestoreOptions(sectionId, options);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            markSectionRuntimeState(sectionId, "failed", reason);
            return {
                status: "fatal",
                layoutRevision: options.expectedLayoutRevision ?? 0,
                expectedIds: [],
                failedWidgetIds: [],
                unresolvedWidgetIds: [],
                structuralComplete: false,
                reason,
            };
        }
        options = resolvedOptions;
        const container = getComponentSectionContainer(sectionId);
        if (!container) {
            return {
                status: "fatal",
                layoutRevision: 0,
                expectedIds: [],
                failedWidgetIds: [],
                unresolvedWidgetIds: [],
                structuralComplete: false,
                reason: "分栏容器不存在",
            };
        }
        // 分区导航模式下，只 restore 当前 visible 分栏或正在切换的目标分栏；普通组件区（sectionId 为空字符串）始终需要恢复。
        if (effectiveComponentSectionsEnabled && sectionId && sectionId !== activeComponentSectionId && sectionId !== requestedComponentSectionId) {
            return {
                status: "fatal",
                layoutRevision: sectionRuntimeStates.get(sectionId)?.layoutRevision ?? 0,
                expectedIds: sectionRuntimeStates.get(sectionId)?.expectedIds ?? [],
                failedWidgetIds: sectionRuntimeStates.get(sectionId)?.failedWidgetIds ?? [],
                unresolvedWidgetIds: sectionRuntimeStates.get(sectionId)?.unresolvedWidgetIds ?? [],
                structuralComplete: false,
                reason: "目标分栏不是当前本地活动分栏",
            };
        }

        markSectionRuntimeState(sectionId, "loading");
        let result: RestoreLayoutResult;
        try {
            const isRootSection = sectionId === ROOT_COMPONENT_SECTION_ID;
            result = await restoreLayout(
                plugin,
                { value: container },
                container,
                {
                    sectionsEnabled: !isRootSection && effectiveComponentSectionsEnabled,
                    sectionId: isRootSection ? null : sectionId,
                    preservedWidgetElements,
                    componentSectionContainers,
                    readOnly: true,
                    ...(options.fixedContext ? { deviceViewContext: options.fixedContext } : {}),
                    expectedLayoutRevision: options.expectedLayoutRevision,
                    expectedWidgetIds: options.expectedDeclaredWidgetIds ?? options.expectedWidgetIds,
                },
            );
        } catch (error) {
            result = {
                status: "fatal",
                layoutRevision: options.expectedLayoutRevision ?? 0,
                expectedIds: [...(options.expectedWidgetIds ?? [])],
                failedWidgetIds: [],
                unresolvedWidgetIds: [],
                structuralComplete: false,
                reason: error instanceof Error ? error.message : String(error),
            };
        }
        if (result.status !== "fatal") {
            container.dataset.layoutRestoreState = result.status === "complete" ? "ready" : result.status;
        }
        setSectionRuntimeState(sectionId, {
            layoutRevision: result.layoutRevision,
            sectionContentSignature: options.sectionContentSignature ?? "",
            declaredWidgetIds: [...(options.expectedDeclaredWidgetIds ?? [
                ...result.expectedIds,
                ...result.unresolvedWidgetIds,
            ])],
            expectedIds: result.expectedIds,
            failedWidgetIds: result.failedWidgetIds,
            unresolvedWidgetIds: result.unresolvedWidgetIds,
            effectiveColumns: options.effectiveColumns,
            effectiveGap: options.effectiveGap,
            structuralComplete: result.structuralComplete,
            status: result.status === "complete"
                ? "ready"
                : result.status === "degraded"
                    ? "degraded"
                    : "failed",
            ...(result.reason ? { reason: result.reason } : {}),
        });
        return result;
    }

    function getCompleteRestoreExpectedIds(container: HTMLElement): string[] | null {
        if (!container.isConnected) return null;
        const registration = Array.from(componentSectionContainers.entries())
            .find(([, registeredContainer]) => registeredContainer === container);
        if (!registration) return null;
        const state = sectionRuntimeStates.get(registration[0]);
        if (
            !state
            || !["ready", "degraded"].includes(state.status)
            || !state.structuralComplete
            || state.failedWidgetIds.length > 0
            || (registration[0] !== ROOT_COMPONENT_SECTION_ID && !state.sectionContentSignature)
            || (state.status === "degraded" && state.unresolvedWidgetIds.length === 0)
            || (state.status === "ready" && state.unresolvedWidgetIds.length > 0)
        ) return null;
        const unresolvedSet = new Set(state.unresolvedWidgetIds);
        if (!haveSameOrderedIds(
            state.declaredWidgetIds.filter((id) => !unresolvedSet.has(id)),
            state.expectedIds,
        )) return null;
        const expectedIds = state.expectedIds;
        const actualElements = Array.from(container.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("widget-block"));
        if (actualElements.length !== expectedIds.length) return null;
        if (!expectedIds.every((id, index) => actualElements[index]?.id === id)) return null;
        if (!actualElements.every((element) => (element as any).__widgetBlockInstance?.hasMountedContent?.())) return null;
        return expectedIds;
    }

    function getStructuralRestoreExpectedIds(container: HTMLElement): string[] | null {
        if (!container.isConnected) return null;
        if (!["ready", "degraded"].includes(container.dataset.layoutRestoreState || "")) return null;
        let expectedIds: string[];
        try {
            const parsed = JSON.parse(container.dataset.layoutExpectedWidgetIds || "");
            if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string" && id)) return null;
            expectedIds = parsed;
        } catch {
            return null;
        }
        return haveSameOrderedIds(getContainerWidgetIds(container), expectedIds) ? expectedIds : null;
    }

    function captureCompleteContainerSnapshot(
        container: HTMLElement | null,
    ): {
        expectedIds: string[];
        elements: HTMLElement[];
        preservedEntries: Array<[string, HTMLElement]>;
        domSnapshot: HomepageWidgetDomSnapshot;
        runtimeState: SectionRuntimeState;
    } | null {
        if (!container) return null;
        const enumeration = enumerateHomepageWidgetElements(getCurrentHomepageDomScope(container));
        if (enumeration.ownershipErrors.length > 0) return null;
        if (Array.from(enumeration.elementsById.values()).some((elements) => elements.length > 1)) return null;
        const staleCleanup = cleanupStalePreservedWidgetEntries(enumeration, preservedWidgetElements);
        if ("reason" in staleCleanup) return null;
        const expectedIds = getCompleteRestoreExpectedIds(container);
        if (expectedIds === null) return null;
        const elements = Array.from(container.children)
            .filter((child): child is HTMLElement => (
                child instanceof HTMLElement && child.classList.contains("widget-block")
            ));
        if (elements.length !== expectedIds.length) return null;
        if (!expectedIds.every((id, index) => elements[index]?.id === id)) return null;
        if (!elements.every((element) => (element as any).__widgetBlockInstance?.hasMountedContent?.())) return null;
        const sectionId = Array.from(componentSectionContainers.entries())
            .find(([, registeredContainer]) => registeredContainer === container)?.[0];
        const runtimeState = sectionId === undefined ? undefined : sectionRuntimeStates.get(sectionId);
        if (!runtimeState) return null;
        return {
            expectedIds: [...expectedIds],
            elements: [...elements],
            preservedEntries: Array.from(preservedWidgetElements.entries()),
            domSnapshot: captureHomepageWidgetDomSnapshot(getCurrentHomepageDomScope(container)),
            runtimeState: {
                ...runtimeState,
                declaredWidgetIds: [...runtimeState.declaredWidgetIds],
                expectedIds: [...runtimeState.expectedIds],
                failedWidgetIds: [...runtimeState.failedWidgetIds],
                unresolvedWidgetIds: [...runtimeState.unresolvedWidgetIds],
            },
        };
    }

    async function waitForRegisteredConnectedContainer(
        sectionId: string,
    ): Promise<HTMLElement | null> {
        const delays = [0, 0, 50];
        for (const delayMs of delays) {
            await tick();
            if (delayMs > 0) {
                await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
            }
            const container = getComponentSectionContainer(sectionId);
            if (container?.isConnected && componentSectionContainers.get(sectionId) === container) {
                return container;
            }
        }
        return null;
    }

    async function applyComponentSectionLayoutInvalidated(
        event: CustomEvent<{ refreshRoot?: boolean; sectionIds?: string[]; forceCurrent?: boolean }>,
    ): Promise<void> {
        const detail = event.detail || {};
        const refreshRoot = detail.refreshRoot === true;
        const normalizedSectionIds = Array.isArray(detail.sectionIds)
            ? [...new Set(detail.sectionIds.map(normalizeRuntimeSectionId).filter((id) => id))]
            : [];

        // 清理受影响作用域的恢复标记；空 sectionId 不能混入 sectionIds。
        if (refreshRoot) {
            markSectionRuntimeState(ROOT_COMPONENT_SECTION_ID, "stale");
        }
        for (const sectionId of normalizedSectionIds) {
            markSectionRuntimeState(sectionId, "stale");
        }

        const shouldRestoreRoot = showRootComponentSection && (refreshRoot || !effectiveComponentSectionsEnabled);
        const shouldRestoreActiveSection =
            effectiveComponentSectionsEnabled &&
            (detail.forceCurrent === true || normalizedSectionIds.includes(activeComponentSectionId));

        if (!shouldRestoreRoot && !shouldRestoreActiveSection) {
            return;
        }

        await tick();
        if (homepageComponentDestroyed) return;

        if (shouldRestoreRoot) {
            activateComponentSectionContainer(ROOT_COMPONENT_SECTION_ID);
            await ensureComponentSectionRestored(ROOT_COMPONENT_SECTION_ID, { force: true });
            if (homepageComponentDestroyed) return;
        }

        if (shouldRestoreActiveSection) {
            activateComponentSectionContainer(activeComponentSectionId);
            await ensureComponentSectionRestored(activeComponentSectionId, { force: true });
            if (homepageComponentDestroyed) return;
        }

        await tick();
        updateCustomGridMetrics();
    }

    function handleComponentSectionLayoutInvalidated(
        event: CustomEvent<{ refreshRoot?: boolean; sectionIds?: string[]; forceCurrent?: boolean }>,
    ): void {
        void enqueueSectionUiOperation(() => applyComponentSectionLayoutInvalidated(event));
    }

    // 异步请求版本戳，用于丢弃过期结果
    let updateHomepageVersion = 0;
    let updateStatsVersion = 0;

    let homepageComponentDestroyed = false;

    // 实时获取高级功能启用状态
    function getAdvancedEnabled(): boolean {
        return Boolean(plugin?.ADVANCED);
    }

    function getSafeActiveComponentSectionId(sectionId: string | null | undefined, sections = componentSections): string | undefined {
        const normalizedSections = normalizeComponentSections(sections);
        if (sectionId && normalizedSections.some((section) => section.id === sectionId)) {
            return sectionId;
        }
        return normalizedSections[0]?.id;
    }

    interface WidgetAddTargetContext {
        containerEl: HTMLElement | null;
        sectionsEnabled: boolean;
        sectionId: string | null;
        targetKind: "root" | "active-section";
    }

    /**
     * 获取“添加组件”的目标作用域。
     * 分栏真实生效且活动分栏有效时，目标为活动分栏；不得自动回退到普通组件区。
     */
    function getWidgetAddTargetContext(): WidgetAddTargetContext {
        if (
            effectiveComponentSectionsEnabled &&
            activeComponentSectionId &&
            componentSections.some((section) => section.id === activeComponentSectionId)
        ) {
            return {
                containerEl: getComponentSectionContainer(activeComponentSectionId),
                sectionsEnabled: true,
                sectionId: activeComponentSectionId,
                targetKind: "active-section",
            };
        }
        return {
            containerEl: getComponentSectionContainer(ROOT_COMPONENT_SECTION_ID),
            sectionsEnabled: false,
            sectionId: null,
            targetKind: "root",
        };
    }

    /**
     * 确认添加组件的目标容器已就绪；未就绪时先恢复对应作用域。
     * 失败返回 null，调用方应停止添加并提示用户。
     */
    async function ensureWidgetAddTargetReady(): Promise<WidgetAddTargetContext | null> {
        const context = getWidgetAddTargetContext();
        const targetSectionId = context.sectionId ?? ROOT_COMPONENT_SECTION_ID;
        const container = context.containerEl;
        if (!container || !container.isConnected) {
            if (context.targetKind === "active-section") {
                showMessage("目标分栏容器尚未就绪，无法添加组件", 3000, "info");
            } else {
                showMessage("目标组件区尚未就绪，请稍后重试", 3000, "info");
            }
            return null;
        }
        if (
            !["ready", "degraded"].includes(sectionRuntimeStates.get(targetSectionId)?.status || "")
        ) {
            const restored = await ensureComponentSectionRestored(targetSectionId, { force: true });
            if (restored.status === "fatal") {
                showMessage("组件区恢复失败，无法添加组件", 3000, "info");
                return null;
            }
        }
        return context;
    }

    async function handleFirstContentCommitted(widgetId: string, options: HomepageLayoutRuntimeOptions): Promise<boolean> {
        const sectionId = options.sectionId ?? ROOT_COMPONENT_SECTION_ID;
        const container = getComponentSectionContainer(sectionId);
        if (!container) return false;

        const saved = await saveLayout(plugin, container, {
            ...options,
            committedWidgetIds: [widgetId],
        });
        return saved;
    }

    async function handleAddWidgetButtonClick(item: ButtonItem): Promise<void> {
        const context = await ensureWidgetAddTargetReady();
        if (!context) return;
        handleButtonClick(
            item,
            plugin,
            currentBlockForSettingsRef,
            saveLayout,
            {
                containerEl: context.containerEl,
                sectionsEnabled: context.sectionsEnabled,
                sectionId: context.sectionId,
                onFirstContentCommitted: handleFirstContentCommitted,
            },
        );
    }

    // 恢复当前可见组件区：分栏模式下只恢复活动分栏，普通模式下只恢复普通组件区。
    async function restoreVisibleComponentSections(): Promise<void> {
        if (homepageComponentDestroyed) return;
        if (showRootComponentSection) {
            const rootContainer = activateComponentSectionContainer(ROOT_COMPONENT_SECTION_ID);
            if (rootContainer) {
                await ensureComponentSectionRestored(ROOT_COMPONENT_SECTION_ID);
            }
        }
        if (homepageComponentDestroyed) return;
        if (effectiveComponentSectionsEnabled && activeComponentSectionId) {
            const sectionContainer = activateComponentSectionContainer(activeComponentSectionId);
            if (sectionContainer) {
                await ensureComponentSectionRestored(activeComponentSectionId);
            }
        }
        if (homepageComponentDestroyed) return;
        updateCustomGridMetrics();
    }

    function waitForContainerMountable(container: HTMLElement, timeoutMs = 1000): Promise<boolean> {
        return new Promise((resolve) => {
            const isMountable = () => {
                const style = getComputedStyle(container);
                const isPreparingPanel = container.classList.contains("section-preparing");
                return (
                    container.isConnected
                    && container.clientWidth > 0
                    && style.display !== "none"
                    // 准备面板允许 visibility:hidden，仍可测量 clientWidth 进行结构对账。
                    && (style.visibility !== "hidden" || isPreparingPanel)
                    // 容器必须由当前 Homepage 实例注册。
                    && componentSectionContainers.get(
                        container.dataset.componentSectionId || "",
                    ) === container
                );
            };
            if (isMountable()) {
                resolve(true);
                return;
            }
            const observer = new ResizeObserver(() => {
                if (isMountable()) {
                    cleanup();
                    resolve(true);
                }
            });
            let rafId = 0;
            let timer = 0;
            const cleanup = () => {
                observer.disconnect();
                if (rafId) cancelAnimationFrame(rafId);
                if (timer) window.clearTimeout(timer);
            };
            observer.observe(container);
            rafId = requestAnimationFrame(() => {
                if (isMountable()) {
                    cleanup();
                    resolve(true);
                }
            });
            timer = window.setTimeout(() => {
                cleanup();
                resolve(isMountable());
            }, timeoutMs);
        });
    }

    let sectionUiQueue: Promise<void> = Promise.resolve();

    function enqueueSectionUiOperation<T>(operation: () => Promise<T>): Promise<T> {
        const result = sectionUiQueue.then(operation, operation);
        sectionUiQueue = result.then(() => undefined, () => undefined);
        return result;
    }

    function getValidatedSectionExpectedIds(
        layout: Awaited<ReturnType<typeof loadLayoutSnapshotForContext>>["layout"],
        context: ReturnType<typeof getCurrentDeviceViewContext>,
        sectionId: string,
        validSectionIds: string[],
    ): string[] {
        const profile = layout.profiles?.[context.scopeId];
        const sections = profile?.sections || {};
        if (!validSectionIds.includes(sectionId) || !sections[sectionId]) {
            throw new Error("目标分栏不存在于最新布局");
        }
        const globalOrder = normalizeLayoutItems(profile?.order || layout.order);
        assertSectionLayoutInvariants(globalOrder, sections, validSectionIds, { requireAllAssigned: true });
        const expectedIds = [...sections[sectionId].widgetIds];
        if (new Set(expectedIds).size !== expectedIds.length) {
            throw new Error("目标分栏包含重复组件 ID");
        }
        return expectedIds;
    }

    /** 分栏复用决策。 */
    const SectionReuse = {
        No: 0,
        PureReuse: 1,
        TargetedRetry: 2,
    } as const;
    type SectionReuse = typeof SectionReuse[keyof typeof SectionReuse];

    interface SectionIdentity {
        /** 分栏声明的全部成员 ID（含 unresolved）。 */
        declaredWidgetIds: string[];
        /** 当前分栏中属于 manifest unresolved 的 ID。 */
        unresolvedWidgetIds: string[];
        /** 可渲染的组件 ID（declared 减去 unresolved）。 */
        renderableWidgetIds: string[];
        /** 分栏内容签名：含 declared IDs、样式、有效 columns/gap、section 存在状态及 unresolved 集合。 */
        sectionContentSignature: string;
        effectiveColumns: number | undefined;
        effectiveGap: number | undefined;
    }

    /** 统一计算分栏运行身份：初始加载与点击切换必须共用此函数。 */
    function computeSectionIdentity(
        sectionId: string,
        layout: Awaited<ReturnType<typeof loadLayoutSnapshotForContext>>["layout"],
        context: ReturnType<typeof getCurrentDeviceViewContext>,
        unresolvedLegacyWidgetIds: ReadonlySet<string>,
        validSectionIds: string[],
        effectiveColumns: number | undefined,
        effectiveGap: number | undefined,
    ): SectionIdentity {
        const declaredWidgetIds = getValidatedSectionExpectedIds(layout, context, sectionId, validSectionIds);
        const unresolvedWidgetIds = declaredWidgetIds.filter((id) => unresolvedLegacyWidgetIds.has(id));
        const renderableWidgetIds = declaredWidgetIds.filter((id) => !unresolvedLegacyWidgetIds.has(id));
        const sectionContentSignature = computeSectionContentSignature(
            declaredWidgetIds,
            layout,
            context.scopeId,
            sectionId,
            effectiveColumns,
            effectiveGap,
            unresolvedWidgetIds,
        );
        return {
            declaredWidgetIds,
            unresolvedWidgetIds,
            renderableWidgetIds,
            sectionContentSignature,
            effectiveColumns,
            effectiveGap,
        };
    }

    function computeSectionContentSignature(
        expectedIds: readonly string[],
        layout: Awaited<ReturnType<typeof loadLayoutSnapshotForContext>>["layout"],
        deviceId: string,
        sectionId: string,
        colOrNumber: number | undefined,
        colOrGap: number | undefined,
        unresolvedIds?: readonly string[],
    ): string {
        const profile = layout.profiles?.[deviceId];
        const sectionData = profile?.sections?.[sectionId];
        if (!profile || !sectionData) {
            throw new Error(`分栏 ${sectionId} 缺少严格签名所需的 profile/section`);
        }
        const effectiveColumns = colOrNumber ?? sectionData.widgetLayoutNumber;
        const effectiveGap = colOrGap ?? sectionData.widgetGap;
        if (!Number.isFinite(effectiveColumns) || !Number.isFinite(effectiveGap)) {
            throw new Error(`分栏 ${sectionId} 缺少严格签名所需的 columns/gap`);
        }
        const globalOrder = normalizeLayoutItems(profile.order || layout.order);
        const itemById = new Map(globalOrder.map((item) => [item.id, item] as const));
        const unresolvedSet = new Set(unresolvedIds ?? []);
        const styles = expectedIds
            .filter((id) => !unresolvedSet.has(id))
            .map((id) => {
                const item = itemById.get(id);
                if (!item) throw new Error(`分栏 ${sectionId} 的可渲染组件 ${id} 缺少布局样式`);
                return { id, style: item.style };
            });
        return JSON.stringify({
            ids: [...expectedIds],
            styles,
            col: effectiveColumns,
            gap: effectiveGap,
            exists: true,
            unresolved: [...unresolvedSet].sort(),
        });
    }

    /**
     * 判断分栏是否可复用运行时，区分三种状态：
     * - PureReuse: ready 无 failed；或 degraded 仅有 unresolved（failedWidgetIds 为空）。
     * - TargetedRetry: degraded 且存在实际 failed IDs，只重建失败组件。
     * - No: 结构不匹配或签名变化，必须完整 restore。
     */
    function canReuseSectionRuntime(
        sectionId: string,
        expectedIds: readonly string[],
        sectionContentSignature: string,
        container: HTMLElement,
        _context: ReturnType<typeof getCurrentDeviceViewContext>,
    ): SectionReuse {
        const state = sectionRuntimeStates.get(sectionId);
        if (
            !state
            || !state.structuralComplete
            || state.sectionContentSignature !== sectionContentSignature
            || !haveSameOrderedIds(state.expectedIds, expectedIds)
        ) {
            return SectionReuse.No;
        }
        const scopedDom = enumerateHomepageWidgetElements(getCurrentHomepageDomScope(container));
        if (scopedDom.ownershipErrors.length > 0) return SectionReuse.No;
        const staleCleanup = cleanupStalePreservedWidgetEntries(scopedDom, preservedWidgetElements);
        if ("reason" in staleCleanup) return SectionReuse.No;
        if (Array.from(scopedDom.elementsById.values()).some((elements) => elements.length > 1)) {
            return SectionReuse.No;
        }
        const hasUnhealthyRenderable = expectedIds.some((widgetId) => {
            const targetMatches = getDirectWidgetElements(container)
                .filter((element) => element.id === widgetId);
            const runtimeMatches = scopedDom.elementsById.get(widgetId) ?? [];
            if (
                targetMatches.length !== 1
                || runtimeMatches.length !== 1
                || runtimeMatches[0] !== targetMatches[0]
            ) {
                return true;
            }
            const instance = (targetMatches[0] as any).__widgetBlockInstance;
            return !instance || instance.hasMountedContent?.() !== true;
        });
        if (hasUnhealthyRenderable) {
            return SectionReuse.TargetedRetry;
        }
        if (!haveSameOrderedIds(getContainerWidgetIds(container), expectedIds)) {
            return SectionReuse.No;
        }
        if (
            state.status === "ready"
            && state.failedWidgetIds.length === 0
            && state.unresolvedWidgetIds.length === 0
        ) {
            return SectionReuse.PureReuse;
        }
        // Degraded 且仅有 unresolved → 直接复用，不重新 mount 健康组件。
        if (
            state.status === "degraded"
            && state.failedWidgetIds.length === 0
            && state.unresolvedWidgetIds.length > 0
        ) {
            return SectionReuse.PureReuse;
        }
        // Degraded 且存在实际 failed IDs → 只重试失败组件。
        if (state.status === "degraded" && state.failedWidgetIds.length > 0) {
            return SectionReuse.TargetedRetry;
        }
        return SectionReuse.No;
    }

    async function switchComponentSectionTransaction(sectionId: string): Promise<void> {
        if (!effectiveComponentSectionsEnabled || homepageComponentDestroyed) return;
        const targetSectionId = getSafeActiveComponentSectionId(sectionId);
        if (!targetSectionId) return;

        // 立即设置请求状态，导航按钮显示正在切换。
        requestedComponentSectionId = targetSectionId;

        const previousVisibleSectionId = activeComponentSectionId;
        const fixedContext = getCurrentDeviceViewContext(plugin, "desktop-homepage");

        // 阶段 1：固定 context，读取目标 layout、manifest 和分栏身份。
        let snapshot: Awaited<ReturnType<typeof loadLayoutSnapshotForContext>>;
        let sectionIdentity: SectionIdentity;
        try {
            snapshot = await loadLayoutSnapshotForContext(fixedContext, { assumeReady: true });
            const manifest = await readDeviceViewManifest(fixedContext);
            if (!manifest) throw new Error("当前设备视图 manifest 缺失");
            const unresolvedLegacyWidgetIds = new Set(manifest.migration?.unresolvedLegacyWidgetIds ?? []);
            const effectiveSettings = resolveEffectiveWidgetLayoutSettings(
                snapshot.layout,
                fixedContext.scopeId,
                { sectionsEnabled: true, sectionId: targetSectionId },
            );
            const validSectionIds = componentSections.map((section) => section.id);
            sectionIdentity = computeSectionIdentity(
                targetSectionId,
                snapshot.layout,
                fixedContext,
                unresolvedLegacyWidgetIds,
                validSectionIds,
                effectiveSettings.widgetLayoutNumber,
                effectiveSettings.widgetGap,
            );
        } catch (error) {
            failPreparing("分栏结构不可用", previousVisibleSectionId, error);
            return;
        }

        const targetContainer = getComponentSectionContainer(targetSectionId);
        if (!targetContainer) {
            failPreparing(undefined, previousVisibleSectionId);
            return;
        }

        // 阶段 2：判断复用决策。
        // 使用 renderableWidgetIds 比较 DOM 与 runtime state。
        const reuseDecision = canReuseSectionRuntime(
            targetSectionId,
            sectionIdentity.renderableWidgetIds,
            sectionIdentity.sectionContentSignature,
            targetContainer,
            fixedContext,
        );
        if (reuseDecision === SectionReuse.PureReuse) {
            await switchVisibleComponentSection(targetSectionId, fixedContext, snapshot.revision);
            return;
        }

        // 阶段 3：TargetedRetry — degraded 且有实际 failed IDs，只重建失败组件。
        if (reuseDecision === SectionReuse.TargetedRetry) {
            // 进入准备状态：目标面板可测量但不可见。
            preparingComponentSectionId = targetSectionId;
            await tick();
            if (homepageComponentDestroyed) { failPreparing(undefined, previousVisibleSectionId); return; }
            const prepContainer = getComponentSectionContainer(targetSectionId);
            if (!prepContainer) { failPreparing(undefined, previousVisibleSectionId); return; }
            const prepMountable = await waitForContainerMountable(prepContainer);
            if (homepageComponentDestroyed) { failPreparing(undefined, previousVisibleSectionId); return; }
            if (!prepMountable) {
                failPreparing("目标分栏容器宽度暂不可用", previousVisibleSectionId);
                return;
            }

            activateComponentSectionContainer(targetSectionId);
            if (
                sectionIdentity.effectiveColumns === undefined
                || sectionIdentity.effectiveGap === undefined
            ) {
                failPreparing("分栏布局设置不可读", previousVisibleSectionId);
                return;
            }
            sectionWidgetLayoutNumbers.set(targetSectionId, sectionIdentity.effectiveColumns);
            sectionWidgetGaps.set(targetSectionId, sectionIdentity.effectiveGap);
            updateCustomGridMetricsForContainer(
                prepContainer,
                sectionIdentity.effectiveColumns,
                sectionIdentity.effectiveGap,
            );
            const restored = await ensureComponentSectionRestored(targetSectionId, {
                force: true,
                fixedContext,
                expectedLayoutRevision: snapshot.revision,
                expectedWidgetIds: sectionIdentity.renderableWidgetIds,
                expectedDeclaredWidgetIds: sectionIdentity.declaredWidgetIds,
                sectionContentSignature: sectionIdentity.sectionContentSignature,
                effectiveColumns: sectionIdentity.effectiveColumns,
                effectiveGap: sectionIdentity.effectiveGap,
                identityResolved: true,
            });
            if (homepageComponentDestroyed) { failPreparing(undefined, previousVisibleSectionId); return; }
            if (restored.status === "fatal") {
                failPreparing("分栏恢复失败", previousVisibleSectionId, restored.reason);
                return;
            }
            await switchVisibleComponentSection(targetSectionId, fixedContext, snapshot.revision);
            return;
        }

        // 阶段 4：目标未加载或 stale/failed，在不可见准备面板中完成结构对账。
        // 设置 preparing 后模板会使用 section-preparing 类（visibility:hidden, position:absolute, 有宽度）。
        preparingComponentSectionId = targetSectionId;
        await tick();
        if (homepageComponentDestroyed) { failPreparing(undefined, previousVisibleSectionId); return; }

        // 重新从 container map 取得已进入准备状态的容器。
        const prepContainer = getComponentSectionContainer(targetSectionId);
        if (!prepContainer) { failPreparing(undefined, previousVisibleSectionId); return; }

        const mountable = await waitForContainerMountable(prepContainer);
        if (homepageComponentDestroyed) { failPreparing(undefined, previousVisibleSectionId); return; }
        if (!mountable) {
            failPreparing("目标分栏容器宽度暂不可用", previousVisibleSectionId);
            return;
        }

        activateComponentSectionContainer(targetSectionId);
        if (
            sectionIdentity.effectiveColumns === undefined
            || sectionIdentity.effectiveGap === undefined
        ) {
            failPreparing("分栏布局设置不可读", previousVisibleSectionId);
            return;
        }
        sectionWidgetLayoutNumbers.set(targetSectionId, sectionIdentity.effectiveColumns);
        sectionWidgetGaps.set(targetSectionId, sectionIdentity.effectiveGap);
        updateCustomGridMetricsForContainer(
            prepContainer,
            sectionIdentity.effectiveColumns,
            sectionIdentity.effectiveGap,
        );

        const restored = await ensureComponentSectionRestored(targetSectionId, {
            force: true,
            fixedContext,
            expectedLayoutRevision: snapshot.revision,
            expectedWidgetIds: sectionIdentity.renderableWidgetIds,
            expectedDeclaredWidgetIds: sectionIdentity.declaredWidgetIds,
            sectionContentSignature: sectionIdentity.sectionContentSignature,
            effectiveColumns: sectionIdentity.effectiveColumns,
            effectiveGap: sectionIdentity.effectiveGap,
            identityResolved: true,
        });
        if (homepageComponentDestroyed) { failPreparing(undefined, previousVisibleSectionId); return; }
        if (restored.status === "fatal") {
            failPreparing(
                restored.failureKind === "widget-read" ? "组件配置读取失败，分栏未就绪" : "分栏恢复失败",
                previousVisibleSectionId,
                restored.failureKind !== "widget-read" ? restored.reason : undefined,
            );
            // widget-read 失败不再保留 preparing 面板；目标面板重新进入 hidden。
            markSectionRuntimeState(targetSectionId, "stale", restored.reason);
            return;
        }
        // complete 或 degraded 均视为目标可显示。
        await switchVisibleComponentSection(targetSectionId, fixedContext, snapshot.revision);
    }

    function failPreparing(
        message: string | undefined,
        previousVisibleSectionId: string | undefined,
        error?: unknown,
    ): void {
        preparingComponentSectionId = undefined;
        requestedComponentSectionId = previousVisibleSectionId ?? activeComponentSectionId;
        if (message) {
            showMessage(
                `${message}${error instanceof Error ? `：${error.message}` : error ? `：${String(error)}` : ""}`,
                5000,
                "error",
            );
        }
    }

    async function switchVisibleComponentSection(
        targetSectionId: string,
        fixedContext: ReturnType<typeof getCurrentDeviceViewContext>,
        layoutRevision: number,
    ): Promise<void> {
        preparingComponentSectionId = undefined;
        requestedComponentSectionId = targetSectionId;
        activeComponentSectionId = targetSectionId;
        await tick();
        if (homepageComponentDestroyed) return;
        updateCustomGridMetrics();
        try {
            await setActiveComponentSectionForCurrentDevice(
                plugin,
                targetSectionId,
                "desktop-homepage",
                fixedContext,
                layoutRevision,
            );
        } catch {
            showMessage("当前分栏已显示，但活动分栏状态未保存。", 5000, "info");
        }
    }

    async function handleComponentSectionSwitch(sectionId: string): Promise<void> {
        await enqueueSectionUiOperation(() => switchComponentSectionTransaction(sectionId));
    }

    interface WidgetSectionMovedEventDetail {
        widgetId: string;
        fromSectionId?: string | null;
        toSectionId: string;
        layoutRevision?: number;
        sourceElement?: HTMLElement | null;
        handled: boolean;
        complete: (result: { success: boolean; error?: string }) => void;
    }

    function reorderExistingSectionElements(container: HTMLElement, expectedIds: readonly string[]): void {
        for (const widgetId of expectedIds) {
            const matches = getDirectWidgetElements(container)
                .filter((element) => element.id === widgetId);
            if (matches.length !== 1) continue;
            container.appendChild(matches[0]);
            const cleared = clearPreservedWidgetElementAfterAppend(matches[0], preservedWidgetElements);
            if ("reason" in cleared) throw new Error(cleared.reason);
        }
    }

    function updateSectionRuntimeAfterMove(
        sectionId: string,
        layoutRevision: number,
        identity: SectionIdentity,
    ): void {
        const container = getComponentSectionContainer(sectionId);
        const previous = sectionRuntimeStates.get(sectionId);
        if (!container || !previous || previous.status === "unloaded") {
            setSectionRuntimeState(sectionId, {
                layoutRevision,
                sectionContentSignature: identity.sectionContentSignature,
                declaredWidgetIds: identity.declaredWidgetIds,
                expectedIds: identity.renderableWidgetIds,
                failedWidgetIds: [],
                unresolvedWidgetIds: identity.unresolvedWidgetIds,
                effectiveColumns: identity.effectiveColumns,
                effectiveGap: identity.effectiveGap,
                structuralComplete: false,
                status: "stale",
            });
            return;
        }
        const actualIds = getContainerWidgetIds(container);
        const scoped = enumerateHomepageWidgetElements(getCurrentHomepageDomScope(container));
        const failedWidgetIds = identity.renderableWidgetIds.filter((widgetId) => {
            const matches = scoped.elementsById.get(widgetId) ?? [];
            return (
                matches.length !== 1
                || matches[0].parentElement !== container
                || (matches[0] as any).__widgetBlockInstance?.hasMountedContent?.() !== true
            );
        });
        const structuralComplete = (
            scoped.ownershipErrors.length === 0
            && !Array.from(scoped.elementsById.values()).some((elements) => elements.length > 1)
            && haveSameOrderedIds(actualIds, identity.renderableWidgetIds)
        );
        setSectionRuntimeState(sectionId, {
            layoutRevision,
            sectionContentSignature: identity.sectionContentSignature,
            declaredWidgetIds: identity.declaredWidgetIds,
            expectedIds: identity.renderableWidgetIds,
            failedWidgetIds,
            unresolvedWidgetIds: identity.unresolvedWidgetIds,
            effectiveColumns: identity.effectiveColumns,
            effectiveGap: identity.effectiveGap,
            structuralComplete,
            status: structuralComplete
                ? (failedWidgetIds.length === 0 && identity.unresolvedWidgetIds.length === 0 ? "ready" : "degraded")
                : "stale",
        });
    }

    function haveSameSectionIdentity(left: SectionIdentity, right: SectionIdentity): boolean {
        return (
            left.sectionContentSignature === right.sectionContentSignature
            && haveSameOrderedIds(left.declaredWidgetIds, right.declaredWidgetIds)
            && haveSameOrderedIds(left.renderableWidgetIds, right.renderableWidgetIds)
            && haveSameOrderedIds(left.unresolvedWidgetIds, right.unresolvedWidgetIds)
            && left.effectiveColumns === right.effectiveColumns
            && left.effectiveGap === right.effectiveGap
        );
    }

    async function applyWidgetSectionMoved(detail: WidgetSectionMovedEventDetail): Promise<void> {
        if (homepageComponentDestroyed) throw new Error("主页实例已销毁");
        const fromSectionId = normalizeRuntimeSectionId(detail.fromSectionId);
        const toSectionId = normalizeRuntimeSectionId(detail.toSectionId);
        const sourceContainer = fromSectionId ? getComponentSectionContainer(fromSectionId) : null;
        if (!detail.sourceElement || !sourceContainer) {
            throw new Error("迁移事件缺少当前实例的来源元素或来源分栏");
        }
        const sourceMatches = getDirectWidgetElements(sourceContainer)
            .filter((element) => element.id === detail.widgetId);
        if (sourceMatches.length === 0) throw new Error("来源分栏中不存在迁移组件");
        if (sourceMatches.length > 1) throw new Error("来源分栏中存在重复组件实例");
        if (sourceMatches[0] !== detail.sourceElement) {
            throw new Error("迁移来源元素不属于当前主页实例");
        }
        const fixedContext = getCurrentDeviceViewContext(plugin, "desktop-homepage");
        const snapshot = await loadLayoutSnapshotForContext(fixedContext, { assumeReady: true });
        if (detail.layoutRevision !== snapshot.revision) {
            throw new Error("迁移后的布局 revision 已变化");
        }
        const validSectionIds = componentSections.map((section) => section.id);
        const manifest = await readDeviceViewManifest(fixedContext);
        if (!manifest) throw new Error("迁移后的设备视图 manifest 缺失");
        const unresolvedLegacyWidgetIds = new Set(manifest.migration?.unresolvedLegacyWidgetIds ?? []);
        const targetSettings = resolveEffectiveWidgetLayoutSettings(
            snapshot.layout,
            fixedContext.scopeId,
            { sectionsEnabled: true, sectionId: toSectionId },
        );
        const targetIdentity = computeSectionIdentity(
            toSectionId,
            snapshot.layout,
            fixedContext,
            unresolvedLegacyWidgetIds,
            validSectionIds,
            targetSettings.widgetLayoutNumber,
            targetSettings.widgetGap,
        );
        const sourceIdentity = fromSectionId
            ? (() => {
                const settings = resolveEffectiveWidgetLayoutSettings(
                    snapshot.layout,
                    fixedContext.scopeId,
                    { sectionsEnabled: true, sectionId: fromSectionId },
                );
                return computeSectionIdentity(
                    fromSectionId,
                    snapshot.layout,
                    fixedContext,
                    unresolvedLegacyWidgetIds,
                    validSectionIds,
                    settings.widgetLayoutNumber,
                    settings.widgetGap,
                );
            })()
            : null;
        if (
            !targetIdentity.declaredWidgetIds.includes(detail.widgetId)
            || sourceIdentity?.declaredWidgetIds.includes(detail.widgetId)
        ) {
            throw new Error("迁移后的来源/目标成员关系不成立");
        }
        const profile = snapshot.layout.profiles?.[fixedContext.scopeId];
        const ownerCount = Object.values(profile?.sections || {})
            .filter((section) => section.widgetIds.includes(detail.widgetId)).length;
        if (ownerCount !== 1) {
            throw new Error("迁移后的组件不属于唯一目标分栏");
        }
        const verifyMoveDataSnapshot = async (): Promise<void> => {
            const latestSnapshot = await loadLayoutSnapshotForContext(fixedContext, { assumeReady: true });
            if (latestSnapshot.revision !== snapshot.revision) {
                throw new Error("迁移提交期间布局 revision 已变化");
            }
            const latestManifest = await readDeviceViewManifest(fixedContext);
            if (!latestManifest) throw new Error("迁移提交期间设备视图 manifest 缺失");
            const latestUnresolved = new Set(latestManifest.migration?.unresolvedLegacyWidgetIds ?? []);
            const latestValidSectionIds = componentSections.map((section) => section.id);
            if (!haveSameOrderedIds(latestValidSectionIds, validSectionIds)) {
                throw new Error("迁移提交期间分栏列表已变化");
            }
            const latestTargetSettings = resolveEffectiveWidgetLayoutSettings(
                latestSnapshot.layout,
                fixedContext.scopeId,
                { sectionsEnabled: true, sectionId: toSectionId },
            );
            const latestTargetIdentity = computeSectionIdentity(
                toSectionId,
                latestSnapshot.layout,
                fixedContext,
                latestUnresolved,
                latestValidSectionIds,
                latestTargetSettings.widgetLayoutNumber,
                latestTargetSettings.widgetGap,
            );
            const latestSourceIdentity = fromSectionId
                ? (() => {
                    const settings = resolveEffectiveWidgetLayoutSettings(
                        latestSnapshot.layout,
                        fixedContext.scopeId,
                        { sectionsEnabled: true, sectionId: fromSectionId },
                    );
                    return computeSectionIdentity(
                        fromSectionId,
                        latestSnapshot.layout,
                        fixedContext,
                        latestUnresolved,
                        latestValidSectionIds,
                        settings.widgetLayoutNumber,
                        settings.widgetGap,
                    );
                })()
                : null;
            if (
                !haveSameSectionIdentity(latestTargetIdentity, targetIdentity)
                || Boolean(latestSourceIdentity) !== Boolean(sourceIdentity)
                || (
                    latestSourceIdentity
                    && sourceIdentity
                    && !haveSameSectionIdentity(latestSourceIdentity, sourceIdentity)
                )
            ) {
                throw new Error("迁移提交期间来源或目标分栏身份已变化");
            }
            if (
                !latestTargetIdentity.declaredWidgetIds.includes(detail.widgetId)
                || latestSourceIdentity?.declaredWidgetIds.includes(detail.widgetId)
            ) {
                throw new Error("迁移提交期间来源/目标成员关系已变化");
            }
            const latestProfile = latestSnapshot.layout.profiles?.[fixedContext.scopeId];
            const latestOwnerCount = Object.values(latestProfile?.sections || {})
                .filter((section) => section.widgetIds.includes(detail.widgetId)).length;
            if (latestOwnerCount !== 1) {
                throw new Error("迁移提交期间组件唯一归属已变化");
            }
        };

        const scopedDom = enumerateHomepageWidgetElements(getCurrentHomepageDomScope());
        if (scopedDom.ownershipErrors.length > 0) throw new Error(scopedDom.ownershipErrors[0]);
        const staleCleanup = cleanupStalePreservedWidgetEntries(scopedDom, preservedWidgetElements);
        if ("reason" in staleCleanup) throw new Error(staleCleanup.reason);
        const moveDomSnapshot = captureHomepageWidgetDomSnapshot(getCurrentHomepageDomScope());
        const candidates = scopedDom.elementsById.get(detail.widgetId) ?? [];
        if (candidates.length > 1) {
            throw new Error("页面中存在重复组件实例");
        }
        if (candidates.length !== 1 || candidates[0] !== detail.sourceElement) {
            throw new Error("迁移来源实例在当前主页中已变化");
        }

        const healthyElement = candidates[0] && (candidates[0] as any).__widgetBlockInstance?.hasMountedContent?.()
            ? candidates[0]
            : null;
        if (homepageComponentDestroyed) throw new Error("主页实例已销毁");
        if (healthyElement) {
            const targetContainer = getComponentSectionContainer(toSectionId);
            if (!targetContainer) throw new Error("目标分栏容器不存在");
            const instance = (healthyElement as any).__widgetBlockInstance;
            if (
                typeof instance?.getRuntimeOptionsSnapshot !== "function"
                || typeof instance?.updateRuntimeOptions !== "function"
            ) {
                throw new Error("迁移组件不支持严格运行时选项事务");
            }
            const previousRuntimeOptions = instance.getRuntimeOptionsSnapshot();
            let runtimeOptionsUpdated = false;
            try {
                if (!matchesHomepageWidgetDomSnapshot(moveDomSnapshot, getCurrentHomepageDomScope())) {
                    throw new Error("迁移提交前 DOM 已变化");
                }
                await verifyMoveDataSnapshot();
                if (!matchesHomepageWidgetDomSnapshot(moveDomSnapshot, getCurrentHomepageDomScope())) {
                    throw new Error("迁移数据复核期间 DOM 已变化");
                }
                targetContainer.appendChild(healthyElement);
                const cleared = clearPreservedWidgetElementAfterAppend(healthyElement, preservedWidgetElements);
                if ("reason" in cleared) throw new Error(cleared.reason);
                await instance.updateRuntimeOptions({
                    sectionsEnabled: true,
                    sectionId: toSectionId,
                    deviceViewContext: fixedContext,
                    componentSectionContainers,
                    preservedWidgetElements,
                });
                runtimeOptionsUpdated = true;
                reorderExistingSectionElements(targetContainer, targetIdentity.renderableWidgetIds);
                const sourceContainer = fromSectionId ? getComponentSectionContainer(fromSectionId) : null;
                if (sourceContainer && sourceIdentity) {
                    reorderExistingSectionElements(sourceContainer, sourceIdentity.renderableWidgetIds);
                }
                await verifyMoveDataSnapshot();
                const committedDom = enumerateHomepageWidgetElements(getCurrentHomepageDomScope());
                const committedDuplicate = Array.from(committedDom.elementsById.entries())
                    .find(([, elements]) => elements.length > 1);
                if (
                    committedDom.ownershipErrors.length > 0
                    || committedDuplicate
                    || healthyElement.parentElement !== targetContainer
                    || instance.hasMountedContent?.() !== true
                    || !haveSameOrderedIds(
                        getContainerWidgetIds(targetContainer),
                        targetIdentity.renderableWidgetIds,
                    )
                    || (
                        sourceContainer
                        && sourceIdentity
                        && !haveSameOrderedIds(
                            getContainerWidgetIds(sourceContainer),
                            sourceIdentity.renderableWidgetIds,
                        )
                    )
                ) {
                    throw new Error("迁移提交后的 DOM 身份或成员关系不完整");
                }
                updateSectionRuntimeAfterMove(toSectionId, snapshot.revision, targetIdentity);
                if (fromSectionId && sourceIdentity) {
                    updateSectionRuntimeAfterMove(fromSectionId, snapshot.revision, sourceIdentity);
                }
            } catch (error) {
                let runtimeRollbackReason: string | undefined;
                if (runtimeOptionsUpdated) {
                    try {
                        await instance.updateRuntimeOptions(previousRuntimeOptions);
                    } catch (runtimeRollbackError) {
                        runtimeRollbackReason = runtimeRollbackError instanceof Error
                            ? runtimeRollbackError.message
                            : String(runtimeRollbackError);
                    }
                }
                const rolledBack = restoreHomepageWidgetDomSnapshot(
                    moveDomSnapshot,
                    getCurrentHomepageDomScope(),
                );
                const reason = error instanceof Error ? error.message : String(error);
                const rollbackReasons = [
                    "reason" in rolledBack ? `DOM 回滚失败：${rolledBack.reason}` : "",
                    runtimeRollbackReason ? `运行时选项回滚失败：${runtimeRollbackReason}` : "",
                ].filter(Boolean);
                throw new Error(
                    rollbackReasons.length > 0 ? `${reason}；${rollbackReasons.join("；")}` : reason,
                );
            }
            return;
        }

        markSectionRuntimeState(toSectionId, "stale", "迁移组件实例未在当前主页中健康挂载");
        if (fromSectionId && sourceIdentity) {
            updateSectionRuntimeAfterMove(fromSectionId, snapshot.revision, sourceIdentity);
        }
    }

    function handleWidgetSectionMoved(event: CustomEvent<WidgetSectionMovedEventDetail>): void {
        const detail = event.detail;
        if (
            detail?.handled
            || !detail?.widgetId
            || !detail.toSectionId
            || !detail.sourceElement
            || typeof detail.complete !== "function"
        ) return;
        const fromSectionId = normalizeRuntimeSectionId(detail.fromSectionId);
        const sourceContainer = fromSectionId ? getComponentSectionContainer(fromSectionId) : null;
        if (!sourceContainer) return;
        const sourceMatches = getDirectWidgetElements(sourceContainer)
            .filter((element) => element.id === detail.widgetId);
        if (sourceMatches.length !== 1 || sourceMatches[0] !== detail.sourceElement) return;
        if (!isElementDirectChildOfScopedContainer(
            detail.sourceElement,
            getCurrentHomepageDomScope(),
        )) return;
        detail.handled = true;
        void enqueueSectionUiOperation(() => applyWidgetSectionMoved(detail))
            .then(() => detail.complete({ success: true }))
            .catch((error) => {
                const fromSectionId = normalizeRuntimeSectionId(detail.fromSectionId);
                const toSectionId = normalizeRuntimeSectionId(detail.toSectionId);
                if (fromSectionId) markSectionRuntimeState(fromSectionId, "stale");
                if (toSectionId) markSectionRuntimeState(toSectionId, "stale");
                detail.complete({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
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

    function applyBackgroundImageStyle(): void {
        updateHomepageBackgroundImageStyle({
            advanced: getAdvancedEnabled(),
            backgroundImageEnabled,
            backgroundImageGlobalEnabled,
            backgroundImageSrc,
            backgroundImageOpacity,
            backgroundImageBlur,
        });
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
        }
    }

    // 会员验证成功后重新加载配置
    async function handleAdvancedReady() {
        await enqueueSectionUiOperation(async () => {
            try {
                invalidateStatusAiCache();
                await updateHomepage("config-refresh");
                await updateDisplayedStatsInfoText();
                await tick();
                await restoreVisibleComponentSections();

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
            } catch (error) {
                console.error("[Homepage] 会员状态刷新失败，已保留或回滚到上一次健康主页", error);
            }
        });
    }

    // 会员状态不可用时重新加载配置
    async function handleAdvancedUnavailable() {
        await enqueueSectionUiOperation(async () => {
            try {
                invalidateStatusAiCache();
                await updateHomepage("config-refresh");
                await updateDisplayedStatsInfoText();
                await tick();
                await restoreVisibleComponentSections();

                cleanupFallingEffects();
                updateCursorStyle({
                    advanced: getAdvancedEnabled(),
                    mouseIcon,
                    mouseGlobalEnabled,
                    ClickEffectEnabled,
                    ClickEffectContent,
                    MouseTrailEnabled,
                });
            } catch (error) {
                console.error("[Homepage] 会员状态刷新失败，已保留或回滚到上一次健康主页", error);
            }
        });
    }

    // 处理主页设置保存事件 - 本地热应用配置
    async function handleHomepageSettingsSaved() {
        await enqueueSectionUiOperation(async () => {
            try {
                invalidateStatusAiCache();
                await updateHomepage("config-refresh");
                await updateDisplayedStatsInfoText();
                await tick();
                await restoreVisibleComponentSections();
                reRegisterAllShortcuts(buttonsList);
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
            } catch (error) {
                console.error("[Homepage] 设置热刷新失败，已保留或回滚到上一次健康主页", error);
            }
        });
    }

    // 初始化主页组件区布局（Sortable、ResizeObserver、restoreLayout）
    async function initCustomContentLayout(): Promise<void> {
        if (homepageComponentDestroyed) return;
        await tick();
        if (homepageComponentDestroyed) return;
        if (customContentInitialized) {
            return;
        }
        customContentInitialized = true;

        // 普通模式下恢复普通组件区。
        if (showRootComponentSection) {
            activateComponentSectionContainer(ROOT_COMPONENT_SECTION_ID);
            const rootContainer = getComponentSectionContainer(ROOT_COMPONENT_SECTION_ID);
            if (!rootContainer) return;
            await ensureComponentSectionRestored(ROOT_COMPONENT_SECTION_ID);
            if (homepageComponentDestroyed) return;
        }

        // 分栏模式下恢复当前活动用户分栏。
        if (effectiveComponentSectionsEnabled && activeComponentSectionId) {
            activateComponentSectionContainer(activeComponentSectionId);
            const sectionContainer = getComponentSectionContainer(activeComponentSectionId);
            if (sectionContainer) {
                await ensureComponentSectionRestored(activeComponentSectionId);
            }
        }
        if (homepageComponentDestroyed) return;

        await tick();
        if (homepageComponentDestroyed) return;
        // 初始加载完成后同步 requested 状态。
        if (effectiveComponentSectionsEnabled && !requestedComponentSectionId) {
            requestedComponentSectionId = activeComponentSectionId;
        }
        updateCustomGridMetrics();

    }

    async function refreshCustomContentLayoutFromTemplate() {
        if (homepageComponentDestroyed) return;

        try {
            if (showRootComponentSection) {
                activateComponentSectionContainer(ROOT_COMPONENT_SECTION_ID);
                const rootContainer = getComponentSectionContainer(ROOT_COMPONENT_SECTION_ID);
                if (!rootContainer) return;
                const rootLayoutSettings = await loadWidgetLayoutSettings(plugin, { sectionsEnabled: false, sectionId: null });
                if (homepageComponentDestroyed) return;
                widgetLayoutNumber = rootLayoutSettings.widgetLayoutNumber;
                widgetGap = rootLayoutSettings.widgetGap;
                await ensureComponentSectionRestored(ROOT_COMPONENT_SECTION_ID, { force: true });
                if (homepageComponentDestroyed) return;
            }

            if (effectiveComponentSectionsEnabled && activeComponentSectionId) {
                activateComponentSectionContainer(activeComponentSectionId);
                const sectionContainer = getComponentSectionContainer(activeComponentSectionId);
                if (sectionContainer) {
                    const sectionLayoutSettings = await loadWidgetLayoutSettings(plugin, {
                        sectionsEnabled: true,
                        sectionId: activeComponentSectionId,
                    });
                    if (homepageComponentDestroyed) return;
                    sectionWidgetLayoutNumbers.set(activeComponentSectionId, sectionLayoutSettings.widgetLayoutNumber);
                    sectionWidgetGaps.set(activeComponentSectionId, sectionLayoutSettings.widgetGap);
                    await ensureComponentSectionRestored(activeComponentSectionId, { force: true });
                    if (homepageComponentDestroyed) return;
                }
            }

            await tick();
            if (homepageComponentDestroyed) return;
            updateCustomGridMetrics();
        } catch {
            // 模板应用后刷新组件区失败，保持现有组件。
        }
    }

    async function handleTemplateLayoutChanged() {
        await enqueueSectionUiOperation(refreshCustomContentLayoutFromTemplate);
    }

    function handleHomepageTabBeforeDestroy(): void {
        homepageComponentDestroyed = true;
        abortStatusAiRequest();
        unregisterAllShortcuts();
        cleanupFallingEffects();
        cleanupMouseEffects();
    }

    onMount(async () => {
        homepageComponentDestroyed = false;
        try {
        // 先添加事件监听器，确保不会错过 VIP 状态变化事件
        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
        window.addEventListener("homepage-settings-saved", handleHomepageSettingsSaved);
        window.addEventListener("siyuan-homepage:tab-before-destroy", handleHomepageTabBeforeDestroy);
        window.addEventListener(STAT_INDEX_UPDATED_EVENT, handleStatIndexUpdated);
        window.addEventListener("homepage-template-layout-changed", handleTemplateLayoutChanged);
        window.addEventListener(
            "homepage-component-section-layout-invalidated",
            handleComponentSectionLayoutInvalidated as EventListener,
        );
        window.addEventListener(
            "homepage-widget-section-moved",
            handleWidgetSectionMoved as EventListener,
        );

        // 不在冷启动阶段写入空布局：存储暂不可用时，空读不能覆盖用户已有布局。

        // 加载配置并恢复首个可见分栏；两者与后续切换共用同一 UI 队列。
        await enqueueSectionUiOperation(async () => {
            await updateHomepage("initial-load");
            if (homepageComponentDestroyed) return;
            await tick();
            if (homepageComponentDestroyed) return;
            await initCustomContentLayout();
            if (homepageComponentDestroyed) return;

            // 首次恢复后的最终校准：等待滚动条和容器宽度稳定后执行一次精确网格计算。
            await tick();
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (homepageComponentDestroyed) return;
            const visibleSectionId = showRootComponentSection
                ? ROOT_COMPONENT_SECTION_ID
                : (activeComponentSectionId || ROOT_COMPONENT_SECTION_ID);
            const visibleContainer = getComponentSectionContainer(visibleSectionId);
            if (visibleContainer) {
                activateComponentSectionContainer(visibleSectionId);
                const layoutNumber = visibleSectionId === ROOT_COMPONENT_SECTION_ID
                    ? widgetLayoutNumber
                    : (sectionWidgetLayoutNumbers.get(visibleSectionId) ?? widgetLayoutNumber);
                const gap = visibleSectionId === ROOT_COMPONENT_SECTION_ID
                    ? widgetGap
                    : (sectionWidgetGaps.get(visibleSectionId) ?? widgetGap);
                const gridApplied = updateCustomGridMetricsForContainer(visibleContainer, layoutNumber, gap);
                if (gridApplied) {
                    initialWidgetGridReady = true;
                }
            }
        });
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
        } catch (error) {
            console.error("[Homepage] 初始主页恢复失败", error);
        }
    });

    onDestroy(() => {
        homepageComponentDestroyed = true;

        for (const sortable of sectionSortables.values()) {
            try {
                sortable.destroy();
            } catch {
                // 忽略销毁错误
            }
        }
        sectionSortables.clear();

        for (const observer of sectionResizeObservers.values()) {
            try {
                observer.disconnect();
            } catch {
                // 忽略断开错误
            }
        }
        sectionResizeObservers.clear();
        sectionInfrastructureContainers.clear();

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
        window.removeEventListener("siyuan-homepage:tab-before-destroy", handleHomepageTabBeforeDestroy);
        window.removeEventListener(STAT_INDEX_UPDATED_EVENT, handleStatIndexUpdated);
        window.removeEventListener("homepage-template-layout-changed", handleTemplateLayoutChanged);
        window.removeEventListener(
            "homepage-component-section-layout-invalidated",
            handleComponentSectionLayoutInvalidated as EventListener,
        );
        window.removeEventListener(
            "homepage-widget-section-moved",
            handleWidgetSectionMoved as EventListener,
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
        cleanupHomepageBackgroundImageStyle();
        abortStatusAiRequest();

        // 仅销毁当前实例登记的直接子组件和 preserved 元素；同一 HTMLElement 只销毁一次。
        const widgetElementsToDestroy = new Set(
            enumerateHomepageWidgetElements(getCurrentHomepageDomScope()).elements,
        );
        widgetElementsToDestroy.forEach((element) => {
            const instance = (element as any).__widgetBlockInstance;
            try {
                instance?.destroy?.();
            } catch {
                // 忽略销毁错误
            }
        });
        preservedWidgetElements.clear();
        componentSectionContainers.clear();
        sectionRuntimeStates.clear();
        componentSectionRestoreInFlight.clear();
    });

    // 监听 widgetLayoutNumber / widgetGap 变化，更新格子尺寸。
    // 仅在真实布局设置已解析且初始网格准备完成后才应用；默认值阶段不污染可见容器。
    $effect(() => {
        widgetLayoutNumber;
        widgetGap;
        if (!homepageConfigLoaded || !initialWidgetGridReady) return;
        tick().then(() => {
            if (homepageComponentDestroyed) return;
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

    run(() => {
        applyBackgroundImageStyle();
    });

    type HomepageUpdateMode = "initial-load" | "config-refresh" | "explicit-storage-refresh";

    // 更新加载主页配置
    async function updateHomepage(mode: HomepageUpdateMode) {
        const currentVersion = ++updateHomepageVersion;
        const previousStatusAiConfigSignature = getStatusAiConfigSignature();
        const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
        const coordinated = await readCoordinatedSnapshotForContext(context);
        if (!coordinated.view) throw new Error("当前桌面主页 view.json 缺失，无法刷新主页");
        const consistency = validateLayoutViewSectionConsistency(
            coordinated.layout.layout,
            context.scopeId,
            coordinated.view.config,
        );
        if (!consistency.ok) {
            throw new Error(`当前主页 layout/view 不一致：${(consistency as { ok: false; reason: string }).reason}`);
        }

        const config = normalizeHomepageConfigData(coordinated.view.config);
        const nextAdvanced = getAdvancedEnabled();
        const nextComponentSections = normalizeComponentSections(config.componentSections);
        const nextEffectiveSectionsEnabled = isComponentSectionsEffective(
            {
                componentSectionsEnabled: config.componentSectionsEnabled,
                componentSections: nextComponentSections,
            },
            nextAdvanced,
        );
        const profile = coordinated.layout.layout.profiles?.[context.scopeId];
        const storedActiveSectionId = profile?.activeSectionId;
        const localActiveStillValid = Boolean(
            activeComponentSectionId
            && nextComponentSections.some((section) => section.id === activeComponentSectionId),
        );
        const nextActiveSectionId = (
            mode === "config-refresh" && localActiveStillValid
                ? activeComponentSectionId
                : getSafeActiveComponentSectionId(storedActiveSectionId, nextComponentSections)
        );
        const rootLayoutSettings = resolveEffectiveWidgetLayoutSettings(
            coordinated.layout.layout,
            context.scopeId,
            { sectionsEnabled: false, sectionId: null },
        );
        const nextSectionLayoutSettings = nextEffectiveSectionsEnabled && nextActiveSectionId
            ? resolveEffectiveWidgetLayoutSettings(
                coordinated.layout.layout,
                context.scopeId,
                { sectionsEnabled: true, sectionId: nextActiveSectionId },
            )
            : null;
        const globalOrder = normalizeLayoutItems(profile?.order || coordinated.layout.layout.order);

        // 读取 manifest 获取分栏级 unresolved 列表，只对可渲染的 ID 执行双重稳定读取。
        const manifest = await readDeviceViewManifest(context);
        if (!manifest) throw new Error("当前桌面主页 manifest 缺失，无法刷新主页");
        const unresolvedLegacyWidgetIds = new Set(manifest.migration?.unresolvedLegacyWidgetIds ?? []);
        const initialSectionIdentity = nextEffectiveSectionsEnabled && nextActiveSectionId
            ? computeSectionIdentity(
                nextActiveSectionId,
                coordinated.layout.layout,
                context,
                unresolvedLegacyWidgetIds,
                nextComponentSections.map((section) => section.id),
                nextSectionLayoutSettings?.widgetLayoutNumber,
                nextSectionLayoutSettings?.widgetGap,
            )
            : null;
        const targetWidgetIds = initialSectionIdentity?.declaredWidgetIds
            ?? globalOrder.map((item) => item.id);
        if (!initialSectionIdentity && new Set(targetWidgetIds).size !== targetWidgetIds.length) {
            throw new Error("当前主页目标组件列表包含重复实例 ID");
        }
        const targetRenderableWidgetIds = initialSectionIdentity?.renderableWidgetIds
            ?? targetWidgetIds.filter((id) => !unresolvedLegacyWidgetIds.has(id));
        const currentSectionUnresolvedWidgetIds = initialSectionIdentity?.unresolvedWidgetIds
            ?? targetWidgetIds.filter((id) => unresolvedLegacyWidgetIds.has(id));

        // UI 切换前完成所有目标组件的严格读取，并复核协调快照与组件 revision/语义均未变化。
        // 只读取缺失或实际不健康的 renderable IDs；健康实例既不重读配置，也不重新 mount。
        const currentDom = enumerateHomepageWidgetElements(getCurrentHomepageDomScope());
        if (currentDom.ownershipErrors.length > 0) throw new Error(currentDom.ownershipErrors[0]);
        const duplicateCurrentWidget = Array.from(currentDom.elementsById.entries())
            .find(([, elements]) => elements.length > 1);
        if (duplicateCurrentWidget) {
            throw new Error(`当前主页存在重复组件实例 ${duplicateCurrentWidget[0]}`);
        }
        const staleCleanup = cleanupStalePreservedWidgetEntries(currentDom, preservedWidgetElements);
        if ("reason" in staleCleanup) throw new Error(staleCleanup.reason);
        const widgetIdsNeedingRead = targetRenderableWidgetIds.filter((widgetId) => {
            const matches = currentDom.elementsById.get(widgetId) ?? [];
            return (
                matches.length !== 1
                || (matches[0] as any).__widgetBlockInstance?.hasMountedContent?.() !== true
            );
        });
        const initialWidgetDocuments = new Map<string, Awaited<ReturnType<typeof readWidgetInstanceDocument>>>();
        for (const widgetId of widgetIdsNeedingRead) {
            const document = await readWidgetInstanceDocument(context, widgetId);
            if (!document) throw new Error(`主页组件 ${widgetId} 配置明确缺失，拒绝切换当前健康主页`);
            initialWidgetDocuments.set(widgetId, document);
        }
        const coordinatedRecheck = await readCoordinatedSnapshotForContext(context);
        if (
            coordinatedRecheck.layout.revision !== coordinated.layout.revision
            || !hasSameJsonSemantic(coordinatedRecheck.layout.layout, coordinated.layout.layout)
            || coordinatedRecheck.view?.revision !== coordinated.view.revision
            || !hasSameJsonSemantic(coordinatedRecheck.view?.config, coordinated.view.config)
        ) {
            throw new Error("主页协调快照在 UI 切换前发生变化，已保留当前健康主页");
        }
        for (const [widgetId, initialDocument] of initialWidgetDocuments) {
            const currentDocument = await readWidgetInstanceDocument(context, widgetId);
            if (
                !currentDocument
                || !initialDocument
                || currentDocument.revision !== initialDocument.revision
                || !hasSameJsonSemantic(currentDocument.config, initialDocument.config)
            ) {
                throw new Error(`主页组件 ${widgetId} 在 UI 切换前发生变化，已保留当前健康主页`);
            }
        }

        // 丢弃过期请求结果
        if (currentVersion !== updateHomepageVersion) return;

        const previousRuntimeState = {
            advanced,
            componentSectionsEnabled,
            componentSections: snapshotComponentSectionsForRuntime(componentSections),
            componentSectionsNavAlign,
            activeComponentSectionId,
            requestedComponentSectionId,
            preparingComponentSectionId,
            widgetLayoutNumber,
            widgetGap,
            sectionWidgetLayoutNumbers: new SvelteMap(Array.from(sectionWidgetLayoutNumbers.entries())),
            sectionWidgetGaps: new SvelteMap(Array.from(sectionWidgetGaps.entries())),
            sectionRuntimeStates: new SvelteMap(Array.from(sectionRuntimeStates.entries()).map(
                ([sectionId, state]) => [sectionId, {
                    ...state,
                    declaredWidgetIds: [...state.declaredWidgetIds],
                    expectedIds: [...state.expectedIds],
                    failedWidgetIds: [...state.failedWidgetIds],
                    unresolvedWidgetIds: [...state.unresolvedWidgetIds],
                }],
            )),
        };
        const previousVisibleSectionId = showRootComponentSection
            ? ROOT_COMPONENT_SECTION_ID
            : (activeComponentSectionId || ROOT_COMPONENT_SECTION_ID);
        const previousContainer = getComponentSectionContainer(previousVisibleSectionId);
        const previousCompleteSnapshot = captureCompleteContainerSnapshot(previousContainer);

        try {
            preserveMountedWidgetsOnNextContainerDestroy = true;
            // 保存切换前状态用于 config-refresh 规则判断。
            const previousActive = activeComponentSectionId;
            const previousRequested = requestedComponentSectionId;
            const wasSwitching = String(requestedComponentSectionId ?? "") !== String(activeComponentSectionId ?? "");
            advanced = nextAdvanced;
            componentSectionsEnabled = config.componentSectionsEnabled;
            componentSections = nextComponentSections;
            componentSectionsNavAlign = normalizeComponentSectionsNavAlign(config.componentSectionsNavAlign);
            activeComponentSectionId = nextActiveSectionId;
            // config-refresh 规则：
            // 1. requested 已不在新分栏集合 → 回退到 nextActive。
            // 2. 没有进行中切换 → 同步 nextActive。
            // 3. 有效的用户切换目标不得被覆盖。
            if (mode !== "initial-load") {
                const validIds = new Set(nextComponentSections.map((s) => s.id));
                if (previousRequested && !validIds.has(previousRequested)) {
                    requestedComponentSectionId = nextActiveSectionId;
                    preparingComponentSectionId = undefined;
                } else if (!wasSwitching && previousActive === previousRequested) {
                    requestedComponentSectionId = nextActiveSectionId;
                }
            }
            widgetLayoutNumber = rootLayoutSettings.widgetLayoutNumber;
            widgetGap = rootLayoutSettings.widgetGap;
            if (mode === "initial-load") {
                sectionWidgetLayoutNumbers = new SvelteMap();
                sectionWidgetGaps = new SvelteMap();
                sectionRuntimeStates = new SvelteMap();
            }
            const validSectionIdSet = new Set(nextComponentSections.map((section) => section.id));
            for (const sectionId of [...sectionRuntimeStates.keys()]) {
                if (sectionId && !validSectionIdSet.has(sectionId)) sectionRuntimeStates.delete(sectionId);
            }
            for (const sectionId of [...sectionWidgetLayoutNumbers.keys()]) {
                if (!validSectionIdSet.has(sectionId)) sectionWidgetLayoutNumbers.delete(sectionId);
            }
            for (const sectionId of [...sectionWidgetGaps.keys()]) {
                if (!validSectionIdSet.has(sectionId)) sectionWidgetGaps.delete(sectionId);
            }
            if (nextSectionLayoutSettings && nextActiveSectionId) {
                sectionWidgetLayoutNumbers.set(nextActiveSectionId, nextSectionLayoutSettings.widgetLayoutNumber);
                sectionWidgetGaps.set(nextActiveSectionId, nextSectionLayoutSettings.widgetGap);
            }
            await tick();
            preserveMountedWidgetsOnNextContainerDestroy = false;
            if (currentVersion !== updateHomepageVersion) return;

            const targetSectionId = nextEffectiveSectionsEnabled && nextActiveSectionId
                ? nextActiveSectionId
                : ROOT_COMPONENT_SECTION_ID;
            const targetContainer = getComponentSectionContainer(targetSectionId);
            if (!targetContainer) throw new Error("目标主页组件容器尚未建立");

            // 初始恢复前保证目标容器基础设施和精确网格已提交。
            // 无条件调用 activate 确保 ResizeObserver/Sortable 已建立，不依赖 ?? 短路。
            activateComponentSectionContainer(targetSectionId);
            const mountable = await waitForContainerMountable(targetContainer);
            if (homepageComponentDestroyed || currentVersion !== updateHomepageVersion) return;
            if (!mountable) throw new Error("目标主页组件容器宽度暂不可用");

            const targetEffectiveColumns = initialSectionIdentity?.effectiveColumns ?? rootLayoutSettings.widgetLayoutNumber;
            const targetEffectiveGap = initialSectionIdentity?.effectiveGap ?? rootLayoutSettings.widgetGap;
            sectionWidgetLayoutNumbers.set(targetSectionId, targetEffectiveColumns);
            sectionWidgetGaps.set(targetSectionId, targetEffectiveGap);
            const gridApplied = updateCustomGridMetricsForContainer(
                targetContainer,
                targetEffectiveColumns,
                targetEffectiveGap,
            );
            if (!gridApplied) throw new Error("目标主页组件容器网格参数应用失败");

            const restored = await restoreComponentSectionWithRetry(targetSectionId, {
                force: true,
                fixedContext: context,
                expectedLayoutRevision: coordinated.layout.revision,
                expectedWidgetIds: targetRenderableWidgetIds,
                expectedDeclaredWidgetIds: targetWidgetIds,
                sectionContentSignature: initialSectionIdentity?.sectionContentSignature ?? "",
                effectiveColumns: initialSectionIdentity?.effectiveColumns ?? rootLayoutSettings.widgetLayoutNumber,
                effectiveGap: initialSectionIdentity?.effectiveGap ?? rootLayoutSettings.widgetGap,
                identityResolved: initialSectionIdentity !== null,
            });
            // 恢复验证：任何 renderable 组件缺失或顺序错误都视为恢复失败。
            // 仅存在明确 manifest unresolved 历史组件时允许 degraded。
            const restoredIds = getStructuralRestoreExpectedIds(targetContainer);
            const restoredRenderableIds = (restoredIds ?? []).filter((id) => !unresolvedLegacyWidgetIds.has(id));
            const renderableStructureComplete = (
                restored.status !== "fatal"
                && restoredIds !== null
                && restoredRenderableIds.length === targetRenderableWidgetIds.length
                && targetRenderableWidgetIds.every((id, index) => restoredRenderableIds[index] === id)
            );
            if (!renderableStructureComplete) {
                throw new Error("目标主页组件未完整恢复");
            }
            // renderable 结构完整 + 仅存在 unresolved → degraded，不标记 stale。
            if (currentSectionUnresolvedWidgetIds.length > 0 && restored.failedWidgetIds.length === 0) {
                // 保持现有 runtime 状态的 degraded 标记；后续切回可直接复用健康结构。
            }
        } catch (error) {
            preserveMountedWidgetsOnNextContainerDestroy = true;
            advanced = previousRuntimeState.advanced;
            componentSectionsEnabled = previousRuntimeState.componentSectionsEnabled;
            componentSections = previousRuntimeState.componentSections;
            componentSectionsNavAlign = previousRuntimeState.componentSectionsNavAlign;
            activeComponentSectionId = previousRuntimeState.activeComponentSectionId;
            requestedComponentSectionId = previousRuntimeState.requestedComponentSectionId;
            preparingComponentSectionId = previousRuntimeState.preparingComponentSectionId;
            widgetLayoutNumber = previousRuntimeState.widgetLayoutNumber;
            widgetGap = previousRuntimeState.widgetGap;
            sectionWidgetLayoutNumbers = previousRuntimeState.sectionWidgetLayoutNumbers;
            sectionWidgetGaps = previousRuntimeState.sectionWidgetGaps;
            sectionRuntimeStates = previousRuntimeState.sectionRuntimeStates;
            try {
                const rollbackContainer = await waitForRegisteredConnectedContainer(previousVisibleSectionId);
                if (!rollbackContainer || !previousCompleteSnapshot) {
                    if (rollbackContainer) {
                        rollbackContainer.dataset.layoutRestoreState = "incomplete";
                        markSectionRuntimeState(previousVisibleSectionId, "failed");
                    }
                    throw new Error("上一次主页不是可确认的完整基线，无法宣称回滚成功");
                }

                const rolledBack = restoreHomepageWidgetDomSnapshot(
                    previousCompleteSnapshot.domSnapshot,
                    getCurrentHomepageDomScope(rollbackContainer),
                );
                if ("reason" in rolledBack) throw new Error(rolledBack.reason);
                rollbackContainer.dataset.layoutExpectedWidgetIds = JSON.stringify(previousCompleteSnapshot.expectedIds);
                rollbackContainer.dataset.layoutUnresolvedWidgetIds = JSON.stringify(
                    previousCompleteSnapshot.runtimeState.unresolvedWidgetIds,
                );
                rollbackContainer.dataset.layoutRestoreState = previousCompleteSnapshot.runtimeState.status;
                setSectionRuntimeState(previousVisibleSectionId, previousCompleteSnapshot.runtimeState);
                setupContainerInfrastructure(rollbackContainer, previousVisibleSectionId);
                updateCustomGridMetricsForContainer(
                    rollbackContainer,
                    previousVisibleSectionId === ROOT_COMPONENT_SECTION_ID
                        ? previousRuntimeState.widgetLayoutNumber
                        : (previousRuntimeState.sectionWidgetLayoutNumbers.get(previousVisibleSectionId)
                            ?? previousRuntimeState.widgetLayoutNumber),
                    previousVisibleSectionId === ROOT_COMPONENT_SECTION_ID
                        ? previousRuntimeState.widgetGap
                        : (previousRuntimeState.sectionWidgetGaps.get(previousVisibleSectionId)
                            ?? previousRuntimeState.widgetGap),
                );
            } catch (rollbackError) {
                console.warn("[Homepage] 主页恢复回滚未完整完成，已保留可用组件元素", rollbackError);
                const fallbackContainer = getComponentSectionContainer(previousVisibleSectionId);
                if (fallbackContainer?.isConnected && previousCompleteSnapshot) {
                    const fallbackSafe = previousCompleteSnapshot.elements.every((element) => {
                        const preserved = preservedWidgetElements.get(element.id);
                        const sameIdChildren = getDirectWidgetElements(fallbackContainer)
                            .filter((child) => child.id === element.id);
                        return (
                            (preserved === undefined || preserved === element)
                            && sameIdChildren.every((child) => child === element)
                            && (element as any).__widgetBlockInstance?.hasMountedContent?.() === true
                        );
                    });
                    if (fallbackSafe) {
                        for (const element of previousCompleteSnapshot.elements) {
                            fallbackContainer.appendChild(element);
                            const cleared = clearPreservedWidgetElementAfterAppend(element, preservedWidgetElements);
                            if ("reason" in cleared) break;
                        }
                    }
                    fallbackContainer.dataset.layoutRestoreState = "failed";
                    markSectionRuntimeState(previousVisibleSectionId, "failed");
                }
            } finally {
                preserveMountedWidgetsOnNextContainerDestroy = false;
            }
            throw error;
        } finally {
            preserveMountedWidgetsOnNextContainerDestroy = false;
        }
        if (currentVersion !== updateHomepageVersion) return;

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
        statusAiStatKeys = normalizeStatusAiStatKeys(config.statusAiStatKeys);
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
        backgroundImageEnabled = advanced && config.backgroundImageEnabled;
        backgroundImageGlobalEnabled = advanced && config.backgroundImageGlobalEnabled;
        backgroundImageOpacity = advanced ? config.backgroundImageOpacity : DEFAULT_BACKGROUND_IMAGE_OPACITY;
        backgroundImageBlur = advanced ? config.backgroundImageBlur : DEFAULT_BACKGROUND_IMAGE_BLUR;

        // 横幅高度配置 - 优先使用当前桌面设备的配置
        try {
            const displaySettings = await loadBannerDisplaySettings(plugin);
            if (currentVersion !== updateHomepageVersion) return;
            bannerHeight = displaySettings.bannerHeight;
        } catch {
            if (currentVersion !== updateHomepageVersion) return;
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

        // 背景图片
        const backgroundResult = await resolveBackgroundImage(
            config,
            getAdvancedEnabled(),
        );
        if (currentVersion !== updateHomepageVersion) return;
        backgroundImageSrc = backgroundResult.backgroundImageSrc;
    }

    // 格式化状态语言，将变量替换为统计信息（异步处理）
    let formattedStatsInfoText = $state("");
    let statusAiCacheKey = "";
    let statusAiCachedText = "";
    let statusAiAbortController: AbortController | null = null;

    function setStatusAiRuntimeState(state: HomepageStatusAiRuntimeState, _message = ""): void {
        statusAiRuntimeState = state;
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

        // 兼容旧写法：统一替换为当前支持的变量名
        result = result
            .replace(/\{\{notesCount\}\}/g, "{{blocksCount}}")
            .replace(/\{\{DocsCount\}\}/g, "{{docsCount}}");

        const requested = HOMEPAGE_STATUS_STAT_DEFINITIONS.filter((item) => result.includes(`{{${item.key}}}`));
        const values = await Promise.all(requested.map(async (item) => [item.key, await loadStatsDataResult(item.key, plugin)] as const));
        for (const [key, value] of values) {
            const display = value.status === "ok" && value.value !== null ? String(value.value) : "暂无数据";
            result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), display);
        }

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
            statKeys: statusAiStatKeys,
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
        await prepareHomepageStatistics(plugin);

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
            return;
        }

        const aiConfig = getHomepageStatusAiConfig();
        if (!aiConfig.providerId || !aiConfig.modelId) {
            setStatusAiRuntimeState("no_model");
            setVisibleStatusTextError(getHomepageStatusAiFailureText("no_model"));
            return;
        }

        const abortController = new AbortController();
        statusAiAbortController = abortController;

        try {
            const facts = await loadHomepageStatusFacts(plugin, aiConfig.statKeys);
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
                if (reason === "aborted") {
                    setStatusAiRuntimeState("aborted");
                    setVisibleStatusTextError(getHomepageStatusAiFailureText("aborted"));
                } else {
                    setStatusAiRuntimeState(reason === "no_model" ? "no_model" : reason === "not_premium" ? "no_premium" : "failed");
                    setVisibleStatusTextError(getHomepageStatusAiFailureText(reason));
                }
                return;
            }

            statusAiCacheKey = result.cacheKey;
            statusAiCachedText = result.text;
            formattedStatsInfoText = result.text;
            setStatusAiRuntimeState("success");
        } catch {
            if (!abortController.signal.aborted) {
                setStatusAiRuntimeState("failed");
                setVisibleStatusTextError(getHomepageStatusAiFailureText("unknown"));
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

    function handleStatIndexUpdated(): void {
        if (!homepageConfigLoaded || isRefreshingStatusText) return;
        invalidateStatusAiCache();
        void updateDisplayedStatsInfoText({ forceRefresh: statusTextMode === "ai" });
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
        statusAiStatKeys;
        advanced;
        homepageConfigLoaded;
        if (!homepageConfigLoaded) return;
        updateDisplayedStatsInfoText();
    });

    // 过滤按钮列表，只显示未选中的按钮
    let filteredButtons = $derived(buttonsList.filter((b) => b.checked === false));

    // 更多按钮点击事件处理
    function handleDocumentClick(event: MouseEvent) {
        const target = event.target;
        const targetElement = target instanceof Element ? target : null;
        const isWithinMoreControls = Boolean(targetElement?.closest(".more-button, .more-menu"));
        if (!isWithinMoreControls && showMoreMenu) {
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
    class:background-image-active={backgroundImageEnabled && backgroundImageSrc && advanced}
    style={`--homepage-banner-title-color: ${bannerTitleColor}; --homepage-banner-status-color: ${bannerStatusColor}; --homepage-banner-button-color: ${bannerButtonColor}; --homepage-banner-glass-color: ${bannerGlassColor}; --homepage-banner-glass-opacity: ${bannerGlassOpacity}%; --homepage-banner-glass-blur: ${bannerGlassBlur}px;`}
>
    <!-- 头部横幅区域 -->
    <div
        class="section top-banner"
        class:hide-top-banner={!$showBanner}
        style={topBannerInlineStyle}
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
                <div class="banner-title-content">
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
                                    onclick={() => void handleAddWidgetButtonClick(sortedButtons)}
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
                        bind:this={moreButtonEl}
                        class:hidden={(!isHoveringNavBar && !showMoreMenu) ||
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
                        <div
                            class="more-menu"
                            use:floatingPopoverAction={{
                                referenceEl: moreButtonEl ?? undefined,
                                placement: "bottom-start",
                                offset: 8,
                                open: showMoreMenu,
                                shiftPadding: 8,
                            }}
                        >
                            {#each filteredButtons as item}
                                <button
                                    class="more-menu-item"
                                    onclick={() => {
                                        void handleAddWidgetButtonClick(item).then(() => {
                                            showMoreMenu = false;
                                        });
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
                                onclick={() => void handleAddWidgetButtonClick(sortedButtons)}
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
                        bind:this={moreButtonEl}
                        class:hidden={(!isHoveringNavBar && !showMoreMenu) ||
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
                        <div
                            class="more-menu"
                            use:floatingPopoverAction={{
                                referenceEl: moreButtonEl ?? undefined,
                                placement: "bottom-start",
                                offset: 8,
                                open: showMoreMenu,
                                shiftPadding: 8,
                            }}
                        >
                            {#each filteredButtons as item}
                                <button
                                    class="more-menu-item"
                                    onclick={() => {
                                        void handleAddWidgetButtonClick(item).then(() => {
                                            showMoreMenu = false;
                                        });
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
    <!-- 分栏真实生效时只显示分栏导航与当前活动分栏；否则显示普通组件区并按全局 order 渲染全部组件。 -->
    <div class="section component-section-area" class:initial-widget-grid-preparing={!initialWidgetGridReady}>
        {#if showRootComponentSection}
            <div
                use:registerCustomContentContainer={ROOT_COMPONENT_SECTION_ID}
                class="custom-content"
                class:root-empty={rootComponentSectionCollapsed}
                data-component-section-id={ROOT_COMPONENT_SECTION_ID}
                role="region"
                aria-label="普通组件区"
            ></div>
        {/if}
        {#if effectiveComponentSectionsEnabled && componentSections.length >= 1}
            <div
                class="component-section-nav"
                class:align-center={componentSectionsNavAlign === "center"}
                class:align-right={componentSectionsNavAlign === "right"}
                role="tablist"
                aria-label="组件分区导航"
            >
                {#each componentSections as section (section.id)}
                    <button
                        type="button"
                        class="component-section-nav__button"
                        class:active={section.id === requestedComponentSectionId}
                        role="tab"
                        aria-selected={section.id === requestedComponentSectionId}
                        onclick={() => void handleComponentSectionSwitch(section.id)}
                    >
                        {section.name}
                    </button>
                {/each}
            </div>
            <div class="component-section-panels">
                {#each componentSections as section (section.id)}
                    {@const isActive = section.id === activeComponentSectionId}
                    {@const isPreparing = !isActive && section.id === preparingComponentSectionId}
                    <div
                        use:registerCustomContentContainer={section.id}
                        class="custom-content component-section-panel"
                        class:section-preparing={isPreparing}
                        class:hidden={!isActive && !isPreparing}
                        data-component-section-id={section.id}
                        role="region"
                        aria-label={`自定义组件区域 - ${section.name}`}
                        aria-hidden={!isActive}
                    ></div>
                {/each}
            </div>
        {/if}
    </div>

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
                        {@html mdToHtml(footerContent)}
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
