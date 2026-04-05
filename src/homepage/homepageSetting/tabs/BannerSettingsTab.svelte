<script lang="ts">
    let fileInputEl: HTMLInputElement | null = $state(null);

    interface Props {
        tempBannerEnabled: boolean;
        bannerGlobalType: string;
        bingApiType: string;
        tempBannerType: string;
        bannerLocalData: string;
        bannerRemoteUrl: string;
        tempBannerHeight: string;
        advancedEnabled: boolean;
        onTempBannerEnabledChange: (value: boolean) => void;
        onBannerGlobalTypeChange: (value: string) => void;
        onBingApiTypeChange: (value: string) => void;
        onTempBannerTypeChange: (value: string) => void;
        onBannerLocalDataChange: (value: string) => void;
        onBannerRemoteUrlChange: (value: string) => void;
        onTempBannerHeightChange: (value: string) => void;
        handleImageSelect: (event: Event) => void;
    }

    let {
        tempBannerEnabled,
        bannerGlobalType,
        bingApiType,
        tempBannerType,
        bannerLocalData,
        bannerRemoteUrl,
        tempBannerHeight,
        advancedEnabled,
        onTempBannerEnabledChange,
        onBannerGlobalTypeChange,
        onBingApiTypeChange,
        onTempBannerTypeChange,
        onBannerRemoteUrlChange,
        onTempBannerHeightChange,
        handleImageSelect
    }: Props = $props();
</script>

<div class="section-setting">
    <div class="form-group">
        <label>
            <input
                type="checkbox"
                checked={tempBannerEnabled}
                onchange={(e) => onTempBannerEnabledChange((e.currentTarget as HTMLInputElement).checked)}
            />
            启用横幅图片
        </label>
    </div>
    {#if tempBannerEnabled}
        <div class="form-group">
            <label for=""
                >横幅类型：<select
                    value={bannerGlobalType}
                    onchange={(e) => onBannerGlobalTypeChange((e.currentTarget as HTMLSelectElement).value)}
                >
                    <option value="custom">自定义</option>
                    <option value="bing">每日一图👑</option>
                </select></label
            >
            <label for="banner-height-input"
                >横幅高度(px)：<input
                    id="banner-height-input"
                    type="number"
                    value={tempBannerHeight}
                    oninput={(e) => onTempBannerHeightChange((e.currentTarget as HTMLInputElement).value)}
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
                            value={tempBannerType}
                            onchange={(e) => onTempBannerTypeChange((e.currentTarget as HTMLSelectElement).value)}
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
                                onclick={() => fileInputEl?.click()}
                                class="btn-select-file"
                                id="local-image-input"
                                >📂 选择图片</button
                            >
                            <input
                                type="file"
                                accept="image/*"
                                bind:this={fileInputEl}
                                onchange={handleImageSelect}
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
                                    value={bannerRemoteUrl}
                                    oninput={(e) => onBannerRemoteUrlChange((e.currentTarget as HTMLInputElement).value)}
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
                            value={bingApiType}
                            onchange={(e) => onBingApiTypeChange((e.currentTarget as HTMLSelectElement).value)}
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