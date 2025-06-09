<script lang="ts">
    import { onMount } from "svelte";

    export let plugin;
    export let close;

    let activeTab = "homepage";
    let bannerEnabled = true;
    let bannerType = "local"; // 默认是本地图片
    let tempBannerEnabled = bannerEnabled;
    let tempBannerType = bannerType;
    let bannerLocalData: string | null = null;
    let bannerRemoteUrl = "";
    let bannerHeight = "300"; // 默认值为字符串类型以适配输入框
    let tempBannerHeight = bannerHeight;
    let fileInputEl: HTMLInputElement;

    // 页面加载时读取配置
    onMount(async () => {
        const savedConfig = await plugin.loadData("homepageSettingConfig.json");
        if (savedConfig) {
            bannerEnabled = savedConfig.bannerEnabled ?? true;
            bannerType = savedConfig.bannerType ?? "local";
            bannerLocalData = savedConfig.bannerLocalData || "";
            bannerRemoteUrl = savedConfig.bannerRemoteUrl || "";
            bannerHeight = savedConfig.bannerHeight || "300";
        }

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

    $: {
        if (tempBannerType === "remote") {
            bannerLocalData = null; // 清空本地图片数据
        }
    }

    // 保存配置并关闭对话框
    async function confirmSave() {
        const config = {
            bannerEnabled: tempBannerEnabled,
            bannerType: tempBannerType,
            bannerLocalData: bannerLocalData,
            bannerRemoteUrl: bannerRemoteUrl,
            bannerHeight: tempBannerHeight,
        };

        await plugin.saveData("homepageSettingConfig.json", config);

        if (close) {
            close();
        }

        window.open("siyuan://#"); // 如果你仍需要重启思源笔记
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
            <div class="section-setting">
                <h3>🖼️ 横幅区域设置</h3>
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
                        <label for="banner-height-input">横幅高度(px)：</label>
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
                            <label for="local-image-input">本地路径：</label>
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
                <h3>🧭 标题区域设置</h3>
                <div class="form-group"></div>
            </div>

            <div class="section-setting">
                <h3>🧩 自定义组件区域设置</h3>
                <div class="form-group"></div>
            </div>

            <div class="section-setting">
                <h3>🧾 底部信息区域设置</h3>
                <div class="form-group"></div>
            </div>
        {:else if activeTab === "about"}
            <div class="about-section">
                <h3>💡 关于插件</h3>
                <p><strong>插件名称：</strong> 思源笔记首页插件</p>
                <p><strong>作者：</strong> Glaube-TY</p>
                <p><strong>版本号：</strong> v1.0.0</p>
                <p>
                    <strong>简介：</strong> 提供个性化首页布局和丰富的功能模块。
                </p>
            </div>
        {/if}
    </div>
    <!-- 操作按钮 -->
    <div class="action-buttons">
        <a
            class="btn primary no-link-style"
            href="#"
            role="button"
            on:click={confirmSave}>✅ 确认</a
        >
        <button class="btn" on:click={cancelSave}>❌ 取消</button>
    </div>
</div>

<style>
    .settings-container {
        padding: 1.5rem;
        background: var(--b3-theme-background);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--b3-border-color);
        max-width: 480px;
        font-family: "Segoe UI", system-ui, sans-serif;
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

    .tab-content {
        padding-top: 1rem;
    }

    .section-setting {
        padding: 1rem;
        background-color: var(--b3-theme-surface);
        border-radius: 8px;
        border: 1px solid var(--b3-border-color);
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
</style>
