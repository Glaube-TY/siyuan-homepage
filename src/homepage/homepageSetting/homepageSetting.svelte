<script lang="ts">
    import { onMount, mount, onDestroy } from "svelte";
    import * as advanced from "../../components/tools/advanced";
    import { showMessage } from "siyuan";

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
    } from "./config"
    import type { BackgroundImageType, BannerDeviceProfile, BannerGlassColorMode, ComponentMigrationStatus, ComponentSection, ComponentSectionsNavAlign, HomepageSettingConfig, HomepageTitleAlign, QuickButtonStyle } from "./config"
    import { createDefaultButtons, normalizeButtons, addButton, moveButtonUp, moveButtonDown, deleteButton, isCoreButton } from "./buttonSettings"
    import { getLocalDeviceId, isDesktopDeviceProfileEnabled, getCurrentDeviceInfo, updateDeviceProfile, findExistingDeviceByHardware, deduplicateDeviceProfiles } from "../utils/deviceProfile"
    import { ensureComponentSectionsForCurrentDevice, loadWidgetLayoutSettings, removeComponentSectionLayouts, saveWidgetLayoutSettings } from "../../components/utils/widgetBlock/utils/layout-shared"
    import { svelteDialog, confirmDialogBoolean, safeConfirmContent } from "../../libs/dialog"
    import HiddenWidgetsDialog from "./HiddenWidgetsDialog.svelte"
    import MobileHomepagePreviewDialog from "../mobileHomepage/MobileHomepagePreviewDialog.svelte"
    import AboutSection from "./sections/AboutSection.svelte"
    import VipSection from "./sections/VipSection.svelte"
    import HomepageGlobalSection from "./sections/HomepageGlobalSection.svelte"
    import BannerSettingsTab from "./tabs/BannerSettingsTab.svelte"
    import TitleSettingsTab from "./tabs/TitleSettingsTab.svelte"
    import ButtonSettingsTab from "./tabs/ButtonSettingsTab.svelte"
    import WidgetsSettingsTab from "./tabs/WidgetsSettingsTab.svelte"
    import StylesSettingsTab from "./tabs/StylesSettingsTab.svelte"
    import MobileSettingsTab from "./tabs/MobileSettingsTab.svelte"
    import AiKnowledgeBaseSettingsTab from "./tabs/AiKnowledgeBaseSettingsTab.svelte"
    import NotifyBridgeSettingsTab from "./tabs/NotifyBridgeSettingsTab.svelte"
    import ChatActionBridgeSettingsTab from "./tabs/ChatActionBridgeSettingsTab.svelte"
    import IndexManagementSettingsTab from "./tabs/IndexManagementSettingsTab.svelte"
    import MainTabNav from "./layout/MainTabNav.svelte"
    import SubTabNav from "./layout/SubTabNav.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { getKbSettings, KB_SETTINGS_CHANGED_EVENT } from "@/features/kb/services/settings/kb-settings-service";
    import { buildChatModelOptions } from "@/features/kb/services/settings/chat-model-options";
    import { buildChatModelKey, type ChatModelOption } from "@/features/kb/types/chat-model-selection";
    import {
        DEFAULT_STATUS_AI_MAX_CHARS,
        DEFAULT_STATUS_AI_PROMPT,
        normalizeHomepageStatusTextMode,
        normalizeStatusAiMaxChars,
        normalizeStatusAiModelId,
        normalizeStatusAiPrompt,
        normalizeStatusAiThinkingEnabled,
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
        normalizeMobileQuickActionButtonSize,
        normalizeMobileQuickActionItems,
        type MobileQuickActionSetting,
    } from "../mobileQuickActions/mobileQuickActionsConfig";

    let { plugin, close }: HomepageSettingProps = $props();

    let activeTab = $state<HomepageSettingMainTab>("homepage");

    // 主页设置相关配置变量
    let tempAutoOpenHomepage = $state(true);
    let sidebarEnabled = $state(false);
    let autoOpenMobileHomepage = $state(false);
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
    let settingsActiveTab = $state<HomepageSettingSubTab>("behavior");
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
    let statusAiModelOptions: ChatModelOption[] = $state([]);
    let statusAiAvailableModelCount = $state(0);
    let statusAiSelectedModelLabel = $state("");

    let buttonsList: ButtonItem[] = $state(createDefaultButtons());

    // 当前选中的按钮项
    let selectedButton: ButtonItem | null = $state(null);
    let nextId = Date.now();
    let selectedButtonIndex: number = $state(-1);

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
    let aiKbSettingsSaveTask: Promise<void> = Promise.resolve();

    function queueSaveAiKnowledgeBaseSettings(): Promise<void> {
        if (!settingsLoaded) return Promise.resolve();
        aiKbSettingsSaveTask = aiKbSettingsSaveTask
            .catch(() => undefined)
            .then(() => saveAiKnowledgeBaseSettings());
        return aiKbSettingsSaveTask;
    }

    async function saveAiKnowledgeBaseSettings(): Promise<void> {
        const existingConfig = (await loadHomepageSettingConfig(plugin)) || {} as HomepageSettingConfig;
        await saveHomepageSettingConfig(plugin, {
            ...existingConfig,
            aiKbDockEnabled,
            aiKbTabEnabled,
            statusAiProviderId: normalizeStatusAiModelId(tempStatusAiProviderId),
            statusAiModelId: normalizeStatusAiModelId(tempStatusAiModelId),
            statusAiThinkingEnabled: normalizeStatusAiThinkingEnabled(tempStatusAiThinkingEnabled),
            selectionAiToolbar: normalizeSelectionAiToolbarSettings(selectionAiToolbar),
        } as HomepageSettingConfig);
        setSelectionAiToolbarSettingsSnapshot(normalizeSelectionAiToolbarSettings(selectionAiToolbar));
        window.dispatchEvent(new CustomEvent("homepage-settings-saved"));
    }

    function handleAiKbDockEnabledChange(value: boolean): void {
        aiKbDockEnabled = value;
        void queueSaveAiKnowledgeBaseSettings().then(() => {
            if (!value) showMessage("设置已保存，侧边栏入口将在重启插件或刷新界面后隐藏", 4000);
        }).catch(() => {
            showMessage("设置保存失败，请稍后重试", 3000);
        });
    }

    function handleAiKbTabEnabledChange(value: boolean): void {
        aiKbTabEnabled = value;
        void queueSaveAiKnowledgeBaseSettings().then(() => {
            if (!value) showMessage("设置已保存，标签页入口将在重启插件或刷新界面后隐藏", 4000);
        }).catch(() => {
            showMessage("设置保存失败，请稍后重试", 3000);
        });
    }

    function handleStatusAiThinkingEnabledChange(value: boolean): void {
        tempStatusAiThinkingEnabled = value;
        saveAiKnowledgeBaseSettingsSafely();
    }

    function handleSelectionAiToolbarChange(value: SelectionAiToolbarSettings): void {
        selectionAiToolbar = normalizeSelectionAiToolbarSettings(value);
        saveAiKnowledgeBaseSettingsSafely();
    }

    function saveAiKnowledgeBaseSettingsSafely(): void {
        void queueSaveAiKnowledgeBaseSettings().catch(() => {
            showMessage("设置保存失败，请稍后重试", 3000);
        });
    }

    let selectionAiToolbar = $state<SelectionAiToolbarSettings>(
        normalizeSelectionAiToolbarSettings(DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS)
    );

    function createComponentSectionId(): string {
        const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return `section-${randomPart}`.replace(/[^a-zA-Z0-9_-]/g, "");
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
        componentSections = normalizeComponentSections(componentSections);
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
        if (sectionId === "overview") {
            showMessage("总览分区不能删除", 3000);
            return;
        }
        const normalizedSections = normalizeComponentSections(componentSections);
        if (normalizedSections.length <= 1) {
            showMessage("至少保留一个分区", 3000);
            return;
        }
        const target = normalizedSections.find((section) => section.id === sectionId);
        if (!target) return;

        const confirmed = await confirmDialogBoolean({
            title: "删除分区",
            content: safeConfirmContent(
                "确定要删除该组件分区吗？\n\n只会移除该分区的布局引用，不会删除组件内容文件。\n\n分区：",
                target.name,
            ),
        });
        if (!confirmed) return;

        componentSections = normalizeComponentSections(normalizedSections.filter((section) => section.id !== sectionId));
        deletedComponentSectionIds = [...new Set([...deletedComponentSectionIds, sectionId])];
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

    // 设备管理
    let currentDeviceInfo = $state<ReturnType<typeof getCurrentDeviceInfo> | null>(null);
    let deviceProfiles = $state<Record<string, any>>({});

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
        saveAiKnowledgeBaseSettingsSafely();
    }

    function handleKbSettingsChanged(): void {
        void refreshStatusAiModelSummary();
    }

    // 设置页面加载时读取配置信息
    onMount(async () => {
        const savedConfig = await loadHomepageSettingConfig(plugin);
        if (savedConfig) {
            // 全局配置
            tempAutoOpenHomepage = savedConfig.autoOpenHomepage ?? true;
            sidebarEnabled = savedConfig.sidebarEnabled ?? false;
            autoOpenMobileHomepage =
                savedConfig.autoOpenMobileHomepage ?? false;
            mobileQuickActionsEnabled = savedConfig.mobileQuickActionsEnabled ?? true;
            mobileQuickActionsButtonSize = normalizeMobileQuickActionButtonSize(savedConfig.mobileQuickActionsButtonSize);
            mobileQuickActionItems = normalizeMobileQuickActionItems(savedConfig.mobileQuickActionItems);
            // 横幅配置
            bannerEnabled = savedConfig.bannerEnabled ?? true;
            bannerGlobalType = savedConfig.bannerGlobalType || "custom";
            bingApiType = savedConfig.bingApiType || "POD_UHD";
            bannerType = savedConfig.bannerType ?? "local";
            bannerLocalData = savedConfig.bannerLocalData || "";
            bannerRemoteUrl = savedConfig.bannerRemoteUrl || "";

            // 横幅高度：桌面端优先读取当前设备配置，否则回退到全局
            const globalBannerHeight = savedConfig.bannerHeight || "300";
            if (isDesktopDeviceProfileEnabled()) {
                const deviceId = getLocalDeviceId();
                if (deviceId && savedConfig.bannerDeviceProfiles?.[deviceId]?.bannerHeight !== undefined) {
                    bannerHeight = String(savedConfig.bannerDeviceProfiles[deviceId].bannerHeight);
                } else {
                    bannerHeight = globalBannerHeight;
                }
            } else {
                bannerHeight = globalBannerHeight;
            }

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
            tempStatsInfoText = savedConfig.statsInfoText || "自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{blocksCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{docsCount}} 篇笔记。\n感谢自己的坚持！❤";
            tempStatusTextMode = normalizeHomepageStatusTextMode(savedConfig.statusTextMode);
            tempStatusAiPrompt = normalizeStatusAiPrompt(savedConfig.statusAiPrompt);
            tempStatusAiMaxChars = normalizeStatusAiMaxChars(savedConfig.statusAiMaxChars);
            tempStatusAiProviderId = normalizeStatusAiModelId(savedConfig.statusAiProviderId);
            tempStatusAiModelId = normalizeStatusAiModelId(savedConfig.statusAiModelId);
            tempStatusAiThinkingEnabled = normalizeStatusAiThinkingEnabled(savedConfig.statusAiThinkingEnabled);

            // 恢复按钮配置
            if (savedConfig.buttonsList) {
                buttonsList = normalizeButtons(savedConfig.buttonsList);
                nextId = Math.max(...buttonsList.map((item) => item.id), 0) + 1;
            }

            if (savedConfig.selectedButton) {
                const found = buttonsList.find((item) => item.id === savedConfig.selectedButton.id);
                selectedButton = found ?? null;
            }

            // 组件设置 - 从 widgetLayout.json 读取（与组件顺序存储方式一致）
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

            // 设备管理 - 登记当前设备并加载所有设备（带同机匹配和去重）
            currentDeviceInfo = getCurrentDeviceInfo();
            let loadedDeviceProfiles = savedConfig.deviceProfiles || {};
            
            // 先做一次去重清理
            const originalDeviceProfiles = loadedDeviceProfiles;
            const { cleanedProfiles, deletedIds } = deduplicateDeviceProfiles(loadedDeviceProfiles);
            if (deletedIds.length > 0) {
                for (const deletedId of deletedIds) {
                    const deletedProfile = originalDeviceProfiles[deletedId];
                    const retainedEntry = Object.entries(cleanedProfiles).find(([, profile]) =>
                        isSameDeviceHardwareProfile(profile, deletedProfile)
                    );
                    if (retainedEntry) {
                        mergeBannerDeviceProfile(savedConfig, deletedId, retainedEntry[0]);
                    }
                }
                loadedDeviceProfiles = cleanedProfiles;
                
                // 同步清理 widgetLayout.json 中的重复 profiles
                const widgetLayout = await plugin.loadData("widgetLayout.json");
                if (widgetLayout?.profiles) {
                    for (const oldId of deletedIds) {
                        delete widgetLayout.profiles[oldId];
                    }
                    await plugin.saveData("widgetLayout.json", widgetLayout);
                }
            }
            
            // 桌面端：登记当前设备
            if (isDesktopDeviceProfileEnabled() && currentDeviceInfo.deviceId) {
                // 先按当前 deviceId 查找
                let existingProfile = loadedDeviceProfiles[currentDeviceInfo.deviceId];
                let oldDeviceId: string | null = null;
                
                // 如果没找到，尝试同机匹配（修复 localStorage 漂移）
                if (!existingProfile) {
                    const matchedId = findExistingDeviceByHardware(loadedDeviceProfiles, currentDeviceInfo);
                    if (matchedId) {
                        existingProfile = loadedDeviceProfiles[matchedId];
                        oldDeviceId = matchedId;
                    }
                }
                
                if (existingProfile) {
                    // 更新现有 profile 的设备信息，保留 layout
                    loadedDeviceProfiles[currentDeviceInfo.deviceId] = {
                        ...existingProfile,
                        deviceName: currentDeviceInfo.deviceName,
                        platform: currentDeviceInfo.platform,
                        arch: currentDeviceInfo.arch,
                        hostname: currentDeviceInfo.hostname,
                        isMobile: currentDeviceInfo.isMobile,
                        lastSeenAt: new Date().toISOString(),
                    };
                    
                    // 如果发生了迁移，删除旧 key
                    if (oldDeviceId && oldDeviceId !== currentDeviceInfo.deviceId) {
                        delete loadedDeviceProfiles[oldDeviceId];
                        
                        // 同步迁移 widgetLayout.json 中的 profile
                        const widgetLayout = await plugin.loadData("widgetLayout.json");
                        if (widgetLayout?.profiles?.[oldDeviceId]) {
                            widgetLayout.profiles[currentDeviceInfo.deviceId] = widgetLayout.profiles[oldDeviceId];
                            delete widgetLayout.profiles[oldDeviceId];
                            await plugin.saveData("widgetLayout.json", widgetLayout);
                        }
                        mergeBannerDeviceProfile(savedConfig, oldDeviceId, currentDeviceInfo.deviceId);
                    }
                } else {
                    // 创建新 profile（不含 layout，layout 已移到 widgetLayout.json）
                    loadedDeviceProfiles[currentDeviceInfo.deviceId] = {
                        deviceId: currentDeviceInfo.deviceId,
                        deviceName: currentDeviceInfo.deviceName,
                        platform: currentDeviceInfo.platform,
                        arch: currentDeviceInfo.arch,
                        hostname: currentDeviceInfo.hostname,
                        isMobile: currentDeviceInfo.isMobile,
                        lastSeenAt: new Date().toISOString(),
                    };
                }
                // 保存回配置
                savedConfig.deviceProfiles = loadedDeviceProfiles;
                await saveHomepageSettingConfig(plugin, savedConfig);
            }
            
            // 更新页面状态
            deviceProfiles = { ...loadedDeviceProfiles };
        }

        // 同步到临时变量
        tempBannerEnabled = bannerEnabled;
        tempBannerType = bannerType;
        tempBannerHeight = bannerHeight;
        advancedEnabled = plugin.ADVANCED;

        await refreshStatusAiModelSummary();
        window.addEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
        settingsLoaded = true;
    });

    onDestroy(() => {
        window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
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

    $effect(() => {
        // 获取当前选中按钮在列表中的索引
        selectedButtonIndex = selectedButton
            ? buttonsList.findIndex((item) => item.id === selectedButton.id)
            : -1;
    });

    function moveUpButton() {
        buttonsList = moveButtonUp(buttonsList, selectedButtonIndex);
    }

    function moveDownButton() {
        buttonsList = moveButtonDown(buttonsList, selectedButtonIndex);
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
        onMoveUpButton: moveUpButton,
        onMoveDownButton: moveDownButton,
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

    function handleFavoritesMigrationStatusChange(status: ComponentMigrationStatus) {
        favoritesMigrationStatus = status;
    }
    function handleReviewDocsMigrationStatusChange(status: ComponentMigrationStatus) {
        reviewDocsMigrationStatus = status;
    }
    function handleTaskIndexMigrationStatusChange(status: ComponentMigrationStatus) {
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

    // 保存配置并关闭对话框
    async function confirmSave() {
        const existingConfig = (await loadHomepageSettingConfig(plugin)) || {} as HomepageSettingConfig;
        const deviceProfiles = existingConfig.deviceProfiles || {};

        // 初始化 bannerDeviceProfiles（如果不存在）
        let bannerDeviceProfiles = existingConfig.bannerDeviceProfiles || {};
        existingConfig.bannerDeviceProfiles = bannerDeviceProfiles;

        // 桌面端：登记当前设备信息，并保存设备特定的横幅高度
        if (isDesktopDeviceProfileEnabled()) {
            const deviceId = getLocalDeviceId();
            if (deviceId) {
                const deviceInfo = getCurrentDeviceInfo();
                let existingProfile = deviceProfiles[deviceId];
                let oldDeviceId: string | null = null;
                if (!existingProfile) {
                    const matchedId = findExistingDeviceByHardware(deviceProfiles, deviceInfo);
                    if (matchedId) {
                        existingProfile = deviceProfiles[matchedId];
                        oldDeviceId = matchedId;
                    }
                }
                if (existingProfile) {
                    deviceProfiles[deviceId] = updateDeviceProfile(existingProfile, deviceInfo);
                    if (oldDeviceId && oldDeviceId !== deviceId) {
                        delete deviceProfiles[oldDeviceId];
                        mergeBannerDeviceProfile(existingConfig, oldDeviceId, deviceId);
                    }
                } else {
                    deviceProfiles[deviceId] = {
                        deviceId: deviceInfo.deviceId,
                        deviceName: deviceInfo.deviceName,
                        platform: deviceInfo.platform,
                        arch: deviceInfo.arch,
                        hostname: deviceInfo.hostname,
                        isMobile: deviceInfo.isMobile,
                        lastSeenAt: new Date().toISOString(),
                    };
                }

                // 保存当前设备的横幅高度
                if (!bannerDeviceProfiles[deviceId]) {
                    bannerDeviceProfiles[deviceId] = {};
                }
                bannerDeviceProfiles[deviceId].bannerHeight = Number(tempBannerHeight) || 300;
            }
        }

        const normalizedComponentSections = normalizeComponentSections(componentSections);
        const effectiveComponentSectionsEnabled = advancedEnabled && componentSectionsEnabled;

        if (deletedComponentSectionIds.length > 0) {
            await removeComponentSectionLayouts(plugin, deletedComponentSectionIds);
            deletedComponentSectionIds = [];
        }

        if (componentSectionsEnabled) {
            await ensureComponentSectionsForCurrentDevice(plugin);
        }

        // 保存布局设置到 widgetLayout.json（与组件顺序存储方式一致）
        await saveWidgetLayoutSettings(
            plugin,
            { widgetLayoutNumber, widgetGap },
            { sectionsEnabled: effectiveComponentSectionsEnabled },
        );

        const config = {
            // 全局配置
            autoOpenHomepage: tempAutoOpenHomepage,
            sidebarEnabled: sidebarEnabled,
            autoOpenMobileHomepage: autoOpenMobileHomepage,
            mobileQuickActionsEnabled: mobileQuickActionsEnabled,
            mobileQuickActionsButtonSize: normalizeMobileQuickActionButtonSize(mobileQuickActionsButtonSize),
            mobileQuickActionsPosition: existingConfig.mobileQuickActionsPosition,
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

            // 组件配置 - widgetLayoutNumber/widgetGap 已移到 widgetLayout.json
            // 这里保留移动端的全局值，桌面端不再使用
            widgetLayoutNumber: widgetLayoutNumber,
            widgetGap: widgetGap,
            componentSectionsEnabled: componentSectionsEnabled,
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

            // 设备 profiles
            deviceProfiles: deviceProfiles,

            // 横幅设备特定配置
            bannerDeviceProfiles: bannerDeviceProfiles,
        };

        await saveHomepageSettingConfig(plugin, config);
        setSelectionAiToolbarSettingsSnapshot(config.selectionAiToolbar);

        // 派发全局事件通知主页配置已保存
        window.dispatchEvent(new CustomEvent("homepage-settings-saved"));

        if (close) close();
    }

    function cancelSave() {
        if (close) {
            close();
        }
    }

    // 移除设备配置（带确认）
    async function removeDeviceProfile(deviceIdToRemove: string) {
        const isCurrentDevice = deviceIdToRemove === getLocalDeviceId();
        if (isCurrentDevice) {
            showMessage("当前设备不可移除");
            return;
        }

        // 确认对话框
        const confirmed = await confirmDialogBoolean({
            title: "移除设备配置",
            content: safeConfirmContent(
                "确定要移除该设备配置吗？\n\n只会移除该设备的布局配置，不会删除组件内容文件。\n\n设备: ",
                deviceIdToRemove.slice(0, 8) + "..."
            ),
        });
        if (!confirmed) return;

        // 从 homepageSettingConfig 中删除
        const savedConfig = (await loadHomepageSettingConfig(plugin)) || {} as HomepageSettingConfig;
        const profiles = savedConfig.deviceProfiles || {};
        delete profiles[deviceIdToRemove];
        savedConfig.deviceProfiles = profiles;
        await saveHomepageSettingConfig(plugin, savedConfig);

        // 从 widgetLayout.json 中删除
        const widgetLayout = await plugin.loadData("widgetLayout.json");
        if (widgetLayout?.profiles && widgetLayout.profiles[deviceIdToRemove]) {
            delete widgetLayout.profiles[deviceIdToRemove];
            await plugin.saveData("widgetLayout.json", widgetLayout);
        }

        // 更新本地状态
        deviceProfiles = profiles;

        showMessage(`已移除设备配置: ${deviceIdToRemove.slice(0, 8)}...`);
    }

    // 打开隐藏组件管理弹窗
    function openHiddenWidgetsDialog() {
        svelteDialog({
            title: "管理隐藏组件",
            width: "960px",
            height: "70vh",
            constructor: (containerEl: HTMLElement) => {
                return mount(HiddenWidgetsDialog, {
                    target: containerEl,
                    props: {
                        plugin: plugin,
                        close: () => {
                            // 弹窗关闭时会自动处理
                        },
                    },
                });
            },
        });
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

<div class="shp-homepage-settings">
    <!-- 左侧：一级页签 -->
    <div class="main-nav-column">
        <MainTabNav
            activeTab={activeTab}
            onTabChange={handleMainTabChange}
        />
    </div>

    <!-- 中间：二级页签（仅主页设置时显示） -->
    {#if activeTab === "homepage"}
        <div class="sub-nav-column">
            <SubTabNav
                settingsActiveTab={settingsActiveTab}
                advancedEnabled={advancedEnabled}
                onTabChange={(tab) => settingsActiveTab = tab}
            />
        </div>
    {/if}

    <!-- 右侧：内容区 -->
    <div class="content-column">
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

                    {#if settingsActiveTab === "mobile"}
                        <MobileSettingsTab
                            advancedEnabled={advancedEnabled}
                            autoOpenMobileHomepage={autoOpenMobileHomepage}
                            mobileQuickActionsEnabled={mobileQuickActionsEnabled}
                            mobileQuickActionsButtonSize={mobileQuickActionsButtonSize}
                            mobileQuickActionItems={mobileQuickActionItems}
                            showMobilePreview={!plugin?.isMobile}
                            onAutoOpenMobileHomepageChange={(value) => autoOpenMobileHomepage = value}
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
                            selectedButtonIndex={selectedButtonIndex}
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
                            bind:favoritesMigrationStatus
                            bind:reviewDocsMigrationStatus
                            bind:taskIndexMigrationStatus
                            bind:heatmapIndexStatus
                            bind:statIndexStatus
                            bind:enhancedDiaryIndexStatus
                            onFavoritesStatusChange={handleFavoritesMigrationStatusChange}
                            onReviewDocsStatusChange={handleReviewDocsMigrationStatusChange}
                            onTaskIndexStatusChange={handleTaskIndexMigrationStatusChange}
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
                        {@const otherDevices = Object.entries(deviceProfiles).filter(([id]) => id !== currentDeviceInfo?.deviceId)}
                        <div class="devices-section">
                            <SettingSection title="当前设备">
                                <SettingRow
                                    title="管理隐藏组件"
                                    description="查看并恢复当前设备已隐藏的组件"
                                >
                                    <button
                                        class="device-action-btn"
                                        onclick={openHiddenWidgetsDialog}
                                    >
                                        管理
                                    </button>
                                </SettingRow>

                                {#if currentDeviceInfo}
                                    {@const currentProfile = currentDeviceInfo?.deviceId ? deviceProfiles[currentDeviceInfo.deviceId] : null}
                                    <div class="device-info-panel current">
                                        <div class="device-info-item">
                                            <span class="device-info-label">设备名称</span>
                                            <span class="device-info-value">{currentDeviceInfo.deviceName}</span>
                                        </div>
                                        <div class="device-info-item">
                                            <span class="device-info-label">平台/架构</span>
                                            <span class="device-info-value">{currentDeviceInfo.platform} / {currentDeviceInfo.arch}</span>
                                        </div>
                                        <div class="device-info-item">
                                            <span class="device-info-label">最后活跃</span>
                                            <span class="device-info-value">{currentProfile?.lastSeenAt ? new Date(currentProfile.lastSeenAt).toLocaleString() : '未知'}</span>
                                        </div>
                                    </div>
                                {:else}
                                    <p class="no-device">无法获取当前设备信息</p>
                                {/if}
                            </SettingSection>

                            <SettingSection title={`已登记设备 (${otherDevices.length})`}>
                                {#if otherDevices.length > 0}
                                    {@const sortedDevices = otherDevices.sort((a, b) => {
                                        const timeA = a[1].lastSeenAt ? new Date(a[1].lastSeenAt).getTime() : 0;
                                        const timeB = b[1].lastSeenAt ? new Date(b[1].lastSeenAt).getTime() : 0;
                                        return timeB - timeA;
                                    })}
                                    <div class="device-list">
                                        {#each sortedDevices as [id, profile]}
                                            <div class="device-card">
                                                <div class="device-card-info">
                                                    <div class="device-info-item">
                                                        <span class="device-info-label">设备名称</span>
                                                        <span class="device-info-value">{profile.deviceName || '未知'}</span>
                                                    </div>
                                                    <div class="device-info-item">
                                                        <span class="device-info-label">平台/架构</span>
                                                        <span class="device-info-value">{profile.platform || '未知'} / {profile.arch || '未知'}</span>
                                                    </div>
                                                    <div class="device-info-item">
                                                        <span class="device-info-label">最后活跃</span>
                                                        <span class="device-info-value">{profile.lastSeenAt ? new Date(profile.lastSeenAt).toLocaleString() : '未知'}</span>
                                                    </div>
                                                </div>
                                                <div class="device-card-actions">
                                                    <button
                                                        class="device-remove-btn"
                                                        onclick={() => removeDeviceProfile(id)}
                                                    >
                                                        移除配置
                                                    </button>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="no-devices">暂无其他已登记设备</p>
                                {/if}
                            </SettingSection>
                        </div>
                    {/if}
                </div>
            </div>
            <!-- 操作按钮 -->
            <div class="action-buttons">
                <button class="btn primary no-link-style" onclick={confirmSave}>
                    <SiyuanIcon name="confirm" size={14} />
                    <span>确认</span>
                </button>
                <button class="btn" onclick={cancelSave}>
                    <SiyuanIcon name="cancel" size={14} />
                    <span>取消</span>
                </button>
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
                <NotifyBridgeSettingsTab advancedEnabled={advancedEnabled} plugin={plugin} />
            </div>
        {:else if activeTab === "chatActionBridge"}
            <div class="content-scroll-area full-content">
                <ChatActionBridgeSettingsTab advancedEnabled={advancedEnabled} plugin={plugin} />
            </div>
        {:else if activeTab === "about"}
            <div class="content-scroll-area full-content">
                <AboutSection />
            </div>
        {/if}
    </div>
</div>
