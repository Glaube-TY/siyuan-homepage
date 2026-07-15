<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import ImageSourceSetting from "../../shared/ImageSourceSetting.svelte";
    import { openFocusNotifySettingsDialog } from "@/features/focus-notify";

    interface Props {
        focusImageType?: string;
        breakImageType?: string;
        focusBgImage?: string;
        breakBgImage?: string;
        focusLocalImage?: string | null;
        breakLocalImage?: string | null;
        advancedEnabled?: boolean;
    }

    let {
        focusImageType = $bindable("remote"),
        breakImageType = $bindable("remote"),
        focusBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464"),
        breakBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d"),
        focusLocalImage = $bindable(null),
        breakLocalImage = $bindable(null),
        advancedEnabled = false,
    }: Props = $props();
</script>

<SettingSection title="统计数据">
    <SettingRow
        title="本地共享"
        description="番茄钟统计保存在插件本地，并由所有番茄钟组件自动共享。"
    />
</SettingSection>

<SettingSection title="番茄钟通知">
    <SettingRow
        title="全局通知规则"
        description="所有番茄钟组件共享专注结束和休息结束通知规则"
    >
        <button
            type="button"
            class="b3-button b3-button--text"
            disabled={!advancedEnabled}
            onclick={() => openFocusNotifySettingsDialog(advancedEnabled)}
        >打开番茄钟通知设置</button>
    </SettingRow>
</SettingSection>

<ImageSourceSetting
    title="专注背景"
    bind:source={focusImageType}
    bind:remoteUrl={focusBgImage}
    bind:localDataUrl={focusLocalImage}
    remotePlaceholder="请输入专注背景图URL"
    uploadLabel="上传图片"
    previewAlt="专注背景预览"
/>

<ImageSourceSetting
    title="休息背景"
    bind:source={breakImageType}
    bind:remoteUrl={breakBgImage}
    bind:localDataUrl={breakLocalImage}
    remotePlaceholder="请输入休息背景图URL"
    uploadLabel="上传图片"
    previewAlt="休息背景预览"
/>
