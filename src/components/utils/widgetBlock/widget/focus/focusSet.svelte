<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import ImageSourceSetting from "../../shared/ImageSourceSetting.svelte";

    interface Props {
        focusImageType?: string;
        breakImageType?: string;
        focusBgImage?: string;
        breakBgImage?: string;
        focusLocalImage?: string | null;
        breakLocalImage?: string | null;
        focusDatabaseId?: string;
    }

    let {
        focusImageType = $bindable("remote"),
        breakImageType = $bindable("remote"),
        focusBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464"),
        breakBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d"),
        focusLocalImage = $bindable(null),
        breakLocalImage = $bindable(null),
        focusDatabaseId = $bindable(""),
    }: Props = $props();
</script>

<SettingSection title="统计数据库">
    <SettingRow
        title="数据库 ID"
        description="番茄钟统计数据将保存到思源数据库。同一主页空间内的番茄钟组件会自动共用已有数据库 ID。旧本地统计会在填写数据库 ID 后自动迁移。"
    >
        <input
            type="text"
            bind:value={focusDatabaseId}
            class="control-full"
            placeholder="输入番茄钟统计数据库 ID"
        />
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
