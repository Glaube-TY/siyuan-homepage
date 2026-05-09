<script lang="ts">
    import ImageSourceSetting from "../../shared/ImageSourceSetting.svelte";

    interface Props {
        focusImageType?: string;
        breakImageType?: string;
        focusBgImage?: string;
        breakBgImage?: string;
        focusLocalImage?: string | null;
        breakLocalImage?: string | null;
    }

    let {
        focusImageType = $bindable("remote"),
        breakImageType = $bindable("remote"),
        focusBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464"),
        breakBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d"),
        focusLocalImage = $bindable(null),
        breakLocalImage = $bindable(null)
    }: Props = $props();
</script>

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
