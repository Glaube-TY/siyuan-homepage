import { mount, unmount } from "svelte";
import {
    Plugin,
    showMessage,
    openTab,
    getFrontend,
    Model,
    type IMenuItem,
} from "siyuan";

import { svelteDialog } from "@/libs/dialog";
import "./style/dialog-viewport.css";
import * as advanced from "@/components/tools/advanced";
import { destroyFloatingDoc } from "@/components/tools/floatingDoc";
import { destroyFloatingMini } from "@/components/utils/widgetBlock/widget/musicPlayer/musicFloatingMiniManager";
import {
    loadHomepageConfig,
    loadHomepageConfigDataStrict,
    resolveBackgroundImage,
} from "./homepage/configLoader";
import { getCurrentDeviceViewContext } from "./homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewMigrated } from "./homepage/deviceView/deviceViewMigration";
import type { DeviceViewSurface } from "./homepage/deviceView/deviceViewTypes";
import { ensureDeviceIdentityReady } from "./homepage/utils/deviceProfile";
import {
    DeviceViewMigrationBlockedError,
    DeviceViewTemporarilyIncompleteError,
    formatDeviceViewBlockedUserMessage,
    markDeviceViewBlockedNotified,
    recordDeviceViewBlockedState,
} from "./homepage/deviceView/deviceViewErrors";
import { readDeviceViewSettings, updateDeviceViewSettings } from "./homepage/deviceView/deviceViewStorage";
import {
    cleanupGlobalBackgroundImageStyle,
    updateGlobalBackgroundImageStyle,
} from "./homepage/effects/backgroundImage";
import Homepage from "./homepage/homepage.svelte";
import TasksEditingDialog from "./components/utils/widgetBlock/widget/tasksPlus/tasksEditingDialog.svelte";
import QuickNotesDialog from "./components/utils/widgetBlock/widget/quickNotes/quickNotesDialog.svelte";
import ReviewDocsDialog from "./components/utils/widgetBlock/widget/reviewDocs/reviewDocsDialog.svelte";
import { clearReviewTarget } from "./components/utils/widgetBlock/widget/reviewDocs/reviewDocs";
import { updateFavoriteIndex } from "./components/tools/siyuanComponentDataApi";
import {
    destroySharedWidgetStorage,
    flushPendingSharedWidgetWrites,
    setSharedWidgetStoragePlugin,
} from "./components/utils/widgetBlock/widget/sharedLocalStorage/sharedLocalStorage";
import { ensureLegacySharedWidgetMigration } from "./components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetMigration";
import type { ReviewMenuTarget } from "./components/utils/widgetBlock/widget/reviewDocs/reviewDocsTypes";
import EnhancedDiaryWorkspacePage from "./components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspacePage.svelte";
import KbPremiumGatePanel from "@/features/kb/components/panels/kb-premium-gate-panel.svelte";
import KbSettingsPanel from "@/features/kb/components/panels/kb-settings-panel.svelte";
import { setKbSettingsPlugin } from "@/features/kb/services/settings/kb-settings-service";
import { setReferenceNavigationPlugin } from "@/features/kb/services/siyuan/reference-navigation";
import { setNotebrainPlugin } from "@/features/kb/services/agent-workbench/storage";
import { saveData, loadData, removeData } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { setPluginStorage } from "@/features/kb/services/agent-workbench/runtime/in-flight-turn-journal";
import { setNotifyBridgePlugin } from "@/features/notify-bridge";
import {
    destroyNotificationCenterRuntime,
    ensureNotificationCenterMigration,
    registerMobileNotificationPlanProvider,
    setNotificationCenterPlugin,
    settleMobilePlanReconcile,
    settleNotificationCenterOperations,
    settleNotificationHistoryWrites,
    startNotificationCenterRuntime,
} from "@/features/notification-center";
import { taskMobileNotificationPlanProvider } from "@/features/task-notify/task-notify-mobile-plans";
import { countdownMobileNotificationPlanProvider } from "@/features/countdown-notify/countdown-notify-mobile-plans";
import { enhancedDiaryMobileNotificationPlanProvider } from "@/features/enhanced-diary-notify/enhanced-diary-notify-mobile-plans";
import { reviewMobileNotificationPlanProvider } from "@/features/review-notify/review-notify-mobile-plans";
import { destroyChatActionBridge, setChatActionBridgePlugin, startChatActionBridgeIfNeeded } from "@/features/chat-action-bridge";
import { destroyTaskNotifyScheduler, setTaskNotifyPlugin, startTaskNotifyScheduler } from "@/features/task-notify";
import { destroyCountdownNotifyScheduler, setCountdownNotifyPlugin, startCountdownNotifyScheduler } from "@/features/countdown-notify";
import { destroyEnhancedDiaryNotifyScheduler, setEnhancedDiaryNotifyPlugin, setEnhancedDiaryNotifyRulesPlugin, startEnhancedDiaryNotifyScheduler } from "@/features/enhanced-diary-notify";
import { destroyReviewNotifyScheduler, setReviewNotifyPlugin, startReviewNotifyScheduler } from "@/features/review-notify";
import { getSelectionAiToolbarSettingsSnapshot, loadSelectionAiToolbarSettingsSnapshot } from "@/features/kb/services/selection-ai/selection-ai-config";
import { clearSelectionAskPayloadHandler } from "@/features/kb/services/selection-ai/selection-ai-chat-bridge";
import { destroySelectionAiPopup } from "@/features/kb/services/selection-ai/selection-ai-popup-controller";
import { destroySelectionAiActionMenu } from "@/features/kb/services/selection-ai/selection-ai-action-menu-controller";
import { createSelectionAiToolbarItems, removeSelectionAiToolbarItems } from "@/features/kb/services/selection-ai/selection-ai-menu";
import { initSelectionAiToolbarPointerTracker, destroySelectionAiToolbarPointerTracker } from "@/features/kb/services/selection-ai/selection-ai-toolbar-pointer-tracker";
import type { SelectionAiToolbarSettings } from "@/features/kb/services/selection-ai/selection-ai-types";
import { pushAgentDebugEvent } from "@/features/kb/services/agent-workbench/debug/workbench-debug";
import Sidebar from "./components/utils/sidebar/sidebar.svelte";
import MobileHomepage from "./homepage/mobileHomepage/mobileHomepage.svelte";
import MobileQuickActions from "./homepage/mobileQuickActions/MobileQuickActions.svelte";
import MobileQuickActionsSettingsDialog from "./homepage/mobileQuickActions/MobileQuickActionsSettingsDialog.svelte";
import {
    MOBILE_QUICK_ACTION_DEFINITIONS,
    normalizeMobileQuickActionButtonSize,
    normalizeMobileQuickActionItems,
    normalizeMobileQuickActionsPosition,
} from "./homepage/mobileQuickActions/mobileQuickActionsConfig";
import type {
    MobileQuickActionId,
    MobileQuickActionSetting,
    MobileQuickActionsPosition,
} from "./homepage/mobileQuickActions/mobileQuickActionsConfig";
import { openAccountingDetailDialogFromPlugin } from "./components/utils/widgetBlock/widget/accounting/openAccountingDetailDialog";

let notificationPlanUnregisters: Array<() => void> = [];

type HomepageMenuItem = {
    icon?: string;
    label: string;
    click?: () => void;
    type?: "submenu";
    submenu?: HomepageMenuItem[];
};

type MobileQuickAction = {
    id: MobileQuickActionId;
    label: string;
    description: string;
    icon: string;
    run: () => void | Promise<void>;
};

const STORAGE_NAME = "menu-config";
const TAB_TYPE = "homepage_tab";
const TAB_ID = "siyuan-homepagehomepage_tab";
const ENHANCED_DIARY_WORKSPACE_TAB_TYPE = "enhanced_diary_workspace_tab";
const ENHANCED_DIARY_WORKSPACE_TAB_ID = "siyuan-homepageenhanced_diary_workspace_tab";
const DOCK_TYPE = "homepage_dock";
const KB_CHAT_TAB_TYPE = "kb_chat_tab";
const KB_CHAT_TAB_ID = "siyuan-homepagekb_chat_tab";
const KB_DOCK_TYPE = "homepage_kb_dock";

const HOMEPAGE_ICON_SVG = `<symbol id="iconhomepage" viewBox="0 0 1024 1024">
    <path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15736"></path><path d="M918.050133 478.344533L512 165.341867 105.949867 478.344533a51.165867 51.165867 0 0 1-62.7712-80.8448L477.184 57.9584 512 25.6l34.833067 32.3584 434.005333 339.541333a51.2 51.2 0 1 1-62.788267 80.8448z" fill="#B02721" p-id="15737"></path><path d="M512 165.341867L119.466667 467.9168V981.333333h785.066666V467.9168z" fill="#E0E1E2" p-id="15738"></path><path d="M1006.933333 810.666667a17.066667 17.066667 0 0 0-17.066666 17.066666v17.066667h-17.066667v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667h-34.133334a17.066667 17.066667 0 1 0 0 34.133333h34.133334v51.2h-34.133334a17.066667 17.066667 0 1 0 0 34.133334h34.133334v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-153.6a17.066667 17.066667 0 0 0-17.066667-17.066666z m-34.133333 119.466666v-51.2h17.066667v51.2h-17.066667zM119.466667 878.933333a17.066667 17.066667 0 1 0 0-34.133333H85.333333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v17.066667H34.133333v-17.066667a17.066667 17.066667 0 1 0-34.133333 0v153.6a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h17.066667v17.066666a17.066667 17.066667 0 1 0 34.133333 0v-17.066666h34.133334a17.066667 17.066667 0 1 0 0-34.133334H85.333333v-51.2h34.133334z m-68.266667 51.2H34.133333v-51.2h17.066667v51.2z" fill="#E0E1E2" p-id="15739"></path><path d="M256 452.266667h204.8v136.533333H256zM256 691.2h204.8v170.666667H256zM563.2 452.266667h204.8v136.533333H563.2zM563.2 691.2h204.8v290.133333H563.2z" fill="#556080" p-id="15740"></path><path d="M563.2 452.266667h204.8v102.4H563.2zM256 452.266667h204.8v47.189333H256zM375.466667 759.466667v-68.266667h-34.133334v68.266667h-85.333333v34.133333h85.333333v68.266667h34.133334v-68.266667h85.333[... 52 char[... 14 chars omitted ...]
</symbol>`;

const TASK_ICON_SVG = `<symbol id="iconTask" viewBox="0 0 1024 1024">
    <path d="M224.924444 967.111111C153.813333 967.111111 128 929.578667 128 862.620444V242.659556c0-62.421333 18.033778-105.671111 91.448889-105.671112h56.988444s32.711111 10.168889 32.711111 15.246223c0 38.727111 26.936889 79.018667 60.757334 79.018666h277.12c32.199111 0 59.136-40.206222 59.136-78.933333 0-5.077333 36.494222-15.246222 36.494222-15.246222h55.779556c67.726222 0 100.977778 43.278222 100.977777 105.671111v619.875555c0 75.064889-35.456 104.490667-106.510222 104.490667H224.924444z m63.104-420.366222a40.647111 40.647111 0 0 0 0.213334 56.675555l118.385778 118.528 1.607111 2.062223a38.812444 38.812444 0 0 0 55.808 0l251.889777-253.952a39.537778 39.537778 0 0 0-55.594666-56.234667L436.024889 639.544889l-91.776-93.44a40.604444 40.604444 0 0 0-27.875556-11.121778 40.064 40.064 0 0 0-28.344889 11.690667v0.071111z m125.454223-382.321778c-22.101333 0-39.921778-30.392889-40.035556-55.808C373.333333 83.2 391.196444 56.888889 413.482667 56.888889h190.791111c22.215111 0 40.035556 26.296889 40.035555 51.712 0 25.415111-17.820444 55.808-38.855111 55.808l-191.971555 0.014222z" fill="#323233" p-id="14715"></path>
</symbol>`;

const SPARKLES_ICON_SVG = `<symbol id="iconSparkles" viewBox="0 0 1024 1024">
    <path d="M448 64l72 240 240 72-240 72-72 240-72-240-240-72 240-72z" fill="currentColor"></path>
    <path d="M768 576l40 136 136 40-136 40-40 136-40-136-136-40 136-40z" fill="currentColor"></path>
    <path d="M224 640l28 92 92 28-92 28-28 92-28-92-92-28 92-28z" fill="currentColor"></path>
</symbol>`;

const NOTEBRAIN_ICON_SVG = `<symbol id="iconNotebrain" viewBox="0 0 1024 1024">
    <path d="M304.64 140.8h546.56v324.48a40.32 40.32 0 0 1-80.64 0V223.36H304.64c-88.704 0-160 73.6-160 164.48v181.12c0 90.88 71.296 163.84 160 163.84h207.68a41.28 41.28 0 0 1 0 82.56H304.64C171.52 815.36 64 705.28 64 568.96V387.84C64 251.52 171.52 140.8 304.64 140.8z" fill="#262626"></path>
    <path d="M262.784 361.92m62.208 0l0.064 0q62.208 0 62.208 62.208l0 86.4q0 62.208-62.208 62.208l-0.064 0q-62.208 0-62.208-62.208l0-86.4q0-62.208 62.208-62.208Z" fill="#262626"></path>
    <path d="M512 355.84m62.208 0l0.064 0q62.208 0 62.208 62.208l0 86.4q0 62.208-62.208 62.208l-0.064 0q-62.208 0-62.208-62.208l0-86.4q0-62.208 62.208-62.208Z" fill="#262626"></path>
    <path d="M761.088 647.36a39.36 39.36 0 1 1 78.72 0v81.728h81.728a39.36 39.36 0 1 1 0 78.72h-81.728v81.728a39.36 39.36 0 1 1-78.72 0v-81.728h-81.728a39.36 39.36 0 1 1 0-78.72h81.728v-81.728z" fill="#1890FF"></path>
</symbol>`;

interface PluginConfig {
    quickNotesEnabled?: boolean;
    quickNotesPosition?: string;
    quickNotesTimestampEnabled?: boolean;
    quickNotesAddPosition?: string;
    taskEditorEnabled?: boolean;
    sidebarEnabled?: boolean;
    autoOpenMobileHomepage?: boolean;
    mobileQuickActionsEnabled?: boolean;
    mobileQuickActionsButtonSize?: number;
    mobileQuickActionsPosition?: MobileQuickActionsPosition;
    mobileQuickActionItems?: MobileQuickActionSetting[];
    autoOpenHomepage?: boolean;
    aiKbDockEnabled?: boolean;
    aiKbTabEnabled?: boolean;
    selectionAiToolbar?: SelectionAiToolbarSettings;
}

export default class PluginHomepage extends Plugin {
    customTab?: () => Model;
    enhancedDiaryWorkspaceTab?: () => Model;
    kbChatTab?: () => Model;
    isMobile = false;
    currentMobileDialog: ReturnType<typeof svelteDialog> | null = null;
    private currentMobileKbDialog: ReturnType<typeof svelteDialog> | null = null;
    private currentMobileSettingsDialog: ReturnType<typeof svelteDialog> | null = null;
    private currentMobileEnhancedDiaryWorkspaceDialog: ReturnType<typeof svelteDialog> | null = null;
    private homepageInstance: Record<string, any> | null = null;
    private homepageTabDiv: HTMLDivElement | null = null;
    private enhancedDiaryWorkspaceInstance: Record<string, any> | null = null;
    private enhancedDiaryWorkspaceTabDiv: HTMLDivElement | null = null;
    private enhancedDiaryWorkspaceInitialTab = "overview";
    private kbChatInstance: Record<string, any> | null = null;
    private kbChatTabDiv: HTMLDivElement | null = null;
    private kbDockInstance: Record<string, any> | null = null;
    private kbDockRegistered = false;
    private kbDockInitGeneration = 0;
    private sidebarDockInstance: Record<string, any> | null = null;
    private mobileQuickActionsHost: HTMLDivElement | null = null;
    private mobileQuickActionsInstance: Record<string, any> | null = null;
    private mobileQuickActionsPositionSaveTimer: number | null = null;
    private pendingMobileQuickActionsPosition: MobileQuickActionsPosition | null = null;
    private customTabsRegistered = false;
    private homepageTopBarElement: HTMLElement | null = null;
    private kbTopBarElement: HTMLElement | null = null;
    ADVANCED = false;
    private docTreeMenuEventBindThis = this.handleDocTreeMenu.bind(this);
    private contentMenuEventBindThis = this.handleContentMenu.bind(this);
    private editorTitleIconMenuEventBindThis = this.handleEditorTitleIconMenu.bind(this);
    private blockIconMenuEventBindThis = this.handleBlockIconMenu.bind(this);
    private homepageSettingsSavedBindThis = this.handleHomepageSettingsSaved.bind(this);
    private homepageAdvancedReadyBindThis = this.handleHomepageAdvancedReady.bind(this);
    private homepageAdvancedUnavailableBindThis = this.handleHomepageAdvancedUnavailable.bind(this);

    // 全局背景异步刷新版本号：防止旧请求覆盖新状态
    private globalBackgroundApplyVersion = 0;

    // 设备视图迁移阻断状态：结构化错误被捕获后保存，用于阻止依赖设备视图的功能
    private deviceViewBlocked: Readonly<DeviceViewMigrationBlockedError> | null = null;

    // 主页 surface 暂不可用只影响主页，不阻断独立业务。
    private homepageSurfaceUnavailable: Readonly<DeviceViewTemporarilyIncompleteError> | null = null;
    // 未分类的主页 surface 读取错误：只停用主页，显式重新打开时允许重试。
    private homepageSurfaceReadError: Error | null = null;
    // 设备身份不可用：不阻断通知/日记/AI/桥接等独立业务，但阻止设备视图初始化。
    private deviceIdentityUnavailable: Error | null = null;
    private deviceIdentityInitialization: Promise<void> | null = null;
    private homepageLayoutReadyFinalized = false;
    private readonly readyDeviceViewSurfaces = new Set<DeviceViewSurface>();
    private homepageCommandRegistered = false;
    private quickNotesCommandRegistered = false;
    private homepageWindowListenersRegistered = false;
    private baseEventListenersRegistered = false;
    private contentMenuListenerRegistered = false;
    private sidebarDockRegistered = false;
    private legacySharedMigrationInFlight: Promise<void> | null = null;
    private legacySharedMigrationCompleted = false;

    public override onDataChanged(): void {
        // 安全空实现：不调用基类实现，不卸载插件，不启动迁移，不重建主页。
        // 标签重新打开时通过标准init读取当前设备视图。
        console.debug("[Homepage] onDataChanged 触发，当前版本不做处理");
    }

    private ensureDeviceIdentityForRuntime(): Promise<void> {
        if (this.deviceIdentityInitialization) return this.deviceIdentityInitialization;

        const initialization = ensureDeviceIdentityReady().then(
            () => {
                this.deviceIdentityUnavailable = null;
            },
            (error: unknown) => {
                const structuredError = error instanceof Error
                    ? error
                    : new Error("设备身份初始化失败");
                this.deviceIdentityUnavailable = structuredError;
                throw structuredError;
            },
        );
        this.deviceIdentityInitialization = initialization;
        const clearInFlight = () => {
            if (this.deviceIdentityInitialization === initialization) {
                this.deviceIdentityInitialization = null;
            }
        };
        void initialization.then(clearInFlight, clearInFlight);
        return initialization;
    }

    private captureHomepageSurfaceError(surface: DeviceViewSurface, error: unknown): void {
        this.readyDeviceViewSurfaces.delete(surface);
        if (error instanceof DeviceViewMigrationBlockedError) {
            this.deviceViewBlocked = Object.freeze(error);
            this.homepageSurfaceUnavailable = null;
            this.homepageSurfaceReadError = null;
            recordDeviceViewBlockedState(error);
            return;
        }
        if (error instanceof DeviceViewTemporarilyIncompleteError) {
            this.homepageSurfaceUnavailable = Object.freeze(error);
            this.homepageSurfaceReadError = null;
            return;
        }
        this.homepageSurfaceUnavailable = null;
        this.homepageSurfaceReadError = error instanceof Error
            ? error
            : new Error("主页设备视图读取失败");
    }

    private clearHomepageSurfaceReadErrors(_surface: DeviceViewSurface): void {
        this.homepageSurfaceUnavailable = null;
        this.homepageSurfaceReadError = null;
    }

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        // 第一部分：首个 await 前同步完成所有独立能力和最小主页入口注册。
        setSharedWidgetStoragePlugin(this);
        setKbSettingsPlugin(this);
        setReferenceNavigationPlugin(this);
        setNotebrainPlugin(this);
        setPluginStorage({ saveData, loadData, removeData });
        setNotificationCenterPlugin(this);
        setNotifyBridgePlugin(this);
        setChatActionBridgePlugin(this);
        setTaskNotifyPlugin(this);
        setCountdownNotifyPlugin(this);
        setEnhancedDiaryNotifyPlugin(this);
        setEnhancedDiaryNotifyRulesPlugin(this);
        setReviewNotifyPlugin(this);

        notificationPlanUnregisters.forEach((unregister) => unregister());
        notificationPlanUnregisters = [
            registerMobileNotificationPlanProvider(taskMobileNotificationPlanProvider),
            registerMobileNotificationPlanProvider(countdownMobileNotificationPlanProvider),
            registerMobileNotificationPlanProvider(enhancedDiaryMobileNotificationPlanProvider),
            registerMobileNotificationPlanProvider(reviewMobileNotificationPlanProvider),
        ];
        this.registerIcon();
        this.ensureTabContainers();
        this.registerCustomTabs();
        this.registerBaseIndependentListeners();
        this.registerMinimalHomepageEntry();
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        // 第二部分：启动共享身份 Promise 并立即附加失败处理，但暂不等待。
        const identityPromise = this.ensureDeviceIdentityForRuntime();
        void identityPromise.catch(() => undefined);

        // 独立业务逐项隔离失败，不能被设备身份长期 pending 阻塞。
        try {
            await loadSelectionAiToolbarSettingsSnapshot(this);
        } catch (error) {
            console.warn("[Homepage] 划词 AI 设置读取失败，划词 AI 本次停用", error);
        }
        initSelectionAiToolbarPointerTracker();
        void startChatActionBridgeIfNeeded().catch((error) => {
            console.warn("[Homepage] 聊天桥接初始化失败，本次仅停用聊天桥接", error);
        });

        // 第三部分：独立能力完成后才等待身份；失败只停用设备视图。
        try {
            await identityPromise;
            const config = await this.recoverDeviceViewRuntimeAfterIdentityReady();
            this.syncHomepageConfigDependentListeners(config);
            this.maybeStartLegacySharedWidgetMigration();
        } catch (error) {
            this.syncHomepageConfigDependentListeners(null);
            if (error instanceof DeviceViewMigrationBlockedError) {
                if (markDeviceViewBlockedNotified(error.deviceId, error.surface)) {
                    showMessage(formatDeviceViewBlockedUserMessage(error), 0, "error");
                }
            } else if (this.deviceIdentityUnavailable) {
                showMessage("设备身份初始化失败，主页和侧边栏暂不可用；独立业务仍可使用。", 0, "error");
            } else {
                console.warn("[Homepage] 设备视图初始化失败；独立业务继续运行", error);
            }
        }
    }

    private async applyGlobalBackgroundImageStyle(): Promise<void> {
        const version = ++this.globalBackgroundApplyVersion;
        const config = await loadHomepageConfig(this);
        if (version !== this.globalBackgroundApplyVersion) return;
        const { backgroundImageSrc } = await resolveBackgroundImage(config, this.ADVANCED);
        if (version !== this.globalBackgroundApplyVersion) return;
        updateGlobalBackgroundImageStyle({
            advanced: this.ADVANCED,
            backgroundImageEnabled: config.backgroundImageEnabled,
            backgroundImageGlobalEnabled: config.backgroundImageGlobalEnabled,
            backgroundImageSrc,
            backgroundImageOpacity: config.backgroundImageOpacity,
            backgroundImageBlur: config.backgroundImageBlur,
        });
    }

    private registerBaseIndependentListeners(): void {
        if (this.baseEventListenersRegistered) return;
        this.eventBus.on("open-menu-doctree", this.docTreeMenuEventBindThis);
        this.eventBus.on("click-editortitleicon", this.editorTitleIconMenuEventBindThis);
        this.eventBus.on("click-blockicon", this.blockIconMenuEventBindThis);
        window.addEventListener("homepage-settings-saved", this.homepageSettingsSavedBindThis);
        this.baseEventListenersRegistered = true;
    }

    private syncHomepageConfigDependentListeners(config: PluginConfig | null): void {
        const enableContentMenu = config?.taskEditorEnabled === true;
        if (enableContentMenu && !this.contentMenuListenerRegistered) {
            this.eventBus.on("open-menu-content", this.contentMenuEventBindThis);
            this.contentMenuListenerRegistered = true;
        } else if (!enableContentMenu && this.contentMenuListenerRegistered) {
            this.eventBus.off("open-menu-content", this.contentMenuEventBindThis);
            this.contentMenuListenerRegistered = false;
        }

        const enableWindowListeners = config !== null;
        if (enableWindowListeners && !this.homepageWindowListenersRegistered) {
            window.addEventListener("homepage-advanced-ready", this.homepageAdvancedReadyBindThis);
            window.addEventListener("homepage-advanced-unavailable", this.homepageAdvancedUnavailableBindThis);
            this.homepageWindowListenersRegistered = true;
        } else if (!enableWindowListeners && this.homepageWindowListenersRegistered) {
            window.removeEventListener("homepage-advanced-ready", this.homepageAdvancedReadyBindThis);
            window.removeEventListener("homepage-advanced-unavailable", this.homepageAdvancedUnavailableBindThis);
            this.homepageWindowListenersRegistered = false;
        }
        this.syncConfigCommands(config);
        this.syncKbTopBar(config);
    }

    private registerMinimalHomepageEntry(): void {
        this.registerHomepageTopBar();
        if (!this.isMobile) this.registerHomepageCommand();
    }

    private async initializeHomepageSurface(config: PluginConfig): Promise<void> {
        this.registerMinimalHomepageEntry();
        this.syncHomepageConfigDependentListeners(config);

        if (config.sidebarEnabled === true && !this.isMobile && !this.sidebarDockRegistered) {
            this.registerDock();
        }
        if (config.aiKbDockEnabled === true && !this.isMobile) {
            this.registerKbDock();
        }

        // 全局背景应用失败是非致命副作用，单独捕获，避免整个主页初始化永久卡死。
        try {
            // 插件加载时应用全局背景（会员校验是异步的，后续事件会再次触发刷新）
            await this.applyGlobalBackgroundImageStyle();
        } catch (error) {
            console.warn("[Homepage] 初始化全局背景样式失败:", error);
        }
    }

    private async handleHomepageSettingsSaved(): Promise<void> {
        const surface: DeviceViewSurface = this.isMobileFrontend() ? "mobile-homepage" : "desktop-homepage";
        try {
            const config = await this.getPluginConfig();
            this.clearHomepageSurfaceReadErrors(surface);
            this.readyDeviceViewSurfaces.add(surface);
            await this.initializeHomepageSurface(config);
            this.syncHomepageConfigDependentListeners(config);
            try {
                this.mountMobileQuickActions(config);
            } catch (error) {
                console.warn("[Homepage] 设置保存后刷新移动快捷操作失败:", error);
            }
        } catch (error) {
            this.captureHomepageSurfaceError(surface, error);
            this.syncHomepageConfigDependentListeners(null);
        }
    }

    private async handleHomepageAdvancedReady(): Promise<void> {
        const surface: DeviceViewSurface = this.isMobileFrontend() ? "mobile-homepage" : "desktop-homepage";
        try {
            const config = await this.getPluginConfig();
            this.clearHomepageSurfaceReadErrors(surface);
            this.readyDeviceViewSurfaces.add(surface);
            this.syncHomepageConfigDependentListeners(config);
            try {
                this.mountMobileQuickActions(config);
            } catch (error) {
                console.warn("[Homepage] 高级功能就绪后刷新移动快捷操作失败:", error);
            }
        } catch (error) {
            this.captureHomepageSurfaceError(surface, error);
            this.syncHomepageConfigDependentListeners(null);
        }
        try {
            await this.applyGlobalBackgroundImageStyle();
        } catch (error) {
            console.warn("[Homepage] 高级功能就绪后刷新全局背景样式失败:", error);
        }
    }

    private async handleHomepageAdvancedUnavailable(): Promise<void> {
        try {
            if (this.currentMobileEnhancedDiaryWorkspaceDialog) {
                this.currentMobileEnhancedDiaryWorkspaceDialog.close();
                this.currentMobileEnhancedDiaryWorkspaceDialog = null;
            }
        } catch (error) {
            console.warn("[Homepage] 关闭移动端增强日记工作区失败:", error);
        }
        try {
            await this.applyGlobalBackgroundImageStyle();
        } catch (error) {
            console.warn("[Homepage] 高级功能不可用后刷新全局背景样式失败:", error);
        }
        try {
            if (this.currentMobileSettingsDialog) {
                this.currentMobileSettingsDialog.close();
                this.currentMobileSettingsDialog = null;
            }
        } catch (error) {
            console.warn("[Homepage] 关闭移动端设置对话框失败:", error);
        }
        try {
            this.destroyMobileQuickActions();
        } catch (error) {
            console.warn("[Homepage] 销毁移动快捷操作失败:", error);
        }
    }

    async onunload() {
        if (this.currentMobileEnhancedDiaryWorkspaceDialog) {
            this.currentMobileEnhancedDiaryWorkspaceDialog.close();
            this.currentMobileEnhancedDiaryWorkspaceDialog = null;
        }
        if (this.mobileQuickActionsPositionSaveTimer !== null) {
            clearTimeout(this.mobileQuickActionsPositionSaveTimer);
            this.mobileQuickActionsPositionSaveTimer = null;
        }
        if (this.pendingMobileQuickActionsPosition) {
            const pendingPosition = this.pendingMobileQuickActionsPosition;
            this.pendingMobileQuickActionsPosition = null;
            try {
                await this.persistMobileQuickActionsPosition(pendingPosition);
            } catch (error) {
                this.pendingMobileQuickActionsPosition = pendingPosition;
                console.warn("[Homepage] 卸载时保存移动快捷操作位置失败，已保留待保存位置:", error);
            }
        }
        await destroyChatActionBridge();
        destroyTaskNotifyScheduler();
        destroyCountdownNotifyScheduler();
        destroyEnhancedDiaryNotifyScheduler();
        destroyReviewNotifyScheduler();
        destroyNotificationCenterRuntime();
        await settleMobilePlanReconcile();
        notificationPlanUnregisters.forEach((unregister) => unregister());
        notificationPlanUnregisters = [];
        await Promise.all([
            settleNotificationCenterOperations(),
            settleNotificationHistoryWrites(),
        ]);
        try {
            await flushPendingSharedWidgetWrites();
        } catch (error) {
            console.warn("[Homepage] 插件卸载前仍有组件本地数据写入失败", error);
        }
        destroySharedWidgetStorage();
        destroyFloatingMini();
        this.eventBus.off("open-menu-doctree", this.docTreeMenuEventBindThis);
        this.eventBus.off("open-menu-content", this.contentMenuEventBindThis);
        this.eventBus.off("click-editortitleicon", this.editorTitleIconMenuEventBindThis);
        this.eventBus.off("click-blockicon", this.blockIconMenuEventBindThis);
        window.removeEventListener("homepage-settings-saved", this.homepageSettingsSavedBindThis);
        window.removeEventListener("homepage-advanced-ready", this.homepageAdvancedReadyBindThis);
        window.removeEventListener("homepage-advanced-unavailable", this.homepageAdvancedUnavailableBindThis);
        this.baseEventListenersRegistered = false;
        this.contentMenuListenerRegistered = false;
        this.homepageWindowListenersRegistered = false;
        this.globalBackgroundApplyVersion++;
        cleanupGlobalBackgroundImageStyle();

        // 销毁 Homepage 组件实例
        this.destroyHomepageInstance();
        this.destroyEnhancedDiaryWorkspaceInstance();
        this.destroyKbChatInstance();

        // 关闭移动端对话框
        if (this.currentMobileDialog) {
            this.currentMobileDialog.close();
            this.currentMobileDialog = null;
        }
        if (this.currentMobileKbDialog) {
            this.currentMobileKbDialog.close();
            this.currentMobileKbDialog = null;
        }
        if (this.currentMobileSettingsDialog) {
            this.currentMobileSettingsDialog.close();
            this.currentMobileSettingsDialog = null;
        }
        this.destroyMobileQuickActions();

        // 销毁全局悬浮预览单例（清理 DOM、样式、Protyle 等资源）
        try {
            destroyFloatingDoc();
        } catch {
            // 忽略销毁过程中的错误
        }
        destroySelectionAiPopup();
        destroySelectionAiActionMenu();
        destroySelectionAiToolbarPointerTracker();
        clearSelectionAskPayloadHandler();

        // 销毁 dock Sidebar 实例
        if (this.sidebarDockInstance) {
            try {
                unmount(this.sidebarDockInstance);
            } catch {
                // 忽略卸载过程中的错误
            }
            this.sidebarDockInstance = null;
        }

        this.kbDockInitGeneration += 1;
        if (this.kbDockInstance) {
            try {
                unmount(this.kbDockInstance);
            } catch {
                // ignore dock cleanup errors
            }
            this.kbDockInstance = null;
        }
        this.kbDockRegistered = false;
        this.sidebarDockRegistered = false;

        this.customTabsRegistered = false;
        this.customTab = undefined;
        this.enhancedDiaryWorkspaceTab = undefined;
        this.kbChatTab = undefined;
        this.removeOwnedTopBarElements();
    }

    updateProtyleToolbar(toolbar: Array<string | IMenuItem>): Array<string | IMenuItem> {
        const settings = getSelectionAiToolbarSettingsSnapshot();
        // 先清理旧的 selection-ai item，确保 click 回调来自当前代码版本
        removeSelectionAiToolbarItems(toolbar);
        if (!settings.enabled || this.isMobileFrontend()) {
            return toolbar;
        }
        const selectionAiToolbarItems = createSelectionAiToolbarItems({
            plugin: this,
            settings,
        });
        toolbar.push(...selectionAiToolbarItems);
        return toolbar;
    }

    async onLayoutReady() {
        // 独立业务先启动：聊天桥接、通知中心、日记通知等不依赖设备身份。
        void startChatActionBridgeIfNeeded().catch((error) => {
            console.warn("[Homepage] 聊天桥接初始化失败，本次仅停用聊天桥接", error);
        });
        try {
            await ensureNotificationCenterMigration();
            startNotificationCenterRuntime();
            startTaskNotifyScheduler();
            startCountdownNotifyScheduler();
            startEnhancedDiaryNotifyScheduler();
            startReviewNotifyScheduler();
        } catch (error) {
            console.warn("[Homepage] 通知中心迁移失败，业务通知调度器未启动", error);
        }

        try {
            await this.ensureDeviceIdentityForRuntime();
        } catch {
            return;
        }

        try {
            const config = await this.recoverDeviceViewRuntimeAfterIdentityReady();
            this.syncHomepageConfigDependentListeners(config);
            this.maybeStartLegacySharedWidgetMigration();
            if (!this.homepageLayoutReadyFinalized) {
                await this.finalizeHomepageSurfaceOnLayoutReady(config);
                this.homepageLayoutReadyFinalized = true;
            }
        } catch (error) {
            this.syncHomepageConfigDependentListeners(null);
            console.warn("[Homepage] onLayoutReady 设备视图恢复失败，独立业务继续运行", error);
        }
    }

    private async finalizeHomepageSurfaceOnLayoutReady(config: PluginConfig): Promise<void> {
        // 检查是否在新窗口中打开
        const isNewWindow = this.isNewWindow();

        // 只在非新窗口中自动打开主页
        if (!isNewWindow) {
            if (this.isMobileFrontend()) {
                if (config.autoOpenMobileHomepage === true) {
                    await this.openMobileHomepage();
                } else {
                    await this.verifyLicense();
                }
                this.mountMobileQuickActions(config);
            } else if (config.autoOpenHomepage === true) {
                await this.openHomepage();
                void this.verifyLicense();
            } else {
                this.destroyMobileQuickActions();
                void this.verifyLicense();
            }
        } else {
            this.destroyMobileQuickActions();
            void this.verifyLicense();
        }
    }

    private ensureTabContainers(): void {
        if (!this.enhancedDiaryWorkspaceTabDiv) {
            this.enhancedDiaryWorkspaceTabDiv = document.createElement("div");
        }
        if (!this.kbChatTabDiv) {
            this.kbChatTabDiv = document.createElement("div");
        }
    }

    private registerCustomTabs(): void {
        if (this.customTabsRegistered) {
            return;
        }
        this.ensureTabContainers();

        const self = this;
        this.customTab = this.addTab({
            type: TAB_TYPE,
            async init() {
                if (!this.element) return;
                // 无论此前是未决还是失败，都先等待同一个可重试身份屏障。
                try {
                    await self.ensureDeviceIdentityForRuntime();
                } catch {
                    self.renderIdentityUnavailableNotice(this.element as HTMLElement);
                    return;
                }
                if (self.deviceViewBlocked) {
                    self.renderHomepageBlockedNotice(this.element as HTMLElement);
                    return;
                }
                try {
                    await self.recoverDeviceViewRuntimeAfterIdentityReady();
                } catch (error) {
                    if (error instanceof DeviceViewMigrationBlockedError) {
                        self.renderHomepageBlockedNotice(this.element as HTMLElement);
                        return;
                    }
                    self.renderHomepageUnavailableNotice(this.element as HTMLElement);
                    return;
                }
                self.destroyHomepageInstance();
                self.homepageTabDiv = document.createElement("div");
                self.prepareHomepageTabElement(this.element as HTMLElement);
                self.prepareHomepageContainer(self.homepageTabDiv);
                this.element.replaceChildren(self.homepageTabDiv);
                self.createHomepageInstance();
            },
            beforeDestroy() {
                window.dispatchEvent(new CustomEvent("siyuan-homepage:tab-before-destroy"));
            },
            destroy() {
                self.destroyHomepageInstance();
                self.homepageTabDiv = null;
                this.element?.replaceChildren();
            },
            resize() {
                self.homepageTabDiv?.dispatchEvent(new CustomEvent("homepage-tab-resize"));
            },
            update() {
                self.homepageTabDiv?.dispatchEvent(new CustomEvent("homepage-tab-update"));
            },
        });

        this.enhancedDiaryWorkspaceTab = this.addTab({
            type: ENHANCED_DIARY_WORKSPACE_TAB_TYPE,
            async init() {
                if (!this.element) {
                    return;
                }

                if (self.isMobileFrontend()) {
                    showMessage("移动端工作台还在开发中", 3000);
                    return;
                }

                if (self.enhancedDiaryWorkspaceTabDiv) {
                    this.element.appendChild(self.enhancedDiaryWorkspaceTabDiv);
                    if (!self.enhancedDiaryWorkspaceInstance) {
                        self.createEnhancedDiaryWorkspaceInstance();
                    }
                }
            },
        });

        this.kbChatTab = this.addTab({
            type: KB_CHAT_TAB_TYPE,
            async init() {
                if (!this.element) {
                    return;
                }

                self.prepareKbChatContainer(this.element as HTMLElement);
                if (!self.kbChatTabDiv) return;

                let aiKbTabEnabled = true;
                const primarySurface: DeviceViewSurface = self.isMobile
                    ? "mobile-homepage"
                    : "desktop-homepage";
                if (!self.deviceViewBlocked && self.readyDeviceViewSurfaces.has(primarySurface)) {
                    try {
                        const config = await self.getPluginConfig();
                        aiKbTabEnabled = config.aiKbTabEnabled ?? true;
                    } catch {
                        aiKbTabEnabled = true;
                    }
                }
                if (aiKbTabEnabled === false) {
                    self.kbChatTabDiv.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--b3-theme-on-surface-light,#666);font-size:13px;">此功能需要开启 AI 知识库标签页，请在主页设置中启用「开启标签页对话」</div>`;
                    this.element.appendChild(self.kbChatTabDiv);
                    return;
                }

                this.element.appendChild(self.kbChatTabDiv);
                if (!self.kbChatInstance) {
                    self.createKbChatInstance();
                }
            },
        });

        this.customTabsRegistered = true;
    }

    private prepareHomepageTabElement(tabElement: HTMLElement): void {
        tabElement.style.height = "100%";
        tabElement.style.width = "100%";
        tabElement.style.minHeight = "0";
        tabElement.style.overflow = "auto";
        tabElement.style.display = "block";
    }

    private prepareHomepageContainer(container: HTMLDivElement): void {
        container.classList.add("siyuan-homepage-tab-root");
        container.style.minHeight = "100%";
        container.style.width = "100%";
        container.style.boxSizing = "border-box";
    }

    // 创建主页实例（仅在容器已连接到 DOM 时执行）
    private createHomepageInstance(): void {
        if (!this.isHomepageDeviceViewAvailable()) {
            return;
        }
        if (!this.homepageTabDiv || !this.homepageTabDiv.isConnected) {
            // 容器未创建或未进入 DOM，暂不 mount
            return;
        }
        try {
            this.prepareHomepageContainer(this.homepageTabDiv);
            this.homepageTabDiv.innerHTML = "";
            this.homepageInstance = mount(Homepage as any, {
                target: this.homepageTabDiv,
                props: {
                    app: this.app,
                    plugin: this,
                }
            } as any);
        } catch (e) {
            this.homepageInstance = null;
            if (this.homepageTabDiv) {
                this.homepageTabDiv.innerHTML = "";
            }
            console.warn("[Homepage] 创建主页实例失败:", e);
        }
    }

    // 销毁主页实例
    private destroyHomepageInstance(): void {
        if (this.homepageInstance) {
            try {
                unmount(this.homepageInstance);
            } catch (e) {
                console.warn("[Plugin] 销毁主页实例失败:", e);
            }
            this.homepageInstance = null;
        }
        // 清空容器内容
        if (this.homepageTabDiv) {
            this.homepageTabDiv.innerHTML = "";
        }
    }

    // 判断主页设备视图是否可用。
    private isHomepageDeviceViewAvailable(): boolean {
        return this.deviceViewBlocked === null
            && this.homepageSurfaceUnavailable === null
            && this.homepageSurfaceReadError === null
            && this.deviceIdentityUnavailable === null;
    }

    /**
     * 身份重试成功后执行完整设备视图恢复，不重复注册命令/Dock/事件监听器。
     * 顺序：confirm identity → migrate primary → sidebar readiness → shared migration → verify license。
     */
    private async recoverDeviceViewRuntimeAfterIdentityReady(): Promise<PluginConfig> {
        await this.ensureDeviceIdentityForRuntime();
        if (this.deviceViewBlocked) throw this.deviceViewBlocked;

        const primarySurface: DeviceViewSurface = this.isMobile ? "mobile-homepage" : "desktop-homepage";

        // primary 未 ready 或存在任何局部读取错误时，都必须真实重读。
        if (
            !this.readyDeviceViewSurfaces.has(primarySurface)
            || this.homepageSurfaceUnavailable !== null
            || this.homepageSurfaceReadError !== null
        ) {
            try {
                const context = getCurrentDeviceViewContext(this, primarySurface);
                await ensureCurrentDeviceViewMigrated(context);
            } catch (error) {
                this.captureHomepageSurfaceError(primarySurface, error);
                if (error instanceof DeviceViewMigrationBlockedError) {
                    if (markDeviceViewBlockedNotified(error.deviceId, error.surface)) {
                        showMessage(formatDeviceViewBlockedUserMessage(error), 0, "error");
                    }
                }
                throw error;
            }
        }

        // sidebar 失败只影响 sidebar，并保留 primary 的独立恢复结果。
        if (!this.isMobile && !this.readyDeviceViewSurfaces.has("desktop-sidebar")) {
            try {
                const sidebarContext = getCurrentDeviceViewContext(this, "desktop-sidebar");
                await ensureCurrentDeviceViewMigrated(sidebarContext);
                this.readyDeviceViewSurfaces.add("desktop-sidebar");
            } catch (error) {
                console.warn("[Homepage] desktop-sidebar readiness 未完成；仅侧边栏暂不可用", error);
            }
        }

        try {
            const config = await this.getPluginConfig();
            this.clearHomepageSurfaceReadErrors(primarySurface);
            this.readyDeviceViewSurfaces.add(primarySurface);
            await this.initializeHomepageSurface(config);
            this.syncHomepageConfigDependentListeners(config);
            this.maybeStartLegacySharedWidgetMigration();
            return config;
        } catch (error) {
            this.captureHomepageSurfaceError(primarySurface, error);
            this.syncHomepageConfigDependentListeners(null);
            throw error;
        }
    }

    private maybeStartLegacySharedWidgetMigration(): void {
        if (this.legacySharedMigrationCompleted || this.legacySharedMigrationInFlight) return;
        const requiredSurfaces: DeviceViewSurface[] = this.isMobile
            ? ["mobile-homepage"]
            : ["desktop-homepage", "desktop-sidebar"];
        if (!requiredSurfaces.every((surface) => this.readyDeviceViewSurfaces.has(surface))) return;

        let migrationStart: Promise<void>;
        try {
            migrationStart = ensureLegacySharedWidgetMigration(this, requiredSurfaces);
        } catch (error) {
            console.warn("[Homepage] 启动共享组件历史数据迁移失败；surface 保持 ready，可在下次明确操作重试", error);
            return;
        }
        const migration = migrationStart
            .then(() => {
                this.legacySharedMigrationCompleted = true;
            })
            .catch((error) => {
                console.warn("[Homepage] 共享组件历史数据迁移失败；surface 保持 ready，可在下次明确操作重试", error);
            })
            .finally(() => {
                if (this.legacySharedMigrationInFlight === migration) {
                    this.legacySharedMigrationInFlight = null;
                }
            });
        this.legacySharedMigrationInFlight = migration;
    }

    // 在容器内渲染设备视图阻断安全提示；不调用 showMessage，不输出完整堆栈
    private renderHomepageBlockedNotice(container: HTMLElement): void {
        const error = this.deviceViewBlocked;
        if (!error) return;
        container.innerHTML = "";
        const root = document.createElement("div");
        root.className = "siyuan-homepage-blocked-notice";
        root.style.cssText = "height:100%;width:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:var(--b3-theme-background,#fff);color:var(--b3-theme-on-background,#333);";
        const card = document.createElement("div");
        card.style.cssText = "max-width:560px;line-height:1.7;font-size:14px;";
        const title = document.createElement("div");
        title.style.cssText = "font-weight:600;font-size:16px;margin-bottom:12px;color:var(--b3-theme-error,#d23f31);";
        title.textContent = "设备视图需要手动处理";
        const body = document.createElement("pre");
        body.style.cssText = "white-space:pre-wrap;word-break:break-word;margin:0;font-family:inherit;";
        body.textContent = formatDeviceViewBlockedUserMessage(error);
        card.appendChild(title);
        card.appendChild(body);
        root.appendChild(card);
        container.appendChild(root);
    }

    // 在容器内渲染主页视图暂不可用提示；不调用 showMessage，不输出错误细节
    private renderHomepageUnavailableNotice(container: HTMLElement): void {
        container.innerHTML = "";
        const root = document.createElement("div");
        root.className = "siyuan-homepage-unavailable-notice";
        root.style.cssText = "height:100%;width:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:var(--b3-theme-background,#fff);color:var(--b3-theme-on-background,#333);";
        const card = document.createElement("div");
        card.style.cssText = "max-width:560px;line-height:1.7;font-size:14px;";
        const title = document.createElement("div");
        title.style.cssText = "font-weight:600;font-size:16px;margin-bottom:12px;color:var(--b3-theme-on-surface-light,#666);";
        title.textContent = "主页视图暂不可用";
        const body = document.createElement("div");
        body.style.cssText = "white-space:pre-wrap;word-break:break-word;";
        body.textContent = "当前设备主页视图暂时无法安全读取。请稍后关闭并重新打开主页重试；插件不会主动重建或覆盖视图。";
        card.appendChild(title);
        card.appendChild(body);
        root.appendChild(card);
        container.appendChild(root);
    }

    private renderIdentityUnavailableNotice(container: HTMLElement): void {
        container.replaceChildren();
        const root = document.createElement("div");
        root.className = "homepage-blocked-notice";
        const card = document.createElement("div");
        card.className = "homepage-blocked-card";
        const title = document.createElement("div");
        title.className = "homepage-blocked-title";
        title.textContent = "设备身份暂不可用";
        const body = document.createElement("div");
        body.className = "homepage-blocked-body";
        body.textContent = "思源系统配置读取失败，主页功能暂不可用。请检查网络连接或重启思源后重新打开主页。";
        card.appendChild(title);
        card.appendChild(body);
        root.appendChild(card);
        container.appendChild(root);
    }

    private createEnhancedDiaryWorkspaceInstance(): void {
        if (!this.enhancedDiaryWorkspaceTabDiv || !this.enhancedDiaryWorkspaceTabDiv.isConnected) {
            return;
        }

        this.enhancedDiaryWorkspaceInstance = mount(EnhancedDiaryWorkspacePage as any, {
            target: this.enhancedDiaryWorkspaceTabDiv,
            props: {
                plugin: this,
                initialTab: this.enhancedDiaryWorkspaceInitialTab,
            },
        } as any);
    }

    private destroyEnhancedDiaryWorkspaceInstance(): void {
        if (this.enhancedDiaryWorkspaceInstance) {
            try {
                unmount(this.enhancedDiaryWorkspaceInstance);
            } catch (e) {
                console.warn("[Plugin] 销毁强化日记工作台实例失败:", e);
            }
            this.enhancedDiaryWorkspaceInstance = null;
        }

        if (this.enhancedDiaryWorkspaceTabDiv) {
            this.enhancedDiaryWorkspaceTabDiv.innerHTML = "";
        }
    }

    private createKbChatInstance(): void {
        if (!this.kbChatTabDiv || !this.kbChatTabDiv.isConnected) {
            return;
        }

        this.kbChatInstance = mount(KbPremiumGatePanel as any, {
            target: this.kbChatTabDiv,
            props: {
                plugin: this,
                placement: "tab",
                onOpenSettings: () => this.openKbSettingsDialog(),
            },
        } as any);
    }

    private prepareKbChatContainer(tabElement: HTMLElement): void {
        tabElement.style.height = "100%";
        tabElement.style.width = "100%";
        tabElement.style.minHeight = "0";
        tabElement.style.display = "flex";
        tabElement.style.flexDirection = "column";
        tabElement.style.overflow = "hidden";

        if (!this.kbChatTabDiv) {
            return;
        }
        this.kbChatTabDiv.style.height = "100%";
        this.kbChatTabDiv.style.width = "100%";
        this.kbChatTabDiv.style.minHeight = "0";
        this.kbChatTabDiv.style.flex = "1 1 auto";
        this.kbChatTabDiv.style.display = "flex";
        this.kbChatTabDiv.style.overflow = "hidden";
    }

    private destroyKbChatInstance(): void {
        if (this.kbChatInstance) {
            try {
                unmount(this.kbChatInstance);
            } catch (e) {
                console.warn("[Plugin] destroy KB chat instance failed:", e);
            }
            this.kbChatInstance = null;
        }

        if (this.kbChatTabDiv) {
            this.kbChatTabDiv.innerHTML = "";
        }
    }

    private async verifyLicense() {
        try {
            const vipInfo = await advanced.updateVIP();
            const userName = vipInfo.USER_NAME;
            const userId = vipInfo.USER_ID;
            const licenseResult = await advanced.verifyLicense(this, userName, userId);

            if (licenseResult.valid && licenseResult.code === 0 && licenseResult.userInfo) {
                this.ADVANCED = true;
                window.dispatchEvent(new CustomEvent("homepage-advanced-ready"));

                if (licenseResult.legacyDeprecated) {
                    showMessage(
                        "⚠️ 当前使用的是旧版激活码。激活方式已更换，请联系作者换发新版激活码。旧版激活方式将只兼容到 2026 年 8 月 31 日，请尽快联系作者换发新版激活码。",
                        10000
                    );
                }

                const remainingDays = licenseResult.userInfo.remainingDays;
                const isLifetime = licenseResult.userInfo.isLifetime === true;

                if (!isLifetime) {
                    if (remainingDays === 7) {
                        showMessage("您的激活码还有 7 天过期，建议及时更新！");
                    } else if (remainingDays === 3) {
                        showMessage("您的激活码还有 3 天过期，建议及时更新！");
                    } else if (remainingDays === 1) {
                        showMessage("您的激活码还有 1 天过期，建议及时更新！");
                    }
                }
            } else {
                this.ADVANCED = false;
                window.dispatchEvent(new CustomEvent("homepage-advanced-unavailable"));

                if ([31, 40, 43].includes(licenseResult.code) && licenseResult.error) {
                    showMessage(licenseResult.error);
                }
            }
        } catch (error) {
            console.error("会员校验失败:", error);
            this.ADVANCED = false;
            window.dispatchEvent(new CustomEvent("homepage-advanced-unavailable"));
        }
    }

    private registerIcon() {
        this.addIconIfMissing("iconhomepage", HOMEPAGE_ICON_SVG);
        this.addIconIfMissing("iconTask", TASK_ICON_SVG);
        this.addIconIfMissing("iconSparkles", SPARKLES_ICON_SVG);
        this.addIconIfMissing("iconNotebrain", NOTEBRAIN_ICON_SVG);
    }

    private addIconIfMissing(symbolId: string, svg: string): void {
        if (document.querySelector(`symbol#${symbolId}`)) {
            return;
        }
        this.addIcons(svg);
    }

    private registerHomepageCommand(): void {
        if (this.homepageCommandRegistered) return;
        this.addCommand({
            langKey: "打开主页",
            hotkey: "⇧⌘H",
            callback: () => {
                // 检查是否为移动端
                if (this.isMobile) {
                    showMessage("❌移动端不支持快捷键开启");
                    return;
                } else {
                    this.openHomepage();
                }
            },
        });
        this.homepageCommandRegistered = true;
    }

    private syncConfigCommands(config: PluginConfig | null): void {
        const shouldRegisterQuickNotes = config?.quickNotesEnabled === true;
        if (shouldRegisterQuickNotes && !this.quickNotesCommandRegistered) {
            this.addCommand({
                langKey: "快速笔记",
                hotkey: "⇧⌘Q",
                callback: () => {
                    void this.openQuickNotesDialog();
                },
            });
            this.quickNotesCommandRegistered = true;
        } else if (!shouldRegisterQuickNotes && this.quickNotesCommandRegistered) {
            for (let index = this.commands.length - 1; index >= 0; index -= 1) {
                if (this.commands[index]?.langKey === "快速笔记") this.commands.splice(index, 1);
            }
            this.quickNotesCommandRegistered = false;
        }
    }

    private async openQuickNotesDialog(): Promise<void> {
        try {
            const config = await this.getPluginConfig();
            const quickNotesEnabled = config.quickNotesEnabled;
            const quickNotesPosition = config.quickNotesPosition;
            const quickNotesTimestampEnabled = config.quickNotesTimestampEnabled;
            const quickNotesAddPosition = config.quickNotesAddPosition;

            if (!quickNotesEnabled) {
                showMessage("❌请先在主页设置中开启快速笔记");
                return;
            } else if (!quickNotesPosition || !String(quickNotesPosition).trim()) {
                showMessage("❌请先在主页设置中设置快速笔记的位置");
                return;
            } else {
                const dialog = svelteDialog({
                    title: "快速笔记",
                    constructor: (containerEl: HTMLElement) => {
                        return mount(QuickNotesDialog as any, {
                            target: containerEl,
                            props: {
                                quickNotesPosition,
                                quickNotesTimestampEnabled,
                                quickNotesAddPosition,
                                close: () => {
                                    dialog.close();
                                },
                            },
                        });
                    },
                });
            }
        } catch (error) {
            console.warn("[Homepage] 打开快速笔记失败:", error);
            showMessage("快速笔记配置暂不可读，请稍后重试");
        }
    }

    private registerHomepageTopBar(): void {
        if (this.homepageTopBarElement?.isConnected) return;
        this.removeExistingTopBar("homepage", this.homepageTopBarElement);
        const homepageTopBar = this.addTopBar({
            icon: "iconhomepage",
            title: "打开主页",
            position: "left",
            callback: () => {
                if (this.isMobile) {
                    void this.openMobileHomepage();
                } else {
                    void this.openHomepage();
                }
            }
        });
        homepageTopBar.dataset.siyuanHomepageTopbar = "homepage";
        this.homepageTopBarElement = homepageTopBar;
    }

    private syncKbTopBar(config: PluginConfig | null): void {
        if (config?.aiKbTabEnabled === true) {
            if (this.kbTopBarElement?.isConnected) return;
            this.removeExistingTopBar("kb-chat", this.kbTopBarElement);
            const kbTopBar = this.addTopBar({
                icon: "iconNotebrain",
                title: "打开 AI 知识库",
                position: "left",
                callback: () => this.openKbChatTab(),
            });
            kbTopBar.dataset.siyuanHomepageTopbar = "kb-chat";
            this.kbTopBarElement = kbTopBar;
        } else {
            this.removeExistingTopBar("kb-chat", this.kbTopBarElement);
            this.kbTopBarElement = null;
        }
    }

    private removeExistingTopBar(kind: "homepage" | "kb-chat", currentElement: HTMLElement | null): void {
        currentElement?.remove();
        document.querySelectorAll(`[data-siyuan-homepage-topbar="${kind}"]`).forEach((element) => {
            element.remove();
        });
    }

    private removeOwnedTopBarElements(): void {
        this.removeExistingTopBar("homepage", this.homepageTopBarElement);
        this.removeExistingTopBar("kb-chat", this.kbTopBarElement);
        this.homepageTopBarElement = null;
        this.kbTopBarElement = null;
    }

    private isMobileFrontend(): boolean {
        const frontEnd = getFrontend();
        return this.isMobile || frontEnd === "mobile" || frontEnd === "browser-mobile" || frontEnd.includes("mobile");
    }

    private isNewWindow(): boolean {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has("json");
    }

    private buildMobileQuickActions(config: PluginConfig): MobileQuickAction[] {
        const runById: Record<MobileQuickActionId, () => void | Promise<void>> = {
            "accounting-record": () => openAccountingDetailDialogFromPlugin(this, "record"),
            "mobile-homepage": () => this.openMobileHomepage(),
            "enhanced-diary-workspace": () => this.openEnhancedDiaryWorkspace(),
            "ai-knowledge-base": () => this.openMobileKbChat(),
            "quick-notes": () => this.openQuickNotesDialog(),
            "mobile-settings": () => this.openMobileSettingsDialog(),
        };
        const definitionById = new Map(MOBILE_QUICK_ACTION_DEFINITIONS.map((item) => [item.id, item]));

        return normalizeMobileQuickActionItems(config.mobileQuickActionItems)
            .filter((item) => item.enabled)
            .sort((a, b) => a.order - b.order)
            .map((item) => {
                const definition = definitionById.get(item.id);
                if (!definition) return null;
                return {
                    id: definition.id,
                    label: definition.label,
                    description: definition.description,
                    icon: definition.icon,
                    run: runById[definition.id],
                };
            })
            .filter((item): item is MobileQuickAction => item !== null);
    }

    private mountMobileQuickActions(config: PluginConfig): void {
        if (this.isNewWindow() || !this.isMobileFrontend() || !this.ADVANCED || config.mobileQuickActionsEnabled === false) {
            this.destroyMobileQuickActions();
            return;
        }

        const buttonSize = normalizeMobileQuickActionButtonSize(config.mobileQuickActionsButtonSize);
        const actions = this.buildMobileQuickActions(config);
        if (actions.length === 0) {
            this.destroyMobileQuickActions();
            return;
        }

        this.destroyMobileQuickActions();

        const host = document.createElement("div");
        host.dataset.siyuanHomepageMobileQuickActions = "true";
        host.className = "siyuan-homepage-mobile-quick-actions-host";
        document.body.appendChild(host);

        this.mobileQuickActionsHost = host;
        this.mobileQuickActionsInstance = mount(MobileQuickActions as any, {
            target: host,
            props: {
                actions,
                buttonSize,
                position: normalizeMobileQuickActionsPosition(config.mobileQuickActionsPosition, {
                    viewportHeight: window.innerHeight,
                    buttonSize,
                }),
                onPositionChange: (
                    position: MobileQuickActionsPosition,
                    options?: { immediate?: boolean },
                ) => this.saveMobileQuickActionsPosition(position, options),
            },
        });
    }

    private saveMobileQuickActionsPosition(
        position: MobileQuickActionsPosition,
        options: { immediate?: boolean } = {},
    ): void {
        const normalizedPosition = normalizeMobileQuickActionsPosition(position, {
            viewportHeight: window.innerHeight,
        });
        this.pendingMobileQuickActionsPosition = normalizedPosition;

        if (options.immediate === true) {
            if (this.mobileQuickActionsPositionSaveTimer !== null) {
                clearTimeout(this.mobileQuickActionsPositionSaveTimer);
                this.mobileQuickActionsPositionSaveTimer = null;
            }
            this.pendingMobileQuickActionsPosition = null;
            void this.persistMobileQuickActionsPosition(normalizedPosition).catch((error) => {
                this.restorePendingMobileQuickActionsPosition(normalizedPosition, error);
            });
            return;
        }

        if (this.mobileQuickActionsPositionSaveTimer !== null) return;
        this.mobileQuickActionsPositionSaveTimer = window.setTimeout(() => {
            this.mobileQuickActionsPositionSaveTimer = null;
            const pendingPosition = this.pendingMobileQuickActionsPosition;
            this.pendingMobileQuickActionsPosition = null;
            if (pendingPosition) {
                void this.persistMobileQuickActionsPosition(pendingPosition).catch((error) => {
                    this.restorePendingMobileQuickActionsPosition(pendingPosition, error);
                });
            }
        }, 160);
    }

    private restorePendingMobileQuickActionsPosition(
        position: MobileQuickActionsPosition,
        error: unknown,
    ): void {
        if (!this.pendingMobileQuickActionsPosition) {
            this.pendingMobileQuickActionsPosition = position;
        }
        console.warn("[Homepage] 保存移动快捷操作位置失败，已保留最后待保存位置:", error);
    }

    private async persistMobileQuickActionsPosition(position: MobileQuickActionsPosition): Promise<void> {
        const context = getCurrentDeviceViewContext(this, "mobile-homepage");
        await loadHomepageConfigDataStrict(this, "mobile-homepage");
        const current = await readDeviceViewSettings(context);
        if (!current) throw new Error("当前设备 mobile-homepage 的 view.json 缺失");
        await updateDeviceViewSettings(context, (config) => ({
            ...config,
            mobileQuickActionsPosition: normalizeMobileQuickActionsPosition(position),
        }), { expectedRevision: current.revision });
    }

    private destroyMobileQuickActions(): void {
        if (this.mobileQuickActionsInstance) {
            try {
                unmount(this.mobileQuickActionsInstance);
            } catch {
                // ignore mobile quick actions cleanup errors
            }
        }
        this.mobileQuickActionsHost?.remove();
        this.mobileQuickActionsInstance = null;
        this.mobileQuickActionsHost = null;
    }

    private async openHomepage() {
        this.ensureTabContainers();
        this.registerCustomTabs();
        openTab({
            app: this.app,
            custom: {
                icon: "iconhomepage",
                title: "首页",
                data: { text: "思源笔记首页" },
                id: TAB_ID,
            },
        });
    }

    public openEnhancedDiaryWorkspace(initialTab = "overview"): void {
        if (!this.ADVANCED) {
            showMessage("强化日记工作台为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }

        if (this.isMobileFrontend()) {
            this.openMobileEnhancedDiaryWorkspace(initialTab);
            return;
        }

        this.ensureTabContainers();
        this.registerCustomTabs();
        this.enhancedDiaryWorkspaceInitialTab = initialTab;
        openTab({
            app: this.app,
            custom: {
                icon: "iconTask",
                title: "强化日记工作台",
                data: { text: "强化日记工作台" },
                id: ENHANCED_DIARY_WORKSPACE_TAB_ID,
            },
        });

        window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("siyuan-homepage:enhanced-diary-workspace-tab", {
                detail: { tab: initialTab },
            }));
        }, 0);
    }

    public closeMobileEnhancedDiaryWorkspace(): void {
        const dialog = this.currentMobileEnhancedDiaryWorkspaceDialog;
        if (!dialog) return;

        this.currentMobileEnhancedDiaryWorkspaceDialog = null;
        try {
            dialog.close();
        } catch (error) {
            console.warn("[Plugin] 关闭移动强化日记工作台失败:", error);
        }
    }

    private openMobileEnhancedDiaryWorkspace(initialTab: string): void {
        if (this.currentMobileEnhancedDiaryWorkspaceDialog) {
            window.dispatchEvent(new CustomEvent("siyuan-homepage:enhanced-diary-workspace-tab", {
                detail: { tab: initialTab },
            }));
            return;
        }

        let dialogRef: ReturnType<typeof svelteDialog> | null = null;
        const closeWorkspace = () => {
            if (!dialogRef) return;
            dialogRef.close();
            if (this.currentMobileEnhancedDiaryWorkspaceDialog === dialogRef) {
                this.currentMobileEnhancedDiaryWorkspaceDialog = null;
            }
        };

        dialogRef = svelteDialog({
            title: "强化日记工作台",
            width: "100vw",
            height: "100dvh",
            constructor: (containerEl: HTMLElement) => {
                return mount(EnhancedDiaryWorkspacePage as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        initialTab,
                        mobile: true,
                        onClose: closeWorkspace,
                    },
                } as any);
            },
            callback: () => {
                if (this.currentMobileEnhancedDiaryWorkspaceDialog === dialogRef) {
                    this.currentMobileEnhancedDiaryWorkspaceDialog = null;
                }
            },
        });
        this.currentMobileEnhancedDiaryWorkspaceDialog = dialogRef;
        dialogRef.dialog.element.classList.add("enhanced-diary-workspace-mobile-dialog");
    }

    public openKbSettingsDialog(): void {
        const dialog = svelteDialog({
            title: "AI 知识库设置",
            width: "960px",
            height: "72vh",
            constructor: (containerEl: HTMLElement) => {
                return mount(KbSettingsPanel as any, {
                    target: containerEl,
                    props: {
                        close: () => {
                            dialog.close();
                        },
                    },
                } as any);
            },
        });
    }

    public async openKbChatTab(): Promise<void> {
        if (this.isMobileFrontend()) {
            this.openMobileKbChat();
            return;
        }

        const config = await this.getPluginConfig();
        if (config.aiKbTabEnabled === false) {
            showMessage("AI 知识库标签页对话未开启，请在主页设置中启用", 3000);
            return;
        }

        this.ensureTabContainers();
        this.registerCustomTabs();
        openTab({
            app: this.app,
            custom: {
                icon: "iconNotebrain",
                title: "AI 知识库",
                data: { text: "AI 知识库对话" },
                id: KB_CHAT_TAB_ID,
            },
        });
    }

    private findKbDockButton(): HTMLElement | null {
        const exactSelector = `.dock__item[data-type="${this.name}${KB_DOCK_TYPE}"]`;
        const fuzzySelectors = [
            `.dock__item[data-type$="${KB_DOCK_TYPE}"]`,
            `.dock__item[data-type*="${KB_DOCK_TYPE}"]`,
            `.dock__item[data-title="AI 知识库对话"]`,
            `.dock__item[aria-label*="AI 知识库对话"]`,
        ];

        // Collect all candidates: [element, dockContainerId or null]
        const candidates: Array<{ el: HTMLElement; container: string | null }> = [];

        // Search each dock container by priority, then document-wide
        const dockContainers = ["#dockRight", "#dockLeft", "#dockBottom"];
        for (const containerId of dockContainers) {
            const container = document.querySelector(containerId);
            if (!container) continue;
            const el = container.querySelector(exactSelector) as HTMLElement | null;
            if (el) candidates.push({ el, container: containerId });
        }

        // If exact selector found nothing, try document-wide
        if (candidates.length === 0) {
            const el = document.querySelector(exactSelector) as HTMLElement | null;
            if (el) {
                const container = el.closest("#dockRight, #dockLeft, #dockBottom");
                candidates.push({ el, container: container?.id ?? null });
            }
        }

        // If still nothing, fall back to fuzzy selectors document-wide
        if (candidates.length === 0) {
            for (const selector of fuzzySelectors) {
                const el = document.querySelector(selector) as HTMLElement | null;
                if (el) {
                    const container = el.closest("#dockRight, #dockLeft, #dockBottom");
                    candidates.push({ el, container: container?.id ?? null });
                    break;
                }
            }
        }

        if (candidates.length === 0) return null;

        // Preference: active button > visible button > first found
        const active = candidates.find((c) => c.el.classList.contains("dock__item--active"));
        if (active) return active.el;

        const visible = candidates.find((c) => {
            const style = getComputedStyle(c.el);
            return style.display !== "none" && style.visibility !== "hidden";
        });
        if (visible) return visible.el;

        return candidates[0].el;
    }

    private isKbDockContainerMounted(): boolean {
        return !!document.querySelector("[data-kb-dock-container]");
    }

    private isKbDockChatReady(): boolean {
        const container = document.querySelector("[data-kb-dock-container]");
        return !!container?.querySelector(".kb-main-panel");
    }

    private async waitForKbDockContainerMounted(timeoutMs = 1500): Promise<boolean> {
        if (this.isKbDockContainerMounted()) return true;
        const step = 80;
        let elapsed = 0;
        while (elapsed < timeoutMs) {
            await new Promise((r) => setTimeout(r, step));
            elapsed += step;
            if (this.isKbDockContainerMounted()) return true;
        }
        return false;
    }

    private async waitForKbDockChatReady(timeoutMs = 1500): Promise<boolean> {
        if (this.isKbDockChatReady()) return true;
        const step = 80;
        let elapsed = 0;
        while (elapsed < timeoutMs) {
            await new Promise((r) => setTimeout(r, step));
            elapsed += step;
            if (this.isKbDockChatReady()) return true;
        }
        return false;
    }

    private async waitForKbDockButton(timeoutMs = 3000): Promise<HTMLElement | null> {
        const found = this.findKbDockButton();
        if (found) return found;
        const step = 80;
        let elapsed = 0;
        while (elapsed < timeoutMs) {
            await new Promise((r) => setTimeout(r, step));
            elapsed += step;
            const btn = this.findKbDockButton();
            if (btn) return btn;
        }
        return null;
    }

    private getKbDockButtonSide(button: HTMLElement | null): "right" | "left" | "bottom" | "unknown" {
        if (!button) return "unknown";
        if (button.closest("#dockRight")) return "right";
        if (button.closest("#dockLeft")) return "left";
        if (button.closest("#dockBottom")) return "bottom";
        return "unknown";
    }

    public async openKbDock(): Promise<boolean> {
        if (this.isMobileFrontend()) {
            pushAgentDebugEvent("SELECTION_AI_MOBILE_CHAT_OPEN", {
                isMobile: true,
            }, "info");
            this.openMobileKbChat();
            return true;
        }

        const config = await this.getPluginConfig();
        if (config.aiKbDockEnabled === false) {
            pushAgentDebugEvent("SELECTION_AI_DOCK_OPEN_FAILED", {
                reason: "ai_kb_dock_disabled",
                isMobile: false,
            }, "warn");
            showMessage("此功能需要开启 AI 知识库侧边栏，请在主页设置中启用「开启侧边栏对话」", 3000);
            return false;
        }

        pushAgentDebugEvent("SELECTION_AI_DOCK_OPEN_START", {
            isMobile: false,
            dockRegistered: this.kbDockRegistered,
            chatReady: this.isKbDockChatReady(),
        }, "info");

        // 确保 dock 已注册（幂等守护，不会重复 addDock）
        if (!this.kbDockRegistered) {
            this.registerKbDock();
        }

        // 等待 dock 按钮出现在 DOM 中（addDock 后可能延迟）
        const dockButton = await this.waitForKbDockButton();
        if (!dockButton) {
            pushAgentDebugEvent("SELECTION_AI_DOCK_BUTTON_MISSING", {
                hasButton: false,
            }, "warn");
            showMessage("未能自动打开 AI 知识库侧边栏，请确认已开启侧边栏对话后重试。", 4000);
            return false;
        }

        // 判断 dock 按钮所在位置，打开对应侧栏
        const dockSide = this.getKbDockButtonSide(dockButton);
        const layout = (window as any).siyuan?.layout;
        const hasDockApi = !!layout;

        switch (dockSide) {
            case "left":
                layout?.leftDock?.showDock?.(true);
                break;
            case "bottom":
                layout?.bottomDock?.showDock?.(true);
                break;
            case "right":
            default:
                layout?.rightDock?.showDock?.(true);
                break;
        }

        pushAgentDebugEvent("SELECTION_AI_DOCK_SHOW_DOCK", {
            dockSide,
            hasDockApi,
        }, "info");

        const buttonActive = dockButton.classList.contains("dock__item--active");
        pushAgentDebugEvent("SELECTION_AI_DOCK_BUTTON_FOUND", {
            hasButton: true,
            buttonActive,
            dockSide,
        }, "info");

        if (!buttonActive) {
            dockButton.click();
        }

        const containerMounted = await this.waitForKbDockContainerMounted();
        pushAgentDebugEvent("SELECTION_AI_DOCK_CONTAINER_READY", {
            containerMounted,
        }, "info");

        if (!containerMounted) {
            showMessage("未能自动打开 AI 知识库侧边栏，请确认已开启侧边栏对话后重试。", 4000);
            return false;
        }

        const chatReady = await this.waitForKbDockChatReady();
        pushAgentDebugEvent("SELECTION_AI_DOCK_CHAT_READY", {
            chatReady,
        }, "info");

        if (chatReady) {
            return true;
        }

        showMessage("AI 知识库侧边栏已打开，但问答面板尚未就绪，请确认已开启高级功能后再使用选区问答", 4000);
        return false;
    }

    private async openMobileHomepage(): Promise<void> {
        try {
            await this.ensureDeviceIdentityForRuntime();
            await this.recoverDeviceViewRuntimeAfterIdentityReady();
            await this.verifyLicense();
        } catch (error) {
            if (error instanceof DeviceViewMigrationBlockedError) {
                showMessage(formatDeviceViewBlockedUserMessage(error), 0, "error");
            } else {
                showMessage("移动主页暂不可用；未修改现有主页数据，请稍后重试。", 5000, "error");
            }
            return;
        }
        if (!this.ADVANCED) {
            showMessage("移动端主页为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }

        // 如果已存在对话框，先关闭
        if (this.currentMobileDialog) {
            this.currentMobileDialog.close();
            this.currentMobileDialog = null;
        }

        this.currentMobileDialog = svelteDialog({
            title: "移动主页",
            width: "100vw",
            height: "100dvh",
            constructor: (containerEl: HTMLElement) => {
                return mount(MobileHomepage as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        close: () => {
                            this.currentMobileDialog?.close();
                            this.currentMobileDialog = null;
                        },
                    },
                });
            },
            // dialog 任何关闭路径（包括自身关闭按钮）都会触发，确保引用正确置空
            callback: () => {
                this.currentMobileDialog = null;
            },
        });
        this.currentMobileDialog.dialog.element.classList.add("mobile-homepage-dialog");
    }

    private openMobileKbChat(): void {
        if (this.currentMobileKbDialog) {
            this.currentMobileKbDialog.close();
            this.currentMobileKbDialog = null;
        }

        this.currentMobileKbDialog = svelteDialog({
            title: "AI 知识库",
            width: "100vw",
            height: "100dvh",
            constructor: (containerEl: HTMLElement) => {
                return mount(KbPremiumGatePanel as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        placement: "mobile",
                        onOpenSettings: () => this.openKbSettingsDialog(),
                    },
                });
            },
            callback: () => {
                this.currentMobileKbDialog = null;
            },
        });
        this.currentMobileKbDialog.dialog.element.classList.add("mobile-kb-chat-dialog");
    }

    private openMobileSettingsDialog(): void {
        if (!this.ADVANCED) {
            showMessage("移动端设置为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }

        if (this.currentMobileSettingsDialog) {
            this.currentMobileSettingsDialog.close();
            this.currentMobileSettingsDialog = null;
        }

        this.currentMobileSettingsDialog = svelteDialog({
            title: "移动端设置",
            width: "100vw",
            height: "100dvh",
            constructor: (containerEl: HTMLElement) => {
                return mount(MobileQuickActionsSettingsDialog as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        close: () => {
                            this.currentMobileSettingsDialog?.close();
                            this.currentMobileSettingsDialog = null;
                        },
                    },
                });
            },
            callback: () => {
                this.currentMobileSettingsDialog = null;
            },
        });
        this.currentMobileSettingsDialog.dialog.element.classList.add("mobile-quick-actions-settings-dialog");
    }

    private async getPluginConfig(): Promise<PluginConfig> {
        const surface = this.isMobileFrontend() ? "mobile-homepage" : "desktop-homepage";
        return (await loadHomepageConfigDataStrict(this, surface)).data as PluginConfig;
    }

    private registerDock() {
        if (this.sidebarDockRegistered) return;
        this.addDock({
            config: {
                position: "RightTop",
                size: { width: 200, height: 0 },
                icon: "iconhomepage",
                title: "主页侧边栏",
            },
            data: {
                text: "这是一个主页侧边栏。"
            },
            type: DOCK_TYPE,
            init: (dock) => {
                // 如果已有旧实例，先清理避免重复挂载
                if (this.sidebarDockInstance) {
                    try {
                        unmount(this.sidebarDockInstance);
                    } catch {
                        // 忽略卸载错误
                    }
                    this.sidebarDockInstance = null;
                }

                // 清理 dock.element 内可能残留的旧 sidebar 容器
                const existingContainer = dock.element.querySelector('[data-sidebar-container]');
                if (existingContainer) {
                    existingContainer.remove();
                }

                const sidebarContainer = document.createElement("div");
                sidebarContainer.setAttribute('data-sidebar-container', 'true');
                this.sidebarDockInstance = mount(Sidebar as any, {
                    target: sidebarContainer,
                    props: {
                        plugin: this,
                    }
                } as any);
                dock.element.appendChild(sidebarContainer);
            },
        });
        this.sidebarDockRegistered = true;
    }

    private registerKbDock() {
        if (this.kbDockRegistered) return;

        this.addDock({
            config: {
                position: "RightTop",
                size: { width: 360, height: 0 },
                icon: "iconNotebrain",
                title: "AI 知识库对话",
            },
            data: {},
            type: KB_DOCK_TYPE,
            init: (dock) => {
                const initGeneration = ++this.kbDockInitGeneration;
                if (this.kbDockInstance) {
                    try {
                        unmount(this.kbDockInstance);
                    } catch {
                        // ignore stale dock cleanup errors
                    }
                    this.kbDockInstance = null;
                }

                const existingContainer = dock.element.querySelector('[data-kb-dock-container]');
                if (existingContainer) {
                    existingContainer.remove();
                }

                const kbContainer = document.createElement("div");
                kbContainer.setAttribute("data-kb-dock-container", "true");
                kbContainer.style.height = "100%";
                kbContainer.style.width = "100%";

                const isCurrentDockInit = (): boolean => (
                    this.kbDockInitGeneration === initGeneration
                    && dock.element.isConnected
                );
                const appendContainerOnce = (): boolean => {
                    if (!isCurrentDockInit()) return false;
                    if (kbContainer.parentElement === dock.element) return true;
                    if (kbContainer.parentElement) return false;
                    dock.element.appendChild(kbContainer);
                    return true;
                };
                const showLocalNotice = (message: string): void => {
                    if (!appendContainerOnce()) return;
                    const notice = document.createElement("div");
                    notice.style.cssText = "display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--b3-theme-on-surface-light,#666);font-size:13px;";
                    notice.textContent = message;
                    kbContainer.replaceChildren(notice);
                };

                void (async () => {
                    try {
                        const config = await this.getPluginConfig();
                        if (!isCurrentDockInit()) return;
                        if (config.aiKbDockEnabled === false) {
                            showLocalNotice("此功能需要开启 AI 知识库侧边栏，请在主页设置中启用「开启侧边栏对话」");
                            return;
                        }
                        if (!appendContainerOnce()) return;
                        const instance = mount(KbPremiumGatePanel as any, {
                            target: kbContainer,
                            props: {
                                plugin: this,
                                placement: "dock",
                                onOpenSettings: () => this.openKbSettingsDialog(),
                            },
                        } as any);
                        if (!isCurrentDockInit()) {
                            try {
                                unmount(instance);
                            } catch {
                                // Dock 已销毁，忽略延迟实例的局部收尾错误。
                            }
                            return;
                        }
                        this.kbDockInstance = instance;
                    } catch {
                        if (!isCurrentDockInit()) return;
                        try {
                            showLocalNotice("AI 知识库配置暂不可读，请关闭并重新打开 Dock 后重试。");
                        } catch {
                            // Dock 局部提示失败也不得形成未处理的 Promise rejection。
                        }
                        console.warn("[Homepage] KB Dock 初始化失败，请关闭并重新打开 Dock 后重试");
                    }
                })();
            },
            destroy: () => {
                this.kbDockInitGeneration += 1;
                if (this.kbDockInstance) {
                    try {
                        unmount(this.kbDockInstance);
                    } catch {
                        // ignore dock cleanup errors
                    }
                    this.kbDockInstance = null;
                }
            },
        });

        this.kbDockRegistered = true;
        pushAgentDebugEvent("SELECTION_AI_DOCK_REGISTERED", { dockRegistered: true, isMobile: this.isMobile }, "info");
    }

    // 校验并规范化 docId
    private sanitizeDocId(value: unknown): string | null {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed || null;
    }

    // 从单个 DOM 元素尝试提取 data-node-id
    private extractNodeIdFromElement(el: unknown): string | null {
        if (!el || typeof el !== "object") return null;

        const elem = el as HTMLElement;

        // 先读 dataset.nodeId
        const datasetId = this.sanitizeDocId((elem as any).dataset?.nodeId);
        if (datasetId) return datasetId;

        // 再读 getAttribute("data-node-id")
        const attrId = this.sanitizeDocId(elem.getAttribute?.("data-node-id"));
        if (attrId) return attrId;

        // 再 closest("[data-node-id]")
        const closestEl = elem.closest?.("[data-node-id]");
        if (closestEl) {
            const closestId = this.sanitizeDocId((closestEl as any).dataset?.nodeId);
            if (closestId) return closestId;
            const closestAttrId = this.sanitizeDocId(closestEl.getAttribute?.("data-node-id"));
            if (closestAttrId) return closestAttrId;
        }

        return null;
    }

    // 从文档树菜单事件中解析 docId
    private resolveDocTreeMenuDocId(detail: any): string | null {
        // 1. 从 detail.elements 取
        if (Array.isArray(detail.elements)) {
            for (const element of detail.elements) {
                const id = this.extractNodeIdFromElement(element);
                if (id) return id;
            }
        }

        // 2. 从 detail.element / detail.target / detail.currentTarget 取
        const candidates = [detail.element, detail.target, detail.currentTarget];
        for (const candidate of candidates) {
            const id = this.extractNodeIdFromElement(candidate);
            if (id) return id;
        }

        // 3. 从明显字段兜底
        const fieldCandidates = [
            detail.data?.id,
            detail.id,
            detail.nodeId,
            detail.blockId,
        ];
        for (const field of fieldCandidates) {
            const id = this.sanitizeDocId(field);
            if (id) return id;
        }

        // 4. DOM 兜底：借鉴 QYL-theme 思路，从当前聚焦文档树项读取
        const focusedDocItem = document.querySelector('.b3-list-item--focus[data-type="navigation-file"]');
        if (focusedDocItem) {
            const id = this.extractNodeIdFromElement(focusedDocItem);
            if (id) return id;
        }

        // 再尝试通用聚焦项
        const focusedAny = document.querySelector('.b3-list-item--focus[data-node-id]');
        if (focusedAny) {
            const id = this.extractNodeIdFromElement(focusedAny);
            if (id) return id;
        }

        return null;
    }

    private openReviewDocsDialog(target: ReviewMenuTarget, mode: "create" | "edit" = "create"): void {
        if (!this.ADVANCED) {
            showMessage("复习文档为高级会员专属功能", 3000);
            return;
        }

        const dialog = svelteDialog({
            title: mode === "edit" ? "编辑复习计划" : "加入复习计划",
            width: "min(860px, calc(100vw - 32px))",
            constructor: (containerEl: HTMLElement) => {
                return mount(ReviewDocsDialog as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        targetId: target.id,
                        targetType: target.type,
                        mode,
                        close: () => dialog.close(),
                    },
                });
            },
        });
    }

    private async removeReviewDocsPlan(target: ReviewMenuTarget): Promise<void> {
        if (!this.ADVANCED) {
            showMessage("复习文档为高级会员专属功能", 3000);
            return;
        }

        try {
            const result = await clearReviewTarget({
                targetId: target.id,
                targetType: target.type,
            });
            showMessage(
                result.logWarning
                    ? `${result.message}；复习计划已完成，但本地操作日志写入失败：${result.logWarning}`
                    : result.message,
                4000,
            );
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "取消复习计划失败", 4000);
        }
    }

    private createHomepageReviewMenuItems(target: ReviewMenuTarget): HomepageMenuItem[] {
        return [
            {
                icon: "iconCalendar",
                label: "加入复习计划",
                click: () => this.openReviewDocsDialog(target, "create"),
            },
            {
                icon: "iconClose",
                label: "取消复习计划",
                click: () => void this.removeReviewDocsPlan(target),
            },
        ];
    }

    private addHomepageReviewSubmenu(menu: any, target: ReviewMenuTarget): void {
        menu.addItem({
            icon: "iconhomepage",
            label: "主页插件",
            type: "submenu",
            submenu: this.createHomepageReviewMenuItems(target),
        });
    }

    private addHomepageBlockActions(menu: any, blockId: string, options?: { includeTaskEditor?: boolean }): void {
        this.addHomepageReviewSubmenu(menu, { id: blockId, type: "block" });

        if (options?.includeTaskEditor) {
            menu.addItem({
                icon: "iconTask",
                label: "任务编辑器（主页插件）",
                click: () => {
                    const dialog = svelteDialog({
                        title: "任务编辑器",
                        constructor: (containerEl: HTMLElement) => {
                            return mount(TasksEditingDialog as any, {
                                target: containerEl,
                                props: {
                                    blockId: blockId,
                                    close: () => {
                                        dialog.close();
                                    },
                                },
                            });
                        },
                    });
                }
            });
        }
    }

    // 添加收藏菜单到指定菜单
    private addFavoriteDocumentSubmenu(menu: any, docId: string): void {
        menu.addItem({
            icon: "iconhomepage",
            label: "主页插件",
            type: "submenu",
            submenu: [
                {
                    icon: "iconHeart",
                    label: "收藏文档",
                    click: async () => {
                        try {
                            await updateFavoriteIndex(docId, true);
                            showMessage("已收藏");
                        } catch (err) {
                            showMessage(err instanceof Error ? err.message : "收藏失败");
                        }
                    }
                },
                {
                    icon: "iconClose",
                    label: "取消收藏",
                    click: async () => {
                        try {
                            await updateFavoriteIndex(docId, false);
                            showMessage("已取消收藏");
                        } catch (err) {
                            showMessage(err instanceof Error ? err.message : "取消收藏失败");
                        }
                    }
                },
                ...this.createHomepageReviewMenuItems({ id: docId, type: "doc" }),
            ]
        });
    }

    private handleDocTreeMenu({ detail }: any) {
        if (!detail || !detail.menu) return;

        const docId = this.resolveDocTreeMenuDocId(detail);
        if (!docId) {
            return;
        }

        this.addFavoriteDocumentSubmenu(detail.menu, docId);
    }

    private handleContentMenu({ detail }: any) {
        if (!detail) return;
        const blockElement = detail.element?.closest?.('[data-node-id]');
        if (!blockElement) {
            console.warn('未找到块元素');
            return;
        }
        const blockId = blockElement.getAttribute('data-node-id');
        if (blockId) {
            this.addHomepageBlockActions(detail.menu, blockId, { includeTaskEditor: true });
        }
    }

    private handleBlockIconMenu({ detail }: any) {
        if (!detail) return;

        let blockId: string | null = null;

        // 优先从 blockElements 数组获取
        const blockEl = detail.blockElements?.[0];
        if (blockEl) {
            blockId = blockEl.dataset?.nodeId || blockEl.getAttribute("data-node-id");
        }

        // 兜底：从 element 向上查找
        if (!blockId && detail.element?.closest) {
            const closest = detail.element.closest("[data-node-id]");
            blockId = closest?.getAttribute("data-node-id") || null;
        }

        if (!blockId) {
            return;
        }

        this.addHomepageBlockActions(detail.menu, blockId, { includeTaskEditor: true });
    }

    private handleEditorTitleIconMenu({ detail }: any) {
        if (!detail) {
            return;
        }

        // 从事件中获取当前文档ID
        // click-editortitleicon 事件通常包含 data 或 protyle 信息
        let docId: string | null = null;

        // 尝试从多种可能的位置获取文档ID
        if (detail.data?.id) {
            docId = detail.data.id;
        } else if (detail.protyle?.block?.id) {
            docId = detail.protyle.block.id;
        } else if (detail.protyle?.block?.rootID) {
            docId = detail.protyle.block.rootID;
        }

        if (!docId) {
            return;
        }

        this.addFavoriteDocumentSubmenu(detail.menu, docId);
    }
}
