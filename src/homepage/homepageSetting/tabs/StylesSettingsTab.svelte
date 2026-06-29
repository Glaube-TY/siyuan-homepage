<script lang="ts">
    import type { StylesSettingsState, StylesSettingsActions } from '../types';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';
    import AdvancedFeatureLock from '@/components/utils/widgetBlock/widget/common/AdvancedFeatureLock.svelte';
    import SiyuanIcon from '@/components/utils/shared/SiyuanIcon.svelte';

    interface Props {
        state: StylesSettingsState;
        actions: StylesSettingsActions;
        advancedEnabled?: boolean;
    }

    let { state: settingsState, actions, advancedEnabled = false }: Props = $props();
    let backgroundFileInputEl: HTMLInputElement | null = $state(null);
</script>

{#if advancedEnabled}
<SettingSection title="页脚">
    <SettingRow title="显示页脚" description="在主页底部显示自定义页脚内容">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={settingsState.footerEnabled}
            onchange={(e) => actions.onFooterEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if settingsState.footerEnabled}
        <SettingRow title="页脚内容" description="支持 HTML 标签">
            <textarea
                class="control-full"
                rows="3"
                placeholder="输入页脚内容"
                value={settingsState.footerContent}
                oninput={(e) => actions.onFooterContentChange((e.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="鼠标样式">
    <SettingRow title="鼠标图标" description="选择自定义鼠标指针样式">
        <select
            class="control-md"
            value={settingsState.mouseIcon}
            onchange={(e) => actions.onMouseIconChange((e.currentTarget as HTMLSelectElement).value)}
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
            <option value="CBPK2077">赛博朋克2077</option>
            <option value="CYWL1">初音未来1</option>
            <option value="CYWL2">初音未来2</option>
            <option value="cat1">喵星人1</option>
            <option value="cat2">喵星人2</option>
            <option value="cat3">喵星人3</option>
            <option value="WDSJsword">钻石剑</option>
            <option value="WDSJpickaxe">钻石镐</option>
        </select>
    </SettingRow>
    <SettingRow title="应用于全局" description="鼠标样式应用到整个思源笔记">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={settingsState.mouseGlobalEnabled}
            onchange={(e) => actions.onMouseGlobalEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="鼠标轨迹" description="显示鼠标移动轨迹效果">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={settingsState.mouseTrailEnabled}
            onchange={(e) => actions.onMouseTrailEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="点击特效" description="点击时显示特效文字">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={settingsState.clickEffectEnabled}
            onchange={(e) => actions.onClickEffectEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if settingsState.clickEffectEnabled}
        <SettingRow title="特效内容" description="每行一个特效文字">
            <textarea
                class="control-full"
                rows="3"
                placeholder="输入点击特效内容（每行一个特效）"
                value={settingsState.clickEffectContent}
                oninput={(e) => actions.onClickEffectContentChange((e.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="背景图片">
    <SettingRow title="开启背景图片" description="为主页或整个思源界面显示背景图片">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={settingsState.backgroundImageEnabled}
            onchange={(e) => actions.onBackgroundImageEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if settingsState.backgroundImageEnabled}
        <SettingRow title="应用于全局" description="开启后背景图片应用到整个思源笔记，否则只应用到主页">
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                checked={settingsState.backgroundImageGlobalEnabled}
                onchange={(e) => actions.onBackgroundImageGlobalEnabledChange((e.currentTarget as HTMLInputElement).checked)}
            />
        </SettingRow>

        <SettingRow title="图片来源" description="选择使用本地图片或网络图片">
            <select
                class="control-md"
                value={settingsState.backgroundImageType}
                onchange={(e) => actions.onBackgroundImageTypeChange((e.currentTarget as HTMLSelectElement).value as "local" | "remote")}
            >
                <option value="local">本地图片</option>
                <option value="remote">网络图片</option>
            </select>
        </SettingRow>

        {#if settingsState.backgroundImageType === "local"}
            <SettingRow title="选择图片" description="从本地选择背景图片">
                <button
                    type="button"
                    onclick={() => backgroundFileInputEl?.click()}
                    class="file-action-btn"
                >
                    <SiyuanIcon name="folder" size={14} />
                </button>
                <input
                    type="file"
                    accept="image/*"
                    bind:this={backgroundFileInputEl}
                    onchange={actions.onBackgroundImageSelect}
                    style="display:none;"
                />
            </SettingRow>
        {:else}
            <SettingRow title="图片地址" description="输入远程图片 URL">
                <input
                    type="text"
                    class="control-full"
                    value={settingsState.backgroundImageRemoteUrl}
                    oninput={(e) => actions.onBackgroundImageRemoteUrlChange((e.currentTarget as HTMLInputElement).value)}
                    placeholder="输入远程图片地址"
                />
            </SettingRow>
        {/if}

        <SettingRow title="透明度" description="背景图片显示强度">
            <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settingsState.backgroundImageOpacity}
                oninput={(e) => actions.onBackgroundImageOpacityChange(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <span class="style-value-label">{settingsState.backgroundImageOpacity}%</span>
        </SettingRow>

        <SettingRow title="模糊" description="背景图片虚化强度">
            <input
                type="range"
                min="0"
                max="40"
                step="1"
                value={settingsState.backgroundImageBlur}
                oninput={(e) => actions.onBackgroundImageBlurChange(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <span class="style-value-label">{settingsState.backgroundImageBlur}px</span>
        </SettingRow>

        {#if settingsState.backgroundImageType === "local" && settingsState.backgroundImageLocalData}
            <div class="background-preview-wrapper">
                <img src={settingsState.backgroundImageLocalData} alt="背景图片预览" class="background-preview-image" />
            </div>
        {:else if settingsState.backgroundImageType === "remote" && settingsState.backgroundImageRemoteUrl}
            <div class="background-preview-wrapper">
                <img src={settingsState.backgroundImageRemoteUrl} alt="背景图片预览" class="background-preview-image" />
            </div>
        {/if}
    {/if}
</SettingSection>

<SettingSection title="飘落特效">
    <SettingRow title="开启飘落特效" description="在页面上显示飘落动画">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={settingsState.fallEffectsEnabled}
            onchange={(e) => actions.onFallEffectsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="应用于全局" description="飘落特效应用到整个思源笔记">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={settingsState.globalFallingEffectsEnabled}
            onchange={(e) => actions.onGlobalFallingEffectsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="飘落图形" description="选择飘落的图形样式">
        <select
            class="control-md"
            value={settingsState.fallingIcon}
            onchange={(e) => actions.onFallingIconChange((e.currentTarget as HTMLSelectElement).value)}
        >
            <option value="snow">雪花</option>
            <option value="heart">爱心</option>
            <option value="star">五角星</option>
            <option value="greenery">绿叶</option>
            <option value="mapleLeaf">枫叶</option>
            <option value="ginkgoLeaf">银杏叶</option>
            <option value="bodhiLeaf">菩提叶</option>
            <option value="bambooLeaf">竹叶</option>
            <option value="cherry">樱花</option>
            <option value="cherryPetal">樱花瓣</option>
            <option value="Rinka">梨花</option>
            <option value="rose">玫瑰花</option>
            <option value="dandelion">蒲公英</option>
            <option value="QZHIHE">千纸鹤</option>
            <option value="paperPlane">纸飞机</option>
            <option value="HMBB">海绵宝宝</option>
            <option value="PDX">派大星</option>
        </select>
    </SettingRow>
    <SettingRow title="密度" description="飘落图形的数量">
        <select
            class="control-sm"
            value={settingsState.fallingDensity}
            onchange={(e) => actions.onFallingDensityChange((e.currentTarget as HTMLSelectElement).value)}
        >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
        </select>
    </SettingRow>
    <SettingRow title="速度" description="飘落图形的下落速度">
        <select
            class="control-sm"
            value={settingsState.fallingSpeed}
            onchange={(e) => actions.onFallingSpeedChange((e.currentTarget as HTMLSelectElement).value)}
        >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
        </select>
    </SettingRow>
</SettingSection>
{:else}
<AdvancedFeatureLock
    title="高级样式"
    subtitle="自定义主页页脚、鼠标样式、点击特效和飘落动画，让主页更有个人风格。"
    icon="style"
    features={[
        "自定义页脚内容和主页展示",
        "鼠标指针、轨迹和点击特效",
        "主页或全局背景图片",
        "飘落动画与全局装饰效果",
        "打造更个性化的思源主页"
    ]}
    highlights={["个性化主页", "背景图片", "鼠标特效", "飘落动画"]}
/>
{/if}

<style>
    .style-value-label {
        min-width: 44px;
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        text-align: right;
    }

    .background-preview-wrapper {
        display: flex;
        justify-content: center;
        padding: 0.75rem 0 0.25rem;
    }

    .background-preview-image {
        width: min(100%, 360px);
        max-height: 180px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid var(--b3-border-color);
    }
</style>
