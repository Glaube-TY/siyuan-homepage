<script lang="ts">
    import { onMount, mount, onDestroy, tick } from "svelte";
    import * as advanced from "../../components/tools/advanced";
    import { showMessage } from "siyuan";
    import { createRuntimeId } from "@/libs/runtime-id";

    import "./homepageSettingStyle/homepageSetting.scss"
    import type { HomepageSettingProps, ButtonItem, HomepageSettingMainTab, HomepageSettingSubTab, WidgetsSettingsState, WidgetsSettingsActions, StylesSettingsState, StylesSettingsActions, ButtonSettingsActions } from "./types"
    import {
        normalizeBannerGlassBlur,
        normalizeBannerGlassColor,
        normalizeBannerGlassColorMode,
        normalizeBannerGlassOpacity,
        normalizeBackgroundImageBlur,
        normalizeBackgroundImageOpacity,
        normalizeBackgroundImageType,
        normalizeComponentSections,
        normalizeComponentSectionsNavAlign,
        loadHomepageSettingConfig,
        normalizeBannerIntegratedColor,
        normalizeHomepageTitleAlign,
        normalizeQuickButtonStyle,
        saveHomepageSettingConfig,
        normalizeNotebookOptions,
        normalizeComponentMigrationStatus,
        isComponentSectionsEffective,
    } from "./config"
    import type { BackgroundImageType, BannerGlassColorMode, ComponentMigrationStatus, ComponentSection, ComponentSectionsNavAlign, HomepageSettingConfig, HomepageTitleAlign, QuickButtonStyle } from "./config"
    import { createDefaultButtons, normalizeButtons, addButton, reorderButtons, deleteButton, isCoreButton } from "./buttonSettings"
    import { getCurrentDeviceInfo } from "../utils/deviceProfile"
    import {
        loadWidgetLayoutSettings,
        saveHomepageSettingsInTransaction,
        SyncLayoutAndViewError,
        UnrecoverableSectionHalfCommitError,
    } from "../../components/utils/widgetBlock/utils/layout-shared"
    import { svelteDialog, confirmDialogBoolean, safeConfirmContent } from "../../libs/dialog"
    import MobileHomepagePreviewDialog from "../mobileHomepage/MobileHomepagePreviewDialog.svelte"
    import { resetCurrentDesktopHomepageLayout } from "../deviceView/resetCurrentDesktopHomepageLayout"
    import AboutSection from "./sections/AboutSection.svelte"
    import VipSection from "./sections/VipSection.svelte"
    import HomepageGlobalSection from "./sections/HomepageGlobalSection.svelte"
    import BannerSettingsTab from "./tabs/BannerSettingsTab.svelte"
    import TitleSettingsTab from "./tabs/TitleSettingsTab.svelte"
    import ButtonSettingsTab from "./tabs/ButtonSettingsTab.svelte"
    import WidgetsSettingsTab from "./tabs/WidgetsSettingsTab.svelte"
    import StylesSettingsTab from "./tabs/StylesSettingsTab.svelte"
    import AppearanceSettingsTab from "./tabs/AppearanceSettingsTab.svelte"
    import {
        HOMEPAGE_THEME_TRANSITION_EVENT,
        type HomepageThemeTransitionEventDetail,
    } from "../theme/runtime/themeTransitionEvents";
    import MobileSettingsTab from "./tabs/MobileSettingsTab.svelte"
    import AiKnowledgeBaseSettingsTab from "./tabs/AiKnowledgeBaseSettingsTab.svelte"
    import NotificationCenterSettingsTab from "./tabs/NotificationCenterSettingsTab.svelte"
    import RobotAssistantSettingsTab from "./tabs/RobotAssistantSettingsTab.svelte"
    import IndexManagementSettingsTab from "./tabs/IndexManagementSettingsTab.svelte"
    import MainTabNav from "./layout/MainTabNav.svelte"
    import SubTabNav from "./layout/SubTabNav.svelte";
    import AiKnowledgeBaseSubTabNav from "./layout/AiKnowledgeBaseSubTabNav.svelte";
    import NotificationCenterSubTabNav from "./layout/NotificationCenterSubTabNav.svelte";
    import RobotAssistantSubTabNav from "./layout/RobotAssistantSubTabNav.svelte";
    import SettingsCommandBar from "./layout/SettingsCommandBar.svelte";
    import type { AiKnowledgeBaseSubTab } from "./aiKnowledgeBaseTabs";
    import type { NotificationCenterSubTab } from "./notificationCenterTabs";
    import type { RobotAssistantSubTab } from "./robotAssistantTabs";
    import type { SettingSearchResult, SettingsSaveStatus } from "./settingsExperience";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { getKbSettings, KB_SETTINGS_CHANGED_EVENT } from "@/features/kb/services/settings/kb-settings-service";
    import { buildChatModelOptions } from "@/features/kb/services/settings/chat-model-options";
    import { buildChatModelKey, type ChatModelOption } from "@/features/kb/types/chat-model-selection";
    import {
        DEFAULT_STATUS_AI_MAX_CHARS,
        DEFAULT_STATUS_AI_PROMPT,
        DEFAULT_STATUS_AI_STAT_KEYS,
        normalizeHomepageStatusTextMode,
        normalizeStatsInfoText,
        normalizeStatusAiMaxChars,
        normalizeStatusAiModelId,
        normalizeStatusAiPrompt,
        normalizeStatusAiThinkingEnabled,
        normalizeStatusAiStatKeys,
        type HomepageStatusStatKey,
        type HomepageStatusTextMode,
    } from "../status-text-config";
    import {
        DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS,
        normalizeSelectionAiToolbarSettings,
    } from "@/features/kb/services/selection-ai/selection-ai-defaults";
    import { setSelectionAiToolbarSettingsSnapshot } from "@/features/kb/services/selection-ai/selection-ai-config";
    import type { SelectionAiToolbarSettings } from "@/features/kb/services/selection-ai/selection-ai-types";
    import {
        DEFAULT_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        normalizeMobileAutoOpenTarget,
        normalizeMobileQuickActionButtonSize,
        normalizeMobileQuickActionItems,
        resolveMobileAutoOpenConfig,
        type MobileQuickActionSetting,
    } from "../mobileQuickActions/mobileQuickActionsConfig";
    import { readHomepageSharedSettingsSnapshot } from "../sharedSettings/homepageSharedSettings";
    import { registerBuiltinHomepageThemes } from "../theme/registry/builtinThemeDiscovery";
    import { homepageThemeRegistry } from "../theme/registry/themeRegistry";
    import {
        normalizeHomepageAppearanceConfig,
        type HomepageAppearanceConfig,
    } from "../theme/runtime/appearanceConfig";
    import { createHomepageEntitlementSnapshot } from "../theme/runtime/entitlementResolver";
    import { resolveHomepageTheme } from "../theme/runtime/themeResolver";

    let {
        plugin,
        initialMainTab = "homepage",
        initialSubTab = "behavior",
        initialFocus,
    }: HomepageSettingProps = $props();

    let settingsRootElement: HTMLDivElement | null = $state(null);
    let initialFocusScheduled = false;
    let searchFocusResetTimer: ReturnType<typeof setTimeout> | null = null;

    registerBuiltinHomepageThemes();

    function getInitialMainTab(): HomepageSettingMainTab {
        return initialMainTab;
    }

    function getInitialSubTab(): HomepageSettingSubTab {
        return initialSubTab;
    }

    let activeTab = $state<HomepageSettingMainTab>(getInitialMainTab());

    // 主页设置相关配置变量
    let tempAutoOpenHomepage = $state(true);
    let sidebarEnabled = $state(false);
    let mobileAutoOpenEnabled = $state(false);
    let mobileAutoOpenTarget = $state("mobile-homepage");
    let mobileQuickActionsEnabled = $state(true);
    let mobileQuickActionsButtonSize = $state(DEFAULT_MOBILE_QUICK_ACTION_BUTTON_SIZE);
    let mobileQuickActionItems = $state<MobileQuickActionSetting[]>(normalizeMobileQuickActionItems(undefined));
    let tasksPlusSelectedNotebookIds = $state<{ label: string; value: string }[]>([]);
    let reviewDocsSelectedNotebookIds = $state<{ label: string; value: string }[]>([]);
    let favoritesMigrationStatus = $state<ComponentMigrationStatus>({ lastStatus: "idle" });
    let reviewDocsMigrationStatus = $state<ComponentMigrationStatus>({ lastStatus: "idle" });
    let taskIndexMigrationStatus = $state<ComponentMigrationStatus>({ lastStatus: "idle" });
    let heatmapIndexStatus = $state<ComponentMigrationStatus>({ lastStatus: "idle" });
    let statIndexStatus = $state<ComponentMigrationStatus>({ lastStatus: "idle" });
    let enhancedDiaryIndexStatus = $state<ComponentMigrationStatus>({ lastStatus: "idle" });
    let advancedEnabled = $state(false);
    let homepageAppearance = $state<HomepageAppearanceConfig>(normalizeHomepageAppearanceConfig(undefined));
    let activeHomepageThemeTransition = $state<HomepageThemeTransitionEventDetail | null>(null);
    let appearanceOnlyBaseSignature: string | null = null;
    let appearanceResolution = $derived(resolveHomepageTheme({
        preferredThemeId: homepageAppearance.preferredThemeId,
        surface: "desktop-homepage",
        registry: homepageThemeRegistry,
        entitlement: createHomepageEntitlementSnapshot(advancedEnabled),
    }));
    const availableHomepageThemes = homepageThemeRegistry.list("desktop-homepage");
    let settingsActiveTab = $state<HomepageSettingSubTab>(getInitialSubTab());
    let aiKnowledgeBaseActiveTab = $state<AiKnowledgeBaseSubTab>("entries");
    let notificationCenterActiveTab = $state<NotificationCenterSubTab>("desktop");
    let robotAssistantActiveTab = $state<RobotAssistantSubTab>("general");
    let settingsSaveMode = $derived<"auto" | "manual" | "none">(
        activeTab === "homepage" || activeTab === "aiKnowledgeBase"
            ? "auto"
            : activeTab === "notifyBridge" || activeTab === "robotAssistant"
                ? "manual"
                : "none",
    );
    // 横幅区域相关配置变量
    let bannerEnabled = true;
    let bannerGlobalType = $state("custom");
    let bingApiType = $state("POD_UHD");
    let bannerType = "local";
    let tempBannerEnabled = $state(bannerEnabled);
    let tempBannerType = $state(bannerType);
    let bannerLocalData: string | null = $state(null);
    let bannerRemoteUrl = $state("");
    let bannerHeight = "300"; // 默认值为字符串类型以适配输入框
    let tempBannerHeight = $state(bannerHeight);
    // 标题区域相关配置变量
    let tempTitleIconStyle = $state("square");
    let showIcon = $state(true);
    let titleIconType = $state("emoji");
    let tempTitleIconEmoji = $state("🏠");
    let tempTitleIconImage: string | null = $state(null);
    let tempCustomTitle = $state("思源笔记首页");
    let tempBannerTitleIntegrated = $state(false);
    let tempHomepageTitleAlign = $state<HomepageTitleAlign>("center");
    let tempQuickButtonStyle = $state<QuickButtonStyle>("default");
    let tempBannerTitleColor = $state("#ffffff");
    let tempBannerStatusColor = $state("#ffffff");
    let tempBannerButtonColor = $state("#ffffff");
    let tempBannerGlassEnabled = $state(false);
    let tempBannerGlassColorMode = $state<BannerGlassColorMode>("theme");
    let tempBannerGlassColor = $state("#ffffff");
    let tempBannerGlassOpacity = $state(18);
    let tempBannerGlassBlur = $state(12);

    let tempStatsInfoText =
        $state("自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{blocksCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{docsCount}} 篇笔记。\n感谢自己的坚持！❤");
    let tempStatusTextMode = $state<HomepageStatusTextMode>("custom");
    let tempStatusAiPrompt = $state(DEFAULT_STATUS_AI_PROMPT);
    let tempStatusAiMaxChars = $state(DEFAULT_STATUS_AI_MAX_CHARS);
    let tempStatusAiProviderId = $state("");
    let tempStatusAiModelId = $state("");
    let tempStatusAiThinkingEnabled = $state(false);
    let tempStatusAiStatKeys = $state<HomepageStatusStatKey[]>([...DEFAULT_STATUS_AI_STAT_KEYS]);
    let statusAiModelOptions: ChatModelOption[] = $state([]);
    let statusAiAvailableModelCount = $state(0);
    let statusAiSelectedModelLabel = $state("");

    let buttonsList: ButtonItem[] = $state(createDefaultButtons());

    // 当前选中的按钮项
    let selectedButton: ButtonItem | null = $state(null);
    let nextId = Date.now();

    // 组件设置内容
    let widgetLayoutNumber = $state(4);
    let widgetGap = $state(0.2);
    let componentSectionsEnabled = $state(false);
    let componentSections = $state<ComponentSection[]>(normalizeComponentSections(undefined));
    let componentSectionsNavAlign = $state<ComponentSectionsNavAlign>("left");
    let deletedComponentSectionIds: string[] = [];
    // 快速笔记设置
    let quickNotesEnabled = $state(false);
    let quickNotesPosition = $state("");
    let quickNotesTimestampEnabled = $state(true);
    let quickNotesAddPosition = $state("bottom");
    // 任务管理Plus设置
    let taskEditorEnabled = $state(true);
    // 文档预览模式设置
    let defaultDocPreviewMode = $state<"preview" | "wysiwyg">("preview");
    // AI 知识库入口开关
    let aiKbDockEnabled = $state(true);
    let aiKbTabEnabled = $state(true);

    let settingsLoaded = $state(false);

    async function focusInitialSettingLocation(): Promise<void> {
        if (!initialFocus || initialFocusScheduled) return;
        initialFocusScheduled = true;
        await tick();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const target = settingsRootElement?.querySelector<HTMLElement>(
            `[data-homepage-setting-focus="${initialFocus}"]`,
        );
        if (!target) {
            initialFocusScheduled = false;
            return;
        }
        target.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
        target.focus({ preventScroll: true });
    }

    function findSearchResultTarget(result: SettingSearchResult): HTMLElement | null {
        const sections = Array.from(
            settingsRootElement?.querySelectorAll<HTMLElement>("[data-homepage-setting-section]") ?? [],
        );
        const section = result.section
            ? sections.find((candidate) => candidate.dataset.homepageSettingSection === result.section)
            : undefined;
        if (result.target === "section") return section ?? null;
        const rows = Array.from(
            (section ?? settingsRootElement)?.querySelectorAll<HTMLElement>("[data-homepage-setting-title]") ?? [],
        );
        return rows.find((candidate) => candidate.dataset.homepageSettingTitle === result.title) ?? section ?? null;
    }

    async function handleSettingSearchResult(result: SettingSearchResult): Promise<void> {
        await handleMainTabChange(result.mainTab);
        if (result.mainTab === "homepage" && result.subTab) {
            settingsActiveTab = result.subTab as HomepageSettingSubTab;
        } else if (result.mainTab === "aiKnowledgeBase" && result.subTab) {
            aiKnowledgeBaseActiveTab = result.subTab as AiKnowledgeBaseSubTab;
        } else if (result.mainTab === "notifyBridge" && result.subTab) {
            notificationCenterActiveTab = result.subTab as NotificationCenterSubTab;
        } else if (result.mainTab === "robotAssistant" && result.subTab) {
            robotAssistantActiveTab = result.subTab as RobotAssistantSubTab;
        }

        await tick();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const target = findSearchResultTarget(result);
        if (!target) return;
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
        target.focus({ preventScroll: true });
        if (searchFocusResetTimer) clearTimeout(searchFocusResetTimer);
        searchFocusResetTimer = setTimeout(() => {
            if (document.activeElement === target) target.blur();
            searchFocusResetTimer = null;
        }, 2400);
    }

    $effect(() => {
        const targetTabReady = activeTab === initialMainTab
            && (activeTab !== "homepage" || settingsActiveTab === initialSubTab);
        if (settingsLoaded && targetTabReady && initialFocus && !initialFocusScheduled) {
            void focusInitialSettingLocation();
        }
    });

    function handleAiKbDockEnabledChange(value: boolean): void {
        aiKbDockEnabled = value;
    }

    function handleAiKbTabEnabledChange(value: boolean): void {
        aiKbTabEnabled = value;
    }

    function handleStatusAiThinkingEnabledChange(value: boolean): void {
        tempStatusAiThinkingEnabled = value;
    }

    function handleSelectionAiToolbarChange(value: SelectionAiToolbarSettings): void {
        selectionAiToolbar = normalizeSelectionAiToolbarSettings(value);
    }

    let selectionAiToolbar = $state<SelectionAiToolbarSettings>(
        normalizeSelectionAiToolbarSettings(DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS)
    );

    function createComponentSectionId(): string {
        return createRuntimeId("section");
    }

    function sanitizeComponentSectionName(name: string): string {
        return name.trim() || "新分区";
    }

    function handleComponentSectionsEnabledChange(value: boolean): void {
        if (value && !advancedEnabled) {
            showMessage("会员专属，过期后按普通组件布局显示，分区数据保留。", 4000);
            componentSectionsEnabled = false;
            return;
        }
        componentSectionsEnabled = value;
        if (value && componentSections.length === 0) {
            const now = Date.now();
            componentSections = [{
                id: createComponentSectionId(),
                name: "新分区",
                createdAt: now,
                updatedAt: now,
            }];
        } else {
            componentSections = normalizeComponentSections(componentSections);
        }
    }

    function handleAddComponentSection(): void {
        const now = Date.now();
        componentSections = normalizeComponentSections([
            ...componentSections,
            {
                id: createComponentSectionId(),
                name: "新分区",
                createdAt: now,
                updatedAt: now,
            },
        ]);
    }

    function handleRenameComponentSection(sectionId: string, name: string): void {
        const now = Date.now();
        componentSections = normalizeComponentSections(componentSections.map((section) => (
            section.id === sectionId
                ? { ...section, name: sanitizeComponentSectionName(name), updatedAt: now }
                : section
        )));
    }

    async function handleDeleteComponentSection(sectionId: string): Promise<void> {
        const normalizedSections = normalizeComponentSections(componentSections);
        const target = normalizedSections.find((section) => section.id === sectionId);
        if (!target) return;

        const confirmed = await confirmDialogBoolean({
            title: "删除分区",
            content: safeConfirmContent(
                "确定要删除该组件分区吗？\n\n删除普通分栏后，组件会迁入相邻分栏：\n- 优先迁入前一个分栏；\n- 删除第一个分栏时迁入后一个分栏；\n- 删除最后一个分栏时保留全部组件并关闭分栏模式。\n\n组件内容文件不会删除。\n\n分区：",
                target.name,
            ),
        });
        if (!confirmed) return;

        componentSections = normalizeComponentSections(normalizedSections.filter((section) => section.id !== sectionId));
        deletedComponentSectionIds = [...new Set([...deletedComponentSectionIds, sectionId])];
        if (componentSections.length === 0) {
            componentSectionsEnabled = false;
        }
    }

    function moveComponentSection(sectionId: string, direction: -1 | 1): void {
        const sections = normalizeComponentSections(componentSections);
        const index = sections.findIndex((section) => section.id === sectionId);
        const targetIndex = index + direction;
        if (index < 0 || targetIndex < 0 || targetIndex >= sections.length) return;
        const next = [...sections];
        const [item] = next.splice(index, 1);
        next.splice(targetIndex, 0, item);
        componentSections = next;
    }

    let widgetsSettingsState = $derived<WidgetsSettingsState>({
        widgetLayoutNumber,
        widgetGap,
        advancedEnabled,
        componentSectionsEnabled,
        componentSections,
        componentSectionsNavAlign,
        quickNotesEnabled,
        quickNotesPosition,
        quickNotesTimestampEnabled,
        quickNotesAddPosition,
        taskEditorEnabled,
        defaultDocPreviewMode,
    });

    let widgetsSettingsActions: WidgetsSettingsActions = {
        onWidgetLayoutNumberChange: (value) => widgetLayoutNumber = value,
        onWidgetGapChange: (value) => widgetGap = value,
        onComponentSectionsEnabledChange: handleComponentSectionsEnabledChange,
        onAddComponentSection: handleAddComponentSection,
        onRenameComponentSection: handleRenameComponentSection,
        onDeleteComponentSection: (sectionId) => void handleDeleteComponentSection(sectionId),
        onMoveComponentSectionUp: (sectionId) => moveComponentSection(sectionId, -1),
        onMoveComponentSectionDown: (sectionId) => moveComponentSection(sectionId, 1),
        onComponentSectionsNavAlignChange: (value) => componentSectionsNavAlign = normalizeComponentSectionsNavAlign(value),
        onQuickNotesEnabledChange: (value) => quickNotesEnabled = value,
        onQuickNotesPositionChange: (value) => quickNotesPosition = value,
        onQuickNotesTimestampEnabledChange: (value) => quickNotesTimestampEnabled = value,
        onQuickNotesAddPositionChange: (value) => quickNotesAddPosition = value,
        onTaskEditorEnabledChange: (value) => taskEditorEnabled = value,
        onDefaultDocPreviewModeChange: (value) => defaultDocPreviewMode = value,
    };

    // vip设置
    let footerEnabled = $state(true);
    let footerContent = $state("");
    let mouseGlobalEnabled = $state(false);
    let mouseIcon = $state("default");
    let MouseTrailEnabled = $state(false);
    let ClickEffectEnabled = $state(false);
    let ClickEffectContent = $state("");
    let backgroundImageEnabled = $state(false);
    let backgroundImageGlobalEnabled = $state(false);
    let backgroundImageType = $state<BackgroundImageType>("local");
    let backgroundImageLocalData: string | null = $state(null);
    let backgroundImageRemoteUrl = $state("");
    let backgroundImageOpacity = $state(35);
    let backgroundImageBlur = $state(0);
    let FallEffectsEnabled = $state(false);
    let GlobalFallingEffectsEnabled = $state(false);
    let FallingIcon = $state("snow");
    let FallingDensity = $state("medium");
    let FallingSpeed = $state("medium");

    // VIP设置
    let USER_NAME: string = $state("");
    let USER_ID: string = $state("");
    let USER_CODE: string = $state("");
    let USER_CODE_V2: string = $state("");
    let IDENTITY_SOURCE: string = $state("");
    let ActivationCode: string = $state("");
    let activated: boolean = $state();
    let activationResult: any = $state();

    // 当前设备
    let currentDeviceInfo = $state<ReturnType<typeof getCurrentDeviceInfo> | null>(null);

    let stylesSettingsState = $derived<StylesSettingsState>({
        footerEnabled,
        footerContent,
        mouseIcon,
        mouseGlobalEnabled,
        mouseTrailEnabled: MouseTrailEnabled,
        clickEffectEnabled: ClickEffectEnabled,
        clickEffectContent: ClickEffectContent,
        backgroundImageEnabled,
        backgroundImageGlobalEnabled,
        backgroundImageType,
        backgroundImageLocalData,
        backgroundImageRemoteUrl,
        backgroundImageOpacity,
        backgroundImageBlur,
        fallEffectsEnabled: FallEffectsEnabled,
        globalFallingEffectsEnabled: GlobalFallingEffectsEnabled,
        fallingIcon: FallingIcon,
        fallingDensity: FallingDensity,
        fallingSpeed: FallingSpeed,
    });

    let stylesSettingsActions: StylesSettingsActions = {
        onFooterEnabledChange: (value) => footerEnabled = value,
        onFooterContentChange: (value) => footerContent = value,
        onMouseIconChange: (value) => mouseIcon = value,
        onMouseGlobalEnabledChange: (value) => mouseGlobalEnabled = value,
        onMouseTrailEnabledChange: (value) => MouseTrailEnabled = value,
        onClickEffectEnabledChange: (value) => ClickEffectEnabled = value,
        onClickEffectContentChange: (value) => ClickEffectContent = value,
        onBackgroundImageEnabledChange: (value) => backgroundImageEnabled = value,
        onBackgroundImageGlobalEnabledChange: (value) => backgroundImageGlobalEnabled = value,
        onBackgroundImageTypeChange: (value) => {
            backgroundImageType = normalizeBackgroundImageType(value);
            if (backgroundImageType === "remote") {
                backgroundImageLocalData = null;
            }
        },
        onBackgroundImageLocalDataChange: (value) => backgroundImageLocalData = value,
        onBackgroundImageRemoteUrlChange: (value) => backgroundImageRemoteUrl = value,
        onBackgroundImageOpacityChange: (value) => backgroundImageOpacity = normalizeBackgroundImageOpacity(value),
        onBackgroundImageBlurChange: (value) => backgroundImageBlur = normalizeBackgroundImageBlur(value),
        onBackgroundImageSelect: handleBackgroundImageSelect,
        onFallEffectsEnabledChange: (value) => FallEffectsEnabled = value,
        onGlobalFallingEffectsEnabledChange: (value) => GlobalFallingEffectsEnabled = value,
        onFallingIconChange: (value) => FallingIcon = value,
        onFallingDensityChange: (value) => FallingDensity = value,
        onFallingSpeedChange: (value) => FallingSpeed = value,
    };

    const AUTO_SAVE_DELAY_MS = 600;
    const SHARED_SETTINGS_POLL_MS = 1500;

    let autoSaveStatus = $state<SettingsSaveStatus>("idle");
    let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let sharedSettingsPollTimer: ReturnType<typeof setInterval> | null = null;
    let autoSaveTask: Promise<void> = Promise.resolve();
    let autoSavePending = false;
    let autoSaveInitialized = false;
    let applyingExternalSharedSettings = false;
    let sharedSettingsRefreshInFlight = false;
    let lastPersistedDraftSignature = "";
    let lastLoadedMobileSignature = "";
    let observedSharedSettingsToken = "";

    function captureMobileSettingsSignature(): string {
        return JSON.stringify({
            mobileAutoOpenEnabled,
            mobileAutoOpenTarget: normalizeMobileAutoOpenTarget(mobileAutoOpenTarget),
            mobileQuickActionsEnabled,
            mobileQuickActionsButtonSize: normalizeMobileQuickActionButtonSize(mobileQuickActionsButtonSize),
            mobileQuickActionItems: normalizeMobileQuickActionItems(mobileQuickActionItems),
        });
    }

    function captureHomepageSettingsSignature(): string {
        return JSON.stringify({
            homepageAppearance,
            tempAutoOpenHomepage,
            sidebarEnabled,
            mobileAutoOpenEnabled,
            mobileAutoOpenTarget,
            mobileQuickActionsEnabled,
            mobileQuickActionsButtonSize,
            mobileQuickActionItems,
            tempBannerEnabled,
            bannerGlobalType,
            bingApiType,
            tempBannerType,
            bannerLocalData,
            bannerRemoteUrl,
            tempBannerHeight,
            showIcon,
            titleIconType,
            tempTitleIconEmoji,
            tempTitleIconImage,
            tempCustomTitle,
            tempBannerTitleIntegrated,
            tempHomepageTitleAlign,
            tempQuickButtonStyle,
            tempBannerTitleColor,
            tempBannerStatusColor,
            tempBannerButtonColor,
            tempBannerGlassEnabled,
            tempBannerGlassColorMode,
            tempBannerGlassColor,
            tempBannerGlassOpacity,
            tempBannerGlassBlur,
            tempTitleIconStyle,
            tempStatsInfoText,
            tempStatusTextMode,
            tempStatusAiPrompt,
            tempStatusAiMaxChars,
            tempStatusAiProviderId,
            tempStatusAiModelId,
            tempStatusAiThinkingEnabled,
            tempStatusAiStatKeys,
            buttonsList,
            selectedButton,
            widgetLayoutNumber,
            widgetGap,
            componentSectionsEnabled,
            componentSections,
            componentSectionsNavAlign,
            quickNotesEnabled,
            quickNotesPosition,
            quickNotesTimestampEnabled,
            quickNotesAddPosition,
            taskEditorEnabled,
            defaultDocPreviewMode,
            aiKbDockEnabled,
            aiKbTabEnabled,
            selectionAiToolbar,
            tasksPlusSelectedNotebookIds,
            reviewDocsSelectedNotebookIds,
            favoritesMigrationStatus,
            reviewDocsMigrationStatus,
            taskIndexMigrationStatus,
            heatmapIndexStatus,
            statIndexStatus,
            enhancedDiaryIndexStatus,
            footerEnabled,
            footerContent,
            mouseIcon,
            MouseTrailEnabled,
            mouseGlobalEnabled,
            ClickEffectEnabled,
            ClickEffectContent,
            backgroundImageEnabled,
            backgroundImageGlobalEnabled,
            backgroundImageType,
            backgroundImageLocalData,
            backgroundImageRemoteUrl,
            backgroundImageOpacity,
            backgroundImageBlur,
            FallEffectsEnabled,
            GlobalFallingEffectsEnabled,
            FallingIcon,
            FallingDensity,
            FallingSpeed,
            advancedEnabled,
        });
    }

    function captureHomepageNonAppearanceSignature(): string {
        const value = JSON.parse(captureHomepageSettingsSignature()) as Record<string, unknown>;
        delete value.homepageAppearance;
        return JSON.stringify(value);
    }

    function handleHomepageThemeSelection(themeId: string): void {
        if (activeHomepageThemeTransition) return;
        const theme = homepageThemeRegistry.get(themeId);
        if (!theme) {
            showMessage("该主页主题当前未安装", 3000, "info");
            return;
        }
        if (theme.access === "vip" && !advancedEnabled) {
            showMessage("该主页主题为会员专属，开通或恢复会员后即可使用", 4000, "info");
            return;
        }
        appearanceOnlyBaseSignature = captureHomepageNonAppearanceSignature();
        homepageAppearance = {
            ...homepageAppearance,
            preferredThemeId: themeId,
        };
        window.dispatchEvent(new CustomEvent("homepage-theme-preview", {
            detail: { homepageAppearance },
        }));
    }

    function handleHomepageThemeTransition(event: Event): void {
        const detail = (event as CustomEvent<HomepageThemeTransitionEventDetail>).detail;
        if (
            !detail
            || typeof detail.requestId !== "number"
            || typeof detail.themeId !== "string"
            || typeof detail.themeName !== "string"
        ) return;

        if (detail.phase === "start") {
            activeHomepageThemeTransition = detail;
            return;
        }
        if (
            activeHomepageThemeTransition?.requestId === detail.requestId
            || activeHomepageThemeTransition?.themeId === detail.themeId
        ) {
            activeHomepageThemeTransition = null;
        }
    }

    function applyMobileSettingsConfig(config: Record<string, unknown>): void {
        if (
            typeof config.mobileAutoOpenEnabled === "boolean"
            || typeof config.mobileAutoOpenTarget === "string"
        ) {
            const resolved = resolveMobileAutoOpenConfig(config);
            mobileAutoOpenEnabled = resolved.enabled;
            mobileAutoOpenTarget = resolved.target;
        }
        if (typeof config.mobileQuickActionsEnabled === "boolean") {
            mobileQuickActionsEnabled = config.mobileQuickActionsEnabled;
        }
        if (config.mobileQuickActionsButtonSize !== undefined) {
            mobileQuickActionsButtonSize = normalizeMobileQuickActionButtonSize(
                config.mobileQuickActionsButtonSize,
            );
        }
        if (Array.isArray(config.mobileQuickActionItems)) {
            mobileQuickActionItems = normalizeMobileQuickActionItems(config.mobileQuickActionItems);
        }
        lastLoadedMobileSignature = captureMobileSettingsSignature();
    }

    async function refreshSharedMobileSettings(): Promise<void> {
        if (
            !settingsLoaded
            || autoSavePending
            || autoSaveStatus === "saving"
            || sharedSettingsRefreshInFlight
        ) return;

        sharedSettingsRefreshInFlight = true;
        try {
            const snapshot = await readHomepageSharedSettingsSnapshot(plugin);
            if (!snapshot) return;
            const token = `${snapshot.revision}:${snapshot.updatedAt}`;
            if (token === observedSharedSettingsToken) return;
            observedSharedSettingsToken = token;

            const before = captureMobileSettingsSignature();
            applyingExternalSharedSettings = true;
            applyMobileSettingsConfig(snapshot.config);
            lastPersistedDraftSignature = captureHomepageSettingsSignature();
            applyingExternalSharedSettings = false;

            if (before !== captureMobileSettingsSignature()) {
                autoSaveStatus = "synced";
            }
        } catch {
            // 同步中的短暂不可读不覆盖当前界面，下一轮轮询继续尝试。
        } finally {
            applyingExternalSharedSettings = false;
            sharedSettingsRefreshInFlight = false;
        }
    }

    function handleHomepageSettingsSavedEvent(): void {
        void refreshSharedMobileSettings();
    }

    function scheduleAutoSave(): void {
        if (!settingsLoaded || applyingExternalSharedSettings) return;
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSavePending = true;
        autoSaveStatus = "pending";
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = null;
            void queueAutoSaveNow();
        }, AUTO_SAVE_DELAY_MS);
    }

    function queueAutoSaveNow(): Promise<void> {
        autoSaveTask = autoSaveTask
            .catch(() => undefined)
            .then(async () => {
                if (!settingsLoaded || applyingExternalSharedSettings) return;
                const currentSignature = captureHomepageSettingsSignature();
                if (currentSignature === lastPersistedDraftSignature) {
                    autoSavePending = false;
                    if (autoSaveStatus === "pending") autoSaveStatus = "saved";
                    return;
                }

                autoSaveStatus = "saving";
                let saveSucceeded = false;
                try {
                    const saved = await confirmSave();
                    if (saved) {
                        lastPersistedDraftSignature = captureHomepageSettingsSignature();
                        lastLoadedMobileSignature = captureMobileSettingsSignature();
                        autoSaveStatus = "saved";
                        saveSucceeded = true;
                    } else {
                        autoSaveStatus = "error";
                    }
                } catch (error) {
                    autoSaveStatus = "error";
                    const message = error instanceof Error ? error.message : String(error);
                    showMessage(`设置保存失败：${message}`, 5000, "error");
                } finally {
                    autoSavePending = false;
                }

                if (saveSucceeded && captureHomepageSettingsSignature() !== lastPersistedDraftSignature) {
                    scheduleAutoSave();
                }
            });
        return autoSaveTask;
    }

    $effect(() => {
        const signature = captureHomepageSettingsSignature();
        if (!settingsLoaded || applyingExternalSharedSettings) return;
        if (!autoSaveInitialized) {
            autoSaveInitialized = true;
            lastPersistedDraftSignature = signature;
            return;
        }
        if (signature !== lastPersistedDraftSignature) {
            scheduleAutoSave();
        }
    });

    $effect(() => {
        if (autoSaveStatus !== "saved" && autoSaveStatus !== "synced") return;
        const timer = setTimeout(() => {
            if (autoSaveStatus === "saved" || autoSaveStatus === "synced") autoSaveStatus = "idle";
        }, 2200);
        return () => clearTimeout(timer);
    });

    function syncStatusAiModelSummary(options: ChatModelOption[] = statusAiModelOptions): void {
        statusAiAvailableModelCount = options.length;
        const selectedKey = buildChatModelKey(tempStatusAiProviderId, tempStatusAiModelId);
        const selected = selectedKey ? options.find((option) => option.key === selectedKey) : undefined;
        statusAiSelectedModelLabel = selected?.label || "";
    }

    function handleStatusTextModeChange(value: HomepageStatusTextMode): void {
        tempStatusTextMode = value;
    }

    async function refreshStatusAiModelSummary(): Promise<void> {
        try {
            const settings = await getKbSettings();
            const options = buildChatModelOptions(settings);
            statusAiModelOptions = options;
            syncStatusAiModelSummary(options);
        } catch {
            statusAiModelOptions = [];
            syncStatusAiModelSummary([]);
        }
    }

    function handleStatusAiModelChange(value: { providerId: string; modelId: string }): void {
        tempStatusAiProviderId = normalizeStatusAiModelId(value.providerId);
        tempStatusAiModelId = normalizeStatusAiModelId(value.modelId);
        syncStatusAiModelSummary();
    }

    function handleKbSettingsChanged(): void {
        void refreshStatusAiModelSummary();
    }

    // 设置页面加载时读取配置信息
    onMount(async () => {
        window.addEventListener(HOMEPAGE_THEME_TRANSITION_EVENT, handleHomepageThemeTransition);
        const savedConfig = await loadHomepageSettingConfig(plugin);
        if (savedConfig) {
            homepageAppearance = normalizeHomepageAppearanceConfig(savedConfig.homepageAppearance);
            // 全局配置（桌面）
            tempAutoOpenHomepage = savedConfig.autoOpenHomepage ?? true;
            sidebarEnabled = savedConfig.sidebarEnabled ?? false;

            // 移动端配置：统一从 mobile-homepage 读取，mobile-shared 优先于 desktop
            try {
                const mobileConfig = (await loadHomepageSettingConfig(plugin, "mobile-homepage")) || {};

                // --- 悬浮按钮设置：mobile-shared 优先，每个字段独立判断 ---
                mobileQuickActionsEnabled =
                    typeof (mobileConfig as any).mobileQuickActionsEnabled === "boolean"
                        ? (mobileConfig as any).mobileQuickActionsEnabled
                        : savedConfig.mobileQuickActionsEnabled ?? true;

                mobileQuickActionsButtonSize = normalizeMobileQuickActionButtonSize(
                    (mobileConfig as any).mobileQuickActionsButtonSize !== undefined
                        ? (mobileConfig as any).mobileQuickActionsButtonSize
                        : savedConfig.mobileQuickActionsButtonSize,
                );

                mobileQuickActionItems = normalizeMobileQuickActionItems(
                    Array.isArray((mobileConfig as any).mobileQuickActionItems)
                        ? (mobileConfig as any).mobileQuickActionItems
                        : savedConfig.mobileQuickActionItems,
                );

                const resolved = resolveMobileAutoOpenConfig(mobileConfig);
                mobileAutoOpenEnabled = resolved.enabled;
                mobileAutoOpenTarget = resolved.target;
            } catch {
                // mobile 配置读取失败：共享设置仍可从当前桌面配置恢复。
                mobileQuickActionsEnabled = savedConfig.mobileQuickActionsEnabled ?? true;
                mobileQuickActionsButtonSize = normalizeMobileQuickActionButtonSize(
                    savedConfig.mobileQuickActionsButtonSize,
                );
                mobileQuickActionItems = normalizeMobileQuickActionItems(savedConfig.mobileQuickActionItems);

                const resolved = resolveMobileAutoOpenConfig(savedConfig);
                mobileAutoOpenEnabled = resolved.enabled;
                mobileAutoOpenTarget = resolved.target;
            }
            // 横幅配置
            bannerEnabled = savedConfig.bannerEnabled ?? true;
            bannerGlobalType = savedConfig.bannerGlobalType || "custom";
            bingApiType = savedConfig.bingApiType || "POD_UHD";
            bannerType = savedConfig.bannerType ?? "local";
            bannerLocalData = savedConfig.bannerLocalData || "";
            bannerRemoteUrl = savedConfig.bannerRemoteUrl || "";

            bannerHeight = savedConfig.bannerHeight || "300";

            // 标题配置
            showIcon = savedConfig.showIcon ?? true;
            titleIconType = savedConfig.titleIconType || "emoji";
            tempTitleIconEmoji = savedConfig.TitleIconEmoji || "🏠";
            tempTitleIconImage = savedConfig.TitleIconImage || null;
            tempTitleIconStyle = savedConfig.tempTitleIconStyle || "square";
            tempCustomTitle = savedConfig.customTitle || "思源笔记首页";
            tempBannerTitleIntegrated = bannerEnabled && savedConfig.bannerTitleIntegrated === true;
            tempHomepageTitleAlign = normalizeHomepageTitleAlign(savedConfig.homepageTitleAlign);
            tempQuickButtonStyle = normalizeQuickButtonStyle(savedConfig.quickButtonStyle);
            tempBannerTitleColor = normalizeBannerIntegratedColor(savedConfig.bannerTitleColor);
            tempBannerStatusColor = normalizeBannerIntegratedColor(savedConfig.bannerStatusColor);
            tempBannerButtonColor = normalizeBannerIntegratedColor(savedConfig.bannerButtonColor);
            tempBannerGlassEnabled = savedConfig.bannerGlassEnabled === true;
            tempBannerGlassColorMode = normalizeBannerGlassColorMode(savedConfig.bannerGlassColorMode);
            tempBannerGlassColor = normalizeBannerGlassColor(savedConfig.bannerGlassColor);
            tempBannerGlassOpacity = normalizeBannerGlassOpacity(savedConfig.bannerGlassOpacity);
            tempBannerGlassBlur = normalizeBannerGlassBlur(savedConfig.bannerGlassBlur);
            tempStatsInfoText = normalizeStatsInfoText(savedConfig.statsInfoText);
            tempStatusTextMode = normalizeHomepageStatusTextMode(savedConfig.statusTextMode);
            tempStatusAiPrompt = normalizeStatusAiPrompt(savedConfig.statusAiPrompt);
            tempStatusAiMaxChars = normalizeStatusAiMaxChars(savedConfig.statusAiMaxChars);
            tempStatusAiProviderId = normalizeStatusAiModelId(savedConfig.statusAiProviderId);
            tempStatusAiModelId = normalizeStatusAiModelId(savedConfig.statusAiModelId);
            tempStatusAiThinkingEnabled = normalizeStatusAiThinkingEnabled(savedConfig.statusAiThinkingEnabled);
            tempStatusAiStatKeys = normalizeStatusAiStatKeys(savedConfig.statusAiStatKeys);

            // 恢复按钮配置
            if (savedConfig.buttonsList) {
                buttonsList = normalizeButtons(savedConfig.buttonsList);
                nextId = Math.max(...buttonsList.map((item) => item.id), 0) + 1;
            }

            if (savedConfig.selectedButton) {
                const found = buttonsList.find((item) => item.id === savedConfig.selectedButton.id);
                selectedButton = found ?? null;
            }

            // 组件设置从当前设备桌面主页布局读取。
            const layoutSettings = await loadWidgetLayoutSettings(plugin);
            widgetLayoutNumber = layoutSettings.widgetLayoutNumber;
            widgetGap = layoutSettings.widgetGap;
            componentSectionsEnabled = savedConfig.componentSectionsEnabled === true;
            componentSections = normalizeComponentSections(savedConfig.componentSections);
            componentSectionsNavAlign = normalizeComponentSectionsNavAlign(savedConfig.componentSectionsNavAlign);

            quickNotesEnabled = savedConfig.quickNotesEnabled ?? false;
            quickNotesPosition = savedConfig.quickNotesPosition || "";
            quickNotesTimestampEnabled =
                savedConfig.quickNotesTimestampEnabled ?? true;
            quickNotesAddPosition =
                savedConfig.quickNotesAddPosition || "bottom";

            taskEditorEnabled = savedConfig.taskEditorEnabled ?? true;

            // 文档预览模式：归一化并回退到默认值
            const validPreviewMode = (mode: string | undefined): "preview" | "wysiwyg" => {
                if (mode === "preview" || mode === "wysiwyg") return mode;
                return "preview";
            };
            defaultDocPreviewMode = validPreviewMode(savedConfig.defaultDocPreviewMode);

            // AI 知识库入口开关
            aiKbDockEnabled = savedConfig.aiKbDockEnabled ?? true;
            aiKbTabEnabled = savedConfig.aiKbTabEnabled ?? true;
            selectionAiToolbar = normalizeSelectionAiToolbarSettings(savedConfig.selectionAiToolbar);

            // 范围配置与迁移状态
            tasksPlusSelectedNotebookIds = normalizeNotebookOptions(savedConfig.tasksPlusSelectedNotebookIds);
            reviewDocsSelectedNotebookIds = normalizeNotebookOptions(savedConfig.reviewDocsSelectedNotebookIds);
            favoritesMigrationStatus = normalizeComponentMigrationStatus(savedConfig.favoritesMigrationStatus);
            reviewDocsMigrationStatus = normalizeComponentMigrationStatus(savedConfig.reviewDocsMigrationStatus);
            taskIndexMigrationStatus = normalizeComponentMigrationStatus(savedConfig.taskIndexMigrationStatus);
            heatmapIndexStatus = normalizeComponentMigrationStatus(savedConfig.heatmapIndexStatus);
            statIndexStatus = normalizeComponentMigrationStatus(savedConfig.statIndexStatus);
            enhancedDiaryIndexStatus = normalizeComponentMigrationStatus(savedConfig.enhancedDiaryIndexStatus);

            footerEnabled = savedConfig.footerEnabled ?? true;
            footerContent = savedConfig.footerContent || "";
            mouseIcon = savedConfig.mouseIcon || "default";
            MouseTrailEnabled = savedConfig.MouseTrailEnabled ?? false;
            mouseGlobalEnabled = savedConfig.mouseGlobalEnabled ?? false;
            ClickEffectEnabled = savedConfig.ClickEffectEnabled ?? false;
            ClickEffectContent = savedConfig.ClickEffectContent || "";
            backgroundImageEnabled = savedConfig.backgroundImageEnabled === true;
            backgroundImageGlobalEnabled = savedConfig.backgroundImageGlobalEnabled === true;
            backgroundImageType = normalizeBackgroundImageType(savedConfig.backgroundImageType);
            backgroundImageLocalData = savedConfig.backgroundImageLocalData || null;
            backgroundImageRemoteUrl = savedConfig.backgroundImageRemoteUrl || "";
            backgroundImageOpacity = normalizeBackgroundImageOpacity(savedConfig.backgroundImageOpacity);
            backgroundImageBlur = normalizeBackgroundImageBlur(savedConfig.backgroundImageBlur);
            FallEffectsEnabled = savedConfig.FallEffectsEnabled ?? false;
            GlobalFallingEffectsEnabled =
                savedConfig.GlobalFallingEffectsEnabled ?? false;
            FallingIcon = savedConfig.FallingIcon || "snow";
            FallingDensity = savedConfig.FallingDensity || "medium";
            FallingSpeed = savedConfig.FallingSpeed || "medium";

            currentDeviceInfo = getCurrentDeviceInfo();
        }

        // 同步到临时变量
        tempBannerEnabled = bannerEnabled;
        tempBannerType = bannerType;
        tempBannerHeight = bannerHeight;
        advancedEnabled = plugin.ADVANCED;

        await refreshStatusAiModelSummary();
        window.addEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
        window.addEventListener("homepage-settings-saved", handleHomepageSettingsSavedEvent);
        lastLoadedMobileSignature = captureMobileSettingsSignature();
        lastPersistedDraftSignature = captureHomepageSettingsSignature();
        autoSaveInitialized = true;
        settingsLoaded = true;
        void refreshSharedMobileSettings();
        sharedSettingsPollTimer = setInterval(
            () => void refreshSharedMobileSettings(),
            SHARED_SETTINGS_POLL_MS,
        );
    });

    onDestroy(() => {
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
            void queueAutoSaveNow();
        }
        if (sharedSettingsPollTimer) {
            clearInterval(sharedSettingsPollTimer);
            sharedSettingsPollTimer = null;
        }
        if (searchFocusResetTimer) {
            clearTimeout(searchFocusResetTimer);
            searchFocusResetTimer = null;
        }
        window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
        window.removeEventListener("homepage-settings-saved", handleHomepageSettingsSavedEvent);
        window.removeEventListener(HOMEPAGE_THEME_TRANSITION_EVENT, handleHomepageThemeTransition);
    });

    function handleImageSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const reader = new FileReader();

            reader.onload = function (e) {
                bannerLocalData = e.target?.result as string; // 存储 Base64 数据
            };

            reader.readAsDataURL(file);
        }
    }

    function handleBackgroundImageSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const reader = new FileReader();

            reader.onload = function (e) {
                backgroundImageLocalData = e.target?.result as string;
            };

            reader.readAsDataURL(file);
        }
    }

    $effect(() => {
        if (tempBannerType === "remote") {
            bannerLocalData = null; // 清空本地图片数据
        }
    });

    $effect(() => {
        if (backgroundImageType === "remote") {
            backgroundImageLocalData = null;
        }
    });

    // 添加新按钮
    function addNewButton() {
        const result = addButton(buttonsList, nextId);
        buttonsList = result.buttons;
        selectedButton = result.newButton;
        nextId = result.nextId;
    }

    // 在编辑按钮标签时触发更新
    function updateButtonLabel(newLabel: string) {
        if (selectedButton) {
            // 创建一个新的按钮对象来替换旧的
            selectedButton = {
                ...selectedButton,
                label: newLabel,
            };

            // 更新 buttonsList 中对应的项
            buttonsList = buttonsList.map((item) =>
                item.id === selectedButton.id ? selectedButton : item,
            );
        }
    }

    function deleteCustomButton() {
        if (selectedButton) {
            if (isCoreButton(selectedButton)) {
                return;
            }
            buttonsList = deleteButton(buttonsList, selectedButton.id);
            selectedButton = null;
        }
    }

    let buttonSettingsActions: ButtonSettingsActions = {
        onSelectButton: (item) => selectedButton = item,
        onAddNewButton: addNewButton,
        onUpdateButtonLabel: (value) => updateButtonLabel(value),
        onUpdateButtonShortcut: (value) => {
            if (selectedButton) {
                selectedButton = { ...selectedButton, shortcut: value };
                buttonsList = buttonsList.map((item) =>
                    item.id === selectedButton.id ? selectedButton : item
                );
            }
        },
        onToggleButtonChecked: (id, checked) => {
            buttonsList = buttonsList.map((item) =>
                item.id === id ? { ...item, checked } : item
            );
        },
        onDeleteCustomButton: deleteCustomButton,
        onReorderButtons: (oldIndex, newIndex) => {
            buttonsList = reorderButtons(buttonsList, oldIndex, newIndex);
        },
    };

    const DELETE_INVALID_LICENSE_CODES = new Set([25, 30, 40, 41, 42, 43, 44]);

    async function refreshVipIdentity(): Promise<void> {
        const res = await advanced.updateVIP();
        USER_NAME = res.USER_NAME || "";
        USER_ID = res.USER_ID || "";
        USER_CODE_V2 = res.USER_CODE_V2 || "";
        IDENTITY_SOURCE = res.IDENTITY_SOURCE || "";
        USER_CODE = USER_CODE_V2;
    }

    async function handleMainTabChange(tab: HomepageSettingMainTab): Promise<void> {
        if (tab === "vip") {
            activeTab = tab;
            await refreshVipIdentity();
            const savedActivation = await advanced.readSavedActivationCodeState(plugin);
            if (savedActivation.status === "error") {
                showMessage("暂时无法读取本地会员授权，请检查思源数据目录后重试。本地会员数据未被修改。", 3000);
                return;
            }
            const verifiedSnapshotCode = savedActivation.status === "found"
                ? savedActivation.code
                : "";
            try {
                activationResult = await advanced.verifyLicense(
                    plugin,
                    USER_NAME,
                    USER_ID,
                );
            } catch {
                showMessage("暂时无法读取本地会员授权，请检查思源数据目录后重试。本地会员数据未被修改。", 3000);
                return;
            }
            activated = activationResult.valid;
            if (!activated && activationResult.code != 2) {
                showMessage(activationResult.error);
                if (DELETE_INVALID_LICENSE_CODES.has(activationResult.code) && verifiedSnapshotCode) {
                    try {
                        const deleteResult = await advanced.deleteLicense(plugin, verifiedSnapshotCode);
                        if (deleteResult === "license_changed") {
                            const currentResult = await advanced.verifyLicense(
                                plugin,
                                USER_NAME,
                                USER_ID,
                            );
                            activationResult = currentResult;
                            activated = currentResult.valid;
                            if (activated) {
                                handleVipMembershipActivated(currentResult);
                            } else {
                                showMessage("本地会员授权已发生变化，请重新打开会员设置确认当前授权。", 3000);
                            }
                        } else {
                            ActivationCode = "";
                        }
                    } catch {
                        showMessage("本地无效会员授权删除失败，请检查思源数据目录写入权限后重试。", 3000);
                    }
                }
            }
        } else {
            activeTab = tab;
        }
    }

    async function handleVipActivate(): Promise<void> {
        await refreshVipIdentity();

        activationResult = await advanced.activateLicense(
            plugin,
            ActivationCode,
            USER_NAME,
            USER_ID,
        );

        if (activationResult.code !== 0) {
            showMessage(activationResult.error);
            return;
        }

        showMessage("✅激活成功！");
        activated = true;
        advancedEnabled = true;
        plugin.ADVANCED = true;
        window.dispatchEvent(new CustomEvent("homepage-advanced-ready"));
        void refreshStatusAiModelSummary();
    }

    function handleVipAdvancedReady(): void {
        advancedEnabled = true;
        activated = true;
        void refreshStatusAiModelSummary();
    }

    function handleVipMembershipActivated(result: any): void {
        activationResult = result;
        activated = result.valid === true;
        if (activated) {
            advancedEnabled = true;
            plugin.ADVANCED = true;
            window.dispatchEvent(new CustomEvent("homepage-advanced-ready"));
            void refreshStatusAiModelSummary();
        }
    }

    function handleVipMembershipRevoked(): void {
        ActivationCode = "";
        activationResult = { valid: false, code: -1, error: "会员授权已取消" };
        activated = false;
        advancedEnabled = false;
        plugin.ADVANCED = false;
        window.dispatchEvent(new CustomEvent("homepage-advanced-unavailable"));
        void refreshStatusAiModelSummary();
    }

    async function handleVipDeactivate(): Promise<void> {
        try {
            const deleteResult = await advanced.deleteLicense(plugin);
            if (deleteResult === "deleted" || deleteResult === "already_missing") {
                handleVipMembershipRevoked();
            }
        } catch {
            showMessage("本地会员授权删除失败，请检查思源数据目录写入权限后重试。", 3000);
        }
    }

    function handleActivationCodeChange(value: string): void {
        ActivationCode = value;
    }

    function handleFavoritesIndexStatusChange(status: ComponentMigrationStatus) {
        favoritesMigrationStatus = status;
    }
    function handleReviewDocsIndexStatusChange(status: ComponentMigrationStatus) {
        reviewDocsMigrationStatus = status;
    }
    function handleTaskIndexStatusChange(status: ComponentMigrationStatus) {
        taskIndexMigrationStatus = status;
    }
    function handleHeatmapIndexStatusChange(status: ComponentMigrationStatus) {
        heatmapIndexStatus = status;
    }
    function handleStatIndexStatusChange(status: ComponentMigrationStatus) {
        statIndexStatus = status;
    }
    function handleEnhancedDiaryIndexStatusChange(status: ComponentMigrationStatus) {
        enhancedDiaryIndexStatus = status;
    }

    // 自动保存当前设置；保存前重新读取共享配置，避免无关的桌面修改覆盖移动端新值。
    async function confirmSave(): Promise<boolean> {
        const existingConfig = (await loadHomepageSettingConfig(plugin)) || {} as HomepageSettingConfig;
        const mobileSettingsChangedLocally =
            captureMobileSettingsSignature() !== lastLoadedMobileSignature;
        if (!mobileSettingsChangedLocally) {
            applyingExternalSharedSettings = true;
            try {
                applyMobileSettingsConfig(existingConfig as unknown as Record<string, unknown>);
            } finally {
                applyingExternalSharedSettings = false;
            }
        }

        const normalizedComponentSections = normalizeComponentSections(componentSections);
        const effectiveComponentSectionsEnabled = isComponentSectionsEffective(
            { componentSectionsEnabled, componentSections: normalizedComponentSections },
            advancedEnabled,
        );

        const config = {
            homepageAppearance: normalizeHomepageAppearanceConfig(homepageAppearance),
            // 全局配置
            autoOpenHomepage: tempAutoOpenHomepage,
            sidebarEnabled: sidebarEnabled,
            mobileAutoOpenEnabled,
            mobileAutoOpenTarget: normalizeMobileAutoOpenTarget(mobileAutoOpenTarget),
            mobileQuickActionsEnabled: mobileQuickActionsEnabled,
            mobileQuickActionsButtonSize: normalizeMobileQuickActionButtonSize(mobileQuickActionsButtonSize),
            ...(existingConfig.mobileQuickActionsPosition !== undefined
                ? { mobileQuickActionsPosition: existingConfig.mobileQuickActionsPosition }
                : {}),
            mobileQuickActionItems: normalizeMobileQuickActionItems(mobileQuickActionItems),

            // 横幅配置
            bannerEnabled: tempBannerEnabled,
            bannerGlobalType: bannerGlobalType,
            bingApiType: bingApiType,
            bannerType: tempBannerType,
            bannerLocalData: bannerLocalData,
            bannerRemoteUrl: bannerRemoteUrl,
            bannerHeight: tempBannerHeight,

            // 标题配置
            showIcon: showIcon,
            titleIconType: titleIconType,
            TitleIconEmoji: tempTitleIconEmoji,
            TitleIconImage: tempTitleIconImage,
            customTitle: tempCustomTitle,
            bannerTitleIntegrated: tempBannerEnabled && tempBannerTitleIntegrated,
            homepageTitleAlign: normalizeHomepageTitleAlign(tempHomepageTitleAlign),
            quickButtonStyle: normalizeQuickButtonStyle(tempQuickButtonStyle),
            bannerTitleColor: normalizeBannerIntegratedColor(tempBannerTitleColor),
            bannerStatusColor: normalizeBannerIntegratedColor(tempBannerStatusColor),
            bannerButtonColor: normalizeBannerIntegratedColor(tempBannerButtonColor),
            bannerGlassEnabled: tempBannerEnabled && tempBannerTitleIntegrated && tempBannerGlassEnabled,
            bannerGlassColorMode: normalizeBannerGlassColorMode(tempBannerGlassColorMode),
            bannerGlassColor: normalizeBannerGlassColor(tempBannerGlassColor),
            bannerGlassOpacity: normalizeBannerGlassOpacity(tempBannerGlassOpacity),
            bannerGlassBlur: normalizeBannerGlassBlur(tempBannerGlassBlur),
            tempTitleIconStyle: tempTitleIconStyle,

            statsInfoText: tempStatsInfoText,
            statusTextMode: normalizeHomepageStatusTextMode(tempStatusTextMode),
            statusAiPrompt: normalizeStatusAiPrompt(tempStatusAiPrompt),
            statusAiMaxChars: normalizeStatusAiMaxChars(tempStatusAiMaxChars),
            statusAiProviderId: normalizeStatusAiModelId(tempStatusAiProviderId),
            statusAiModelId: normalizeStatusAiModelId(tempStatusAiModelId),
            statusAiThinkingEnabled: normalizeStatusAiThinkingEnabled(tempStatusAiThinkingEnabled),
            statusAiStatKeys: normalizeStatusAiStatKeys(tempStatusAiStatKeys),

            // 按钮配置
            buttonsList: buttonsList.map((item) => ({
                id: item.id,
                label: item.label,
                checked: item.checked,
                shortcut: item.shortcut || "",
                order: item.order,
                action: item.action || "",
            })),
            selectedButton: selectedButton,

            componentSectionsEnabled: effectiveComponentSectionsEnabled,
            componentSections: normalizedComponentSections,
            componentSectionsNavAlign: normalizeComponentSectionsNavAlign(componentSectionsNavAlign),
            quickNotesEnabled: quickNotesEnabled,
            quickNotesPosition: quickNotesPosition,
            quickNotesTimestampEnabled: quickNotesTimestampEnabled,
            quickNotesAddPosition: quickNotesAddPosition,
            taskEditorEnabled: taskEditorEnabled,

            // 文档预览模式
            defaultDocPreviewMode: defaultDocPreviewMode,

            // AI 知识库入口开关
            aiKbDockEnabled: aiKbDockEnabled,
            aiKbTabEnabled: aiKbTabEnabled,
            selectionAiToolbar: normalizeSelectionAiToolbarSettings(selectionAiToolbar),

            // 范围配置与迁移状态
            tasksPlusSelectedNotebookIds,
            reviewDocsSelectedNotebookIds,
            favoritesMigrationStatus,
            reviewDocsMigrationStatus,
            taskIndexMigrationStatus,
            heatmapIndexStatus,
            statIndexStatus,
            enhancedDiaryIndexStatus,

            // 页脚配置
            footerEnabled: footerEnabled,
            footerContent: footerContent,

            // vip配置
            mouseIcon: mouseIcon,
            MouseTrailEnabled: MouseTrailEnabled,
            mouseGlobalEnabled: mouseGlobalEnabled,
            ClickEffectEnabled: ClickEffectEnabled,
            ClickEffectContent: ClickEffectContent,
            backgroundImageEnabled: backgroundImageEnabled,
            backgroundImageGlobalEnabled: backgroundImageGlobalEnabled,
            backgroundImageType: normalizeBackgroundImageType(backgroundImageType),
            backgroundImageLocalData: backgroundImageType === "local" ? backgroundImageLocalData : null,
            backgroundImageRemoteUrl: backgroundImageRemoteUrl,
            backgroundImageOpacity: normalizeBackgroundImageOpacity(backgroundImageOpacity),
            backgroundImageBlur: normalizeBackgroundImageBlur(backgroundImageBlur),
            FallEffectsEnabled: FallEffectsEnabled,
            GlobalFallingEffectsEnabled: GlobalFallingEffectsEnabled,
            FallingIcon: FallingIcon,
            FallingDensity: FallingDensity,
            FallingSpeed: FallingSpeed,

        };

        const appearanceOnly = appearanceOnlyBaseSignature !== null
            && captureHomepageNonAppearanceSignature() === appearanceOnlyBaseSignature
            && JSON.stringify(normalizeHomepageAppearanceConfig(existingConfig.homepageAppearance))
                !== JSON.stringify(normalizeHomepageAppearanceConfig(homepageAppearance));
        if (appearanceOnly) {
            try {
                await saveHomepageSettingConfig(plugin, {
                    ...existingConfig,
                    homepageAppearance: normalizeHomepageAppearanceConfig(homepageAppearance),
                } as HomepageSettingConfig);
                appearanceOnlyBaseSignature = null;
                window.dispatchEvent(new CustomEvent("homepage-settings-saved", {
                    detail: { appearanceOnly: true },
                }));
                return true;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                showMessage(`主题偏好保存失败：${message}`, 5000, "error");
                return false;
            }
        }

        let result;
        try {
            result = await saveHomepageSettingsInTransaction(plugin, {
                config,
                sectionsEnabled: effectiveComponentSectionsEnabled,
                sectionIds: normalizedComponentSections.map((section) => section.id),
                deletedSectionIds: deletedComponentSectionIds,
                widgetLayoutNumber,
                widgetGap,
            });
        } catch (error) {
            if (error instanceof UnrecoverableSectionHalfCommitError) {
                showMessage(`当前分栏状态无法根据本次设置安全恢复：${error.reason}。已停止写入，请导出数据检查。`, 7000, "error");
            } else if (error instanceof SyncLayoutAndViewError && error.manualCheckRequired) {
                showMessage(`设置保存状态无法确认，请人工检查：${error.message}`, 6000, "error");
            } else {
                const message = error instanceof Error ? error.message : String(error);
                showMessage(`设置保存失败：${message}`, 5000, "error");
            }
            return false;
        }

        deletedComponentSectionIds = [];
        appearanceOnlyBaseSignature = null;
        try {
            setSelectionAiToolbarSettingsSnapshot(config.selectionAiToolbar);

            // 保存移动端专属字段到 mobile-homepage
            try {
                const mobileConfig = (await loadHomepageSettingConfig(plugin, "mobile-homepage")) || {} as HomepageSettingConfig;
                const target = normalizeMobileAutoOpenTarget(mobileAutoOpenTarget);
                await saveHomepageSettingConfig(plugin, {
                    ...mobileConfig,
                    mobileAutoOpenEnabled,
                    mobileAutoOpenTarget: target,
                    mobileQuickActionsEnabled,
                    mobileQuickActionsButtonSize: normalizeMobileQuickActionButtonSize(mobileQuickActionsButtonSize),
                    mobileQuickActionItems: normalizeMobileQuickActionItems(mobileQuickActionItems),
                } as HomepageSettingConfig, "mobile-homepage");
            } catch (mobileError) {
                showMessage("桌面主页设置已保存，但移动端设置保存失败。", 5000, "error");
            }

            window.dispatchEvent(new CustomEvent("homepage-settings-saved"));
        } catch {
            showMessage("设置已保存，但界面刷新失败", 5000, "error");
            return true;
        }
        if (result.warning) {
            showMessage("设置已保存，但界面刷新失败", 5000, "error");
        }
        return true;
    }

    async function resetCurrentInterface() {
        const confirmed = await confirmDialogBoolean({
            title: "重置当前界面",
            content: "此操作将清空当前设备桌面主页中的组件布局。不会删除组件配置文件、记账、任务等共享业务数据，之后可以通过模板中心重新应用主页布局。确定继续吗？",
        });
        if (!confirmed) return;
        await resetCurrentDesktopHomepageLayout(plugin);
        showMessage("当前设备桌面主页布局已重置，重新打开主页后生效");
    }

    function openMobileHomepagePreviewDialog() {
        if (!advancedEnabled) {
            showMessage("移动端主页为高级会员专属功能，请在「会员服务」中开通后使用", 3000);
            return;
        }

        const dialogRef = svelteDialog({
            title: "手机端主页",
            width: "1120px",
            height: "86vh",
            constructor: (containerEl: HTMLElement) => {
                return mount(MobileHomepagePreviewDialog, {
                    target: containerEl,
                    props: {
                        plugin,
                        close: () => dialogRef.close(),
                    },
                });
            },
        });
        dialogRef.dialog.element.classList.add("mobile-homepage-preview-dialog");
    }

</script>

<div class="shp-homepage-settings" bind:this={settingsRootElement}>
    <!-- 左侧：一级页签 -->
    <div class="main-nav-column">
        <MainTabNav
            activeTab={activeTab}
            onTabChange={handleMainTabChange}
            showRobotAssistant={!plugin?.isMobile}
        />
    </div>

    <!-- 中间：二级页签 -->
    {#if activeTab === "homepage"}
        <div class="sub-nav-column">
            <SubTabNav
                settingsActiveTab={settingsActiveTab}
                advancedEnabled={advancedEnabled}
                onTabChange={(tab) => settingsActiveTab = tab}
            />
        </div>
    {:else if activeTab === "aiKnowledgeBase"}
        <div class="sub-nav-column">
            <AiKnowledgeBaseSubTabNav
                activeTab={aiKnowledgeBaseActiveTab}
                onTabChange={(tab) => aiKnowledgeBaseActiveTab = tab}
            />
        </div>
    {:else if activeTab === "notifyBridge"}
        <div class="sub-nav-column">
            <NotificationCenterSubTabNav
                activeTab={notificationCenterActiveTab}
                onTabChange={(tab) => notificationCenterActiveTab = tab}
            />
        </div>
    {:else if activeTab === "robotAssistant"}
        <div class="sub-nav-column">
            <RobotAssistantSubTabNav
                activeTab={robotAssistantActiveTab}
                onTabChange={(tab) => robotAssistantActiveTab = tab}
            />
        </div>
    {/if}

    <!-- 右侧：内容区 -->
    <div class="content-column">
        <SettingsCommandBar
            saveStatus={autoSaveStatus}
            saveMode={settingsSaveMode}
            onSelectResult={(result) => void handleSettingSearchResult(result)}
            onRetrySave={() => void queueAutoSaveNow()}
        />
        {#if activeTab === "homepage"}
            <div class="content-scroll-area">
                <div class="homepage-content-settings">
                    {#if settingsActiveTab === "behavior"}
                        <HomepageGlobalSection
                            tempAutoOpenHomepage={tempAutoOpenHomepage}
                            sidebarEnabled={sidebarEnabled}
                            onTempAutoOpenHomepageChange={(value) => tempAutoOpenHomepage = value}
                            onSidebarEnabledChange={(value) => sidebarEnabled = value}
                        />
                    {/if}

                    {#if settingsActiveTab === "appearance"}
                        <AppearanceSettingsTab
                            themes={availableHomepageThemes}
                            preferredThemeId={homepageAppearance.preferredThemeId}
                            effectiveThemeId={appearanceResolution.effectiveThemeId}
                            fallbackReason={appearanceResolution.fallbackReason}
                            {advancedEnabled}
                            switchingThemeId={activeHomepageThemeTransition?.themeId ?? null}
                            switchingFirstActivation={activeHomepageThemeTransition?.firstActivation ?? false}
                            onSelectTheme={handleHomepageThemeSelection}
                        />
                    {/if}

                    {#if settingsActiveTab === "mobile"}
                        <MobileSettingsTab
                            advancedEnabled={advancedEnabled}
                            mobileAutoOpenEnabled={mobileAutoOpenEnabled}
                            mobileAutoOpenTarget={mobileAutoOpenTarget}
                            mobileQuickActionsEnabled={mobileQuickActionsEnabled}
                            mobileQuickActionsButtonSize={mobileQuickActionsButtonSize}
                            mobileQuickActionItems={mobileQuickActionItems}
                            showMobilePreview={!plugin?.isMobile}
                            onMobileAutoOpenEnabledChange={(value) => mobileAutoOpenEnabled = value}
                            onMobileAutoOpenTargetChange={(value) => mobileAutoOpenTarget = value}
                            onMobileQuickActionsEnabledChange={(value) => mobileQuickActionsEnabled = value}
                            onMobileQuickActionsButtonSizeChange={(value) => mobileQuickActionsButtonSize = value}
                            onMobileQuickActionItemsChange={(value) => mobileQuickActionItems = value}
                            onOpenMobileHomepagePreview={openMobileHomepagePreviewDialog}
                        />
                    {/if}

                    {#if settingsActiveTab === "banner"}
                        <BannerSettingsTab
                            tempBannerEnabled={tempBannerEnabled}
                            bannerGlobalType={bannerGlobalType}
                            bingApiType={bingApiType}
                            tempBannerType={tempBannerType}
                            bannerLocalData={bannerLocalData}
                            bannerRemoteUrl={bannerRemoteUrl}
                            tempBannerHeight={tempBannerHeight}
                            advancedEnabled={advancedEnabled}
                            onTempBannerEnabledChange={(value) => {
                                tempBannerEnabled = value;
                                if (!value) tempBannerTitleIntegrated = false;
                            }}
                            onBannerGlobalTypeChange={(value) => bannerGlobalType = value}
                            onBingApiTypeChange={(value) => bingApiType = value}
                            onTempBannerTypeChange={(value) => tempBannerType = value}
                            onBannerLocalDataChange={(value) => bannerLocalData = value}
                            onBannerRemoteUrlChange={(value) => bannerRemoteUrl = value}
                            onTempBannerHeightChange={(value) => tempBannerHeight = value}
                            handleImageSelect={handleImageSelect}
                        />
                    {/if}

                    {#if settingsActiveTab === "title"}
                        <TitleSettingsTab
                            tempShowTitleIcon={showIcon}
                            tempTitleIconType={titleIconType}
                            tempTitleEmoji={tempTitleIconEmoji}
                            tempTitleImage={tempTitleIconImage}
                            tempTitleIconStyle={tempTitleIconStyle}
                            tempCustomTitleText={tempCustomTitle}
                            tempStatsText={tempStatsInfoText}
                            tempStatusTextMode={tempStatusTextMode}
                            tempStatusAiPrompt={tempStatusAiPrompt}
                            tempStatusAiMaxChars={tempStatusAiMaxChars}
                            tempStatusAiStatKeys={tempStatusAiStatKeys}
                            tempBannerEnabled={tempBannerEnabled}
                            tempBannerTitleIntegrated={tempBannerTitleIntegrated}
                            tempHomepageTitleAlign={tempHomepageTitleAlign}
                            tempQuickButtonStyle={tempQuickButtonStyle}
                            tempBannerTitleColor={tempBannerTitleColor}
                            tempBannerStatusColor={tempBannerStatusColor}
                            tempBannerButtonColor={tempBannerButtonColor}
                            tempBannerGlassEnabled={tempBannerGlassEnabled}
                            tempBannerGlassColorMode={tempBannerGlassColorMode}
                            tempBannerGlassColor={tempBannerGlassColor}
                            tempBannerGlassOpacity={tempBannerGlassOpacity}
                            tempBannerGlassBlur={tempBannerGlassBlur}
                            statusAiAvailableModelCount={statusAiAvailableModelCount}
                            statusAiSelectedModelLabel={statusAiSelectedModelLabel}
                            advancedEnabled={advancedEnabled}
                            onTempShowTitleIconChange={(value) => showIcon = value}
                            onTempTitleIconTypeChange={(value) => titleIconType = value}
                            onTempTitleEmojiChange={(value) => tempTitleIconEmoji = value}
                            onTempTitleImageChange={(value) => tempTitleIconImage = value}
                            onTempTitleIconStyleChange={(value) => tempTitleIconStyle = value}
                            onTempCustomTitleTextChange={(value) => tempCustomTitle = value}
                            onTempStatsTextChange={(value) => tempStatsInfoText = value}
                            onTempStatusTextModeChange={handleStatusTextModeChange}
                            onTempStatusAiPromptChange={(value) => tempStatusAiPrompt = value}
                            onTempStatusAiMaxCharsChange={(value) => tempStatusAiMaxChars = value}
                            onTempStatusAiStatKeysChange={(value) => tempStatusAiStatKeys = normalizeStatusAiStatKeys(value)}
                            onTempBannerTitleIntegratedChange={(value) => tempBannerTitleIntegrated = tempBannerEnabled && value}
                            onTempHomepageTitleAlignChange={(value) => tempHomepageTitleAlign = normalizeHomepageTitleAlign(value)}
                            onTempQuickButtonStyleChange={(value) => tempQuickButtonStyle = normalizeQuickButtonStyle(value)}
                            onTempBannerTitleColorChange={(value) => tempBannerTitleColor = normalizeBannerIntegratedColor(value)}
                            onTempBannerStatusColorChange={(value) => tempBannerStatusColor = normalizeBannerIntegratedColor(value)}
                            onTempBannerButtonColorChange={(value) => tempBannerButtonColor = normalizeBannerIntegratedColor(value)}
                            onTempBannerGlassEnabledChange={(value) => tempBannerGlassEnabled = value}
                            onTempBannerGlassColorModeChange={(value) => tempBannerGlassColorMode = normalizeBannerGlassColorMode(value)}
                            onTempBannerGlassColorChange={(value) => tempBannerGlassColor = normalizeBannerGlassColor(value)}
                            onTempBannerGlassOpacityChange={(value) => tempBannerGlassOpacity = normalizeBannerGlassOpacity(value)}
                            onTempBannerGlassBlurChange={(value) => tempBannerGlassBlur = normalizeBannerGlassBlur(value)}
                        />
                    {/if}

                    {#if settingsActiveTab === "button"}
                        <ButtonSettingsTab
                            buttonsList={buttonsList}
                            selectedButton={selectedButton}
                            actions={buttonSettingsActions}
                        />
                    {/if}

                    {#if settingsActiveTab === "widgets"}
                        <WidgetsSettingsTab
                            state={widgetsSettingsState}
                            actions={widgetsSettingsActions}
                        />
                    {/if}

                    {#if settingsActiveTab === "indexing"}
                        <IndexManagementSettingsTab
                            {plugin}
                            bind:favoritesIndexStatus={favoritesMigrationStatus}
                            bind:reviewDocsIndexStatus={reviewDocsMigrationStatus}
                            bind:taskIndexStatus={taskIndexMigrationStatus}
                            bind:heatmapIndexStatus
                            bind:statIndexStatus
                            bind:enhancedDiaryIndexStatus
                            onFavoritesStatusChange={handleFavoritesIndexStatusChange}
                            onReviewDocsStatusChange={handleReviewDocsIndexStatusChange}
                            onTaskIndexStatusChange={handleTaskIndexStatusChange}
                            onHeatmapIndexStatusChange={handleHeatmapIndexStatusChange}
                            onStatIndexStatusChange={handleStatIndexStatusChange}
                            onEnhancedDiaryIndexStatusChange={handleEnhancedDiaryIndexStatusChange}
                        />
                    {/if}

                    {#if settingsActiveTab === "styles"}
                        <StylesSettingsTab
                            state={stylesSettingsState}
                            actions={stylesSettingsActions}
                            advancedEnabled={advancedEnabled}
                        />
                    {/if}

                    {#if settingsActiveTab === "devices"}
                        <div class="devices-section">
                            <SettingSection title="当前设备">
                                <SettingRow title="重置当前界面" description="仅清空当前设备桌面主页中的组件布局，不删除组件配置文件和共享业务数据">
                                    <button class="device-action-btn" onclick={resetCurrentInterface}>重置</button>
                                </SettingRow>

                                {#if currentDeviceInfo}
                                    <div class="device-info-panel current">
                                        <div class="device-info-item">
                                            <span class="device-info-label">设备名称</span>
                                            <span class="device-info-value">{currentDeviceInfo.deviceName}</span>
                                        </div>
                                        <div class="device-info-item">
                                            <span class="device-info-label">系统</span>
                                            <span class="device-info-value">{currentDeviceInfo.os} / {currentDeviceInfo.osPlatform}</span>
                                        </div>
                                        <div class="device-info-item">
                                            <span class="device-info-label">设备 ID</span>
                                            <span class="device-info-value">{currentDeviceInfo.physicalDeviceId}</span>
                                        </div>
                                    </div>
                                {:else}
                                    <p class="no-device">无法获取当前设备信息</p>
                                {/if}
                            </SettingSection>

                            <SettingSection title="设备隔离说明">
                                <p class="no-devices">这里只管理当前设备的桌面主页视图，不读取或删除其他设备配置。</p>
                            </SettingSection>
                        </div>
                    {/if}
                </div>
            </div>
        {:else if activeTab === "vip"}
            <div class="content-scroll-area full-content">
                <VipSection
                    plugin={plugin}
                    USER_NAME={USER_NAME}
                    USER_ID={USER_ID}
                    USER_CODE={USER_CODE}
                    USER_CODE_V2={USER_CODE_V2}
                    IDENTITY_SOURCE={IDENTITY_SOURCE}
                    activated={activated}
                    activationResult={activationResult}
                    ActivationCode={ActivationCode}
                    onDeactivate={handleVipDeactivate}
                    onActivate={handleVipActivate}
                    onActivationCodeChange={handleActivationCodeChange}
                    onAdvancedReady={handleVipAdvancedReady}
                    onMembershipActivated={handleVipMembershipActivated}
                    onMembershipRevoked={handleVipMembershipRevoked}
                />
            </div>
        {:else if activeTab === "aiKnowledgeBase"}
            <div class="content-scroll-area full-content">
                {#if !settingsLoaded}
                    <div class="ai-kb-settings-loading">正在加载 AI 知识库设置...</div>
                {:else}
                    <AiKnowledgeBaseSettingsTab
                        activeSubTab={aiKnowledgeBaseActiveTab}
                        aiKbDockEnabled={aiKbDockEnabled}
                        aiKbTabEnabled={aiKbTabEnabled}
                        advancedEnabled={advancedEnabled}
                        statusAiProviderId={tempStatusAiProviderId}
                        statusAiModelId={tempStatusAiModelId}
                        statusAiThinkingEnabled={tempStatusAiThinkingEnabled}
                        selectionAiToolbar={selectionAiToolbar}
                        onAiKbDockEnabledChange={handleAiKbDockEnabledChange}
                        onAiKbTabEnabledChange={handleAiKbTabEnabledChange}
                        onStatusAiModelChange={handleStatusAiModelChange}
                        onStatusAiThinkingEnabledChange={handleStatusAiThinkingEnabledChange}
                        onSelectionAiToolbarChange={handleSelectionAiToolbarChange}
                    />
                {/if}
            </div>
        {:else if activeTab === "notifyBridge"}
            <div class="content-scroll-area full-content">
                <NotificationCenterSettingsTab
                    activeSubTab={notificationCenterActiveTab}
                    advancedEnabled={advancedEnabled}
                    plugin={plugin}
                />
            </div>
        {:else if activeTab === "robotAssistant"}
            <div class="content-scroll-area full-content">
                <RobotAssistantSettingsTab
                    advancedEnabled={advancedEnabled}
                    plugin={plugin}
                    activeSubTab={robotAssistantActiveTab}
                />
            </div>
        {:else if activeTab === "about"}
            <div class="content-scroll-area full-content">
                <AboutSection />
            </div>
        {/if}
    </div>
</div>
