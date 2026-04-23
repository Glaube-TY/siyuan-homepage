<script lang="ts">
    import { onMount, mount } from "svelte";
    import * as advanced from "../../components/tools/advanced";
    import { showMessage } from "siyuan";

    import "./homepageSettingStyle/homepageSetting.scss"
    import type { HomepageSettingProps, ButtonItem, HomepageSettingMainTab, HomepageSettingSubTab, WidgetsSettingsState, WidgetsSettingsActions, StylesSettingsState, StylesSettingsActions, ButtonSettingsActions } from "./types"
    import { subTabs } from "./tabDefs"
    import { loadHomepageSettingConfig, saveHomepageSettingConfig } from "./config"
    import type { HomepageSettingConfig } from "./config"
    import { createDefaultButtons, normalizeButtons, addButton, moveButtonUp, moveButtonDown, deleteButton, isCoreButton } from "./buttonSettings"
    import { getLocalDeviceId, isDesktopDeviceProfileEnabled, getCurrentDeviceInfo, updateDeviceProfile, findExistingDeviceByHardware, deduplicateDeviceProfiles } from "../utils/deviceProfile"
    import { loadWidgetLayoutSettings, saveWidgetLayoutSettings } from "../../components/utils/widgetBlock/utils/layout-shared"
    import { svelteDialog } from "../../libs/dialog"
    import HiddenWidgetsDialog from "./HiddenWidgetsDialog.svelte"
    import AboutSection from "./sections/AboutSection.svelte"
    import VipSection from "./sections/VipSection.svelte"
    import HomepageGlobalSection from "./sections/HomepageGlobalSection.svelte"
    import BannerSettingsTab from "./tabs/BannerSettingsTab.svelte"
    import TitleSettingsTab from "./tabs/TitleSettingsTab.svelte"
    import ButtonSettingsTab from "./tabs/ButtonSettingsTab.svelte"
    import WidgetsSettingsTab from "./tabs/WidgetsSettingsTab.svelte"
    import StylesSettingsTab from "./tabs/StylesSettingsTab.svelte"
    import MainTabNav from "./layout/MainTabNav.svelte"
    import SubTabNav from "./layout/SubTabNav.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    let { plugin, close }: HomepageSettingProps = $props();

    let activeTab = $state<HomepageSettingMainTab>("homepage");

    // 主页设置相关配置变量
    let tempAutoOpenHomepage = $state(true);
    let sidebarEnabled = $state(false);
    let autoOpenMobileHomepage = $state(false);
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

    let tempStatsInfoText =
        $state("自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{blocksCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{docsCount}} 篇笔记。\n感谢自己的坚持！❤");

    let buttonsList: ButtonItem[] = $state(createDefaultButtons());

    // 当前选中的按钮项
    let selectedButton: ButtonItem | null = $state(null);
    let nextId = Date.now();
    let selectedButtonIndex: number = $state(-1);

    // 组件设置内容
    let widgetLayoutNumber = $state(4);
    let widgetGap = $state(0.2);
    // 快速笔记设置
    let quickNotesEnabled = $state(false);
    let quickNotesPosition = $state("");
    let quickNotesTimestampEnabled = $state(true);
    let quickNotesAddPosition = $state("bottom");
    // 任务管理Plus设置
    let taskEditorEnabled = $state(true);
    // 文档预览模式设置
    let defaultDocPreviewMode = $state<"preview" | "wysiwyg">("preview");

    let widgetsSettingsState = $derived<WidgetsSettingsState>({
        widgetLayoutNumber,
        widgetGap,
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
    let FallEffectsEnabled = $state(false);
    let GlobalFallingEffectsEnabled = $state(false);
    let FallingIcon = $state("snow");
    let FallingDensity = $state("medium");
    let FallingSpeed = $state("medium");

    // VIP设置
    let USER_NAME: string = $state();
    let USER_ID: string = $state();
    let USER_CODE: string = $state();
    let ActivationCode: string = $state();
    let activated: boolean = $state();
    let activationResult: any = $state();
    let advancedEnabled = $state(false);

    // 设备管理
    let currentDeviceInfo = $state<ReturnType<typeof getCurrentDeviceInfo> | null>(null);
    let deviceProfiles = $state<Record<string, any>>({});

    let stylesSettingsState = $derived<StylesSettingsState>({
        footerEnabled,
        footerContent,
        mouseIcon,
        mouseGlobalEnabled,
        mouseTrailEnabled: MouseTrailEnabled,
        clickEffectEnabled: ClickEffectEnabled,
        clickEffectContent: ClickEffectContent,
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
        onFallEffectsEnabledChange: (value) => FallEffectsEnabled = value,
        onGlobalFallingEffectsEnabledChange: (value) => GlobalFallingEffectsEnabled = value,
        onFallingIconChange: (value) => FallingIcon = value,
        onFallingDensityChange: (value) => FallingDensity = value,
        onFallingSpeedChange: (value) => FallingSpeed = value,
    };

    // 设置页面加载时读取配置信息
    onMount(async () => {
        const savedConfig = await loadHomepageSettingConfig(plugin);
        if (savedConfig) {
            // 全局配置
            tempAutoOpenHomepage = savedConfig.autoOpenHomepage ?? true;
            sidebarEnabled = savedConfig.sidebarEnabled ?? false;
            autoOpenMobileHomepage =
                savedConfig.autoOpenMobileHomepage ?? false;

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
            tempStatsInfoText = savedConfig.statsInfoText || "自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{blocksCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{docsCount}} 篇笔记。\n感谢自己的坚持！❤";

            // 恢复按钮配置
            if (savedConfig.buttonsList) {
                buttonsList = normalizeButtons(savedConfig.buttonsList);
                nextId = Math.max(...buttonsList.map((item) => item.id), 0) + 1;
            }

            if (savedConfig.selectedButton) {
                selectedButton = savedConfig.selectedButton;
            }

            // 组件设置 - 从 widgetLayout.json 读取（与组件顺序存储方式一致）
            const layoutSettings = await loadWidgetLayoutSettings(plugin);
            widgetLayoutNumber = layoutSettings.widgetLayoutNumber;
            widgetGap = layoutSettings.widgetGap;

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

            footerEnabled = savedConfig.footerEnabled ?? true;
            footerContent = savedConfig.footerContent || "";
            mouseIcon = savedConfig.mouseIcon || "default";
            MouseTrailEnabled = savedConfig.MouseTrailEnabled ?? false;
            mouseGlobalEnabled = savedConfig.mouseGlobalEnabled ?? false;
            ClickEffectEnabled = savedConfig.ClickEffectEnabled ?? false;
            ClickEffectContent = savedConfig.ClickEffectContent || "";
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
            const { cleanedProfiles, deletedIds } = deduplicateDeviceProfiles(loadedDeviceProfiles);
            if (deletedIds.length > 0) {
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

    $effect(() => {
        if (tempBannerType === "remote") {
            bannerLocalData = null; // 清空本地图片数据
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

    async function handleMainTabChange(tab: HomepageSettingMainTab): Promise<void> {
        if (tab === "vip") {
            activeTab = tab;
            await advanced.updateVIP().then((res) => {
                USER_NAME = res.USER_NAME;
                USER_ID = res.USER_ID;
                USER_CODE = res.ENCRYPTED_USER_CODE;
            });
            activationResult = await advanced.verifyLicense(
                plugin,
                USER_NAME,
                USER_ID,
            );
            activated = activationResult.valid;
            if (!activated && activationResult.code != 2) {
                showMessage(activationResult.error);
                advanced.deleteLicense(plugin);
            }
        } else {
            activeTab = tab;
        }
    }

    async function handleVipActivate(): Promise<void> {
        const saveVIPConfDataResult = await advanced.saveVIPConfData(plugin, ActivationCode);
        if (saveVIPConfDataResult) {
            activationResult = await advanced.verifyLicense(plugin, USER_NAME, USER_ID);
            if (activationResult.code !== 0) {
                showMessage(activationResult.error);
                advanced.deleteLicense(plugin);
            } else {
                showMessage("✅激活成功！");
                activated = true;
            }
        }
    }

    async function handleVipDeactivate(): Promise<void> {
        const saveVIPConfDataResult = await advanced.saveVIPConfData(plugin, "");
        if (saveVIPConfDataResult) {
            activated = false;
            advanced.deleteLicense(plugin);
        }
    }

    function handleActivationCodeChange(value: string): void {
        ActivationCode = value;
    }

    // 保存配置并关闭对话框
    async function confirmSave() {
        const existingConfig = (await loadHomepageSettingConfig(plugin)) || {} as HomepageSettingConfig;
        const deviceProfiles = existingConfig.deviceProfiles || {};

        // 初始化 bannerDeviceProfiles（如果不存在）
        let bannerDeviceProfiles = existingConfig.bannerDeviceProfiles || {};

        // 桌面端：登记当前设备信息，并保存设备特定的横幅高度
        if (isDesktopDeviceProfileEnabled()) {
            const deviceId = getLocalDeviceId();
            if (deviceId) {
                const deviceInfo = getCurrentDeviceInfo();
                const existingProfile = deviceProfiles[deviceId];
                if (existingProfile) {
                    deviceProfiles[deviceId] = updateDeviceProfile(existingProfile, deviceInfo);
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

        // 保存布局设置到 widgetLayout.json（与组件顺序存储方式一致）
        await saveWidgetLayoutSettings(plugin, { widgetLayoutNumber, widgetGap });

        const config = {
            // 全局配置
            autoOpenHomepage: tempAutoOpenHomepage,
            sidebarEnabled: sidebarEnabled,
            autoOpenMobileHomepage: autoOpenMobileHomepage,

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
            tempTitleIconStyle: tempTitleIconStyle,

            statsInfoText: tempStatsInfoText,

            // 按钮配置
            buttonsList: buttonsList.map((item) => ({
                id: item.id,
                label: item.label,
                checked: item.checked,
                shortcut: item.shortcut || "",
                order: item.order,
            })),
            selectedButton: selectedButton,

            // 组件配置 - widgetLayoutNumber/widgetGap 已移到 widgetLayout.json
            // 这里保留移动端的全局值，桌面端不再使用
            widgetLayoutNumber: widgetLayoutNumber,
            widgetGap: widgetGap,
            quickNotesEnabled: quickNotesEnabled,
            quickNotesPosition: quickNotesPosition,
            quickNotesTimestampEnabled: quickNotesTimestampEnabled,
            quickNotesAddPosition: quickNotesAddPosition,
            taskEditorEnabled: taskEditorEnabled,

            // 文档预览模式
            defaultDocPreviewMode: defaultDocPreviewMode,

            // 页脚配置
            footerEnabled: footerEnabled,
            footerContent: footerContent,

            // vip配置
            mouseIcon: mouseIcon,
            MouseTrailEnabled: MouseTrailEnabled,
            mouseGlobalEnabled: mouseGlobalEnabled,
            ClickEffectEnabled: ClickEffectEnabled,
            ClickEffectContent: ClickEffectContent,
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
        const confirmed = confirm(
            "确定要移除该设备配置吗？\n\n" +
            "只会移除该设备的布局配置，不会删除组件内容文件。\n\n" +
            `设备: ${deviceIdToRemove.slice(0, 8)}...`
        );
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

    // 弹窗容器引用
    let settingsContainerEl: HTMLElement | null = $state(null);
    let userResizedWidth: number | null = null;
    let lastTabKey = "";

    // 根据当前页签获取推荐宽度（静态配置，避免 scrollWidth 累积问题）
    function calculatePreferredWidth(): number {
        // 主页设置：根据二级页签获取推荐宽度
        if (activeTab === "homepage") {
            const currentSubTab = subTabs.find(tab => tab.key === settingsActiveTab);
            if (currentSubTab?.preferredWidth) {
                return currentSubTab.preferredWidth;
            }
            return 980; // 默认推荐宽度
        }

        // 会员服务：中等宽度
        if (activeTab === "vip") {
            return 1080;
        }

        // 关于插件：偏窄
        if (activeTab === "about") {
            return 900;
        }

        return 980; // 默认
    }

    // 更新弹窗宽度
    function updateContainerWidth() {
        if (!settingsContainerEl) return;

        const preferredWidth = calculatePreferredWidth();
        settingsContainerEl.style.setProperty('--settings-preferred-width', `${preferredWidth}px`);

        // 如果用户手动调整过宽度，且新页签需要更宽，则扩展到更宽
        // 如果新页签可以更窄，保持用户手动设置的宽度（不压缩）
        if (userResizedWidth && userResizedWidth < preferredWidth) {
            // 用户宽度不足以容纳新内容，扩展到建议宽度
            settingsContainerEl.style.setProperty('--settings-user-width', `${preferredWidth}px`);
            userResizedWidth = preferredWidth;
        }
    }

    // 监听页签切换，自动调整宽度
    $effect(() => {
        // 依赖 activeTab 和 settingsActiveTab
        const tabKey = `${activeTab}-${settingsActiveTab}`;
        if (tabKey === lastTabKey) return;
        lastTabKey = tabKey;

        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
            updateContainerWidth();
        });
    });

    // 初始化时计算一次宽度
    $effect(() => {
        if (settingsContainerEl) {
            updateContainerWidth();
        }
    });

    // 监听用户手动 resize
    function handleResize() {
        if (!settingsContainerEl) return;

        const computedWidth = parseInt(getComputedStyle(settingsContainerEl).width);
        const preferredWidth = calculatePreferredWidth();

        // 如果宽度与建议值差异较大，认为是用户手动调整
        if (Math.abs(computedWidth - preferredWidth) > 50) {
            userResizedWidth = computedWidth;
            settingsContainerEl.style.setProperty('--settings-user-width', `${computedWidth}px`);
        }
    }
</script>

<div
    class="settings-container"
    bind:this={settingsContainerEl}
    onresize={handleResize}
>
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
                            autoOpenMobileHomepage={autoOpenMobileHomepage}
                            onTempAutoOpenHomepageChange={(value) => tempAutoOpenHomepage = value}
                            onSidebarEnabledChange={(value) => sidebarEnabled = value}
                            onAutoOpenMobileHomepageChange={(value) => autoOpenMobileHomepage = value}
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
                            onTempBannerEnabledChange={(value) => tempBannerEnabled = value}
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
                            onTempShowTitleIconChange={(value) => showIcon = value}
                            onTempTitleIconTypeChange={(value) => titleIconType = value}
                            onTempTitleEmojiChange={(value) => tempTitleIconEmoji = value}
                            onTempTitleImageChange={(value) => tempTitleIconImage = value}
                            onTempTitleIconStyleChange={(value) => tempTitleIconStyle = value}
                            onTempCustomTitleTextChange={(value) => tempCustomTitle = value}
                            onTempStatsTextChange={(value) => tempStatsInfoText = value}
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

                    {#if settingsActiveTab === "styles"}
                        <StylesSettingsTab
                            state={stylesSettingsState}
                            actions={stylesSettingsActions}
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
                <button class="btn primary no-link-style" onclick={confirmSave}
                    >✅ 确认</button
                >
                <button class="btn" onclick={cancelSave}>❌ 取消</button>
            </div>
        {:else if activeTab === "vip"}
            <div class="content-scroll-area full-content">
                <VipSection
                    USER_NAME={USER_NAME}
                    USER_ID={USER_ID}
                    USER_CODE={USER_CODE}
                    activated={activated}
                    activationResult={activationResult}
                    ActivationCode={ActivationCode}
                    onDeactivate={handleVipDeactivate}
                    onActivate={handleVipActivate}
                    onActivationCodeChange={handleActivationCodeChange}
                />
            </div>
        {:else if activeTab === "about"}
            <div class="content-scroll-area full-content">
                <AboutSection />
            </div>
        {/if}
    </div>
</div>
