<script lang="ts">
    import DirectoryPathSetting from "../../shared/DirectoryPathSetting.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    interface Props {
        advancedEnabled: boolean;
        musicFolderPath?: string;
        autoPlay?: boolean;
        showLyrics?: boolean;
        showCover?: boolean;
        scanSubfolders?: boolean;
        parseMetadata?: boolean;
        showFloatingMini?: boolean;
    }

    let {
        advancedEnabled,
        musicFolderPath = $bindable(""),
        autoPlay = $bindable(false),
        showLyrics = $bindable(true),
        showCover = $bindable(true),
        scanSubfolders = $bindable(false),
        parseMetadata = $bindable(true),
        showFloatingMini = $bindable(false),
    }: Props = $props();
</script>

<div class="music-player-settings">
    {#if advancedEnabled}
        <DirectoryPathSetting
            sectionTitle="音乐设置"
            rowTitle="音乐路径"
            bind:path={musicFolderPath}
            placeholder="请选择音乐文件夹"
            buttonTitle="选择音乐文件夹"
        />

        <SettingSection title="播放设置">
            <SettingRow title="自动播放">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={autoPlay} />
            </SettingRow>
        </SettingSection>

        <SettingSection title="显示设置">
            <SettingRow title="显示歌词">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showLyrics} />
            </SettingRow>
            <SettingRow title="显示封面">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showCover} />
            </SettingRow>
            <!-- TODO: 悬浮播放器开发中，暂不显示设置入口
            <SettingRow title="显示右下角迷你播放器">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showFloatingMini} />
            </SettingRow>
            -->
            <SettingRow title="解析元数据">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={parseMetadata} />
            </SettingRow>
        </SettingSection>

        <SettingSection title="扫描设置">
            <SettingRow title="扫描子文件夹">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={scanSubfolders} />
            </SettingRow>
        </SettingSection>
    {:else}
        <AdvancedFeatureLock
            title="音乐播放器"
            subtitle="本地音乐播放，支持多种音频格式和播放模式。"
            icon="music"
            features={[
                "本地音乐文件夹读取",
                "支持 MP3/WAV/FLAC 等格式",
                "顺序/循环/随机播放模式"
            ]}
            highlights={["本地音乐", "多种格式", "播放模式"]}
        />
    {/if}
</div>

<style lang="scss">
    .music-player-settings {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
</style>
