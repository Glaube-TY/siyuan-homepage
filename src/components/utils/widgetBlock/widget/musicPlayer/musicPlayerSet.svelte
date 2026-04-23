<script lang="ts">
    import { showMessage } from "siyuan";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled: boolean;
        musicFolderPath?: string;
        autoPlay?: boolean;
    }

    let { advancedEnabled, musicFolderPath = $bindable(""), autoPlay = $bindable(false) }: Props = $props();

    // 选择音乐文件夹
    async function selectMusicFolder() {
        try {
            if (
                !window.navigator.userAgent.includes("Electron") ||
                typeof window.require !== "function"
            )
                return showMessage("此功能仅在桌面版可用");
            const { filePaths } = await window
                .require("@electron/remote")
                .dialog.showOpenDialog({
                    properties: ["openDirectory", "createDirectory"],
                });

            if (filePaths && filePaths.length > 0) {
                musicFolderPath = filePaths[0];
            }
        } catch (error) {
            console.error("选择文件夹时发生错误：", error);
        }
    }
</script>

<div class="music-player-settings">
    {#if advancedEnabled}
        <SettingSection title="音乐设置">
            <SettingRow title="音乐路径">
                <div class="file-path-group">
                    <input
                        type="text"
                        bind:value={musicFolderPath}
                        placeholder="请选择音乐文件夹"
                        class="control-full"
                        readonly
                    />
                    <button title="选择音乐文件夹" onclick={selectMusicFolder} class="file-action-btn">📁</button>
                </div>
            </SettingRow>
            <SettingRow title="自动播放">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={autoPlay} />
            </SettingRow>
        </SettingSection>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
</div>
