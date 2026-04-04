<script lang="ts">
    import { onMount } from "svelte";
    import "emoji-picker-element";
    import "./homepageSettingStyle/homepageSetting.scss";
    import * as advanced from "../tools/advanced";
    import { showMessage } from "siyuan";

    export let plugin: any;
    export let close: () => void;

    let activeTab = "homepage";

    // 主页设置相关配置变量
    let tempAutoOpenHomepage = true;
    let sidebarEnabled = false;
    let autoOpenMobileHomepage = false;
    let settingsActiveTab = "banner";
    // 横幅区域相关配置变量
    let bannerEnabled = true;
    let bannerGlobalType = "custom";
    let bingApiType = "POD_UHD";
    let bannerType = "local";
    let tempBannerEnabled = bannerEnabled;
    let tempBannerType = bannerType;
    let bannerLocalData: string | null = null;
    let bannerRemoteUrl = "";
    let bannerHeight = "300"; // 默认值为字符串类型以适配输入框
    let tempBannerHeight = bannerHeight;
    let fileInputEl: HTMLInputElement;
    // 标题区域相关配置变量
    let tempTitleIconStyle = "square";
    let showEmojiPicker = false;
    let emojiPickerPosition = { top: "0px", left: "0px" };
    let emojiPickerElement: HTMLElement | null = null;
    let emojiPickerCleanup: (() => void) | null = null;
    let showIcon = true;
    let titleIconType = "emoji";
    let tempTitleIconEmoji = "🏠";
    let tempTitleIconImage: string | null = null;
    let iconInputEl: HTMLInputElement;
    let tempCustomTitle = "思源笔记首页";

    let tempStatsInfoText =
        "自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{notesCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{DocsCount}} 篇笔记。\n感谢自己的坚持！❤";

    type ButtonItem = {
        id: number;
        label: string;
        checked: boolean;
        shortcut?: string;
        order: number;
    };

    let buttonsList: ButtonItem[] = [
        {
            id: 1728000000000,
            label: "🔍 搜索笔记",
            checked: true,
            shortcut: "Ctrl+P",
            order: 0,
        },
        {
            id: 1728000001000,
            label: "📅 今日日记",
            checked: true,
            shortcut: "Alt+5",
            order: 1,
        },
        {
            id: 1728000002000,
            label: "➕ 添加组件",
            checked: true,
            order: 2,
        },
        {
            id: 1728000003000,
            label: "⚙ 主页设置",
            checked: true,
            order: 3,
        },
    ];

    // 当前选中的按钮项
    let selectedButton: ButtonItem | null = null;
    let nextId = Date.now();
    let selectedButtonIndex: number = -1;

    // 组件设置内容
    let widgetLayoutNumber = 4;
    let widgetGap = 0.2;
    // 快速笔记设置
    let quickNotesEnabled = false;
    let quickNotesPosition = "";
    let quickNotesTimestampEnabled = true;
    let quickNotesAddPosition = "bottom";
    // 任务管理Plus设置
    let taskEditorEnabled = true;

    // vip设置
    let footerEnabled = true;
    let footerContent = "";
    let mouseGlobalEnabled = false;
    let mouseIcon = "default";
    let MouseTrailEnabled = false;
    let ClickEffectEnabled = false;
    let ClickEffectContent = "";
    let FallEffectsEnabled = false;
    let GlobalFallingEffectsEnabled = false;
    let FallingIcon = "snow";
    let FallingDensity = "medium";
    let FallingSpeed = "medium";

    // VIP设置
    let USER_NAME: string;
    let USER_ID: string;
    let USER_CODE: string;
    let ActivationCode: string;
    let activated: boolean;
    let activationResult: any;
    let advancedEnabled = false;

    // 设置页面加载时读取配置信息
    onMount(async () => {
        const savedConfig = await plugin.loadData("homepageSettingConfig.json");
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
                buttonsList = savedConfig.buttonsList.map((item) => ({
                    ...item,
                    order: item.order ?? 0,
                }));
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

    function handleIconImageSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const reader = new FileReader();

            reader.onload = function (e) {
                tempTitleIconImage = e.target?.result as string;
            };

            reader.readAsDataURL(file);
        }
    }

    $: {
        if (tempBannerType === "remote") {
            bannerLocalData = null; // 清空本地图片数据
        }
    }

    // 响应式监听表情选择器事件
    $: {
        if (showEmojiPicker && emojiPickerElement) {
            const handler = (event: any) => {
                const detail = event.detail;
                tempTitleIconEmoji = detail.unicode;
                showEmojiPicker = false;
            };

            emojiPickerElement.addEventListener("emoji-click", handler);

            // 设置清理函数
            emojiPickerCleanup = () => {
                emojiPickerElement?.removeEventListener("emoji-click", handler);
            };
        } else if (!showEmojiPicker && emojiPickerCleanup) {
            emojiPickerCleanup();
            emojiPickerCleanup = null;
        }
    }

    function openEmojiPicker(event: Event) {
        const button = event.currentTarget as HTMLElement;
        const container = document.querySelector(
            ".settings-container",
        ) as HTMLElement;

        if (!container) return;

        const rect = button.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 基于 container 的偏移量计算位置
        emojiPickerPosition = {
            top: `${rect.top - containerRect.top + button.offsetHeight}px`,
            left: `${rect.left - containerRect.left}px`,
        };

        showEmojiPicker = true;
    }

    // 添加新按钮
    function addNewButton() {
        const newId = nextId + 1;
        nextId = newId;

        const newItem = {
            id: newId,
            label: `新建按钮`,
            checked: false,
            order:
                buttonsList.length > 0
                    ? Math.max(...buttonsList.map((b) => b.order)) + 1
                    : 0,
        };

        buttonsList = [...buttonsList, newItem];
        selectedButton = newItem;
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
            // 判断是否为核心按钮（不删除）
            const coreButtons = ["➕ 添加组件", "⚙ 主页设置"];
            if (coreButtons.includes(selectedButton.label)) {
                return;
            }

            // 删除当前选中的按钮
            buttonsList = buttonsList.filter(
                (item) => item.id !== selectedButton.id,
            );
            selectedButton = null; // 清空选中
        }
    }

    $: {
        // 获取当前选中按钮在列表中的索引
        selectedButtonIndex = selectedButton
            ? buttonsList.findIndex((item) => item.id === selectedButton.id)
            : -1;
    }

    function moveUpButton() {
        if (selectedButtonIndex <= 0) return;

        const newIndex = selectedButtonIndex - 1;
        const newList = [...buttonsList];
        [newList[selectedButtonIndex], newList[newIndex]] = [
            newList[newIndex],
            newList[selectedButtonIndex],
        ];

        // 更新 order 字段
        buttonsList = newList.map((item, index) => ({ ...item, order: index }));
    }

    function moveDownButton() {
        if (
            selectedButtonIndex === -1 ||
            selectedButtonIndex >= buttonsList.length - 1
        )
            return;

        const newIndex = selectedButtonIndex + 1;
        const newList = [...buttonsList];
        [newList[selectedButtonIndex], newList[newIndex]] = [
            newList[newIndex],
            newList[selectedButtonIndex],
        ];

        // 更新 order 字段
        buttonsList = newList.map((item, index) => ({ ...item, order: index }));
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

        await plugin.saveData("homepageSettingConfig.json", config);

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
    <!-- 分类导航栏 -->
    <div class="tab-nav">
        <button
            on:click={() => (activeTab = "homepage")}
            class:active={activeTab === "homepage"}>主页设置</button
        >
        <button
            on:click={async () => {
                activeTab = "vip";
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
            }}
            class:active={activeTab === "vip"}>会员服务</button
        >
        <button
            on:click={() => (activeTab = "about")}
            class:active={activeTab === "about"}>关于插件</button
        >
    </div>

    <!-- 动态内容容器 -->
    <div class="tab-content">
        {#if activeTab === "homepage"}
            <div class="homepage-global-settings">
                <label for="auto-open-homepage"
                    >自动打开主页：<input
                        type="checkbox"
                        id="auto-open-homepage"
                        bind:checked={tempAutoOpenHomepage}
                    /></label
                >
                <label for=""
                    >开启侧边栏👑：<input
                        type="checkbox"
                        bind:checked={sidebarEnabled}
                    /></label
                >
                <label for=""
                    >自动打开移动端主页👑：<input
                        type="checkbox"
                        bind:checked={autoOpenMobileHomepage}
                    /></label
                >
            </div>

            <div class="homepage-content-settings">
                <!-- 子标签导航 -->
                <div class="sub-tab-nav">
                    <button
                        on:click={() => (settingsActiveTab = "banner")}
                        class:active={settingsActiveTab === "banner"}
                        >横幅设置</button
                    >
                    <button
                        on:click={() => (settingsActiveTab = "title")}
                        class:active={settingsActiveTab === "title"}
                        >标题设置</button
                    >
                    <button
                        on:click={() => (settingsActiveTab = "button")}
                        class:active={settingsActiveTab === "button"}
                        >按钮设置</button
                    >
                    <button
                        on:click={() => (settingsActiveTab = "widgets")}
                        class:active={settingsActiveTab === "widgets"}
                        >组件设置</button
                    >
                    {#if advancedEnabled}
                        <button
                            on:click={() => (settingsActiveTab = "styles")}
                            class:active={settingsActiveTab === "styles"}
                            >高级样式👑</button
                        >
                    {/if}
                </div>

                {#if settingsActiveTab === "banner"}
                    <div class="section-setting">
                        <div class="form-group">
                            <label>
                                <input
                                    type="checkbox"
                                    bind:checked={tempBannerEnabled}
                                />
                                启用横幅图片
                            </label>
                        </div>
                        {#if tempBannerEnabled}
                            <div class="form-group">
                                <label for=""
                                    >横幅类型：<select
                                        bind:value={bannerGlobalType}
                                    >
                                        <option value="custom">自定义</option>
                                        <option value="bing">每日一图👑</option>
                                    </select></label
                                >
                                <label for="banner-height-input"
                                    >横幅高度(px)：<input
                                        id="banner-height-input"
                                        type="number"
                                        bind:value={tempBannerHeight}
                                        min="100"
                                        max="800"
                                        step="10"
                                        placeholder="例如：300"
                                    /></label
                                >
                            </div>
                            {#if bannerGlobalType === "custom"}
                                <div class="banner-settings-container">
                                    <!-- 左侧设置区域 -->
                                    <div class="banner-settings-left">
                                        <!-- 横幅来源选择 -->
                                        <div class="form-group">
                                            <label for="banner-source-select"
                                                >横幅来源：</label
                                            >
                                            <select
                                                id="banner-source-select"
                                                bind:value={tempBannerType}
                                            >
                                                <option value="local"
                                                    >本地图片</option
                                                >
                                                <option value="remote"
                                                    >网络图片</option
                                                >
                                            </select>
                                        </div>

                                        <!-- 来源具体内容 -->
                                        {#if tempBannerType === "local"}
                                            <div class="form-group">
                                                <label for="local-image-input"
                                                    >本地路径：</label
                                                >
                                                <button
                                                    on:click={() =>
                                                        fileInputEl.click()}
                                                    class="btn-select-file"
                                                    id="local-image-input"
                                                    >📂 选择图片</button
                                                >
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    bind:this={fileInputEl}
                                                    on:change={handleImageSelect}
                                                    style="display:none;"
                                                />
                                            </div>
                                        {:else if tempBannerType === "remote"}
                                            <div
                                                class="form-group remote-url-input"
                                            >
                                                <div class="input-row">
                                                    <label
                                                        for="remote-image-url"
                                                        >远程地址：</label
                                                    >
                                                    <input
                                                        id="remote-image-url"
                                                        type="text"
                                                        bind:value={
                                                            bannerRemoteUrl
                                                        }
                                                        placeholder="输入远程图片地址"
                                                    />
                                                </div>
                                            </div>
                                        {/if}
                                    </div>

                                    <!-- 右侧图片预览区域 -->
                                    <div class="banner-preview-container">
                                        {#if tempBannerEnabled}
                                            {#if tempBannerType === "local" && bannerLocalData}
                                                <img
                                                    src={bannerLocalData}
                                                    alt="本地预览图"
                                                    class="banner-preview"
                                                />
                                            {:else if tempBannerType === "remote" && bannerRemoteUrl}
                                                <img
                                                    src={bannerRemoteUrl}
                                                    alt="远程预览图"
                                                    class="banner-preview"
                                                />
                                            {:else}
                                                <div
                                                    class="banner-preview-placeholder"
                                                >
                                                    未选择图片
                                                </div>
                                            {/if}
                                        {/if}
                                    </div>
                                </div>
                            {:else if bannerGlobalType === "bing"}
                                {#if advancedEnabled}
                                    <div class="banner-setting-bing">
                                        <label for=""
                                            >远程接口：<select
                                                bind:value={bingApiType}
                                            >
                                                <option value="POD_UHD"
                                                    >Bing 每日一图（原图）</option
                                                >
                                                <option value="POD_1K"
                                                    >Bing 每日一图（1080P）</option
                                                >
                                                <option value="POD_Normal"
                                                    >Bing 每日一图（普通）</option
                                                >
                                                <option value="rand_uhd"
                                                    >Bing 历史随机（原图）</option
                                                >
                                                <option value="rand_1K"
                                                    >Bing 历史随机（1080P）</option
                                                >
                                                <option value="rand_Normal"
                                                    >Bing 历史随机（普通）</option
                                                >
                                                <option value="ECY1"
                                                    >二次元壁纸</option
                                                >
                                                <option value="RAND1"
                                                    >随机壁纸</option
                                                >
                                            </select></label
                                        >
                                    </div>
                                {:else}
                                    <h3>👑会员专属权益👑</h3>
                                {/if}
                            {/if}
                        {/if}
                    </div>
                {/if}

                {#if settingsActiveTab === "title"}
                    <!-- 标题区域设置 -->
                    <div class="section-setting titleBlock-setting">
                        <div class="title-setting">
                            <div class="form-group">
                                <label>
                                    <input
                                        type="checkbox"
                                        bind:checked={showIcon}
                                    />
                                    显示标题图标
                                </label>
                            </div>

                            {#if showIcon === true}
                                <!-- 图标选择与自定义标题容器 -->
                                <div class="icon-and-title-container">
                                    <!-- 顶部图标设置 -->
                                    <div class="icon-selection">
                                        <label for="title-icon-type"
                                            >标题图标：</label
                                        >
                                        <select
                                            id="title-icon-type"
                                            bind:value={titleIconType}
                                        >
                                            <option value="emoji">表情</option>
                                            <option value="image">图片</option>
                                        </select>
                                        {#if titleIconType === "emoji"}
                                            <button
                                                id="emoji-picker-button"
                                                type="button"
                                                title="选择图标"
                                                class="emoji-display"
                                                on:click={openEmojiPicker}
                                                aria-label="选择表情"
                                            >
                                                {tempTitleIconEmoji || "😊"}
                                            </button>
                                        {:else if titleIconType === "image"}
                                            <button
                                                on:click={() =>
                                                    iconInputEl.click()}
                                                class="btn-select-file"
                                                id="icon-image-input"
                                                title="选择图标"
                                                >选择图片</button
                                            >

                                            <input
                                                type="file"
                                                accept="image/*"
                                                bind:this={iconInputEl}
                                                on:change={handleIconImageSelect}
                                                style="display:none;"
                                            />
                                        {/if}

                                        {#if titleIconType === "image" && tempTitleIconImage}
                                            <img
                                                src={tempTitleIconImage}
                                                alt="图标预览"
                                                title="图标预览"
                                            />
                                            <select
                                                class="iconstyle"
                                                bind:value={tempTitleIconStyle}
                                            >
                                                <option value="square"
                                                    >方形</option
                                                >
                                                <option value="round"
                                                    >圆角</option
                                                >
                                                <option value="circle"
                                                    >圆形</option
                                                >
                                            </select>
                                        {/if}
                                    </div>
                                    <!-- 底部标题输入 -->
                                    <div class="custom-title-input">
                                        <label for="custom-title-input"
                                            >标题文字：</label
                                        >
                                        <input
                                            id="custom-title-input"
                                            type="text"
                                            bind:value={tempCustomTitle}
                                            placeholder="例如：我的主页"
                                        />
                                    </div>
                                </div>

                                <!-- 表情弹窗 -->
                                {#if showEmojiPicker}
                                    <button
                                        class="emoji-picker-overlay-bg"
                                        tabindex="0"
                                        on:click={() =>
                                            (showEmojiPicker = false)}
                                        on:keydown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            )
                                                showEmojiPicker = false;
                                        }}
                                        aria-label="关闭表情选择器"
                                    ></button>

                                    <div
                                        class="emoji-picker-modal"
                                        style="top: {emojiPickerPosition.top}; left: {emojiPickerPosition.left};"
                                        role="dialog"
                                        aria-modal="true"
                                    >
                                        <div class="emoji-picker-content">
                                            <emoji-picker
                                                bind:this={emojiPickerElement}
                                            />
                                        </div>
                                    </div>
                                {/if}
                            {/if}
                        </div>

                        <div class="stats-info-setting">
                            <div>
                                自定义状态语：<a
                                    href="https://blog.glaube-ty.top/archives/019d2484-7d4f-7573-89dd-772a2c600e2b"
                                    target="_blank">查看可用变量（展开标题记快捷区）</a
                                >
                            </div>
                            <textarea
                                class="stats-info-text"
                                bind:value={tempStatsInfoText}
                                placeholder="输入自定义状态语句"
                            />
                        </div>
                    </div>
                {/if}

                {#if settingsActiveTab === "button"}
                    <div class="section-setting buttons-setting">
                        <div class="buttons-setting-container">
                            <div class="buttons-list">
                                {#each buttonsList as item (item.id)}
                                    <button
                                        type="button"
                                        class="button-item"
                                        class:active={selectedButton?.id ===
                                            item.id}
                                        on:click={() => (selectedButton = item)}
                                        on:keydown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                selectedButton = item;
                                                e.preventDefault();
                                            }
                                        }}
                                        aria-label={`选择按钮 ${item.label}`}
                                    >
                                        <input
                                            type="checkbox"
                                            bind:checked={item.checked}
                                            on:click|stopPropagation
                                        />
                                        <span>{item.label}</span>
                                    </button>
                                {/each}
                                <button
                                    class="add-button"
                                    on:click={addNewButton}>➕ 添加按钮</button
                                >
                            </div>

                            <div class="button-details">
                                {#if selectedButton}
                                    <h4>编辑按钮：{selectedButton.label}</h4>
                                    {#if selectedButton.label === "➕ 添加组件"}
                                        <p>插件核心按钮不支持自定义</p>
                                    {:else if selectedButton.label === "⚙ 主页设置"}
                                        <p>插件核心按钮不支持自定义</p>
                                    {:else}
                                        <!-- 自定义按钮设置项 -->
                                        <div class="form-group">
                                            <label for="custom-button-label"
                                                >按钮标签：</label
                                            >
                                            <input
                                                id="custom-button-label"
                                                type="text"
                                                bind:value={
                                                    selectedButton.label
                                                }
                                                on:input={() =>
                                                    updateButtonLabel(
                                                        selectedButton.label,
                                                    )}
                                                placeholder="例如：我的快捷方式"
                                            />
                                        </div>
                                        <!-- 快捷键输入框 -->
                                        <div class="form-group">
                                            <label for="button-shortcut"
                                                >快捷键：</label
                                            >
                                            <input
                                                id="button-shortcut"
                                                type="text"
                                                placeholder="例如：Ctrl+C"
                                                bind:value={
                                                    selectedButton.shortcut
                                                }
                                            />
                                        </div>
                                        <div class="button-actions">
                                            <button
                                                class="btn move-up"
                                                on:click={moveUpButton}
                                                disabled={selectedButtonIndex <=
                                                    0}
                                                title="上移">🔼</button
                                            >

                                            <button
                                                class="btn move-down"
                                                on:click={moveDownButton}
                                                disabled={selectedButtonIndex >=
                                                    buttonsList.length - 1 ||
                                                    selectedButtonIndex === -1}
                                                title="下移">🔽</button
                                            >

                                            <button
                                                class="btn danger"
                                                on:click={deleteCustomButton}
                                                >❌ 删除此按钮</button
                                            >
                                        </div>
                                    {/if}
                                {:else}
                                    <p>请选择左侧按钮以查看或编辑其详情</p>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/if}

                {#if settingsActiveTab === "widgets"}
                    <div class="section-setting widgets-setting">
                        <div class="form-group widget-layout-setting">
                            <h3>组件布局设置</h3>
                            <label for=""
                                >每行组件数量：<input
                                    type="number"
                                    bind:value={widgetLayoutNumber}
                                /></label
                            >
                            <label for="widget-gap"
                                >组件间距：<input
                                    type="number"
                                    bind:value={widgetGap}
                                /></label
                            >
                        </div>
                        <div class="form-group quick-notes-setting">
                            <h3>快速笔记设置</h3>
                            <label for="quick-notes-open"
                                ><input
                                    id="quick-notes-open"
                                    type="checkbox"
                                    bind:checked={quickNotesEnabled}
                                />开启快速笔记</label
                            >

                            {#if quickNotesEnabled}
                                <label for=""
                                    >快速笔记位置：
                                    <input
                                        type="text"
                                        placeholder="输入用于存放快速笔记的文档 ID"
                                        bind:value={quickNotesPosition}
                                    />
                                </label>
                                <label for="quick-notes-position"
                                    >添加位置：<select
                                        name="quick-notes-position"
                                        id="quick-notes-position"
                                        bind:value={quickNotesAddPosition}
                                    >
                                        <option value="bottom">文档最后</option>
                                        <option value="top">文档最前</option>
                                    </select></label
                                >
                                <label for="quick-notes-timestamp"
                                    ><input
                                        id="quick-notes-timestamp"
                                        type="checkbox"
                                        bind:checked={
                                            quickNotesTimestampEnabled
                                        }
                                    />
                                    启用时间戳
                                </label>
                            {/if}
                        </div>
                        <div class="form-group task-plus-setting">
                            <h3>任务管理Plus设置</h3>
                            <label for="task-editor-enabled"
                                ><input
                                    id="task-editor-enabled"
                                    type="checkbox"
                                    bind:checked={taskEditorEnabled}
                                /> 开启任务编辑器</label
                            >
                        </div>
                    </div>
                {/if}

                {#if settingsActiveTab === "styles"}
                    <div class="section-setting styles-setting">
                        <div class="footer-setting">
                            <h3>页脚设置</h3>
                            <label for="footer-enable"
                                ><input
                                    id="footer-enable"
                                    type="checkbox"
                                    bind:checked={footerEnabled}
                                /> 显示页脚</label
                            >
                            {#if footerEnabled}
                                <label for="footer-content">
                                    <textarea
                                        id="footer-content"
                                        placeholder="输入页脚内容"
                                        bind:value={footerContent}
                                    ></textarea>
                                </label>
                            {/if}
                        </div>
                        <div class="mouse-setting">
                            <h3>鼠标样式设置</h3>
                            <label for="mouse-style">
                                鼠标图标：
                                <select
                                    name="mouse-style"
                                    id="mouse-style"
                                    bind:value={mouseIcon}
                                >
                                    <option value="default">默认</option>
                                    <option value="arrow1">箭头1</option>
                                    <option value="arrow2">箭头2</option>
                                    <option value="arrow3">箭头3</option>
                                    <option value="arrow4">箭头4</option>
                                    <option value="arrow5">箭头5</option>
                                    <option value="arrow6">箭头6</option>
                                    <option value="arrow7">箭头7</option>
                                    <option value="LOL1">LOL1</option>
                                    <option value="LOL2">LOL2</option>
                                    <option value="LOL3">LOL3</option>
                                    <option value="LOL4">LOL4</option>
                                    <option value="CBPK2077"
                                        >赛博朋克2077</option
                                    >
                                    <option value="CYWL1">初音未来1</option>
                                    <option value="CYWL2">初音未来2</option>
                                    <option value="cat1">喵星人1</option>
                                    <option value="cat2">喵星人2</option>
                                    <option value="cat3">喵星人3</option>
                                    <option value="WDSJsword">钻石剑</option>
                                    <option value="WDSJpickaxe">钻石镐</option>
                                </select>
                            </label>
                            <div class="mouse-global-setting">
                                <label for="mouse-global">
                                    <input
                                        id="mouse-global"
                                        type="checkbox"
                                        bind:checked={mouseGlobalEnabled}
                                    />应用于全局
                                </label>
                                <label for="mouse-trail">
                                    <input
                                        id="mouse-trail"
                                        type="checkbox"
                                        bind:checked={MouseTrailEnabled}
                                    />鼠标轨迹
                                </label>
                                <label for="click-effect"
                                    ><input
                                        type="checkbox"
                                        bind:checked={ClickEffectEnabled}
                                    />点击特效</label
                                >
                            </div>
                            {#if ClickEffectEnabled}
                                <label for="click-effect-content">
                                    <textarea
                                        id="click-effect-content"
                                        placeholder="输入点击特效内容（每行一个特效）"
                                        bind:value={ClickEffectContent}
                                    ></textarea>
                                </label>
                            {/if}
                        </div>
                        <div class="background-effects-setting">
                            <h3>背景特效设置</h3>
                            <div class="background-effects-setting-checkbox">
                                <label for=""
                                    ><input
                                        type="checkbox"
                                        bind:checked={FallEffectsEnabled}
                                    />开启飘落特效</label
                                ><label for=""
                                    ><input
                                        type="checkbox"
                                        bind:checked={
                                            GlobalFallingEffectsEnabled
                                        }
                                    />应用于全局</label
                                >
                            </div>
                            <div class="form-group">
                                <label for="falling-icon">
                                    飘落图形：
                                    <select
                                        name="falling-icon"
                                        id="falling-icon"
                                        bind:value={FallingIcon}
                                    >
                                        <option value="snow">雪花</option>
                                        <option value="heart">爱心</option>
                                        <option value="star">五角星</option>
                                        <option value="greenery">绿叶</option>
                                        <option value="mapleLeaf">枫叶</option>
                                        <option value="ginkgoLeaf"
                                            >银杏叶</option
                                        >
                                        <option value="bodhiLeaf">菩提叶</option
                                        >
                                        <option value="bambooLeaf">竹叶</option>
                                        <option value="cherry">樱花</option>
                                        <option value="cherryPetal"
                                            >樱花瓣</option
                                        >
                                        <option value="Rinka">梨花</option>
                                        <option value="rose">玫瑰花</option>
                                        <option value="dandelion">蒲公英</option
                                        >
                                        <option value="QZHIHE">千纸鹤</option>
                                        <option value="paperPlane"
                                            >纸飞机</option
                                        >
                                        <option value="HMBB">海绵宝宝</option>
                                        <option value="PDX">派大星</option>
                                    </select>
                                </label>
                                <label for=""
                                    >密度：
                                    <select bind:value={FallingDensity}>
                                        <option value="low">低</option>
                                        <option value="medium">中</option>
                                        <option value="high">高</option>
                                    </select>
                                </label>
                                <label for=""
                                    >速度:
                                    <select bind:value={FallingSpeed}>
                                        <option value="low">低</option>
                                        <option value="medium">中</option>
                                        <option value="high">高</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
            <!-- 操作按钮 -->
            <div class="action-buttons">
                <button class="btn primary no-link-style" on:click={confirmSave}
                    >✅ 确认</button
                >
                <button class="btn" on:click={cancelSave}>❌ 取消</button>
            </div>
        {:else if activeTab === "vip"}
            <div class="vip-section">
                <div class="vip-info">
                    {#if USER_NAME || USER_ID}
                        <label for="">用户名：{USER_NAME}</label>
                        <label for="">用户ID：{USER_ID}</label>
                    {:else}
                        <label for="">请先登录后进行查看！</label>
                    {/if}
                </div>
                {#if activated}
                    <div class="activated">
                        <h2>👑当前用户已激活👑</h2>
                        <label for=""
                            >到期时间：{activationResult.userInfo.due}</label
                        >
                        <label for=""
                            >剩余天数：{activationResult.userInfo
                                .remainingDays}</label
                        >
                        <button
                            on:click={async () => {
                                const saveVIPConfDataResult =
                                    await advanced.saveVIPConfData(plugin, "");
                                if (saveVIPConfDataResult) {
                                    activated = false;
                                    advanced.deleteLicense(plugin);
                                }
                            }}>注销激活</button
                        >
                    </div>
                {:else}
                    <div class="vip-activate">
                        <h2>👑 VIP 激活</h2>
                        <h3>
                            <a
                                href="https://ttl8ygt82u.feishu.cn/wiki/GEHMwHxE0icZZ8kq124cCAP6njh?from=from_copylink"
                                target="_blank">👑查看会员权益👑</a
                            >
                        </h3>
                        {#if USER_NAME || USER_ID}
                            <label for=""
                                >购买时，请将下列标识码附在留言区域：</label
                            >
                            <div class="code-box">
                                <input
                                    type="text"
                                    class="user-code"
                                    value={USER_CODE}
                                    readonly
                                />
                                <button
                                    on:click={() => {
                                        navigator.clipboard
                                            .writeText(USER_CODE)
                                            .then(() => {
                                                showMessage(
                                                    "✅ 用户标识码已复制到剪贴板",
                                                );
                                            })
                                            .catch((err) => {
                                                console.error("复制失败", err);
                                            });
                                    }}
                                    class="btn copy-button"
                                    title="复制用户标识码"
                                    aria-label="复制用户标识码">复制</button
                                >
                            </div>
                            <div class="purchase-plan">
                                <h4>💰 订阅方案</h4>
                                <div class="plan-card">
                                    <div class="plan-item monthly">
                                        <div class="plan-price">
                                            <span
                                                class="old-price"
                                                style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;"
                                                >8 元</span
                                            >
                                            <span
                                                class="new-price"
                                                style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;"
                                                >5 元</span
                                            >
                                        </div>
                                        <div class="plan-duration">/ 月</div>
                                    </div>
                                    <div class="plan-item monthly">
                                        <div class="plan-price">
                                            <span
                                                class="old-price"
                                                style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;"
                                                >20 元</span
                                            >
                                            <span
                                                class="new-price"
                                                style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;"
                                                >12 元</span
                                            >
                                        </div>
                                        <div class="plan-duration">/ 季</div>
                                    </div>
                                    <div class="plan-item yearly">
                                        <div class="plan-price">
                                            <span
                                                class="old-price"
                                                style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;"
                                                >69 元</span
                                            >
                                            <span
                                                class="new-price"
                                                style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;"
                                                >35 元</span
                                            >
                                        </div>
                                        <div class="plan-duration">/ 年</div>
                                    </div>
                                </div>
                                <p>
                                    以后大概率会保持目前的降价价格，若最近有原价购买过会员的用户且还在会员期内，可以在爱发电私信我，根据用户情况赠送增加相应的天数。
                                </p>
                                <p>感谢大家的支持~</p>
                                <p>调整时间：2026年3月15日</p>
                            </div>
                            <div class="purchase-address">
                                <h4>🛍️ 购买地址</h4>
                                <div class="address-card">
                                    <div class="address-item">
                                        <span class="icon">🔗</span>
                                        <div class="address-content">
                                            <strong>地址：</strong>
                                            <a
                                                href="https://afdian.com/a/glaube-ty"
                                                >爱发电</a
                                            >
                                        </div>
                                    </div>
                                    <div class="qrcode-container">
                                        <img
                                            class="qrcode"
                                            src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/afdian-Glaube_TY.jpg"
                                            alt="爱发电二维码"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div class="reminder">
                                <div class="reminder-card">
                                    <div class="reminder-item">
                                        <span class="icon">💬</span>
                                        <p>
                                            工作日 09:00 - 22:00
                                            回复会比较快，其他时候看到会第一时间处理。
                                        </p>
                                    </div>
                                    <div class="reminder-item">
                                        <span class="icon">💡</span>
                                        <p>虚拟产品购买后不支持退款！</p>
                                    </div>
                                    <div class="reminder-item">
                                        <span class="icon">🎁</span>
                                        <p>
                                            若在插件 2.0
                                            版本前打赏过，可将打赏订单号及标识码发送至下方邮箱或联系频道管理员，赠送一年
                                            VIP。
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div class="purchase-question">
                                <h4>❓ 问题咨询</h4>
                                <div class="question-card">
                                    <div class="question-item">
                                        <span class="icon">📧</span>
                                        <div class="question-content">
                                            <strong>邮箱：</strong>
                                            <a href="mailto:glaube_ty@qq.com"
                                                >glaube_ty@qq.com</a
                                            >
                                        </div>
                                    </div>
                                    <div class="question-item">
                                        <span class="icon">💬</span>
                                        <div class="question-content">
                                            <strong
                                                >腾讯频道：(订阅问题请私信管理员)</strong
                                            >
                                            <a
                                                href="https://pd.qq.com/s/2ks4079x0"
                                                >思源笔记主页插件</a
                                            >
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <label for=""
                                >激活码：<textarea bind:value={ActivationCode}
                                ></textarea></label
                            >
                            <div class="btn-group">
                                <button
                                    on:click={async () => {
                                        const saveVIPConfDataResult =
                                            await advanced.saveVIPConfData(
                                                plugin,
                                                ActivationCode,
                                            );
                                        if (saveVIPConfDataResult) {
                                            activationResult =
                                                await advanced.verifyLicense(
                                                    plugin,
                                                    USER_NAME,
                                                    USER_ID,
                                                );
                                            if (activationResult.code !== 0) {
                                                showMessage(
                                                    activationResult.error,
                                                );
                                                advanced.deleteLicense(plugin);
                                            } else {
                                                showMessage("✅激活成功！");
                                                activated = true;
                                            }
                                        }
                                    }}>激活</button
                                >
                            </div>
                        {:else}
                            <label for=""
                                >由于会员功能与账号绑定，<br
                                />请先登录后进行查看！</label
                            >
                        {/if}
                    </div>
                {/if}
            </div>
        {:else if activeTab === "about"}
            <div class="about-section">
                <div class="about-header">
                    <h3>🏠 思源主页插件</h3>
                    <p class="motto">提供个性化首页布局和丰富的功能模块。</p>
                </div>

                <div class="about-grid">
                    <div class="about-card">
                        <span class="icon">🌐</span>
                        <div>
                            <p class="label">插件主页：</p>
                            <a
                                href="https://github.com/Glaube-TY/siyuan-homepage"
                                class="link">siyuan-homepage</a
                            >
                        </div>
                        <span class="icon">&nbsp;&nbsp;&nbsp;</span>
                        <span class="icon">📜</span>
                        <div>
                            <p class="label">插件教程：</p>
                            <p>
                                <a
                                    href="https://blog.glaube-ty.top/zhu-ye-cha-jian"
                                    class="link">我的博客</a
                                >
                            </p>
                            <p>
                                <a
                                    href="https://ttl8ygt82u.feishu.cn/wiki/Skg2woe9DidYNNkQSiEcWRLrnRg?from=from_copylink"
                                    class="link">飞书文档(备用)</a
                                >
                            </p>
                        </div>
                    </div>

                    <div class="about-card">
                        <span class="icon">👨</span>
                        <div>
                            <p class="label">开发者：Glaube-TY</p>
                            <a href="https://github.com/Glaube-TY" class="link"
                                >Github 主页</a
                            >
                            <p>
                                <a
                                    href="https://ld246.com/member/GlaubeTY"
                                    class="link">链滴主页</a
                                >
                            </p>
                        </div>
                        <span class="icon">&nbsp;&nbsp;&nbsp;</span>
                        <span class="icon">⁉</span>
                        <div>
                            <p class="label">反馈&建议：</p>
                            <p>
                                <a
                                    href="https://github.com/Glaube-TY/siyuan-homepage/issues"
                                    class="link">Github Issues</a
                                >
                            </p>
                            <p>
                                <a
                                    href="https://pd.qq.com/s/2ks4079x0"
                                    class="link">腾讯频道</a
                                >
                            </p>
                        </div>
                    </div>

                    <div class="about-card support-card">
                        <div class="support-content">
                            <p class="support-description">
                                🌹 您的支持是持续开发的动力！
                            </p>
                            <a
                                href="https://blog.glaube-ty.top/da-shang"
                                class="link support-link"
                            >
                                <i class="fas fa-hand-holding-heart"></i>
                                立即赞助
                                <span class="sparkle">✨</span>
                            </a>
                        </div>
                    </div>
                </div>

                <div class="about-footer">
                    <p>❤ 感谢您使用本插件，希望您享受更高效的知识管理体验！</p>
                </div>
            </div>
        {/if}
    </div>
</div>
