<script lang="ts">
    import { onMount, tick } from "svelte";
    import Sortable from "sortablejs";
    import { showMessage } from "siyuan";
    import { saveLayout, restoreLayout, MobileLayoutRevisionConflictError } from "./mobileHomepage_layout";
    import { createMobileWidgetBlock } from "./block-creator";
    import MobileWidgetActionSheet from "./MobileWidgetActionSheet.svelte";
    import MobileWidgetContentSheet from "./MobileWidgetContentSheet.svelte";
    import MobileWidgetStyleSheet from "./MobileWidgetStyleSheet.svelte";
    import MobileAddWidgetSheet from "./MobileAddWidgetSheet.svelte";
    import MobileWidgetDeleteSheet from "./MobileWidgetDeleteSheet.svelte";
    import MobileSectionManagerSheet from "./MobileSectionManagerSheet.svelte";
    import MobileSectionSwitcherSheet from "./MobileSectionSwitcherSheet.svelte";
    import MobileHomepageMenuSheet from "./MobileHomepageMenuSheet.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import AdvancedFeatureLock from "../../components/utils/widgetBlock/widget/common/AdvancedFeatureLock.svelte";
    import { saveWidgetContentPreservingSize } from "@/components/utils/widgetBlock/styleUtils";
    import { getWidgetDefinition } from "@/components/utils/widgetBlock/widgetDefinitionRegistry";
    import { setBlockSize } from "@/components/utils/widgetBlock/utils/block-size-handler";
    import {
        getMobileWidgetLabel,
    } from "./mobile-widget-categories";
    import {
        createMobileSectionId,
        DEFAULT_MOBILE_SECTION_ID,
        DEFAULT_MOBILE_SECTION_NAME,
        MOBILE_ALL_SECTION_ID,
        type MobileHomepageSection,
        type MobileSectionOperation,
        type MobileSectionState,
    } from "./mobileSectionLayout";
    import {
        getWidgetTypeFromBlock,
    } from "./mobile-widget-utils";
    import {
        deleteWidgetFromSurface,
    } from "@/components/utils/widgetBlock/utils/layout-shared";
    import "./mobileHomepage.scss";
    import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
    import { createWidgetInstanceId } from "@/homepage/deviceView/widgetInstanceRepository";
    import { readDeviceViewLayout } from "@/homepage/deviceView/deviceViewStorage";
    import {
        deleteWidgetInstance,
        readWidgetInstanceDocument,
    } from "@/homepage/deviceView/widgetInstanceRepository";
    import {
        HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT,
        type HomepageAgentStorageChangedDetail,
    } from "@/homepage/deviceView/deviceViewEvents";

    export const app = undefined;

    interface Props {
        plugin: any;
        close: () => void;
        previewMode?: boolean;
    }

    type ContentSheetState = {
        blockId: string;
        initialContentType?: string;
        isNew: boolean;
    };

    let { plugin, close, previewMode = false }: Props = $props();
    const deviceViewContext = $derived(getCurrentDeviceViewContext(plugin, "mobile-homepage"));

    const currentBlockForSettingsRef: { value: HTMLElement | null } = { value: null };

    let advanced: boolean = $state(false);
    let sortable: Sortable | null = null;
    let mobileHomepageInitialized = false;
    let initInFlight: Promise<void> | null = null;
    let restoreVersion = 0;
    let destroyed = false;
    let widgetEventsBound = false;

    let mobileHomepageWidgetContainer: HTMLElement | null = $state(null);
    let editMode = $state(false);
    let layoutSaving = $state(false);
    let activeSectionId = $state(DEFAULT_MOBILE_SECTION_ID);
    let selectedBlock: HTMLElement | null = $state(null);
    let selectedWidgetType = $state("");
    let actionSheetOpen = $state(false);
    let addSheetOpen = $state(false);
    let sectionSheetOpen = $state(false);
    let sectionSwitcherOpen = $state(false);
    let menuSheetOpen = $state(false);
    let contentSheet: ContentSheetState | null = $state(null);
    let styleSheetBlock: HTMLElement | null = $state(null);
    let deleteSheetBlock: HTMLElement | null = $state(null);
    let totalWidgetCount = $state(0);
    let visibleWidgetCount = $state(0);
    let sectionAssignments = $state<Record<string, string>>({});
    let sections = $state<MobileHomepageSection[]>([{
        id: DEFAULT_MOBILE_SECTION_ID,
        name: DEFAULT_MOBILE_SECTION_NAME,
        index: 0,
        widgetIds: [],
    }]);
    let activeSectionName = $derived(
        activeSectionId === MOBILE_ALL_SECTION_ID
            ? "全部组件"
            : sections.find((section) => section.id === activeSectionId)?.name || DEFAULT_MOBILE_SECTION_NAME,
    );

    // ── 外部主页存储（Homepage Agent）刷新调度器 ──
    // Agent 修改 mobile-homepage 持久化 storage 后，已打开的移动主页在可见且非编辑态时
    // 自动恢复最新 storage；编辑/保存/隐藏期间只标记 pending，稍后再恢复。
    let mobileHomepageRootElement: HTMLElement | undefined = $state(undefined);
    let pendingExternalStorageRefresh = false;
    let externalStorageRefreshGeneration = 0;
    let mobileHomepageVisibilityObserver: ResizeObserver | null = null;

    // ── 移动主页乐观并发控制 ──
    // renderedLayoutRevision：当前屏幕 DOM 所依据的真实 storage layout revision（restore 成功后记录）。
    // editBaseLayoutRevision：一次编辑会话开始时固定的 base revision；保存时作为 expectedRevision。
    let renderedLayoutRevision: number | null = null;
    let editBaseLayoutRevision: number | null = null;

    function getWidgetBlocks(): HTMLElement[] {
        const container = mobileHomepageWidgetContainer;
        if (!container) return [];
        return Array.from(container.querySelectorAll(".widget-block"))
            .filter((block): block is HTMLElement => block instanceof HTMLElement);
    }

    function setSelectedBlock(block: HTMLElement | null): void {
        if (selectedBlock && selectedBlock !== block) {
            selectedBlock.classList.remove("mobile-widget-selected");
        }
        selectedBlock = block;
        currentBlockForSettingsRef.value = block;
        if (block) {
            block.classList.add("mobile-widget-selected");
            selectedWidgetType = block.dataset.widgetType || "";
        } else {
            selectedWidgetType = "";
        }
    }

    function syncWidgetCount(): void {
        const blocks = getWidgetBlocks();
        totalWidgetCount = blocks.length;
        visibleWidgetCount = blocks.filter((block) => {
            return !block.classList.contains("mobile-widget-hidden-by-section");
        }).length;
    }

    async function refreshSelectedWidgetType(block: HTMLElement | null = selectedBlock): Promise<void> {
        if (!block) {
            selectedWidgetType = "";
            return;
        }
        selectedWidgetType = (await getWidgetTypeFromBlock(plugin, block)) || "";
    }

    function updateSortableState(): void {
        const shouldEnableSortable = editMode && activeSectionId === MOBILE_ALL_SECTION_ID;
        if (!shouldEnableSortable) {
            if (sortable) {
                sortable.destroy();
                sortable = null;
            }
            return;
        }

        const container = mobileHomepageWidgetContainer;
        if (!container || sortable) return;

        sortable = new Sortable(container, {
            animation: 150,
            ghostClass: "mobile-sortable-ghost",
            chosenClass: "mobile-sortable-chosen",
            dragClass: "mobile-sortable-drag",
            handle: ".mobile-widget-drag-handle",
            delay: 180,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            filter: "button:not(.mobile-widget-drag-handle),input,textarea,select,a,[role='button']:not(.mobile-widget-drag-handle)",
            preventOnFilter: false,
            onEnd: async () => {
                if (!editMode || activeSectionId !== MOBILE_ALL_SECTION_ID) return;
                // 拖动保存必须绑定本次编辑会话的 base revision。
                if (editBaseLayoutRevision == null) return;
                try {
                    const result = await saveLayout(plugin, mobileHomepageWidgetContainer, {
                        expectedRevision: editBaseLayoutRevision,
                    });
                    // 连续拖动：base 更新为刚提交的 revision；rendered 同步，避免二次进入编辑假冲突。
                    applyMobileCommittedLayout(result.committedRevision, true);
                    applyMobileSectionState(result.sectionState);
                    await applySectionFilter();
                } catch (error) {
                    if (error instanceof MobileLayoutRevisionConflictError) {
                        await handleMobileEditConflict();
                    } else {
                        showMessage("移动主页拖动保存失败，请重试或点击完成重试。", 5000, "error");
                    }
                }
            },
        });
    }

    async function applySectionFilter(): Promise<void> {
        const blocks = getWidgetBlocks();
        const fallbackSectionId = sections[0]?.id || DEFAULT_MOBILE_SECTION_ID;
        blocks.forEach((block) => {
            const widgetSection = sectionAssignments[block.id] || fallbackSectionId;
            block.dataset.mobileSection = widgetSection;
            const visible = activeSectionId === MOBILE_ALL_SECTION_ID || widgetSection === activeSectionId;
            block.classList.toggle("mobile-widget-hidden-by-section", !visible);
        });
        syncWidgetCount();
    }

    async function initMobileHomepageLayout(options: { confirmedEmptyLayout?: boolean } = {}): Promise<void> {
        // Single-flight: if already initializing, wait for that one
        if (initInFlight) {
            return initInFlight;
        }

        const version = ++restoreVersion;
        const startGeneration = externalStorageRefreshGeneration;

        initInFlight = (async () => {
            await tick();

            const container = mobileHomepageWidgetContainer;
            if (!container) return;

            if (destroyed) return;

            if (!widgetEventsBound) {
                container.addEventListener("mobile-widget-action", handleWidgetAction as EventListener);
                container.addEventListener("mobile-widget-longpress", handleWidgetLongPress as EventListener);
                container.addEventListener("mobile-widget-refreshed", handleWidgetRefreshed as EventListener);
                widgetEventsBound = true;
            }

            const restored = await restoreLayout(plugin, currentBlockForSettingsRef, mobileHomepageWidgetContainer, {
                previewMode,
                confirmedEmptyLayout: options.confirmedEmptyLayout,
            });

            // If a newer restore started or container was destroyed, skip post-processing
            if (version !== restoreVersion || destroyed) return;

            // 记录当前 DOM 所依据的真实 storage revision（编辑 base 的来源）。
            if (restored.layoutRevision != null) {
                renderedLayoutRevision = restored.layoutRevision;
            }
            sections = restored.sectionState.sections;
            sectionAssignments = restored.sectionState.assignments;
            if (
                activeSectionId !== MOBILE_ALL_SECTION_ID
                && !sections.some((section) => section.id === activeSectionId)
            ) {
                activeSectionId = restored.sectionState.activeSectionId;
            }

            // 已确认空布局清空后，清理可能指向已销毁元素的过期选择状态。
            if (container.dataset.mobileConfirmedEmptyCleared === "1") {
                delete container.dataset.mobileConfirmedEmptyCleared;
                selectedBlock = null;
                selectedWidgetType = "";
                currentBlockForSettingsRef.value = null;
                actionSheetOpen = false;
                contentSheet = null;
                styleSheetBlock = null;
                deleteSheetBlock = null;
                sectionSheetOpen = false;
                sectionSwitcherOpen = false;
                menuSheetOpen = false;
            }

            await applySectionFilter();
            syncWidgetCount();
            updateSortableState();
        })();

        try {
            await initInFlight;
        } finally {
            initInFlight = null;
            // 若恢复期间收到了更新的外部 storage 事件，则基于最新 storage 再恢复一次，
            // 避免“in-flight 期间收到事件 → 完成后被丢弃”导致 pending 永远丢失。
            if (!destroyed && pendingExternalStorageRefresh && startGeneration !== externalStorageRefreshGeneration) {
                scheduleExternalStorageRefresh();
            }
        }
    }

    /**
     * 判断移动主页当前是否真正可做 DOM 恢复。
     * 思源内部切换页面时整个 document 仍可见，因此用根元素尺寸判断，而非 document.visibilitychange。
     * 后台隐藏 → 视为“暂时不可恢复”，保留 pending，切回可见后再恢复。
     */
    function isMobileHomepageVisibleAndMountable(): boolean {
        const root = mobileHomepageRootElement;
        if (!root || !root.isConnected) return false;
        if (root.clientWidth <= 0 || root.clientHeight <= 0) return false;
        if (root.getClientRects().length === 0) return false;
        const style = getComputedStyle(root);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return true;
    }

    /** 请求执行一次移动主页外部存储刷新；编辑/保存/隐藏/在途恢复时不立即执行。 */
    function scheduleExternalStorageRefresh(): void {
        if (destroyed) return;
        if (!mobileHomepageRootElement || !mobileHomepageRootElement.isConnected) return;
        if (editMode || layoutSaving) return;
        if (!isMobileHomepageVisibleAndMountable()) return;
        if (initInFlight) return;
        requestAnimationFrame(() => {
            if (destroyed) return;
            if (!pendingExternalStorageRefresh) return;
            if (editMode || layoutSaving) return;
            if (initInFlight) return;
            void runExternalStorageRefresh();
        });
    }

    /** 基于最新持久化 storage 恢复一次移动主页。 */
    async function runExternalStorageRefresh(): Promise<void> {
        const refreshGeneration = externalStorageRefreshGeneration;
        // Agent 外部写入已完成事务提交与写后验证；只有该路径允许请求“已确认空布局”清空。
        await initMobileHomepageLayout({ confirmedEmptyLayout: true });
        if (destroyed) return;
        if (refreshGeneration === externalStorageRefreshGeneration) {
            pendingExternalStorageRefresh = false;
        }
    }

    /**
     * 收到 Homepage Agent 的外部 storage changed 事件。
     * 移动主页只处理 mobile-homepage；桌面主页的写入被忽略，避免互相刷新。
     * latest-wins：restoreVersion++ 立即让在途旧恢复失效；generation++ 用于恢复完成后复查 pending。
     */
    function handleAgentStorageChanged(event: Event): void {
        const detail = (event as CustomEvent<HomepageAgentStorageChangedDetail>).detail;
        if (!detail || detail.surface !== "mobile-homepage") return;
        restoreVersion += 1;
        externalStorageRefreshGeneration += 1;
        pendingExternalStorageRefresh = true;
        scheduleExternalStorageRefresh();
    }

    /** 用 ResizeObserver 观察根元素，移动主页从隐藏变为可见时自动恢复最新 storage。 */
    function setupMobileHomepageVisibilityObserver(): void {
        teardownMobileHomepageVisibilityObserver();
        const root = mobileHomepageRootElement;
        if (!root) return;
        mobileHomepageVisibilityObserver = new ResizeObserver(() => {
            if (isMobileHomepageVisibleAndMountable() && pendingExternalStorageRefresh) {
                scheduleExternalStorageRefresh();
            }
        });
        mobileHomepageVisibilityObserver.observe(root);
    }

    function teardownMobileHomepageVisibilityObserver(): void {
        if (mobileHomepageVisibilityObserver) {
            try {
                mobileHomepageVisibilityObserver.disconnect();
            } catch {
                // 忽略断开错误
            }
            mobileHomepageVisibilityObserver = null;
        }
    }

    function cleanupSortableState(): void {
        destroyed = true;
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }
        const container = mobileHomepageWidgetContainer;
        if (container && widgetEventsBound) {
            container.removeEventListener("mobile-widget-action", handleWidgetAction as EventListener);
            container.removeEventListener("mobile-widget-longpress", handleWidgetLongPress as EventListener);
            container.removeEventListener("mobile-widget-refreshed", handleWidgetRefreshed as EventListener);
        }
        widgetEventsBound = false;
        mobileHomepageInitialized = false;
    }

    /**
     * 从非编辑状态进入可保存编辑状态。
     * - 若已记录 renderedLayoutRevision，直接作为 editBaseLayoutRevision；
     * - 否则读取最新 storage，确认当前 DOM 与 storage 顺序一致后才允许编辑；
     *   不一致则刷新主页，不允许基于未知版本编辑。
     */
    async function enterMobileEditMode(): Promise<boolean> {
        if (editMode) return true;
        if (renderedLayoutRevision != null) {
            editBaseLayoutRevision = renderedLayoutRevision;
            editMode = true;
            updateSortableState();
            return true;
        }
        try {
            const container = mobileHomepageWidgetContainer;
            if (!container) return false;
            const current = await readDeviceViewLayout(deviceViewContext);
            if (!current) return false;
            const storageOrder = current.order.map((item) => item.id);
            const domOrder = getWidgetBlocks().map((block) => block.id);
            if (storageOrder.length === domOrder.length && storageOrder.every((id, i) => id === domOrder[i])) {
                renderedLayoutRevision = current.revision;
                editBaseLayoutRevision = current.revision;
                editMode = true;
                updateSortableState();
                return true;
            }
        } catch {
            return false;
        }
        // DOM 与 storage 不一致：刷新主页，不允许基于未知版本编辑。
        pendingExternalStorageRefresh = true;
        scheduleExternalStorageRefresh();
        showMessage("主页数据已变化，已重新加载最新布局。", 3000, "info");
        return false;
    }

    /**
     * 移动编辑保存发生 revision 冲突（用户与 Agent / 其他窗口同时编辑）：
     * 不写入旧 DOM；退出 stale 编辑、关闭 sheet/selection，并调度一次最新 storage refresh。
     */
    async function handleMobileEditConflict(): Promise<void> {
        actionSheetOpen = false;
        styleSheetBlock = null;
        contentSheet = null;
        deleteSheetBlock = null;
        sectionSheetOpen = false;
        sectionSwitcherOpen = false;
        menuSheetOpen = false;
        setSelectedBlock(null);
        editMode = false;
        layoutSaving = false;
        editBaseLayoutRevision = null;
        pendingExternalStorageRefresh = true;
        showMessage("主页已被其他操作修改，当前编辑无法直接覆盖最新布局，已重新加载最新主页。", 5000, "info");
        scheduleExternalStorageRefresh();
    }

    /** 最小回滚：仅当新建组件文档 revision 仍未变化时删除；已并发变化则保留并提示人工检查。 */
    async function rollbackMobileNewWidget(widgetId: string): Promise<void> {
        try {
            const doc = await readWidgetInstanceDocument(deviceViewContext, widgetId);
            if (doc) {
                await deleteWidgetInstance(deviceViewContext, widgetId, doc.revision);
            }
        } catch (error) {
            console.warn("[MobileHomepage] 新建组件配置无法安全回滚，已保留等待人工检查:", error);
        }
    }

    /**
     * 本地布局成功提交后统一更新 revision bookkeeping：
     * - 当前 DOM 已经对应 committedRevision，因此 renderedLayoutRevision 必须同步；
     * - 仍处于编辑会话时同时推进 editBaseLayoutRevision（连续拖动不产生自我假冲突）；
     * - 退出编辑时由调用方把 editBaseLayoutRevision 清空，renderedLayoutRevision 不清空。
     */
    function applyMobileCommittedLayout(committedRevision: number, stillEditing: boolean): void {
        renderedLayoutRevision = committedRevision;
        if (stillEditing) {
            editBaseLayoutRevision = committedRevision;
        }
    }

    function handleWidgetAction(event: CustomEvent): void {
        const block = event.detail?.element as HTMLElement | undefined;
        if (!block) return;
        void enterMobileEditMode().then((entered) => {
            if (!entered) return;
            setSelectedBlock(block);
            void refreshSelectedWidgetType(block);
            actionSheetOpen = true;
            updateSortableState();
        });
    }

    function handleWidgetLongPress(event: CustomEvent): void {
        const block = event.detail?.element as HTMLElement | undefined;
        if (!block) return;
        void enterMobileEditMode().then((entered) => {
            if (!entered) return;
            setSelectedBlock(block);
            void refreshSelectedWidgetType(block);
            actionSheetOpen = true;
            updateSortableState();
        });
    }

    function handleWidgetRefreshed(): void {
        void applySectionFilter();
        void refreshSelectedWidgetType();
    }

    async function toggleEditMode(): Promise<void> {
        if (editMode) {
            // Guard against re-entrance during an ongoing save
            if (layoutSaving) return;
            layoutSaving = true;
            try {
                if (editBaseLayoutRevision == null) {
                    // 防御性退出编辑（正常流程进入编辑时已记录 base）。
                    editMode = false;
                    setSelectedBlock(null);
                    updateSortableState();
                    return;
                }
                const result = await saveLayout(plugin, mobileHomepageWidgetContainer, { expectedRevision: editBaseLayoutRevision });
                applyMobileCommittedLayout(result.committedRevision, false);
                applyMobileSectionState(result.sectionState);
                editBaseLayoutRevision = null;
                actionSheetOpen = false;
                styleSheetBlock = null;
                contentSheet = null;
                deleteSheetBlock = null;
                sectionSheetOpen = false;
                sectionSwitcherOpen = false;
                menuSheetOpen = false;
                setSelectedBlock(null);
                editMode = false;
                showMessage("移动端主页布局已保存");
            } catch (error) {
                if (error instanceof MobileLayoutRevisionConflictError) {
                    await handleMobileEditConflict();
                    return;
                }
                // Keep editMode=true, preserve current DOM and selection state
                showMessage("移动主页布局保存失败，当前编辑尚未提交，请重试。", 5000, "error");
            } finally {
                layoutSaving = false;
            }
        } else {
            const entered = await enterMobileEditMode();
            if (!entered) return;
        }
        updateSortableState();
    }

    async function handleClose(): Promise<void> {
        // Guard against re-entrance
        if (layoutSaving) return;
        // Not editing: close directly
        if (!editMode) {
            close();
            return;
        }
        // In edit mode: save first, then close
        layoutSaving = true;
        try {
            if (editBaseLayoutRevision == null) {
                close();
                return;
            }
            const result = await saveLayout(plugin, mobileHomepageWidgetContainer, { expectedRevision: editBaseLayoutRevision });
            applyMobileCommittedLayout(result.committedRevision, false);
            applyMobileSectionState(result.sectionState);
            editBaseLayoutRevision = null;
            close();
        } catch (error) {
            if (error instanceof MobileLayoutRevisionConflictError) {
                await handleMobileEditConflict();
                return;
            }
            showMessage("移动主页布局保存失败，当前编辑尚未提交，请重试。", 5000, "error");
        } finally {
            layoutSaving = false;
        }
    }

    function openSelectedContentSheet(): void {
        if (!selectedBlock) return;
        contentSheet = {
            blockId: selectedBlock.id,
            isNew: false,
        };
        actionSheetOpen = false;
    }

    function openSelectedStyleSheet(): void {
        if (!selectedBlock) return;
        styleSheetBlock = selectedBlock;
        actionSheetOpen = false;
    }

    async function refreshBlock(block: HTMLElement | null = selectedBlock): Promise<void> {
        const instance = (block as any)?.__widgetBlockInstance;
        if (instance && typeof instance.refreshContent === "function") {
            await instance.refreshContent();
            await applySectionFilter();
        }
    }

    async function openAddSheet(): Promise<void> {
        const entered = await enterMobileEditMode();
        if (!entered) return;
        addSheetOpen = true;
        updateSortableState();
    }

    async function openSectionManager(): Promise<void> {
        const entered = await enterMobileEditMode();
        if (!entered) return;
        menuSheetOpen = false;
        sectionSwitcherOpen = false;
        sectionSheetOpen = true;
        updateSortableState();
    }

    async function runSectionOperation(operation: MobileSectionOperation): Promise<void> {
        if (!editMode || editBaseLayoutRevision == null) return;
        try {
            const result = await saveLayout(plugin, mobileHomepageWidgetContainer, {
                expectedRevision: editBaseLayoutRevision,
                sectionOperation: operation,
            });
            applyMobileCommittedLayout(result.committedRevision, true);
            applyMobileSectionState(result.sectionState);
            await applySectionFilter();
        } catch (error) {
            if (error instanceof MobileLayoutRevisionConflictError) {
                await handleMobileEditConflict();
                return;
            }
            const message = error instanceof Error ? error.message : "请重试";
            showMessage(`主页分区保存失败：${message}`, 5000, "error");
        }
    }

    function assignWidgetSection(widgetId: string, sectionId: string): Promise<void> {
        return runSectionOperation({ type: "assign", widgetId, sectionId });
    }

    async function createSection(): Promise<void> {
        const sectionNumber = sections.length + 1;
        await runSectionOperation({
            type: "create",
            sectionId: createMobileSectionId(),
            name: `分区 ${sectionNumber}`,
        });
    }

    function selectSection(sectionId: string): void {
        activeSectionId = sectionId;
        sectionSwitcherOpen = false;
    }

    async function beginLayoutEdit(): Promise<void> {
        menuSheetOpen = false;
        activeSectionId = MOBILE_ALL_SECTION_ID;
        await toggleEditMode();
    }

    function applyMobileSectionState(sectionState: MobileSectionState): void {
        sections = sectionState.sections;
        sectionAssignments = sectionState.assignments;
        if (
            activeSectionId !== MOBILE_ALL_SECTION_ID
            && !sections.some((section) => section.id === activeSectionId)
        ) {
            activeSectionId = sectionState.activeSectionId;
        }
    }

    function openNewWidgetContentSheet(widgetType: string): void {
        addSheetOpen = false;
        contentSheet = {
            blockId: createWidgetInstanceId(),
            initialContentType: widgetType,
            isNew: true,
        };
    }

    function defaultMobileWidgetSize(widgetType: string): number {
        const definition = getWidgetDefinition(widgetType);
        if (!definition) return 11;
        if (
            ["list", "task", "note", "chart", "embed", "complex"].includes(definition.kind)
            || ["collection", "visualization", "workspace", "embedded"].includes(definition.presentationCategory)
        ) return 22;
        if (definition.kind === "media") return 12;
        return 11;
    }

    async function handleContentConfirm(contentTypeJson: string): Promise<void> {
        if (!contentSheet) return;

        let block = mobileHomepageWidgetContainer?.querySelector(`#${CSS.escape(contentSheet.blockId)}`) as HTMLElement | null;
        if (contentSheet.isNew) {
            const created = createMobileWidgetBlock(
                plugin,
                currentBlockForSettingsRef,
                mobileHomepageWidgetContainer,
                contentSheet.blockId,
                { previewMode, deviceViewContext },
            );
            block = created?.element || null;
        }

        if (!block) {
            contentSheet = null;
            return;
        }

        const instance = (block as any).__widgetBlockInstance;
        if (instance && typeof instance.updateContent === "function") {
            instance.updateContent(contentTypeJson);
        }
        if (contentSheet.isNew) {
            const parsed = JSON.parse(contentTypeJson) as { type?: unknown };
            if (typeof parsed.type === "string") {
                await setBlockSize(block, defaultMobileWidgetSize(parsed.type), 2);
            }
        }

        await saveWidgetContentPreservingSize(
            plugin,
            contentSheet.blockId,
            JSON.parse(contentTypeJson),
            deviceViewContext,
            block,
            contentSheet.isNew,
        );
        try {
            const targetSectionId = activeSectionId === MOBILE_ALL_SECTION_ID
                ? sections[0]?.id
                : activeSectionId;
            const result = await saveLayout(plugin, mobileHomepageWidgetContainer, {
                expectedRevision: editBaseLayoutRevision ?? undefined,
                ...(contentSheet.isNew && targetSectionId
                    ? { sectionOperation: { type: "assign" as const, widgetId: contentSheet.blockId, sectionId: targetSectionId } }
                    : {}),
            });
            applyMobileCommittedLayout(result.committedRevision, editMode);
            applyMobileSectionState(result.sectionState);
        } catch (error) {
            if (error instanceof MobileLayoutRevisionConflictError) {
                // 内容已写入（新建组件 config 已创建），但布局未提交：最小回滚新建实例。
                if (contentSheet.isNew) {
                    await rollbackMobileNewWidget(contentSheet.blockId);
                }
                await handleMobileEditConflict();
                return;
            }
            // Content was written successfully, but layout did not commit.
            // Keep the current sheet open so the user can retry.
            showMessage("移动主页布局保存失败，组件内容已保存但布局未更新，请重试。", 5000, "error");
            return;
        }
        setSelectedBlock(block);
        await refreshSelectedWidgetType(block);
        await applySectionFilter();
        contentSheet = null;
        syncWidgetCount();
    }

    function requestDeleteSelectedWidget(): void {
        const block = selectedBlock || styleSheetBlock;
        if (!block) return;
        deleteSheetBlock = block;
        actionSheetOpen = false;
        styleSheetBlock = null;
    }

    async function confirmDeleteWidget(): Promise<void> {
        const block = deleteSheetBlock;
        if (!block) return;

        const widgetId = block.id;
        const instance = (block as any).__widgetBlockInstance;

        const result = await deleteWidgetFromSurface(deviceViewContext, widgetId);

        if (result.status === "success" || result.status === "layoutCommittedConfigRetained") {
            if (instance && typeof instance.destroy === "function") {
                try { instance.destroy(); } catch (e) { console.warn("[MobileHomepage] destroy failed after delete:", e); }
            }
            block.remove();

            actionSheetOpen = false;
            styleSheetBlock = null;
            deleteSheetBlock = null;
            setSelectedBlock(null);
            const nextAssignments = { ...sectionAssignments };
            delete nextAssignments[widgetId];
            sectionAssignments = nextAssignments;
            sections = sections.map((section) => ({
                ...section,
                widgetIds: section.widgetIds.filter((id) => id !== widgetId),
            }));
            await applySectionFilter();
            syncWidgetCount();

            showMessage(result.status === "success" ? "已删除移动端组件" : "已从移动主页移除组件，配置文件已保留");
        } else if (result.status === "notCommitted") {
            showMessage(`组件删除失败：${result.reason}`, 5000, "error");
        } else {
            showMessage(`组件删除状态无法确认，请人工检查：${result.reason}`, 6000, "error");
        }
    }

    onMount(() => {
        advanced = !!plugin.ADVANCED;

        const handleAdvancedReady = async () => {
            advanced = true;
            destroyed = false;
            await tick();
            await initMobileHomepageLayout();
        };

        const handleAdvancedUnavailable = () => {
            advanced = false;
            cleanupSortableState();
        };

        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
        window.addEventListener(HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, handleAgentStorageChanged as EventListener);

        if (advanced) {
            void initMobileHomepageLayout();
        }

        setupMobileHomepageVisibilityObserver();

        return () => {
            window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
            window.removeEventListener(HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, handleAgentStorageChanged as EventListener);
            teardownMobileHomepageVisibilityObserver();
            cleanupSortableState();

            // Only clean up our own container instance
            const container = mobileHomepageWidgetContainer;
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
            mobileHomepageWidgetContainer = null;
        };
    });

    $effect(() => {
        activeSectionId;
        void applySectionFilter();
        updateSortableState();
    });

    $effect(() => {
        editMode;
        updateSortableState();
    });

    // 编辑中或保存中收到外部 storage changed 时只标记 pending；
    // 用户退出编辑且保存完成（editMode/layoutSaving 均为 false）后自动恢复最新 storage。
    $effect(() => {
        editMode;
        layoutSaving;
        if (!editMode && !layoutSaving && pendingExternalStorageRefresh && !destroyed) {
            scheduleExternalStorageRefresh();
        }
    });
</script>

<div
    class="mobile-homepage"
    bind:this={mobileHomepageRootElement}
    class:mobile-homepage--editing={editMode}
    class:mobile-homepage--preview={previewMode}
>
    {#if advanced}
        <header class="mobile-homepage-app-bar">
            <button
                type="button"
                class="mobile-homepage-icon-button"
                aria-label="关闭移动主页"
                disabled={layoutSaving}
                onclick={() => void handleClose()}
            ><SiyuanIcon name="close" size={19} /></button>
            <button
                type="button"
                class="mobile-homepage-section-trigger"
                aria-label={`当前分区：${activeSectionName}，点击切换`}
                aria-expanded={sectionSwitcherOpen}
                onclick={() => (sectionSwitcherOpen = true)}
            >
                <span>{activeSectionName}</span>
                <SiyuanIcon name="iconDown" size={12} />
            </button>
            {#if editMode}
                <button
                    type="button"
                    class="mobile-homepage-done-button"
                    disabled={layoutSaving}
                    onclick={() => void toggleEditMode()}
                >{layoutSaving ? "保存中" : "完成"}</button>
            {:else}
                <button
                    type="button"
                    class="mobile-homepage-icon-button"
                    aria-label="更多主页操作"
                    aria-expanded={menuSheetOpen}
                    onclick={() => (menuSheetOpen = true)}
                ><SiyuanIcon name="more" size={19} /></button>
            {/if}
        </header>

        <main class="mobile-homepage-scroll">
            <div class="mobile-homepage-widget" bind:this={mobileHomepageWidgetContainer}></div>
            {#if totalWidgetCount === 0}
                <div class="mobile-homepage-empty">
                    <strong>还没有移动端组件</strong>
                    <span>点击右下角按钮添加第一个组件。</span>
                </div>
            {:else if visibleWidgetCount === 0}
                <div class="mobile-homepage-empty">
                    <strong>这个分区还没有组件</strong>
                    <span>添加新组件，或在组件设置中调整所属分区。</span>
                </div>
            {/if}
        </main>

        {#if !editMode}
            <button class="mobile-homepage-fab" type="button" aria-label="添加组件" onclick={openAddSheet}>
                <SiyuanIcon name="create" size={22} />
            </button>
        {/if}

        {#if actionSheetOpen && selectedBlock}
            <MobileWidgetActionSheet
                title={getMobileWidgetLabel(selectedWidgetType)}
                canDrag={activeSectionId === MOBILE_ALL_SECTION_ID}
                onEditContent={openSelectedContentSheet}
                onEditStyle={openSelectedStyleSheet}
                onRefresh={() => refreshBlock(selectedBlock)}
                onDelete={requestDeleteSelectedWidget}
                onClose={() => (actionSheetOpen = false)}
            />
        {/if}

        {#if contentSheet}
            <MobileWidgetContentSheet
                {plugin}
                currentBlockId={contentSheet.blockId}
                initialContentType={contentSheet.initialContentType || selectedWidgetType}
                onClose={() => (contentSheet = null)}
                onConfirm={handleContentConfirm}
                {deviceViewContext}
            />
        {/if}

        {#if styleSheetBlock}
            <MobileWidgetStyleSheet
                blockElement={styleSheetBlock}
                widgetType={styleSheetBlock.dataset.widgetType || selectedWidgetType}
                {sections}
                sectionId={sectionAssignments[styleSheetBlock.id] || sections[0]?.id || DEFAULT_MOBILE_SECTION_ID}
                onClose={() => (styleSheetBlock = null)}
                onDelete={requestDeleteSelectedWidget}
                onSectionChanged={(sectionId) => assignWidgetSection(styleSheetBlock!.id, sectionId)}
                onStyleChanged={() => {
                    saveLayout(plugin, mobileHomepageWidgetContainer, { expectedRevision: editBaseLayoutRevision ?? undefined })
                        .then((result) => {
                            applyMobileCommittedLayout(result.committedRevision, editMode);
                            applyMobileSectionState(result.sectionState);
                        })
                        .catch((error) => {
                            if (error instanceof MobileLayoutRevisionConflictError) {
                                void handleMobileEditConflict();
                                return;
                            }
                            showMessage("移动主页样式保存失败，请重试。", 5000, "error");
                        });
                }}
            />
        {/if}

        {#if deleteSheetBlock}
            <MobileWidgetDeleteSheet
                title={getMobileWidgetLabel(deleteSheetBlock.dataset.widgetType)}
                onConfirm={confirmDeleteWidget}
                onClose={() => (deleteSheetBlock = null)}
            />
        {/if}

        {#if addSheetOpen}
            <MobileAddWidgetSheet
                activeCategory="all"
                onSelect={openNewWidgetContentSheet}
                onClose={() => (addSheetOpen = false)}
            />
        {/if}

        {#if sectionSheetOpen}
            <MobileSectionManagerSheet
                {sections}
                onOperation={runSectionOperation}
                onCreate={createSection}
                onClose={() => (sectionSheetOpen = false)}
            />
        {/if}

        {#if sectionSwitcherOpen}
            <MobileSectionSwitcherSheet
                {sections}
                {activeSectionId}
                onSelect={selectSection}
                onManage={openSectionManager}
                onClose={() => (sectionSwitcherOpen = false)}
            />
        {/if}

        {#if menuSheetOpen}
            <MobileHomepageMenuSheet
                onEdit={beginLayoutEdit}
                onManageSections={openSectionManager}
                onClose={() => (menuSheetOpen = false)}
            />
        {/if}
    {:else}
        <div class="mobile-homepage-not-advanced">
            <AdvancedFeatureLock
                title="移动端主页"
                subtitle="移动端自定义主页布局，拖拽排序和组件管理。"
                icon="mobile"
                features={[
                    "移动端自定义主页布局",
                    "拖拽排序和组件管理",
                    "适合移动端个性化展示"
                ]}
                highlights={["移动端", "拖拽布局", "组件管理"]}
                compact
            />
        </div>
    {/if}
</div>
