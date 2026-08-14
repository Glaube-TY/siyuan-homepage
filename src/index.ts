import { mount, unmount } from "svelte";
import {
    Plugin,
    showMessage,
    openTab,
    openMobileFileById,
    getFrontend,
    Model,
    fetchPost,
    fetchSyncPost,
    platformUtils,
    type IMenuItem,
} from "siyuan";
import { setSiyuanRuntimePort } from "@/runtime/siyuan-runtime-port";
import { scheduleIdleTask } from "@/utils/runtime/idleTask";
import { createRuntimePerformanceTrace } from "@/utils/performance/runtimePerformance";
import { openDocsInClientRuntime, setOpenDocsRuntime } from "@/components/tools/openDocs";
import {
    ROBOT_QUICK_NOTE_CONFIG_KEY,
    setQuickNoteConfigLoader,
    setQuickNoteWritePlugin,
} from "@/features/quick-note/quick-note-write-service";

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
import { ensureCurrentDeviceViewReady } from "./homepage/deviceView/deviceViewReadiness";
import type { DeviceViewSurface } from "./homepage/deviceView/deviceViewTypes";
import { ensureDeviceIdentityReady } from "./homepage/utils/deviceProfile";
import {
    DeviceViewAccessBlockedError,
    DeviceViewTemporarilyIncompleteError,
    formatDeviceViewBlockedUserMessage,
    markDeviceViewBlockedNotified,
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
import type { ReviewMenuTarget } from "./components/utils/widgetBlock/widget/reviewDocs/reviewDocsTypes";
import EnhancedDiaryWorkspacePage from "./components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspacePage.svelte";
import KbPremiumGatePanel from "@/features/kb/components/panels/kb-premium-gate-panel.svelte";
import KbSettingsPanel from "@/features/kb/components/panels/kb-settings-panel.svelte";
import { KB_SETTINGS_CHANGED_EVENT, setKbSettingsPlugin } from "@/features/kb/services/settings/kb-settings-service";
import { setReferenceNavigationPlugin } from "@/features/kb/services/siyuan/reference-navigation";
import { setNotebrainPlugin } from "@/features/kb/services/agent-workbench/storage";
import { saveData, loadData, removeData } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { setPluginStorage } from "@/features/kb/services/agent-workbench/runtime/in-flight-turn-journal";
import { RobotClientRuntime } from "@/features/robot-assistant/runtime/robot-client-runtime";
import { RobotKernelBridge } from "@/features/robot-assistant/runtime/robot-kernel-bridge";
import { syncRobotAgentRuntimeConfig } from "@/features/robot-assistant/runtime/robot-agent-config-sync";
import {
    destroyNotificationCenterRuntime,
    registerMobileNotificationPlanProvider,
    notificationRuleMobilePlanProvider,
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
import { destroyAutomationRuntime, startAutomationRuntime } from "@/features/agent-platform/automation/automation-runtime";
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
    resolveMobileAutoOpenConfig,
    isMobileAutoOpenTargetId,
} from "./homepage/mobileQuickActions/mobileQuickActionsConfig";
import type {
    MobileQuickActionId,
    MobileQuickActionSetting,
    MobileQuickActionsPosition,
} from "./homepage/mobileQuickActions/mobileQuickActionsConfig";
import { openAccountingDetailDialogFromPlugin } from "./components/utils/widgetBlock/widget/accounting/openAccountingDetailDialog";
import { requestOpenMobileMusicPlayer } from "./components/utils/widgetBlock/widget/musicPlayer/musicMobilePlayerBridge";
import MusicPlayerRuntime from "./components/utils/widgetBlock/widget/musicPlayer/musicPlayer.svelte";
import { syncLicenseStatus } from "@/services/licenseStatusService";
import { DEFAULT_BASE_URL } from "@/services/membershipService";
import pluginManifest from "../plugin.json";
import {
    denyHomepageEntitlement,
    failHomepageEntitlementCheck,
    getHomepageEntitlementSnapshot,
    grantHomepageEntitlement,
    isHomepageEntitlementGranted,
    markHomepageEntitlementPending,
    resetHomepageEntitlement,
    resolveHomepageEntitlementMessage,
    withEntitlementTimeout,
} from "@/features/entitlement/homepage-entitlement";

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
type EnhancedDiaryWorkspaceAction = "create-task" | "create-record";
const DOCK_TYPE = "homepage_dock";
const KB_CHAT_TAB_TYPE = "kb_chat_tab";
const KB_CHAT_TAB_ID = "siyuan-homepagekb_chat_tab";
const KB_DOCK_TYPE = "homepage_kb_dock";

// ── Robot Assistant 前端客户端（Kernel RPC 桥 + Electron Provider 注册） ──
let robotClientRuntime: RobotClientRuntime | null = null;
let robotKernelBridge: RobotKernelBridge | null = null;
let robotBridgeUnsubscribe: (() => void) | null = null;
let robotKbSettingsChangedHandler: (() => void) | null = null;

function isElectronDesktopRuntime(): boolean {
    try {
        return typeof (window as unknown as { require?: unknown }).require === "function";
    } catch {
        return false;
    }
}

function initRobotClientRuntime(plugin: PluginHomepage): void {
    if (robotClientRuntime) return;
    const bridge = new RobotKernelBridge(plugin);
    robotKernelBridge = bridge;
    const kernelClient = bridge.client;
    robotClientRuntime = new RobotClientRuntime({
        pluginName: plugin.name || "siyuan-homepage",
        kernel: kernelClient,
        storage: {
            loadData: (name) => plugin.loadData(name),
            saveData: (name, value) => plugin.saveData(name, value),
        },
        isElectron: isElectronDesktopRuntime,
        logger: {
            warn: (entry) => console.warn("[Homepage] RobotClient", entry),
            error: (entry) => console.error("[Homepage] RobotClient", entry),
        },
    });
    // Kernel 进入 running 后自动启动客户端；已 running 则立即启动。
    // 启动失败不会永久放弃——状态再变 running 时会再次尝试。
    const startRobotClient = (): void => {
        void robotClientRuntime?.start().catch((error) => {
            console.warn("[Homepage] Robot 客户端启动失败，本次仅停用机器人", error);
        });
        void syncRobotAgentRuntimeConfig(kernelClient).catch((error) => {
            console.warn("[Homepage] Robot Agent 模型配置同步失败", error);
        });
    };
    robotBridgeUnsubscribe = bridge.startWhenRunning(startRobotClient);
    robotKbSettingsChangedHandler = () => {
        void syncRobotAgentRuntimeConfig(kernelClient).catch((error) => {
            console.warn("[Homepage] Robot Agent 模型配置重新同步失败", error);
        });
    };
    window.addEventListener(KB_SETTINGS_CHANGED_EVENT, robotKbSettingsChangedHandler);
}

async function disposeRobotClientRuntime(): Promise<void> {
    if (robotKbSettingsChangedHandler) {
        window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, robotKbSettingsChangedHandler);
        robotKbSettingsChangedHandler = null;
    }
    robotBridgeUnsubscribe?.();
    robotBridgeUnsubscribe = null;
    robotKernelBridge?.dispose();
    robotKernelBridge = null;
    const runtime = robotClientRuntime;
    robotClientRuntime = null;
    if (runtime) {
        await runtime.stop().catch(() => undefined);
    }
}

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

const ROBOT_WECHAT_ICON_SVG = `<symbol id="iconRobotWechat" viewBox="0 0 1024 1024">
    <path d="M683.058 364.695c11 0 22 1.016 32.943 1.976C686.564 230.064 538.896 128 370.681 128c-188.104 0.66-342.237 127.793-342.237 289.226 0 93.068 51.379 169.827 136.725 229.256L130.72 748.43l119.796-59.368c42.918 8.395 77.37 16.79 119.742 16.79 11 0 21.46-0.48 31.914-1.442a259.168 259.168 0 0 1-10.455-71.358c0.485-148.002 128.744-268.297 291.403-268.297l-0.06-0.06z m-184.113-91.992c25.99 0 42.913 16.79 42.913 42.575 0 25.188-16.923 42.579-42.913 42.579-25.45 0-51.38-16.85-51.38-42.58 0-25.784 25.93-42.574 51.38-42.574z m-239.544 85.154c-25.384 0-51.374-16.85-51.374-42.58 0-25.784 25.99-42.574 51.374-42.574 25.45 0 42.918 16.79 42.918 42.575 0 25.188-16.924 42.579-42.918 42.579z m736.155 271.655c0-135.647-136.725-246.527-290.983-246.527-162.655 0-290.918 110.88-290.918 246.527 0 136.128 128.263 246.587 290.918 246.587 33.972 0 68.423-8.395 102.818-16.85l93.809 50.973-25.93-84.677c68.907-51.93 120.286-119.815 120.286-196.033z m-385.275-42.58c-16.923 0-34.452-16.79-34.452-34.179 0-16.79 17.529-34.18 34.452-34.18 25.99 0 42.918 16.85 42.918 34.18 0 17.39-16.928 34.18-42.918 34.18z m188.165 0c-16.984 0-33.972-16.79-33.972-34.179 0-16.79 16.927-34.18 33.972-34.18 25.93 0 42.913 16.85 42.913 34.18 0 17.39-16.983 34.18-42.913 34.18z" fill="#09BB07"></path>
</symbol>`;

const ROBOT_QQ_ICON_SVG = `<symbol id="iconRobotQQ" viewBox="0 0 1024 1024">
    <path d="M511.09761 957.257c-80.159 0-153.737-25.019-201.11-62.386-24.057 6.702-54.831 17.489-74.252 30.864-16.617 11.439-14.546 23.106-11.55 27.816 13.15 20.689 225.583 13.211 286.912 6.767v-3.061z" fill="#FAAD08"></path><path d="M496.65061 957.257c80.157 0 153.737-25.019 201.11-62.386 24.057 6.702 54.83 17.489 74.253 30.864 16.616 11.439 14.543 23.106 11.55 27.816-13.15 20.689-225.584 13.211-286.914 6.767v-3.061z" fill="#FAAD08"></path><path d="M497.12861 474.524c131.934-0.876 237.669-25.783 273.497-35.34 8.541-2.28 13.11-6.364 13.11-6.364 0.03-1.172 0.542-20.952 0.542-31.155C784.27761 229.833 701.12561 57.173 496.64061 57.162 292.15661 57.173 209.00061 229.832 209.00061 401.665c0 10.203 0.516 29.983 0.547 31.155 0 0 3.717 3.821 10.529 5.67 33.078 8.98 140.803 35.139 276.08 36.034h0.972z" fill="#000000"></path><path d="M860.28261 619.782c-8.12-26.086-19.204-56.506-30.427-85.72 0 0-6.456-0.795-9.718 0.148-100.71 29.205-222.773 47.818-315.792 46.695h-0.962C410.88561 582.017 289.65061 563.617 189.27961 534.698 185.44461 533.595 177.87261 534.063 177.87261 534.063 166.64961 563.276 155.56661 593.696 147.44761 619.782 108.72961 744.168 121.27261 795.644 130.82461 796.798c20.496 2.474 79.78-93.637 79.78-93.637 0 97.66 88.324 247.617 290.576 248.996a718.01 718.01 0 0 1 5.367 0C708.80161 950.778 797.12261 800.822 797.12261 703.162c0 0 59.284 96.111 79.783 93.637 9.55-1.154 22.093-52.63-16.623-177.017" fill="#000000"></path><path d="M434.38261 316.917c-27.9 1.24-51.745-30.106-53.24-69.956-1.518-39.877 19.858-73.207 47.764-74.454 27.875-1.224 51.703 30.109 53.218 69.974 1.527 39.877-19.853 73.2-47.742 74.436m206.67-69.956c-1.494 39.85-25.34 71.194-53.24 69.956-27.888-1.238-49.269-34.559-47.742-74.435 1.513-39.868 25.341-71.201 53.216-69.974 27.909 1.247 49.285 34.576 47.767 74.453" fill="#FFFFFF"></path><path d="M683.94261 368.627c-7.323-17.609-81.062-37.227-172.353-37.227h-0.98c-91.29 0-165.031 19.618-172.352 37.227a6.244 6.244 0 0 0-0.535 2.505c0 1.269 0.393 2.414 1.006 3.386 6.168 9.765 88.054 58.018 171.882 58.018h0.98c83.827 0 165.71-48.25 171.881-58.016a6.352 6.352 0 0 0 1.002-3.395c0-0.897-0.2-1.736-0.531-2.498" fill="#FAAD08"></path><path d="M467.63161 256.377c1.26 15.886-7.377 30-19.266 31.542-11.907 1.544-22.569-10.083-23.836-25.978-1.243-15.895 7.381-30.008 19.25-31.538 11.927-1.549 22.607 10.088 23.852 25.974m73.097 7.935c2.533-4.118 19.827-25.77 55.62-17.886 9.401 2.07 13.75 5.116 14.668 6.316 1.355 1.77 1.726 4.29 0.352 7.684-2.722 6.725-8.338 6.542-11.454 5.226-2.01-0.85-26.94-15.889-49.905 6.553-1.579 1.545-4.405 2.074-7.085 0.242-2.678-1.834-3.786-5.553-2.196-8.135" fill="#000000"></path><path d="M504.33261 584.495h-0.967c-63.568 0.752-140.646-7.504-215.286-21.92-6.391 36.262-10.25 81.838-6.936 136.196 8.37 137.384 91.62 223.736 220.118 224.996H506.48461c128.498-1.26 211.748-87.612 220.12-224.996 3.314-54.362-0.547-99.938-6.94-136.203-74.654 14.423-151.745 22.684-215.332 21.927" fill="#FFFFFF"></path><path d="M323.27461 577.016v137.468s64.957 12.705 130.031 3.91V591.59c-41.225-2.262-85.688-7.304-130.031-14.574" fill="#EB1C26"></path><path d="M788.09761 432.536s-121.98 40.387-283.743 41.539h-0.962c-161.497-1.147-283.328-41.401-283.744-41.539l-40.854 106.952c102.186 32.31 228.837 53.135 324.598 51.926l0.96-0.002c95.768 1.216 222.4-19.61 324.6-51.924l-40.855-106.952z" fill="#EB1C26"></path>
</symbol>`;

const ROBOT_FEISHU_ICON_SVG = `<symbol id="iconRobotFeishu" viewBox="0 0 1024 1024">
    <path d="M891.318857 340.845714c4.900571 0 9.728 0.292571 14.628572 0.804572a409.965714 409.965714 0 0 1 108.836571 30.061714c10.093714 4.534857 12.580571 8.192 3.949714 17.334857-24.868571 26.624-45.494857 57.051429-61.001143 89.965714-16.822857 35.328-35.108571 69.851429-52.297142 105.033143a225.28 225.28 0 0 1-52.150858 69.412572c-53.613714 48.493714-116.150857 68.973714-187.538285 59.099428-81.92-11.337143-159.451429-38.985143-232.740572-75.483428a143.506286 143.506286 0 0 1-10.459428-5.485715 5.339429 5.339429 0 0 1 0.292571-9.216l5.12-2.706285c59.245714-31.670857 108.836571-75.849143 156.525714-122.294857 20.187429-19.529143 39.497143-40.009143 59.904-59.318858A345.014857 345.014857 0 0 1 804.571429 352.256c13.165714-3.218286 26.550857-5.778286 39.789714-8.630857h0.585143l28.233143-2.56" fill="#133C9A"></path><path d="M317.659429 913.846857c-8.996571-0.512-31.158857-3.584-33.865143-3.949714a536.429714 536.429714 0 0 1-165.083429-48.274286c-30.208-14.116571-59.245714-30.72-88.356571-46.957714-19.163429-10.678857-27.794286-27.282286-27.648-49.883429 0.585143-83.382857 0.585143-166.765714 0-250.148571C2.413714 461.019429 0.731429 407.405714 0 353.718857c0-4.754286 0.731429-9.508571 2.194286-13.897143 3.291429-9.728 9.947429-10.24 16.530285-3.949714 7.606857 7.314286 13.677714 16.237714 21.211429 23.405714 67.291429 66.413714 138.752 127.195429 218.770286 177.225143 45.056 28.891429 91.940571 54.710857 140.434285 77.385143 77.750857 35.328 157.549714 66.486857 241.078858 86.235429 73.874286 17.481143 145.627429 6.436571 205.458285-40.374858 18.285714-15.652571 27.282286-27.062857 48.932572-55.881142a359.862857 359.862857 0 0 1-37.376 72.850285c-13.897143 21.942857-45.348571 51.2-69.193143 74.093715-36.278857 35.108571-83.748571 63.561143-128.292572 87.552-48.566857 26.185143-99.035429 47.104-152.941714 58.514285-27.648 6.948571-67.584 14.848-81.334857 15.579429-2.413714-0.146286-10.678857 1.682286-14.848 1.389714-35.547429 2.633143-57.490286 3.657143-92.891429 0z" fill="#3370FF"></path><path d="M165.083429 110.518857a52.443429 52.443429 0 0 1 7.460571 0c152.649143 0 304.128 2.486857 456.630857 2.486857 0.292571 0 0.585143 0 0.731429 0.219429 14.189714 12.361143 27.282286 25.746286 39.277714 40.155428 34.450286 34.230857 60.123429 93.622857 77.677714 129.755429 8.777143 25.014857 21.942857 48.859429 28.16 76.8v0.438857c-15.579429 5.046857-30.72 11.190857-45.348571 18.505143-44.178286 22.381714-64.219429 38.765714-100.790857 74.752-19.968 19.529143-37.010286 37.083429-63.488 62.098286a563.346286 563.346286 0 0 1-29.769143 26.916571c-7.021714-12.434286-125.732571-244.589714-364.251429-427.300571" fill="#00D6B9"></path>
</symbol>`;

interface PluginConfig {
    quickNotesEnabled?: boolean;
    quickNotesPosition?: string;
    quickNotesTimestampEnabled?: boolean;
    quickNotesAddPosition?: string;
    taskEditorEnabled?: boolean;
    sidebarEnabled?: boolean;
    mobileAutoOpenEnabled?: boolean;
    mobileAutoOpenTarget?: string;
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
    private enhancedDiaryWorkspaceInitialAction: EnhancedDiaryWorkspaceAction | null = null;
    private kbChatInstance: Record<string, any> | null = null;
    private kbChatTabDiv: HTMLDivElement | null = null;
    private kbDockInstance: Record<string, any> | null = null;
    private kbDockRegistered = false;
    private kbDockInitGeneration = 0;
    private sidebarDockInstance: Record<string, any> | null = null;
    private mobileQuickActionsHost: HTMLDivElement | null = null;
    private mobileQuickActionsInstance: Record<string, any> | null = null;
    private mobileMusicRuntimeHost: HTMLDivElement | null = null;
    private mobileMusicRuntimeInstance: Record<string, any> | null = null;
    private mobileQuickActionsPositionSaveTimer: number | null = null;
    private pendingMobileQuickActionsPosition: MobileQuickActionsPosition | null = null;
    private mobileAutoOpenAttempted = false;
    private customTabsRegistered = false;
    private homepageTopBarElement: HTMLElement | null = null;
    private kbTopBarElement: HTMLElement | null = null;
    ADVANCED = false;
    private homepageEntitlementReady = false;
    private homepageEntitlementVerification: Promise<void> | null = null;
    private homepageEntitlementCheckTimer: number | null = null;
    private homepageEntitlementFailureCount = 0;
    private homepageEntitlementReminderKey = "";
    private homepageServerSyncAt = 0;
    private homepageServerSyncInFlight: Promise<void> | null = null;
    private homepageServerRevokedLicense = "";
    private homepageEntitlementVisibilityBindThis = () => {
        if (document.visibilityState !== "visible") return;
        const snapshot = getHomepageEntitlementSnapshot();
        if (snapshot.status === "pending" || snapshot.status === "error" || Date.now() - snapshot.checkedAt >= 30_000) {
            void this.verifyLicense();
        }
    };
    private docTreeMenuEventBindThis = this.handleDocTreeMenu.bind(this);
    private contentMenuEventBindThis = this.handleContentMenu.bind(this);
    private editorTitleIconMenuEventBindThis = this.handleEditorTitleIconMenu.bind(this);
    private blockIconMenuEventBindThis = this.handleBlockIconMenu.bind(this);
    private homepageSettingsSavedBindThis = this.handleHomepageSettingsSaved.bind(this);
    private homepageAdvancedReadyBindThis = this.handleHomepageAdvancedReady.bind(this);
    private homepageAdvancedUnavailableBindThis = this.handleHomepageAdvancedUnavailable.bind(this);

    // 全局背景异步刷新版本号：防止旧请求覆盖新状态
    private globalBackgroundApplyVersion = 0;

    // 设备视图访问阻断状态：结构化错误被捕获后保存，用于阻止依赖设备视图的功能
    private deviceViewBlocked: Readonly<DeviceViewAccessBlockedError> | null = null;

    // 主页 surface 暂不可用只影响主页，不阻断独立业务。
    private homepageSurfaceUnavailable: Readonly<DeviceViewTemporarilyIncompleteError> | null = null;
    // 未分类的主页 surface 读取错误：只停用主页，显式重新打开时允许重试。
    private homepageSurfaceReadError: Error | null = null;
    // 设备身份不可用：不阻断通知/日记/AI/桥接等独立业务，但阻止设备视图初始化。
    private deviceIdentityUnavailable: Error | null = null;
    private deviceIdentityInitialization: Promise<void> | null = null;
    private homepageLayoutReadyFinalized = false;
    private readonly readyDeviceViewSurfaces = new Set<DeviceViewSurface>();
    private mobileQuickActionsAppliedSignature = "";
    private mobileQuickActionsPendingRefresh = false;
    private mobileQuickActionsRefreshing = false;
    private mobileQuickActionsRefreshTimer: number | null = null;
    private mobileQuickActionsVisibilityHandler: (() => void) | null = null;
    private mobileQuickActionsFocusHandler: (() => void) | null = null;
    private cancelDeferredBackgroundStartup: (() => void) | null = null;
    private desktopCommandsRegistered = false;
    private homepageWindowListenersRegistered = false;
    private baseEventListenersRegistered = false;
    private contentMenuListenerRegistered = false;
    private sidebarDockRegistered = false;
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
        if (error instanceof DeviceViewAccessBlockedError) {
            this.deviceViewBlocked = Object.freeze(error);
            this.homepageSurfaceUnavailable = null;
            this.homepageSurfaceReadError = null;
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
        const startupTrace = createRuntimePerformanceTrace("plugin-startup");
        setSiyuanRuntimePort({
            post: (path, payload) => fetchSyncPost(path, payload),
            getFile: (path) => new Promise((resolve) => {
                fetchPost("/api/file/getFile", { path }, (content: unknown) => resolve(content));
            }),
            getFrontend: () => getFrontend(),
            platform: {
                isInAndroid: () => Boolean(platformUtils.isInAndroid?.()),
                isInIOS: () => Boolean(platformUtils.isInIOS?.()),
                isHuawei: () => Boolean(platformUtils.isHuawei?.()),
                sendNotification: (params) => platformUtils.sendNotification(params as Parameters<typeof platformUtils.sendNotification>[0]),
                cancelNotification: (id) => platformUtils.cancelNotification(id),
            },
        });
        setOpenDocsRuntime((plugin, id, mode) => openDocsInClientRuntime(plugin, id, mode, {
            openMobileFileById: (app, docId) => openMobileFileById(app as Parameters<typeof openMobileFileById>[0], docId),
            openTab: (options) => openTab(options as unknown as Parameters<typeof openTab>[0]),
        }));
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        resetHomepageEntitlement(this);
        document.addEventListener("visibilitychange", this.homepageEntitlementVisibilityBindThis);

        // 第一部分：首个 await 前同步完成所有独立能力和最小主页入口注册。
        setSharedWidgetStoragePlugin(this);
        setQuickNoteWritePlugin(this);
        setQuickNoteConfigLoader(async (plugin) => (await loadHomepageConfigDataStrict(plugin)).data);
        setKbSettingsPlugin(this);
        setReferenceNavigationPlugin(this);
        setNotebrainPlugin(this);
        setPluginStorage({ saveData, loadData, removeData });
        setNotificationCenterPlugin(this);
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
            registerMobileNotificationPlanProvider(notificationRuleMobilePlanProvider),
        ];
        this.registerIcon();
        this.ensureTabContainers();
        this.registerCustomTabs();
        this.registerBaseIndependentListeners();
        this.registerMobileQuickActionsForegroundListeners();
        this.registerMinimalHomepageEntry();
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };
        startupTrace.checkpoint("registrations-ready");

        // 会员校验独立于设备视图启动；所有端都尽早开始，但不阻塞基础功能加载。
        void this.verifyLicense();

        // 第二部分：启动共享身份 Promise 并立即附加失败处理，但暂不等待。
        const identityPromise = this.ensureDeviceIdentityForRuntime();
        void identityPromise.catch(() => undefined);

        // 划词设置不影响插件注册和主页可用性，不再阻塞 onload。
        void loadSelectionAiToolbarSettingsSnapshot(this)
            .catch((error) => {
                console.warn("[Homepage] 划词 AI 设置读取失败，划词 AI 本次停用", error);
            })
            .finally(() => initSelectionAiToolbarPointerTracker());
        startupTrace.checkpoint("noncritical-settings-scheduled");

        // 第三部分：独立能力完成后才等待身份；失败只停用设备视图。
        try {
            await identityPromise;
            startupTrace.checkpoint("device-identity-ready");
            const config = await this.recoverDeviceViewRuntimeAfterIdentityReady();
            void this.saveData(ROBOT_QUICK_NOTE_CONFIG_KEY, {
                quickNotesPosition: config.quickNotesPosition ?? "",
                quickNotesTimestampEnabled: config.quickNotesTimestampEnabled ?? true,
                quickNotesAddPosition: config.quickNotesAddPosition ?? "bottom",
            }).catch((error) => console.warn("[Homepage] 快速笔记 Kernel 配置快照同步失败", error));
            this.syncHomepageConfigDependentListeners(config);
            startupTrace.finish("device-view-ready");
        } catch (error) {
            this.syncHomepageConfigDependentListeners(null);
            if (error instanceof DeviceViewAccessBlockedError) {
                if (markDeviceViewBlockedNotified(error.deviceId, error.surface)) {
                    showMessage(formatDeviceViewBlockedUserMessage(error), 0, "error");
                }
            } else if (this.deviceIdentityUnavailable) {
                showMessage("设备身份初始化失败，主页和侧边栏暂不可用；独立业务仍可使用。", 0, "error");
            } else {
                console.warn("[Homepage] 设备视图初始化失败；独立业务继续运行", error);
            }
            startupTrace.finish("device-view-unavailable");
        }
    }

    private async applyGlobalBackgroundImageStyle(): Promise<void> {
        const version = ++this.globalBackgroundApplyVersion;
        const config = await loadHomepageConfig(this);
        if (version !== this.globalBackgroundApplyVersion) return;
        const advancedEnabled = isHomepageEntitlementGranted();
        const { backgroundImageSrc } = await resolveBackgroundImage(config, advancedEnabled);
        if (version !== this.globalBackgroundApplyVersion) return;
        updateGlobalBackgroundImageStyle({
            advanced: advancedEnabled,
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
        this.syncKbTopBar(config);
    }

    private registerMinimalHomepageEntry(): void {
        this.registerHomepageTopBar();
        this.registerDesktopCommands();
    }

    private async initializeHomepageSurface(config: PluginConfig): Promise<void> {
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
        try {
            // 常驻播放器可能在冷启动校验完成前以锁定态挂载，授权恢复时重建一次。
            this.destroyMobileMusicRuntime();
            this.ensureMobileMusicRuntime();
        } catch (error) {
            console.warn("[Homepage] 移动音乐常驻运行实例初始化失败:", error);
        }
    }

    private async handleHomepageAdvancedUnavailable(): Promise<void> {
        this.destroyMobileMusicRuntime();
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
        this.cancelDeferredBackgroundStartup?.();
        this.cancelDeferredBackgroundStartup = null;
        if (this.homepageEntitlementCheckTimer !== null) {
            window.clearTimeout(this.homepageEntitlementCheckTimer);
            this.homepageEntitlementCheckTimer = null;
        }
        document.removeEventListener("visibilitychange", this.homepageEntitlementVisibilityBindThis);
        this.destroyMobileMusicRuntime();
        await disposeRobotClientRuntime();
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
        destroyTaskNotifyScheduler();
        destroyCountdownNotifyScheduler();
        destroyEnhancedDiaryNotifyScheduler();
        destroyReviewNotifyScheduler();
        destroyAutomationRuntime();
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
        this.unregisterMobileQuickActionsForegroundListeners();
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
        // SiYuan passes an empty array when it only wants to enumerate shortcut items.
        // The selection AI menu is an editor toolbar action, not a shortcut command.
        if (toolbar.length === 0) return toolbar;

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
        const layoutTrace = createRuntimePerformanceTrace("layout-ready");
        // 通知首轮扫描与机器人 Provider 都是后台能力，让出思源布局恢复的关键帧。
        this.cancelDeferredBackgroundStartup?.();
        this.cancelDeferredBackgroundStartup = scheduleIdleTask(() => {
            this.cancelDeferredBackgroundStartup = null;
            const starters: Array<readonly [string, () => void]> = [
                ["通知中心", startNotificationCenterRuntime],
                ["自动化中心", startAutomationRuntime],
                ["任务通知", startTaskNotifyScheduler],
                ["倒计时通知", startCountdownNotifyScheduler],
                ["日记通知", startEnhancedDiaryNotifyScheduler],
                ["复习通知", startReviewNotifyScheduler],
            ];
            for (const [name, start] of starters) {
                try {
                    start();
                } catch (error) {
                    console.warn(`[Homepage] ${name}启动失败，其他后台能力继续运行`, error);
                }
            }
            // 手机端不参与机器人运行设备竞争，也不加载任何渠道 Provider。
            if (!this.isMobileFrontend()) initRobotClientRuntime(this);
            layoutTrace.checkpoint("background-runtimes-started");
        }, { timeout: 1200 });
        layoutTrace.checkpoint("background-runtimes-scheduled");

        try {
            await this.ensureDeviceIdentityForRuntime();
        } catch {
            layoutTrace.finish("device-identity-unavailable");
            return;
        }
        layoutTrace.checkpoint("device-identity-ready");

        try {
            const config = await this.recoverDeviceViewRuntimeAfterIdentityReady();
            this.syncHomepageConfigDependentListeners(config);
            if (!this.homepageLayoutReadyFinalized) {
                await this.finalizeHomepageSurfaceOnLayoutReady(config);
                this.homepageLayoutReadyFinalized = true;
            }
            layoutTrace.finish("homepage-surface-ready");
        } catch (error) {
            this.syncHomepageConfigDependentListeners(null);
            console.warn("[Homepage] onLayoutReady 设备视图恢复失败，独立业务继续运行", error);
            layoutTrace.finish("homepage-surface-unavailable");
        }
    }

    private async finalizeHomepageSurfaceOnLayoutReady(config: PluginConfig): Promise<void> {
        // 检查是否在新窗口中打开
        const isNewWindow = this.isNewWindow();

        // 只在非新窗口中自动打开主页
        if (!isNewWindow) {
            if (this.isMobileFrontend()) {
                // 先验证许可
                await this.waitForHomepageEntitlementReady();

                // 音频运行实例挂在插件层，主页或播放器界面关闭后仍保留播放。
                this.ensureMobileMusicRuntime();

                // 挂载悬浮快捷按钮
                this.mountMobileQuickActions(config);

                // 移动端自动打开窗口（仅一次）
                if (!this.mobileAutoOpenAttempted && isHomepageEntitlementGranted()) {
                    this.mobileAutoOpenAttempted = true;
                    const { enabled, target } = resolveMobileAutoOpenConfig(config);
                    if (enabled && isMobileAutoOpenTargetId(target)) {
                        try {
                            await this.runMobileQuickAction(target);
                        } catch (_error) {
                            const definition = MOBILE_QUICK_ACTION_DEFINITIONS.find((d) => d.id === target);
                            const targetLabel = definition?.label || target;
                            showMessage(`自动打开“${targetLabel}”失败`, 3500, "error");
                        }
                    }
                }
            } else if (config.autoOpenHomepage === true) {
                await this.openHomepage();
                void this.waitForHomepageEntitlementReady();
            } else {
                this.destroyMobileQuickActions();
                void this.waitForHomepageEntitlementReady();
            }
        } else {
            this.destroyMobileQuickActions();
            void this.waitForHomepageEntitlementReady();
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
                    if (error instanceof DeviceViewAccessBlockedError) {
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
        container.style.height = "100%";
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
     * 顺序：confirm identity → migrate primary → sidebar readiness → verify license。
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
                await ensureCurrentDeviceViewReady(context);
            } catch (error) {
                this.captureHomepageSurfaceError(primarySurface, error);
                if (error instanceof DeviceViewAccessBlockedError) {
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
                await ensureCurrentDeviceViewReady(sidebarContext);
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
            return config;
        } catch (error) {
            this.captureHomepageSurfaceError(primarySurface, error);
            this.syncHomepageConfigDependentListeners(null);
            throw error;
        }
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

        const initialAction = this.enhancedDiaryWorkspaceInitialAction;
        this.enhancedDiaryWorkspaceInitialAction = null;
        this.enhancedDiaryWorkspaceInstance = mount(EnhancedDiaryWorkspacePage as any, {
            target: this.enhancedDiaryWorkspaceTabDiv,
            props: {
                plugin: this,
                initialTab: this.enhancedDiaryWorkspaceInitialTab,
                initialAction,
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

    public async waitForHomepageEntitlementReady(): Promise<void> {
        if (this.homepageEntitlementVerification) {
            await this.homepageEntitlementVerification;
            return;
        }
        const snapshot = getHomepageEntitlementSnapshot();
        if (this.homepageEntitlementReady && snapshot.status !== "pending" && snapshot.status !== "error") return;
        await this.verifyLicense();
    }

    public async ensureHomepageAdvanced(featureLabel: string): Promise<boolean> {
        await this.waitForHomepageEntitlementReady();
        if (isHomepageEntitlementGranted()) return true;
        showMessage(resolveHomepageEntitlementMessage(featureLabel), 4000, "error");
        return false;
    }

    public refreshHomepageEntitlement(): Promise<void> {
        this.homepageEntitlementReady = false;
        return this.verifyLicense();
    }

    private verifyLicense(): Promise<void> {
        if (this.homepageEntitlementVerification) return this.homepageEntitlementVerification;

        markHomepageEntitlementPending(this);
        const verification = this.runLicenseVerification();
        const trackedVerification = verification.finally(() => {
            this.homepageEntitlementReady = true;
            if (this.homepageEntitlementVerification === trackedVerification) {
                this.homepageEntitlementVerification = null;
            }
        });
        this.homepageEntitlementVerification = trackedVerification;
        return trackedVerification;
    }

    private async runLicenseVerification(): Promise<void> {
        try {
            const vipInfo = await withEntitlementTimeout(
                advanced.updateVIP(),
                8_000,
                "membership identity",
            );
            const userName = vipInfo.USER_NAME;
            const userId = vipInfo.USER_ID;
            const licenseResult = await withEntitlementTimeout(
                advanced.verifySavedSignedLicenseReadOnly(this, userName, userId),
                8_000,
                "saved membership license",
            );

            if (licenseResult.valid && licenseResult.code === 0 && licenseResult.userInfo) {
                if (this.homepageServerRevokedLicense) {
                    const saved = await advanced.readSavedActivationCodeState(this);
                    if (saved.status === "found" && saved.code === this.homepageServerRevokedLicense) {
                        denyHomepageEntitlement(this, "会员授权已由服务器撤销");
                        this.homepageServerSyncAt = 0;
                        this.scheduleHomepageEntitlementCheck(null);
                        void this.syncHomepageServerLicense(vipInfo);
                        return;
                    }
                    if (saved.status === "found" && saved.code !== this.homepageServerRevokedLicense) {
                        this.homepageServerRevokedLicense = "";
                    }
                }
                const snapshot = grantHomepageEntitlement(this, licenseResult.userInfo);
                this.homepageEntitlementFailureCount = 0;
                this.scheduleHomepageEntitlementCheck(snapshot.validUntil);
                void this.syncHomepageServerLicense(vipInfo);

                const remainingDays = licenseResult.userInfo.remainingDays;
                const isLifetime = licenseResult.userInfo.isLifetime === true;
                const reminderKey = isLifetime ? "" : `${licenseResult.userInfo.userId}:${remainingDays}`;

                if (!isLifetime && reminderKey !== this.homepageEntitlementReminderKey) {
                    if (remainingDays === 7) {
                        showMessage("您的激活码还有 7 天过期，建议及时更新！");
                    } else if (remainingDays === 3) {
                        showMessage("您的激活码还有 3 天过期，建议及时更新！");
                    } else if (remainingDays === 1) {
                        showMessage("您的激活码还有 1 天过期，建议及时更新！");
                    }
                    this.homepageEntitlementReminderKey = reminderKey;
                }
            } else {
                if (licenseResult.code === 1 || licenseResult.code === 52) {
                    this.handleHomepageEntitlementCheckFailure(
                        licenseResult.error || (licenseResult.code === 1 ? "思源账号身份尚未就绪" : "本地会员授权读取失败"),
                    );
                    return;
                }
                denyHomepageEntitlement(this, licenseResult.error || "会员授权无效");
                this.homepageEntitlementFailureCount = 0;
                this.homepageEntitlementReminderKey = "";
                this.scheduleHomepageEntitlementCheck(null);

                if (licenseResult.code === 31 && licenseResult.error) {
                    showMessage(licenseResult.error);
                }
            }
        } catch (error) {
            console.error("会员校验失败:", error);
            this.handleHomepageEntitlementCheckFailure(
                error instanceof Error ? error.message : "会员校验异常",
            );
        }
    }

    private handleHomepageEntitlementCheckFailure(reason: string): void {
        const snapshot = failHomepageEntitlementCheck(this, reason);
        this.homepageEntitlementFailureCount += 1;
        const retryDelays = [2_000, 5_000, 15_000, 60_000, 5 * 60_000];
        const delay = retryDelays[Math.min(this.homepageEntitlementFailureCount - 1, retryDelays.length - 1)];
        this.scheduleHomepageEntitlementCheck(snapshot.validUntil, delay);
    }

    private scheduleHomepageEntitlementCheck(validUntil: number | null, delayOverride?: number): void {
        if (this.homepageEntitlementCheckTimer !== null) {
            window.clearTimeout(this.homepageEntitlementCheckTimer);
        }
        const periodicDelay = 5 * 60_000;
        const expiryDelay = validUntil === null
            ? periodicDelay
            : Math.max(50, validUntil - Date.now() + 50);
        const delay = Math.min(delayOverride ?? periodicDelay, expiryDelay, 0x7fffffff);
        this.homepageEntitlementCheckTimer = window.setTimeout(() => {
            this.homepageEntitlementCheckTimer = null;
            void this.verifyLicense();
        }, delay);
    }

    private syncHomepageServerLicense(identity: advanced.VIPIdentity): Promise<void> {
        if (this.homepageServerSyncInFlight) return this.homepageServerSyncInFlight;
        if (Date.now() - this.homepageServerSyncAt < 30 * 60_000) return Promise.resolve();

        this.homepageServerSyncAt = Date.now();
        const operation = this.runHomepageServerLicenseSync(identity).catch((error) => {
            // 服务端不可达不否定仍在有效期内且已通过本地签名验证的离线授权。
            console.debug("[Homepage] 会员服务端状态同步暂不可用，保留本地签名授权", error);
        });
        const tracked = operation.finally(() => {
            if (this.homepageServerSyncInFlight === tracked) this.homepageServerSyncInFlight = null;
        });
        this.homepageServerSyncInFlight = tracked;
        return tracked;
    }

    private async runHomepageServerLicenseSync(identity: advanced.VIPIdentity): Promise<void> {
        if (!identity.USER_ID || !identity.USER_CODE_V2) return;
        const saved = await advanced.readSavedActivationCodeState(this);
        if (saved.status !== "found" || !saved.code.startsWith("SH.")) return;
        const expectedLicense = saved.code;
        const response = await syncLicenseStatus({
            userCode: identity.USER_CODE_V2,
            currentLicense: expectedLicense,
            pluginVersion: pluginManifest.version || "unknown",
        });

        if (response.status === "active" && response.changed) {
            const liveIdentity = await advanced.updateVIP();
            if (liveIdentity.USER_ID !== identity.USER_ID) {
                denyHomepageEntitlement(this, "当前思源账号已变化");
                this.scheduleHomepageEntitlementCheck(null, 250);
                return;
            }
            const result = await advanced.activateLicense(
                this,
                response.license,
                identity.USER_NAME,
                identity.USER_ID,
                {
                    serverManagedSource: "license_sync",
                    serverManagedServiceOrigin: DEFAULT_BASE_URL,
                    expectedCurrentLicense: expectedLicense,
                },
            );
            if (result.valid && result.userInfo) {
                const confirmedIdentity = await advanced.updateVIP();
                if (confirmedIdentity.USER_ID !== identity.USER_ID) {
                    denyHomepageEntitlement(this, "当前思源账号已变化");
                    this.scheduleHomepageEntitlementCheck(null, 250);
                    return;
                }
                this.homepageServerRevokedLicense = "";
                const snapshot = grantHomepageEntitlement(this, result.userInfo);
                this.scheduleHomepageEntitlementCheck(snapshot.validUntil);
            }
            return;
        }

        if (response.status !== "revoked" && this.homepageServerRevokedLicense === expectedLicense) {
            this.homepageServerRevokedLicense = "";
            void this.refreshHomepageEntitlement();
        }

        if (response.status === "revoked") {
            this.homepageServerRevokedLicense = expectedLicense;
            denyHomepageEntitlement(this, "会员授权已由服务器撤销");
            this.scheduleHomepageEntitlementCheck(null, 60_000);
            if (!response.clearLocalLicense) return;
            const deleted = await advanced.deleteLicense(this, expectedLicense);
            if (deleted === "deleted" || deleted === "already_missing") {
                this.homepageEntitlementReminderKey = "";
                this.scheduleHomepageEntitlementCheck(null);
            }
        }
    }

    private registerIcon() {
        this.addIconIfMissing("iconhomepage", HOMEPAGE_ICON_SVG);
        this.addIconIfMissing("iconTask", TASK_ICON_SVG);
        this.addIconIfMissing("iconSparkles", SPARKLES_ICON_SVG);
        this.addIconIfMissing("iconNotebrain", NOTEBRAIN_ICON_SVG);
        this.addIconIfMissing("iconRobotWechat", ROBOT_WECHAT_ICON_SVG);
        this.addIconIfMissing("iconRobotFeishu", ROBOT_FEISHU_ICON_SVG);
        this.addIconIfMissing("iconRobotQQ", ROBOT_QQ_ICON_SVG);
    }

    private addIconIfMissing(symbolId: string, svg: string): void {
        if (document.querySelector(`symbol#${symbolId}`)) {
            return;
        }
        this.addIcons(svg);
    }

    private registerDesktopCommands(): void {
        if (this.isMobile || this.desktopCommandsRegistered) return;
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
        this.addCommand({
            langKey: "快速笔记",
            hotkey: "⇧⌘Q",
            callback: () => {
                void this.openQuickNotesDialog();
            },
        });
        this.addCommand({
            langKey: "打开记账",
            hotkey: "",
            callback: () => {
                void openAccountingDetailDialogFromPlugin(this, "overview");
            },
        });
        this.addCommand({
            langKey: "打开强化日记工作台",
            hotkey: "",
            callback: () => {
                this.openEnhancedDiaryWorkspace("overview");
            },
        });
        this.addCommand({
            langKey: "强化日记工作台：新建任务",
            hotkey: "",
            callback: () => {
                this.openEnhancedDiaryWorkspace("tasks", "create-task");
            },
        });
        this.addCommand({
            langKey: "强化日记工作台：快速记录",
            hotkey: "",
            callback: () => {
                this.openEnhancedDiaryWorkspace("records", "create-record");
            },
        });
        this.addCommand({
            langKey: "新标签页AI对话",
            hotkey: "",
            callback: () => {
                void this.openKbChatTab();
            },
        });
        this.desktopCommandsRegistered = true;
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
                    width: "min(480px, calc(100vw - 32px))",
                    height: "340px",
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
        if (this.homepageTopBarElement !== null) return;
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
            if (this.kbTopBarElement !== null) return;
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

    private runMobileQuickAction(actionId: MobileQuickActionId): void | Promise<void> {
        switch (actionId) {
            case "accounting-record":
                return openAccountingDetailDialogFromPlugin(this, "record");
            case "mobile-homepage":
                return this.openMobileHomepage();
            case "music-player":
                return this.openMobileMusicPlayer();
            case "enhanced-diary-workspace":
                return this.openEnhancedDiaryWorkspace();
            case "ai-knowledge-base":
                return this.openMobileKbChat();
            case "quick-notes":
                return this.openQuickNotesDialog();
            case "mobile-settings":
                return this.openMobileSettingsDialog();
            default:
                return;
        }
    }

    private async openMobileMusicPlayer(): Promise<void> {
        if (!await this.ensureHomepageAdvanced("音乐播放器")) return;
        this.ensureMobileMusicRuntime();
        if (!this.mobileMusicRuntimeInstance) {
            showMessage("移动音乐播放器暂不可用，请确认高级功能已启用。", 5000, "error");
            return;
        }

        let request = requestOpenMobileMusicPlayer();
        if (request.handled) {
            if (request.unavailableReason) showMessage(request.unavailableReason, 5000, "error");
            return;
        }

        for (let attempt = 0; attempt < 48; attempt++) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
            request = requestOpenMobileMusicPlayer();
            if (!request.handled) continue;
            if (request.unavailableReason) showMessage(request.unavailableReason, 5000, "error");
            return;
        }
        showMessage("NAS 音乐播放器仍在初始化，请稍后重试。", 5000, "error");
    }

    private ensureMobileMusicRuntime(): void {
        if (
            this.mobileMusicRuntimeInstance
            || this.mobileMusicRuntimeHost
            || this.isNewWindow()
            || !this.isMobileFrontend()
            || !isHomepageEntitlementGranted()
        ) return;

        const host = document.createElement("div");
        host.dataset.siyuanHomepageMobileMusicRuntime = "true";
        host.hidden = true;
        document.body.appendChild(host);
        this.mobileMusicRuntimeHost = host;

        try {
            const deviceViewContext = getCurrentDeviceViewContext(this, "mobile-homepage");
            const contentTypeJson = JSON.stringify({
                type: "musicPlayer",
                instanceId: "mobile-persistent-music-runtime",
                data: {
                    sourceMode: "subsonic",
                    autoPlay: false,
                    showCover: true,
                    showLyrics: true,
                    parseMetadata: true,
                },
            });
            this.mobileMusicRuntimeInstance = mount(MusicPlayerRuntime, {
                target: host,
                props: {
                    plugin: this,
                    contentTypeJson,
                    runtimeContext: {
                        placement: "mobile-runtime",
                        persistentMusicRuntime: true,
                        deviceViewContext,
                    },
                },
            });
        } catch (error) {
            this.mobileMusicRuntimeInstance = null;
            this.mobileMusicRuntimeHost?.remove();
            this.mobileMusicRuntimeHost = null;
            throw error;
        }
    }

    private destroyMobileMusicRuntime(): void {
        if (this.mobileMusicRuntimeInstance) {
            try {
                unmount(this.mobileMusicRuntimeInstance);
            } catch {
                // 忽略插件卸载或许可失效期间的音频运行实例清理错误。
            }
            this.mobileMusicRuntimeInstance = null;
        }
        this.mobileMusicRuntimeHost?.remove();
        this.mobileMusicRuntimeHost = null;
    }

    private buildMobileQuickActions(config: PluginConfig): MobileQuickAction[] {
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
                    run: () => this.runMobileQuickAction(definition.id),
                };
            })
            .filter((item): item is MobileQuickAction => item !== null);
    }

    private mountMobileQuickActions(config: PluginConfig): void {
        if (this.isNewWindow() || !this.isMobileFrontend() || !isHomepageEntitlementGranted() || config.mobileQuickActionsEnabled === false) {
            this.destroyMobileQuickActions();
            this.mobileQuickActionsAppliedSignature = "";
            return;
        }

        const buttonSize = normalizeMobileQuickActionButtonSize(config.mobileQuickActionsButtonSize);
        const actions = this.buildMobileQuickActions(config);
        if (actions.length === 0) {
            this.destroyMobileQuickActions();
            this.mobileQuickActionsAppliedSignature = "";
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

        // 记录成功挂载后的签名，避免前台刷新重复挂载
        this.mobileQuickActionsAppliedSignature = this.buildMobileQuickActionsSignature(config);
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

    private buildMobileQuickActionsSignature(config: PluginConfig): string {
        const items = normalizeMobileQuickActionItems(config.mobileQuickActionItems)
            .map((item) => ({ id: item.id, enabled: item.enabled, order: item.order }));

        const payload = {
            enabled: config.mobileQuickActionsEnabled ?? true,
            buttonSize: normalizeMobileQuickActionButtonSize(config.mobileQuickActionsButtonSize),
            items,
            position: normalizeMobileQuickActionsPosition(config.mobileQuickActionsPosition),
        };

        return JSON.stringify(payload);
    }

    private async refreshMobileQuickActionsFromSharedConfig(
        reason: "visibility" | "focus" | "local-save",
    ): Promise<void> {
        if (!this.isMobileFrontend() || this.isNewWindow()) return;

        try {
            const strictRead = await loadHomepageConfigDataStrict(this, "mobile-homepage");
            const data = strictRead.data as PluginConfig;

            const signature = this.buildMobileQuickActionsSignature(data);

            if (signature === this.mobileQuickActionsAppliedSignature) {
                // 配置未变化，不重新挂载
                return;
            }

            this.mountMobileQuickActions(data);
        } catch {
            // 读取失败：保留当前悬浮按钮，记录局部 warning，不打扰用户
            console.warn(
                `[Homepage] refreshMobileQuickActionsFromSharedConfig(${reason}) 读取 mobile-homepage 失败，保留当前悬浮按钮`,
            );
        }
    }

    private scheduleMobileQuickActionsRefresh(reason: "visibility" | "focus"): void {
        if (!this.isMobileFrontend() || this.isNewWindow()) return;

        // 如果正在刷新中，记录一次 pending
        if (this.mobileQuickActionsRefreshing) {
            this.mobileQuickActionsPendingRefresh = true;
            return;
        }

        // 已有定时器则重置，延续防抖窗口
        if (this.mobileQuickActionsRefreshTimer !== null) {
            clearTimeout(this.mobileQuickActionsRefreshTimer);
            this.mobileQuickActionsRefreshTimer = null;
        }

        this.mobileQuickActionsRefreshTimer = window.setTimeout(() => {
            this.mobileQuickActionsRefreshTimer = null;
            void this.performMobileQuickActionsRefresh(reason);
        }, 500);
    }

    private async performMobileQuickActionsRefresh(
        reason: "visibility" | "focus",
    ): Promise<void> {
        this.mobileQuickActionsRefreshing = true;
        try {
            await this.refreshMobileQuickActionsFromSharedConfig(reason);
        } finally {
            this.mobileQuickActionsRefreshing = false;
        }

        // 刷新期间又收到触发，最多再刷新一次
        if (this.mobileQuickActionsPendingRefresh) {
            this.mobileQuickActionsPendingRefresh = false;
            void this.performMobileQuickActionsRefresh(reason);
        }
    }

    private registerMobileQuickActionsForegroundListeners(): void {
        if (!this.isMobileFrontend()) return;

        this.mobileQuickActionsVisibilityHandler = () => {
            if (document.visibilityState === "visible") {
                this.scheduleMobileQuickActionsRefresh("visibility");
            }
        };
        this.mobileQuickActionsFocusHandler = () => {
            this.scheduleMobileQuickActionsRefresh("focus");
        };

        document.addEventListener("visibilitychange", this.mobileQuickActionsVisibilityHandler);
        window.addEventListener("focus", this.mobileQuickActionsFocusHandler);
    }

    private unregisterMobileQuickActionsForegroundListeners(): void {
        if (this.mobileQuickActionsVisibilityHandler) {
            document.removeEventListener("visibilitychange", this.mobileQuickActionsVisibilityHandler);
            this.mobileQuickActionsVisibilityHandler = null;
        }
        if (this.mobileQuickActionsFocusHandler) {
            window.removeEventListener("focus", this.mobileQuickActionsFocusHandler);
            this.mobileQuickActionsFocusHandler = null;
        }
        if (this.mobileQuickActionsRefreshTimer !== null) {
            clearTimeout(this.mobileQuickActionsRefreshTimer);
            this.mobileQuickActionsRefreshTimer = null;
        }
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

    public openEnhancedDiaryWorkspace(
        initialTab = "overview",
        initialAction?: EnhancedDiaryWorkspaceAction,
    ): Promise<void> {
        return this.openEnhancedDiaryWorkspaceAfterEntitlement(initialTab, initialAction);
    }

    private async openEnhancedDiaryWorkspaceAfterEntitlement(
        initialTab: string,
        initialAction?: EnhancedDiaryWorkspaceAction,
    ): Promise<void> {
        if (!await this.ensureHomepageAdvanced("强化日记工作台")) return;

        if (this.isMobileFrontend()) {
            this.openMobileEnhancedDiaryWorkspace(initialTab, initialAction);
            return;
        }

        this.ensureTabContainers();
        this.registerCustomTabs();
        const workspaceAlreadyMounted = this.enhancedDiaryWorkspaceInstance !== null;
        this.enhancedDiaryWorkspaceInitialTab = initialTab;
        this.enhancedDiaryWorkspaceInitialAction = workspaceAlreadyMounted ? null : initialAction ?? null;
        openTab({
            app: this.app,
            custom: {
                icon: "iconTask",
                title: "强化日记工作台",
                data: { text: "强化日记工作台" },
                id: ENHANCED_DIARY_WORKSPACE_TAB_ID,
            },
        });

        if (workspaceAlreadyMounted) {
            window.dispatchEvent(new CustomEvent("siyuan-homepage:enhanced-diary-workspace-tab", {
                detail: { tab: initialTab, action: initialAction },
            }));
        }
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

    private openMobileEnhancedDiaryWorkspace(
        initialTab: string,
        initialAction?: EnhancedDiaryWorkspaceAction,
    ): void {
        if (this.currentMobileEnhancedDiaryWorkspaceDialog) {
            window.dispatchEvent(new CustomEvent("siyuan-homepage:enhanced-diary-workspace-tab", {
                detail: { tab: initialTab, action: initialAction },
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
            mobileHeader: "hidden",
            mobileCloseControl: "content",
            constructor: (containerEl: HTMLElement) => {
                return mount(EnhancedDiaryWorkspacePage as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        initialTab,
                        initialAction,
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
                title: "新标签页AI对话",
                data: { text: "新标签页AI对话" },
                id: KB_CHAT_TAB_ID,
            },
        });
    }

    private findKbDockButton(): HTMLElement | null {
        const exactSelector = `.dock__item[data-type="${this.name}${KB_DOCK_TYPE}"]`;
        const fuzzySelectors = [
            `.dock__item[data-type$="${KB_DOCK_TYPE}"]`,
            `.dock__item[data-type*="${KB_DOCK_TYPE}"]`,
            `.dock__item[data-title="侧边栏AI对话"]`,
            `.dock__item[aria-label*="侧边栏AI对话"]`,
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
        } catch (error) {
            if (error instanceof DeviceViewAccessBlockedError) {
                showMessage(formatDeviceViewBlockedUserMessage(error), 0, "error");
            } else {
                showMessage("移动主页暂不可用；未修改现有主页数据，请稍后重试。", 5000, "error");
            }
            return;
        }
        if (!await this.ensureHomepageAdvanced("移动端主页")) return;

        // 如果已存在对话框，先关闭
        if (this.currentMobileDialog) {
            this.currentMobileDialog.close();
            this.currentMobileDialog = null;
        }

        this.currentMobileDialog = svelteDialog({
            title: "移动主页",
            mobileHeader: "hidden",
            mobileCloseControl: "content",
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
            mobileHeader: "hidden",
            mobileCloseControl: "content",
            constructor: (containerEl: HTMLElement) => {
                return mount(KbPremiumGatePanel as any, {
                    target: containerEl,
                    props: {
                        plugin: this,
                        placement: "mobile",
                        onOpenSettings: () => this.openKbSettingsDialog(),
                        onClose: () => {
                            this.currentMobileKbDialog?.close();
                            this.currentMobileKbDialog = null;
                        },
                    },
                });
            },
            callback: () => {
                this.currentMobileKbDialog = null;
            },
        });
        this.currentMobileKbDialog.dialog.element.classList.add("mobile-kb-chat-dialog");
    }

    private async openMobileSettingsDialog(): Promise<void> {
        if (!await this.ensureHomepageAdvanced("移动端设置")) return;

        if (this.currentMobileSettingsDialog) {
            this.currentMobileSettingsDialog.close();
            this.currentMobileSettingsDialog = null;
        }

        this.currentMobileSettingsDialog = svelteDialog({
            title: "移动端设置",
            mobileHeader: "hidden",
            mobileCloseControl: "content",
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
                title: "打开侧边栏主页",
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
                title: "侧边栏AI对话",
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

    private async openReviewDocsDialog(target: ReviewMenuTarget, mode: "create" | "edit" = "create"): Promise<void> {
        if (!await this.ensureHomepageAdvanced("复习文档")) return;

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
        if (!await this.ensureHomepageAdvanced("复习文档")) return;

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
