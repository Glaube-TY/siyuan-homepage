<script lang="ts">
    import { onMount } from "svelte";
    import * as advanced from "../../components/tools/advanced";
    import { showMessage } from "siyuan";

    import "./homepageSettingStyle/homepageSetting.scss"
    import type { HomepageSettingProps, ButtonItem, HomepageSettingMainTab, HomepageSettingSubTab, WidgetsSettingsState, WidgetsSettingsActions, StylesSettingsState, StylesSettingsActions, ButtonSettingsActions } from "./types"
    import { loadHomepageSettingConfig, saveHomepageSettingConfig } from "./config"
    import { createDefaultButtons, normalizeButtons, addButton, moveButtonUp, moveButtonDown, deleteButton, isCoreButton } from "./buttonSettings"
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

    let { plugin, close }: HomepageSettingProps = $props();

    let activeTab = $state<HomepageSettingMainTab>("homepage");

    // 主页设置相关配置变量
    let tempAutoOpenHomepage = $state(true);
    let sidebarEnabled = $state(false);
    let autoOpenMobileHomepage = $state(false);
    let settingsActiveTab = $state<HomepageSettingSubTab>("banner");
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
        $state("自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{notesCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{DocsCount}} 篇笔记。\n感谢自己的坚持！❤");

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

    let widgetsSettingsState = $derived<WidgetsSettingsState>({
        widgetLayoutNumber,
        widgetGap,
        quickNotesEnabled,
        quickNotesPosition,
        quickNotesTimestampEnabled,
        quickNotesAddPosition,
        taskEditorEnabled,
    });

    let widgetsSettingsActions: WidgetsSettingsActions = {
        onWidgetLayoutNumberChange: (value) => widgetLayoutNumber = value,
        onWidgetGapChange: (value) => widgetGap = value,
        onQuickNotesEnabledChange: (value) => quickNotesEnabled = value,
        onQuickNotesPositionChange: (value) => quickNotesPosition = value,
        onQuickNotesTimestampEnabledChange: (value) => quickNotesTimestampEnabled = value,
        onQuickNotesAddPositionChange: (value) => quickNotesAddPosition = value,
        onTaskEditorEnabledChange: (value) => taskEditorEnabled = value,
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
            bannerHeight = savedConfig.bannerHeight || "300";

            // 标题配置
            showIcon = savedConfig.showIcon ?? true;
            titleIconType = savedConfig.titleIconType || "emoji";
            tempTitleIconEmoji = savedConfig.TitleIconEmoji || "🏠";
            tempTitleIconImage = savedConfig.TitleIconImage || null;
            tempTitleIconStyle = savedConfig.tempTitleIconStyle || "square";
            tempCustomTitle = savedConfig.customTitle || "思源笔记首页";
            tempStatsInfoText = savedConfig.statsInfoText;

            // 恢复按钮配置
            if (savedConfig.buttonsList) {
                buttonsList = normalizeButtons(savedConfig.buttonsList);
                nextId = Math.max(...buttonsList.map((item) => item.id), 0) + 1;
            }

            if (savedConfig.selectedButton) {
                selectedButton = savedConfig.selectedButton;
            }

            // 组件设置
            widgetLayoutNumber = savedConfig.widgetLayoutNumber || 4;
            widgetGap = savedConfig.widgetGap || 0.2;

            quickNotesEnabled = savedConfig.quickNotesEnabled ?? false;
            quickNotesPosition = savedConfig.quickNotesPosition || "";
            quickNotesTimestampEnabled =
                savedConfig.quickNotesTimestampEnabled ?? true;
            quickNotesAddPosition =
                savedConfig.quickNotesAddPosition || "bottom";

            taskEditorEnabled = savedConfig.taskEditorEnabled ?? true;

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
            if (isCoreButton(selectedButton.label)) {
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

            // 组件配置
            widgetLayoutNumber: widgetLayoutNumber,
            widgetGap: widgetGap,
            quickNotesEnabled: quickNotesEnabled,
            quickNotesPosition: quickNotesPosition,
            quickNotesTimestampEnabled: quickNotesTimestampEnabled,
            quickNotesAddPosition: quickNotesAddPosition,
            taskEditorEnabled: taskEditorEnabled,

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
        };

        await saveHomepageSettingConfig(plugin, config);

        if (close) close();

        // 刷新页面以应用新的配置
        window.location.reload();
    }

    function cancelSave() {
        if (close) {
            close();
        }
    }
</script>

<div class="settings-container">
    <MainTabNav
        activeTab={activeTab}
        onTabChange={handleMainTabChange}
    />

    <!-- 动态内容容器 -->
    <div class="tab-content">
        {#if activeTab === "homepage"}
            <HomepageGlobalSection
                tempAutoOpenHomepage={tempAutoOpenHomepage}
                sidebarEnabled={sidebarEnabled}
                autoOpenMobileHomepage={autoOpenMobileHomepage}
                onTempAutoOpenHomepageChange={(value) => tempAutoOpenHomepage = value}
                onSidebarEnabledChange={(value) => sidebarEnabled = value}
                onAutoOpenMobileHomepageChange={(value) => autoOpenMobileHomepage = value}
            />

            <div class="homepage-content-settings">
                <SubTabNav
                    settingsActiveTab={settingsActiveTab}
                    advancedEnabled={advancedEnabled}
                    onTabChange={(tab) => settingsActiveTab = tab}
                />

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
            </div>
            <!-- 操作按钮 -->
            <div class="action-buttons">
                <button class="btn primary no-link-style" onclick={confirmSave}
                    >✅ 确认</button
                >
                <button class="btn" onclick={cancelSave}>❌ 取消</button>
            </div>
        {:else if activeTab === "vip"}
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
        {:else if activeTab === "about"}
            <AboutSection />
        {/if}
    </div>
</div>
