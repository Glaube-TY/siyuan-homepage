<script lang="ts">
    import { onMount } from "svelte";
    import "emoji-picker-element";
    import "./homepageSettingStyle/homepageSetting.scss";

    export let plugin: any;
    export let close: () => void;

    let activeTab = "homepage";

    // 主页设置相关配置变量
    let tempAutoOpenHomepage = true;
    let settingsActiveTab = "banner";
    // 横幅区域相关配置变量
    let bannerEnabled = true;
    let bannerType = "local"; // 默认是本地图片
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
    // 快速笔记设置
    let quickNotesEnabled = false;
    let quickNotesPosition = "";
    let quickNotesTimestampEnabled = true;
    let quickNotesAddPosition = "bottom";

    // 设置页面加载时读取配置信息
    onMount(async () => {
        const savedConfig = await plugin.loadData("homepageSettingConfig.json");
        if (savedConfig) {
            // 全局配置
            tempAutoOpenHomepage = savedConfig.autoOpenHomepage ?? true;

            // 横幅配置
            bannerEnabled = savedConfig.bannerEnabled ?? true;
            bannerType = savedConfig.bannerType ?? "local";
            bannerLocalData = savedConfig.bannerLocalData || "";
            bannerRemoteUrl = savedConfig.bannerRemoteUrl || "";
            bannerHeight = savedConfig.bannerHeight || "300";

            // 标题配置
            showIcon = savedConfig.showIcon ?? true;
            titleIconType = savedConfig.titleIconType || "emoji";
            tempTitleIconEmoji = savedConfig.TitleIconEmoji || "🏠";
            tempTitleIconImage = savedConfig.TitleIconImage || null;
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

            quickNotesEnabled = savedConfig.quickNotesEnabled ?? false;
            quickNotesPosition = savedConfig.quickNotesPosition || "";
            quickNotesTimestampEnabled =
                savedConfig.quickNotesTimestampEnabled ?? true;
            quickNotesAddPosition =
                savedConfig.quickNotesAddPosition || "bottom";
        }

        // 同步到临时变量
        tempBannerEnabled = bannerEnabled;
        tempBannerType = bannerType;
        tempBannerHeight = bannerHeight;
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

            // 横幅配置
            bannerEnabled: tempBannerEnabled,
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
            quickNotesEnabled: quickNotesEnabled,
            quickNotesPosition: quickNotesPosition,
            quickNotesTimestampEnabled: quickNotesTimestampEnabled,
            quickNotesAddPosition: quickNotesAddPosition,
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
            on:click={() => (activeTab = "about")}
            class:active={activeTab === "about"}>关于插件</button
        >
    </div>

    <!-- 动态内容容器 -->
    <div class="tab-content">
        {#if activeTab === "homepage"}
            <div class="homepage-global-settings">
                <label for="auto-open-homepage">自动打开主页：</label>
                <input
                    type="checkbox"
                    id="auto-open-homepage"
                    bind:checked={tempAutoOpenHomepage}
                />
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
                    <button
                        on:click={() => (settingsActiveTab = "footer")}
                        class:active={settingsActiveTab === "footer"}
                        >底部设置</button
                    >
                </div>

                {#if settingsActiveTab === "banner"}
                    <div class="section-setting">
                        <!-- 横幅设置容器 -->
                        <div class="banner-settings-container">
                            <!-- 左侧设置区域 -->
                            <div class="banner-settings-left">
                                <!-- 是否启用横幅 -->
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
                                    <!-- 横幅高度设置 -->
                                    <div class="form-group">
                                        <label for="banner-height-input"
                                            >横幅高度(px)：</label
                                        >
                                        <input
                                            id="banner-height-input"
                                            type="number"
                                            bind:value={tempBannerHeight}
                                            min="100"
                                            max="800"
                                            step="10"
                                            placeholder="例如：300"
                                        />
                                    </div>

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
                                                <label for="remote-image-url"
                                                    >远程地址：</label
                                                >
                                                <input
                                                    id="remote-image-url"
                                                    type="text"
                                                    bind:value={bannerRemoteUrl}
                                                    placeholder="输入远程图片地址"
                                                />
                                            </div>
                                        </div>
                                    {/if}
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
                                        <div class="banner-preview-placeholder">
                                            未选择图片
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        </div>
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
                                    href="https://ttl8ygt82u.feishu.cn/wiki/Z4QOwYEXpifRb9kZQg4c2FafnXc?from=from_copylink"
                                    target="_blank">查看可用变量</a
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
                    </div>
                {/if}

                {#if settingsActiveTab === "footer"}
                    <div class="section-setting">
                        <div class="form-group"><p>开发中...</p></div>
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
                            <a
                                href="https://ttl8ygt82u.feishu.cn/wiki/Skg2woe9DidYNNkQSiEcWRLrnRg?from=from_copylink"
                                class="link">飞书文档</a
                            >
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
                                href="https://ttl8ygt82u.feishu.cn/wiki/Skg2woe9DidYNNkQSiEcWRLrnRg#share-Ej8kdvO2iohj1dxWXEzcGZ8Xn7d"
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
