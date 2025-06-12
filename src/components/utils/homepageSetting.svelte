<script lang="ts">
    import { onMount } from "svelte";
    import "emoji-picker-element";

    export let plugin;
    export let close;

    let activeTab = "homepage";

    // 主页设置相关配置变量
    let tempAutoOpenHomepage = true;
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
        }

        // 同步到临时变量
        tempBannerEnabled = bannerEnabled;
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
                <div class="section-setting">
                    <h3>⚙ 横幅区域设置</h3>
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
                        <div class="form-group">
                            <label for="banner-source-select">横幅来源：</label>
                            <select
                                id="banner-source-select"
                                bind:value={tempBannerType}
                            >
                                <option value="local">本地图片</option>
                                <option value="remote">网络图片</option>
                            </select>
                        </div>

                        {#if tempBannerType === "local"}
                            <div class="form-group">
                                <label for="local-image-input">本地路径：</label
                                >
                                <button
                                    on:click={() => fileInputEl.click()}
                                    class="btn-select-file"
                                    id="local-image-input">🖼 选择图片</button
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
                            <div class="form-group">
                                <label for="remote-image-url">远程地址：</label>
                                <input
                                    id="remote-image-url"
                                    type="text"
                                    bind:value={bannerRemoteUrl}
                                    placeholder="输入远程图片地址"
                                />
                            </div>
                        {/if}
                    {/if}
                </div>

                <div class="section-setting">
                    <h3>⚙ 标题区域设置</h3>
                    <!-- 标题设置 -->
                    <!-- 标题图标设置 -->
                    <div class="form-group">
                        <label>
                            <input type="checkbox" bind:checked={showIcon} />
                            显示标题图标
                        </label>
                    </div>
                    {#if showIcon === true}
                        <div class="form-group">
                            <label for="title-icon-type">标题图标：</label>
                            <select
                                id="title-icon-type"
                                bind:value={titleIconType}
                            >
                                <option value="emoji">表情</option>
                                <option value="image">图片</option>
                            </select>
                        </div>

                        {#if titleIconType === "emoji"}
                            <div class="form-group">
                                <label for="emoji-picker-button"
                                    >选择表情：</label
                                >
                                <button
                                    id="emoji-picker-button"
                                    type="button"
                                    class="emoji-display"
                                    on:click={openEmojiPicker}
                                    aria-label="选择表情"
                                >
                                    {tempTitleIconEmoji || "😊"}
                                </button>
                            </div>
                        {:else if titleIconType === "image"}
                            <div class="form-group">
                                <label for="icon-image-input">图标图片：</label>
                                <button
                                    on:click={() => iconInputEl.click()}
                                    class="btn-select-file"
                                    id="icon-image-input">🖼 选择图片</button
                                >
                                <input
                                    type="file"
                                    accept="image/*"
                                    bind:this={iconInputEl}
                                    on:change={handleIconImageSelect}
                                    style="display:none;"
                                />
                                {#if titleIconType === "image" && tempTitleIconImage}
                                    <div class="icon-preview">
                                        <img
                                            src={tempTitleIconImage}
                                            alt="图标预览"
                                            style="width: 32px; height: 32px;"
                                        />
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        {#if showEmojiPicker}
                            <!-- 遮罩层：点击关闭 -->
                            <button
                                class="emoji-picker-overlay-bg"
                                tabindex="0"
                                on:click={() => (showEmojiPicker = false)}
                                on:keydown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        showEmojiPicker = false;
                                    }
                                }}
                                aria-label="关闭表情选择器"
                            >
                            </button>

                            <!-- 表情弹窗容器 -->
                            <div
                                class="emoji-picker-modal"
                                style="top: {emojiPickerPosition.top}; left: {emojiPickerPosition.left};"
                            >
                                <div class="emoji-picker-content">
                                    <!-- 实际的表情选择组件 -->
                                    <emoji-picker
                                        bind:this={emojiPickerElement}
                                    />
                                </div>
                            </div>
                        {/if}
                    {/if}
                    <!-- 自定义标题文字 -->
                    <div class="form-group">
                        <label for="custom-title-input">自定义标题文字：</label>
                        <input
                            id="custom-title-input"
                            type="text"
                            bind:value={tempCustomTitle}
                            placeholder="例如：我的主页"
                        />
                    </div>
                </div>

                <div class="section-setting">
                    <h3>⚙ 自定义组件区域设置</h3>
                    <div class="form-group"><p>开发中...</p></div>
                </div>

                <div class="section-setting">
                    <h3>⚙ 底部信息区域设置</h3>
                    <div class="form-group"><p>开发中...</p></div>
                </div>
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
                            <a
                                href="https://github.com/Glaube-TY/siyuan-homepage/issues"
                                class="link">Github Issues</a
                            >
                        </div>
                    </div>

                    <div class="about-card support-card">
                        <div class="support-content">
                            <p class="support-description">
                                🌹 您的支持是持续开发的动力！
                            </p>
                            <a
                                href="https://ttl8ygt82u.feishu.cn/wiki/Skg2woe9DidYNNkQSiEcWRLrnRg?from=from_copylink"
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

<style lang="scss">
    .settings-container {
        padding: 1.5rem;
        background: var(--b3-theme-background);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--b3-border-color);
        font-family: "Segoe UI", system-ui, sans-serif;
        min-width: 500px;
        width: 100%;
    }

    .tab-nav {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .tab-nav button {
        padding: 0.5rem 1rem;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease-in-out;
    }

    .tab-nav button.active {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    .homepage-content-settings {
        padding-top: 1rem;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
    }

    .section-setting {
        padding: 1rem;
        background-color: var(--b3-theme-surface);
        border-radius: 8px;
        border: 1px solid var(--b3-border-color);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        transition: box-shadow 0.2s ease;

        &:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
    }

    h3 {
        color: var(--b3-theme-text);
        margin-bottom: 0.75rem;
    }

    .form-group {
        margin-bottom: 0.75rem;
    }

    .about-section p {
        margin-bottom: 0.5rem;
    }

    .action-buttons {
        display: flex;
        gap: 1rem;
        margin-top: 1rem;
    }

    .btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: background-color 0.2s ease;
    }

    .btn.primary {
        background-color: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    .no-link-style {
        text-decoration: none;
        color: inherit;
        cursor: pointer;
    }

    .btn:hover:not(.primary) {
        background-color: var(--b3-border-color);
    }

    .emoji-picker-modal {
        position: absolute;
        z-index: 9999; /* 确保在最上层 */
        pointer-events: auto;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        padding: 0;
        margin: 0;
    }

    .emoji-picker-overlay-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background-color: transparent;
        z-index: 9998;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
    }

    .emoji-picker-content {
        width: auto;
        height: auto;
        min-width: 200px;
        min-height: 200px;
        max-width: 400px;
        max-height: 500px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        overflow: auto;
        z-index: 10000;
        pointer-events: auto;
        padding: 8px;
    }

    .emoji-display {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        font-size: 24px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: pointer;
        background: var(--b3-theme-surface);
        transition: background-color 0.2s ease;

        &:hover {
            background: var(--b3-theme-hover);
        }
    }

    .about-section {
        padding: 20px;
        max-width: 800px;
        margin: 0 auto;

        .about-header {
            text-align: center;
            margin-bottom: 2rem;

            h3 {
                font-size: 1.8rem;
                color: var(--b3-theme-primary);
                margin-bottom: 0.5rem;
            }

            .motto {
                color: var(--b3-theme-text);
                font-size: 0.9rem;
            }
        }

        .about-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .about-card {
            background: var(--b3-theme-surface);
            border-radius: 8px;
            padding: 1.5rem;
            display: flex;
            align-items: center;
            transition: transform 0.2s;

            &:hover {
                transform: translateY(-3px);
            }

            .icon {
                font-size: 2rem;
                margin-right: 1rem;
            }

            .label {
                color: var(--b3-theme-text);
                margin-bottom: 0.3rem;
                font-size: 0.9rem;
            }

            .link {
                color: var(--b3-theme-primary);
                text-decoration: none;

                &:hover {
                    text-decoration: underline;
                }
            }
        }

        .about-footer {
            text-align: center;
            border-top: 1px solid var(--b3-border-color);
            padding-top: 1.5rem;

            .copyright {
                color: var(--b3-theme-secondary);
                font-size: 0.8rem;
                margin-top: 1rem;
            }
        }

        .sponsor-options {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 1rem;

            .qr-code {
                width: 120px;
                height: 120px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                transition: transform 0.3s ease;

                &:hover {
                    transform: scale(1.05);
                }
            }
        }

        .support-card {
            flex-direction: column; // 改为垂直布局
            justify-content: center; // 水平垂直居中
            text-align: center; // 文字居中
            background: linear-gradient(
                135deg,
                rgba(255, 71, 87, 0.1) 0%,
                rgba(255, 71, 87, 0.05) 100%
            ) !important;
            border: 1px solid rgba(255, 71, 87, 0.2) !important;
            animation: glow 2s ease-in-out infinite alternate;

            &:hover {
                transform: scale(1.05) rotate(-1deg);
            }

            .icon {
                animation: heartbeat 1.5s infinite;
            }

            .icon {
                margin-right: 0; // 移除图标右边距
                margin-bottom: 1rem; // 增加下边距
            }

            .support-content {
                width: 100%; // 撑满容器宽度
                padding: 0; // 移除内边距
            }
        }

        .support-content {
            position: relative;
            padding: 1rem;
        }

        .support-description {
            color: var(--b3-theme-text);
            font-size: 0.9rem;
            line-height: 1.5;
            margin-bottom: 1rem;
        }

        .support-link {
            display: inline-flex;
            align-items: center;
            padding: 0.8rem 1.5rem;
            background: linear-gradient(135deg, #ff4757 0%, #ff6b6b 100%);
            color: white !important;
            border-radius: 8px;
            font-weight: 600;
            transition: all 0.3s ease;

            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(255, 71, 87, 0.3);

                .sparkle {
                    opacity: 1;
                }
            }

            i {
                margin-right: 0.8rem;
                font-size: 1.2rem;
            }
        }

        .sparkle {
            opacity: 0;
            margin-left: 0.5rem;
            transition: opacity 0.3s ease;
        }

        @keyframes glow {
            from {
                box-shadow: 0 0 5px rgba(255, 71, 87, 0.1);
            }
            to {
                box-shadow: 0 0 15px rgba(255, 71, 87, 0.3);
            }
        }
    }
</style>
