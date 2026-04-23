<script lang="ts">
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

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

<SettingSection title="横幅开关">
    <SettingRow title="启用横幅图片" description="在主页顶部显示横幅图片">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={tempBannerEnabled}
            onchange={(e) => onTempBannerEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
</SettingSection>

{#if tempBannerEnabled}
    <SettingSection title="横幅设置">
        <SettingRow title="横幅类型" description="选择横幅图片来源">
            <select
                class="control-md"
                value={bannerGlobalType}
                onchange={(e) => onBannerGlobalTypeChange((e.currentTarget as HTMLSelectElement).value)}
            >
                <option value="custom">自定义</option>
                <option value="bing">每日一图👑</option>
            </select>
        </SettingRow>
        <SettingRow title="横幅高度" description="设置横幅高度（100-800px）">
            <input
                type="number"
                class="control-sm"
                value={tempBannerHeight}
                oninput={(e) => onTempBannerHeightChange((e.currentTarget as HTMLInputElement).value)}
                min="100"
                max="800"
                step="10"
                placeholder="例如：300"
            />
        </SettingRow>
    </SettingSection>

    {#if bannerGlobalType === "custom"}
        <SettingSection title="图片来源">
            <SettingRow title="图片来源" description="选择使用本地图片或网络图片">
                <select
                    class="control-md"
                    value={tempBannerType}
                    onchange={(e) => onTempBannerTypeChange((e.currentTarget as HTMLSelectElement).value)}
                >
                    <option value="local">本地图片</option>
                    <option value="remote">网络图片</option>
                </select>
            </SettingRow>

            {#if tempBannerType === "local"}
                <SettingRow title="选择图片" description="从本地选择横幅图片">
                    <button
                        onclick={() => fileInputEl?.click()}
                        class="file-action-btn"
                    >📁</button>
                    <input
                        type="file"
                        accept="image/*"
                        bind:this={fileInputEl}
                        onchange={handleImageSelect}
                        style="display:none;"
                    />
                </SettingRow>
            {:else if tempBannerType === "remote"}
                <SettingRow title="图片地址" description="输入远程图片 URL">
                    <input
                        type="text"
                        class="control-full"
                        value={bannerRemoteUrl}
                        oninput={(e) => onBannerRemoteUrlChange((e.currentTarget as HTMLInputElement).value)}
                        placeholder="输入远程图片地址"
                    />
                </SettingRow>
            {/if}
        </SettingSection>

        <!-- 图片预览 -->
        {#if tempBannerType === "local" && bannerLocalData}
            <SettingSection title="图片预览">
                <div class="banner-preview-wrapper">
                    <img src={bannerLocalData} alt="本地预览图" class="banner-preview-image" />
                </div>
            </SettingSection>
        {:else if tempBannerType === "remote" && bannerRemoteUrl}
            <SettingSection title="图片预览">
                <div class="banner-preview-wrapper">
                    <img src={bannerRemoteUrl} alt="远程预览图" class="banner-preview-image" />
                </div>
            </SettingSection>
        {/if}
    {:else if bannerGlobalType === "bing"}
        {#if advancedEnabled}
            <SettingSection title="Bing 每日一图">
                <SettingRow title="远程接口" description="选择 Bing 壁纸接口类型">
                    <select
                        class="control-lg"
                        value={bingApiType}
                        onchange={(e) => onBingApiTypeChange((e.currentTarget as HTMLSelectElement).value)}
                    >
                        <option value="POD_UHD">Bing 每日一图（原图）</option>
                        <option value="POD_1K">Bing 每日一图（1080P）</option>
                        <option value="POD_Normal">Bing 每日一图（普通）</option>
                        <option value="rand_uhd">Bing 历史随机（原图）</option>
                        <option value="rand_1K">Bing 历史随机（1080P）</option>
                        <option value="rand_Normal">Bing 历史随机（普通）</option>
                        <option value="ECY1">二次元壁纸</option>
                        <option value="RAND1">随机壁纸</option>
                    </select>
                </SettingRow>
            </SettingSection>
        {:else}
            <SettingSection title="会员权益">
                <div class="vip-feature-hint">
                    <span class="vip-icon">👑</span>
                    <span>每日一图为会员专属权益</span>
                </div>
            </SettingSection>
        {/if}
    {/if}
{/if}

<style>
    .banner-preview-wrapper {
        display: flex;
        justify-content: center;
        padding: 1rem 0;
    }
    .banner-preview-image {
        max-width: 100%;
        max-height: 200px;
        border-radius: 8px;
        object-fit: cover;
    }
    .vip-feature-hint {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 2rem;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
    }
    .vip-icon {
        font-size: 24px;
    }
</style>