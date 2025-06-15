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
    // let selectedButton: (typeof navButtons)[number] | null = null;
    // let navButtons = [
    //     { id: "search", label: "搜索笔记", visible: true },
    //     { id: "today", label: "今日日记", visible: true },
    //     { id: "addWidget", label: "添加组件", visible: true },
    //     { id: "settings", label: "主页设置", visible: true },
    // ];

    // 设置页面加载时读取配置信息
    onMount(async () => {
        const savedConfig = await plugin.loadData("homepageSettingConfig.json");
        if (savedConfig) {
            //全局配置
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

            // 快捷按钮
            // navButtons = savedConfig.navButtons || navButtons;
        }

        // 同步到临时变量
        tempBannerEnabled = bannerEnabled;
        tempBannerEnabled = bannerEnabled;
        tempBannerType = bannerType;
        tempBannerHeight = bannerHeight;
    });

    // function showDetail(button: (typeof navButtons)[number]) {
    //     selectedButton = button;
    // }

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
            // navButtons: navButtons,
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

                        <!-- <div class="custom-btn-setting"> -->
                            <!-- <div class="custom-btn-setting-title">
                                自定义按钮设置：<button class="add-btn"
                                    >添加按钮</button
                                >
                            </div> -->
                            <!-- <div class="custom-btn-setting-container"> -->
                                <!-- <div class="custom-btn-preview"> -->
                                    <!-- {#each navButtons as button} -->
                                        <!-- <div class="btn-list-item"> -->
                                            <!-- 单独放置 checkbox -->
                                            <!-- <input
                                                type="checkbox"
                                                id={`checkbox-${button.id}`}
                                                bind:checked={button.visible}
                                                on:click|stopPropagation={() => {}}
                                            /> -->

                                            <!-- 名称单独绑定点击事件 -->
                                            <!-- <button
                                                type="button"
                                                on:click={() =>
                                                    showDetail(button)}
                                                class="btn-label"
                                            >
                                                {button.label}
                                            </button> -->
                                        <!-- </div> -->
                                    <!-- {/each} -->
                                <!-- </div> -->

                                <!-- <div class="custom-btn-detail"> -->
                                    <!-- {#if selectedButton} -->
                                        <!-- <div>
                                            <h4>按钮详情</h4>
                                            <p>
                                                <strong>名称：</strong
                                                >{selectedButton.label}
                                            </p>
                                            <p>
                                                <strong>ID：</strong
                                                >{selectedButton.id}
                                            </p>
                                            <p>
                                                <strong>是否显示：</strong
                                                >{selectedButton.visible
                                                    ? "是"
                                                    : "否"}
                                            </p>
                                        </div> -->
                                    <!-- {:else} -->
                                        <!-- <p>请选择一个按钮</p> -->
                                    <!-- {/if} -->
                                <!-- </div> -->
                            <!-- </div> -->
                        <!-- </div> -->
                    </div>
                {/if}

                {#if settingsActiveTab === "widgets"}
                    <div class="section-setting">
                        <div class="form-group"><p>开发中...</p></div>
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
                                    href="https://ttl8ygt82u.feishu.cn/wiki/Skg2woe9DidYNNkQSiEcWRLrnRg?from=from_copylink"
                                    class="link">飞书文档评论区</a
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
