<script lang="ts">
    import DirectoryPathSetting from "../../shared/DirectoryPathSetting.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled: boolean;
        musicFolderPath?: string;
        autoPlay?: boolean;
    }

    let { advancedEnabled, musicFolderPath = $bindable(""), autoPlay = $bindable(false) }: Props = $props();
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
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
</div>
