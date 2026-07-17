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
import { loadWidgetLayoutSettings, buildHomepageAppliedSignature } from "@/components/utils/widgetBlock/utils/layout-shared";
import type { WidgetLayoutData } from "@/components/utils/widgetBlock/utils/layout-shared";
import { destroyFloatingDoc } from "@/components/tools/floatingDoc";
import { destroyFloatingMini } from "@/components/utils/widgetBlock/widget/musicPlayer/musicFloatingMiniManager";
import {
    loadHomepageConfig,
    resolveBackgroundImage,
} from "./homepage/configLoader";
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
    private sidebarDockInstance: Record<string, any> | null = null;
    private mobileQuickActionsHost: HTMLDivElement | null = null;
    private mobileQuickActionsInstance: Record<string, any> | null = null;
    private mobileQuickActionsPositionSaveTimer: number | null = null;
    private pendingMobileQuickActionsPosition: MobileQuickActionsPosition | null = null;
    private homepageTabObserver: MutationObserver | null = null;
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

    // 已应用签名状态：用于检测外部同步变化
    private lastAppliedConfigSignature = "";
    private lastAppliedLayoutSignature = "";
    private lastAppliedCompositeSignature = "";

    // 主页热刷新短期锁：只防同一轮事件重入，必须可自动释放
    private homepageReloadTriggered = false;
    private activeHomepageHotReloadReason: string | null = null;
    private pendingHomepageHotReloadReason: string | null = null;
    private homepageHotReloadWatchdogTimer: number | null = null;
    private homepagePendingFlushTimer: number | null = null;

    // 全局背景异步刷新版本号：防止旧请求覆盖新状态
    private globalBackgroundApplyVersion = 0;

    // 更新已应用签名（homepage 初始化完成后调用）
    public updateAppliedSignatures(configSig: string, layoutSig: string, compositeSig?: string): void {
        this.lastAppliedConfigSignature = configSig;
        this.lastAppliedLayoutSignature = layoutSig;
        if (compositeSig !== undefined) {
            this.lastAppliedCompositeSignature = compositeSig;
        }
    }

    // 获取当前已应用签名
    public getAppliedSignatures(): { config: string; layout: string; composite: string } {
        return {
            config: this.lastAppliedConfigSignature,
            layout: this.lastAppliedLayoutSignature,
            composite: this.lastAppliedCompositeSignature,
        };
    }

    // 签名变化时触发局部热刷新（短期锁 + pending 队列 + window 事件）
    public triggerHomepageFullReload(reason: string): void {
        if (this.homepageReloadTriggered) {
            this.pendingHomepageHotReloadReason = reason;
            return;
        }

        this.pendingHomepageHotReloadReason = reason;
        this.flushPendingHomepageHotReload(`trigger:${reason}`);
    }

    private dispatchHomepageExternalSyncChanged(reason: string): void {
        const eventInit = {
            detail: { reason },
            bubbles: false,
        };
        window.dispatchEvent(new CustomEvent("homepage-external-sync-changed", eventInit));
        if (this.homepageTabDiv?.isConnected) {
            this.homepageTabDiv.dispatchEvent(
                new CustomEvent("homepage-external-sync-changed", eventInit)
            );
        }
    }

    private startHomepageHotReloadWatchdog(_reason: string): void {
        this.clearHomepageHotReloadWatchdog();
        this.homepageHotReloadWatchdogTimer = window.setTimeout(() => {
            this.homepageHotReloadWatchdogTimer = null;
            if (!this.homepageReloadTriggered) {
                return;
            }
            // watchdog 触发释放锁，同时清理 active reason，避免旧事件长期占用。
            const activeReason = this.activeHomepageHotReloadReason;
            this.homepageReloadTriggered = false;
            this.activeHomepageHotReloadReason = null;

            const pending = this.pendingHomepageHotReloadReason;
            if (!pending) {
                return;
            }
            // pending 与当前 active reason 相同，说明是同一个旧事件，不重放并清理。
            if (pending === activeReason) {
                this.pendingHomepageHotReloadReason = null;
                return;
            }
            // pending 与当前 active reason 不同，可能是锁期间来的新事件，允许刷新一次。
            this.scheduleFlushPendingHomepageHotReload("watchdog-release");
        }, 30000);
    }

    private clearHomepageHotReloadWatchdog(): void {
        if (this.homepageHotReloadWatchdogTimer) {
            clearTimeout(this.homepageHotReloadWatchdogTimer);
            this.homepageHotReloadWatchdogTimer = null;
        }
    }

    private scheduleFlushPendingHomepageHotReload(reason: string): void {
        if (this.homepagePendingFlushTimer) {
            clearTimeout(this.homepagePendingFlushTimer);
        }
        this.homepagePendingFlushTimer = window.setTimeout(() => {
            this.homepagePendingFlushTimer = null;
            this.flushPendingHomepageHotReload(reason);
        }, 0);
    }

    private flushPendingHomepageHotReload(reason: string): void {
        if (this.homepageReloadTriggered) {
            return;
        }
        const pendingReason = this.pendingHomepageHotReloadReason;
        if (!pendingReason) {
            return;
        }

        if (!this.isHomepageMountedHealthy()) {
            this.ensureHomepageMounted(`flush-pending:${reason}`);
            if (!this.isHomepageMountedHealthy()) {
                return;
            }
        }

        this.pendingHomepageHotReloadReason = null;
        this.homepageReloadTriggered = true;
        this.activeHomepageHotReloadReason = pendingReason;
        this.startHomepageHotReloadWatchdog(pendingReason);

        window.setTimeout(() => {
            if (!this.homepageReloadTriggered) {
                return;
            }
            if (!this.isHomepageMountedHealthy()) {
                this.pendingHomepageHotReloadReason = pendingReason;
                this.homepageReloadTriggered = false;
                this.activeHomepageHotReloadReason = null;
                this.clearHomepageHotReloadWatchdog();
                this.scheduleFlushPendingHomepageHotReload("dispatch-target-lost");
                return;
            }
            this.dispatchHomepageExternalSyncChanged(pendingReason);
        }, 0);
    }

    // 计算配置签名（归一化后）：排除设备管理态字段，避免误判
    private computeConfigSignature(config: any): string {
        try {
            const normalized = this.normalizeConfigForSignature(config);
            return JSON.stringify(normalized);
        } catch {
            return "";
        }
    }

    // 归一化配置用于签名：排除不应触发 reload 的设备管理态字段
    private normalizeConfigForSignature(config: any): any {
        if (!config || typeof config !== 'object') {
            return config;
        }

        // 获取当前设备 ID 用于提取当前设备的 banner 配置
        const deviceId = this.getLocalDeviceIdForSignature();

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
    private getLocalDeviceIdForSignature(): string | null {
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
    private computeLayoutSignature(layout: any): string {
        try {
            return JSON.stringify(layout);
        } catch {
            return "";
        }
    }

    // plugin 侧签名检查：用于检测外部同步变化
    // 返回 true 表示签名已变化（已触发热刷新），调用方不应阻止挂载
    public async checkHomepageSignatureAndReload(reason: string): Promise<boolean> {
        // 热刷新执行中时不重复比较，新的变化会由 pending 队列接住
        if (this.homepageReloadTriggered) {
            return true;
        }

        // 如果没有已应用签名（首次加载），跳过检查
        const appliedSigs = this.getAppliedSignatures();
        if (!appliedSigs.composite && !appliedSigs.config && !appliedSigs.layout) {
            return false;
        }

        try {
            // 读取最新配置和布局
            const rawConfig = (await this.loadData("homepageSettingConfig.json")) || {};
            const layout = await this.loadData("widgetLayout.json") as WidgetLayoutData | null;
            const deviceId = this.getLocalDeviceIdForSignature();
            const sectionsEnabled = Boolean((this as any).ADVANCED) && rawConfig?.componentSectionsEnabled === true;

            // 使用统一 helper 计算复合签名（覆盖 config + layout + widget 内容）
            const currentCompositeSig = await buildHomepageAppliedSignature(this, rawConfig, layout, deviceId, sectionsEnabled);

            // 比较：优先用 composite，回退到旧 config+layout 字段
            if (appliedSigs.composite && currentCompositeSig === appliedSigs.composite) {
                return false;
            }
            if (!appliedSigs.composite) {
                // 兼容旧签名（无 composite）
                const layoutSettings = await loadWidgetLayoutSettings(this);
                const currentConfigSig = this.computeConfigSignature(rawConfig);
                const currentLayoutSig = this.computeLayoutSignature(layoutSettings);
                if (currentConfigSig === appliedSigs.config && currentLayoutSig === appliedSigs.layout) {
                    return false;
                }
            }

            this.triggerHomepageFullReload(`plugin-signature-changed: ${reason}`);
            return true;
        } catch (e) {
            console.warn('[Homepage] plugin 侧签名检查失败:', e);
        }

        return false;
    }

    async onload() {
        const config = await this.getPluginConfig();
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
        await loadSelectionAiToolbarSettingsSnapshot(this);
        initSelectionAiToolbarPointerTracker();
        this.registerIcon();

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        this.ensureTabContainers();
        this.registerCustomTabs();

        this.eventBus.on("open-menu-doctree", this.docTreeMenuEventBindThis);
        this.eventBus.on("click-editortitleicon", this.editorTitleIconMenuEventBindThis);
        this.eventBus.on("click-blockicon", this.blockIconMenuEventBindThis);
        if (config.taskEditorEnabled ?? true) {
            this.eventBus.on("open-menu-content", this.contentMenuEventBindThis);
        }
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        this.registerTopBar(config);
        this.registerCommand();

        // 在非移动端时注册 dock 侧边栏
        if ((config.sidebarEnabled ?? false) && !this.isMobile) {
            this.registerDock();
        }
        if ((config.aiKbDockEnabled ?? true) && !this.isMobile) {
            this.registerKbDock();
        }

        // 监听全局背景相关事件：设置保存、会员状态变化
        window.addEventListener("homepage-settings-saved", this.homepageSettingsSavedBindThis);
        window.addEventListener("homepage-advanced-ready", this.homepageAdvancedReadyBindThis);
        window.addEventListener("homepage-advanced-unavailable", this.homepageAdvancedUnavailableBindThis);

        // 插件加载时应用全局背景（会员校验是异步的，后续事件会再次触发刷新）
        await this.applyGlobalBackgroundImageStyle();
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

    private async handleHomepageSettingsSaved(): Promise<void> {
        await this.applyGlobalBackgroundImageStyle();
        const config = await this.getPluginConfig();
        this.mountMobileQuickActions(config);
    }

    private async handleHomepageAdvancedReady(): Promise<void> {
        await this.applyGlobalBackgroundImageStyle();
        const config = await this.getPluginConfig();
        this.mountMobileQuickActions(config);
    }

    private async handleHomepageAdvancedUnavailable(): Promise<void> {
        if (this.currentMobileEnhancedDiaryWorkspaceDialog) {
            this.currentMobileEnhancedDiaryWorkspaceDialog.close();
            this.currentMobileEnhancedDiaryWorkspaceDialog = null;
        }
        await this.applyGlobalBackgroundImageStyle();
        if (this.currentMobileSettingsDialog) {
            this.currentMobileSettingsDialog.close();
            this.currentMobileSettingsDialog = null;
        }
        this.destroyMobileQuickActions();
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
            await this.persistMobileQuickActionsPosition(pendingPosition);
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
        this.globalBackgroundApplyVersion++;
        cleanupGlobalBackgroundImageStyle();

        // 销毁 Homepage 组件实例
        this.destroyHomepageInstance();
        this.destroyEnhancedDiaryWorkspaceInstance();
        this.destroyKbChatInstance();
        this.clearHomepageHotReloadWatchdog();
        this.pendingHomepageHotReloadReason = null;
        this.activeHomepageHotReloadReason = null;
        this.homepageReloadTriggered = false;
        if (this.homepagePendingFlushTimer) {
            clearTimeout(this.homepagePendingFlushTimer);
            this.homepagePendingFlushTimer = null;
        }

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

        if (this.kbDockInstance) {
            try {
                unmount(this.kbDockInstance);
            } catch {
                // ignore dock cleanup errors
            }
            this.kbDockInstance = null;
        }
        this.kbDockRegistered = false;

        // 断开主页 tab 连接状态观察器
        if (this.homepageTabObserver) {
            this.homepageTabObserver.disconnect();
            this.homepageTabObserver = null;
        }
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
        void ensureLegacySharedWidgetMigration(this).catch((error) => {
            console.warn("[Homepage] 共享组件历史数据迁移启动失败", error);
        });
        void startChatActionBridgeIfNeeded();
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
        this.ensureTabContainers();
        this.registerCustomTabs();
        this.ensureHomepageTabObserver();

        // 检查是否在新窗口中打开
        const isNewWindow = this.isNewWindow();

        // 只在非新窗口中自动打开主页
        if (!isNewWindow) {
            const config = await this.getPluginConfig();
            if (this.isMobileFrontend()) {
                await this.verifyLicense();
                if (this.ADVANCED && config.autoOpenMobileHomepage === true) {
                    this.openMobileHomepage();
                }
                this.mountMobileQuickActions(config);
            } else if (config.autoOpenHomepage === true) {
                this.openHomepage();
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
        if (!this.homepageTabDiv) {
            this.homepageTabDiv = document.createElement("div");
        }
        this.prepareHomepageContainer(this.homepageTabDiv);

        if (!this.enhancedDiaryWorkspaceTabDiv) {
            this.enhancedDiaryWorkspaceTabDiv = document.createElement("div");
        }
        if (!this.kbChatTabDiv) {
            this.kbChatTabDiv = document.createElement("div");
        }
    }

    private ensureHomepageTabObserver(): void {
        if (this.homepageTabObserver) {
            return;
        }

        // 建立防抖观察：强化日记/KB 仍可在长时间断开后销毁。
        // 主页不因 disconnect 自动销毁，避免同步/setUILayout 临时断开导致空白。
        const DISCONNECT_GRACE_MS = 1500;
        let diaryDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let kbDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

        const cancelDiaryDisconnect = () => {
            if (diaryDisconnectTimer) {
                clearTimeout(diaryDisconnectTimer);
                diaryDisconnectTimer = null;
            }
        };
        const cancelKbDisconnect = () => {
            if (kbDisconnectTimer) {
                clearTimeout(kbDisconnectTimer);
                kbDisconnectTimer = null;
            }
        };

        this.homepageTabObserver = new MutationObserver(() => {
            // 主页：只在重新连接后自愈，不在断开时销毁实例。
            if (this.homepageTabDiv && this.homepageTabDiv.isConnected) {
                if (!this.isHomepageMountedHealthy()) {
                    this.ensureHomepageMounted('mutation-reconnect');
                }
            }

            // 强化日记工作台
            if (this.enhancedDiaryWorkspaceTabDiv && !this.enhancedDiaryWorkspaceTabDiv.isConnected) {
                if (!diaryDisconnectTimer && this.enhancedDiaryWorkspaceInstance) {
                    diaryDisconnectTimer = setTimeout(() => {
                        diaryDisconnectTimer = null;
                        if (this.enhancedDiaryWorkspaceTabDiv && !this.enhancedDiaryWorkspaceTabDiv.isConnected) {
                            this.destroyEnhancedDiaryWorkspaceInstance();
                        }
                    }, DISCONNECT_GRACE_MS);
                }
            } else if (this.enhancedDiaryWorkspaceTabDiv && this.enhancedDiaryWorkspaceTabDiv.isConnected) {
                cancelDiaryDisconnect();
            }

            // KB 聊天
            if (this.kbChatTabDiv && !this.kbChatTabDiv.isConnected) {
                if (!kbDisconnectTimer && this.kbChatInstance) {
                    kbDisconnectTimer = setTimeout(() => {
                        kbDisconnectTimer = null;
                        if (this.kbChatTabDiv && !this.kbChatTabDiv.isConnected) {
                            this.destroyKbChatInstance();
                        }
                    }, DISCONNECT_GRACE_MS);
                }
            } else if (this.kbChatTabDiv && this.kbChatTabDiv.isConnected) {
                cancelKbDisconnect();
            }
        });
        this.homepageTabObserver.observe(document.body, { childList: true, subtree: true });
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
                // 轻量保护：确保 custom tab 上下文完整
                if (!this.element) {
                    return;
                }

                if (self.homepageTabDiv) {
                    self.prepareHomepageTabElement(this.element as HTMLElement);
                    self.prepareHomepageContainer(self.homepageTabDiv);
                    this.element.replaceChildren(self.homepageTabDiv);
                    // 先按 AI 标签页的方式恢复挂载，再处理同步签名，避免事件无人监听。
                    self.ensureHomepageMounted('customTab.init');
                }

                // plugin 侧检查签名变化；若已变化，触发局部热刷新但不阻止挂载
                await self.checkHomepageSignatureAndReload('customTab.init');
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

                const config: PluginConfig = (await self.loadData("homepageSettingConfig.json")) || {};
                if (config.aiKbTabEnabled === false) {
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
            if (this.pendingHomepageHotReloadReason) {
                this.scheduleFlushPendingHomepageHotReload("created-instance");
            }
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

    // 检查主页挂载是否健康
    private isHomepageMountedHealthy(): boolean {
        if (!this.homepageTabDiv) return false;
        if (!this.homepageTabDiv.isConnected) return false;
        if (!this.homepageInstance) return false;
        if (!this.homepageTabDiv.querySelector(".homepage-container")) return false;
        return true;
    }

    // 确保主页已挂载：若缺失则重建，若部分损坏则先销毁再重建
    public ensureHomepageMounted(reason: string): void {
        if (!this.homepageTabDiv || !this.homepageTabDiv.isConnected) {
            return;
        }
        if (!this.homepageInstance) {
            this.createHomepageInstance();
            this.scheduleFlushPendingHomepageHotReload(`ensure-created:${reason}`);
            return;
        }
        if (!this.homepageTabDiv.querySelector(".homepage-container")) {
            this.destroyHomepageInstance();
            this.createHomepageInstance();
            this.scheduleFlushPendingHomepageHotReload(`ensure-recreated:${reason}`);
            return;
        }
        if (this.pendingHomepageHotReloadReason) {
            this.scheduleFlushPendingHomepageHotReload(`ensure-healthy:${reason}`);
        }
    }

    private scheduleHomepageMountedEnsure(reason: string): void {
        [0, 80, 300, 1000].forEach((delay, index) => {
            window.setTimeout(() => {
                if (this.homepageTabDiv?.isConnected) {
                    this.ensureHomepageMounted(`${reason}:${index}`);
                }
            }, delay);
        });
    }

    // 标记热刷新完成，释放短期锁
    public markHomepageHotReloadFinished(_reason?: string): void {
        this.clearHomepageHotReloadWatchdog();
        this.homepageReloadTriggered = false;
        this.activeHomepageHotReloadReason = null;
        if (this.pendingHomepageHotReloadReason) {
            this.scheduleFlushPendingHomepageHotReload("hot-reload-finished");
        }
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

    // 重建主页实例（用于恢复坏掉的实例）
    public reloadHomepageInstance(): void {
        if (this.homepageTabDiv && this.homepageTabDiv.isConnected) {
            this.destroyHomepageInstance();
            this.createHomepageInstance();
            this.ensureHomepageMounted('reloadHomepageInstance');
        } else {
            this.destroyHomepageInstance();
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

    private registerCommand() {
        this.addCommand({
            langKey: "快速笔记",
            hotkey: "⇧⌘Q",
            callback: () => {
                void this.openQuickNotesDialog();
            },
        });

        // 添加快速打开主页的快捷键命令
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
    }

    private async openQuickNotesDialog(): Promise<void> {
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
    }

    private registerTopBar(config: PluginConfig) {
        this.removeExistingTopBar("homepage", this.homepageTopBarElement);
        this.removeExistingTopBar("kb-chat", this.kbTopBarElement);

        const homepageTopBar = this.addTopBar({
            icon: "iconhomepage",
            title: "打开主页",
            position: "left",
            callback: () => {
                if (this.isMobile) {
                    this.openMobileHomepage();
                } else {
                    this.openHomepage();
                }
            }
        });
        homepageTopBar.dataset.siyuanHomepageTopbar = "homepage";
        this.homepageTopBarElement = homepageTopBar;

        if (config.aiKbTabEnabled ?? true) {
            const kbTopBar = this.addTopBar({
                icon: "iconNotebrain",
                title: "打开 AI 知识库",
                position: "left",
                callback: () => this.openKbChatTab(),
            });
            kbTopBar.dataset.siyuanHomepageTopbar = "kb-chat";
            this.kbTopBarElement = kbTopBar;
        } else {
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
            void this.persistMobileQuickActionsPosition(normalizedPosition);
            return;
        }

        if (this.mobileQuickActionsPositionSaveTimer !== null) return;
        this.mobileQuickActionsPositionSaveTimer = window.setTimeout(() => {
            this.mobileQuickActionsPositionSaveTimer = null;
            const pendingPosition = this.pendingMobileQuickActionsPosition;
            this.pendingMobileQuickActionsPosition = null;
            if (pendingPosition) {
                void this.persistMobileQuickActionsPosition(pendingPosition);
            }
        }, 160);
    }

    private async persistMobileQuickActionsPosition(position: MobileQuickActionsPosition): Promise<void> {
        const config = await this.getPluginConfig();
        await this.saveData("homepageSettingConfig.json", {
            ...config,
            mobileQuickActionsPosition: normalizeMobileQuickActionsPosition(position),
        });
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

        this.scheduleHomepageMountedEnsure('openHomepage');
        window.setTimeout(async () => {
            await this.checkHomepageSignatureAndReload('openHomepage');
        }, 0);
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

        const config: PluginConfig = (await this.loadData("homepageSettingConfig.json")) || {};
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

        const config: PluginConfig = (await this.loadData("homepageSettingConfig.json")) || {};
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

    private openMobileHomepage() {
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
        return (await this.loadData("homepageSettingConfig.json")) || {};
    }

    private registerDock() {
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

                void (async () => {
                    const config: PluginConfig = (await this.loadData("homepageSettingConfig.json")) || {};
                    if (config.aiKbDockEnabled === false) {
                        kbContainer.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--b3-theme-on-surface-light,#666);font-size:13px;">此功能需要开启 AI 知识库侧边栏，请在主页设置中启用「开启侧边栏对话」</div>`;
                        dock.element.appendChild(kbContainer);
                        return;
                    }

                    this.kbDockInstance = mount(KbPremiumGatePanel as any, {
                        target: kbContainer,
                        props: {
                            plugin: this,
                            placement: "dock",
                            onOpenSettings: () => this.openKbSettingsDialog(),
                        },
                    } as any);
                    dock.element.appendChild(kbContainer);
                })();
            },
            destroy: () => {
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
