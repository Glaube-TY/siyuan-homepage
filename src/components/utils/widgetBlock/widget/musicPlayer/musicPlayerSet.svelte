<script lang="ts">
    import { showMessage } from "siyuan";

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
        <div class="content-panel musicPlayer">
            <label class="folder-select-label">
                <span>音乐路径：</span>
                <input
                    type="text"
                    bind:value={musicFolderPath}
                    placeholder="请选择音乐文件夹"
                />
                <button title="选择音乐文件夹" onclick={selectMusicFolder}
                    >📁</button
                >
            </label>
            <label>
                <input type="checkbox" bind:checked={autoPlay} />
                自动播放
            </label>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
</div>

<style lang="scss">
    .musicPlayer {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        .folder-select-label {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;

            span {
                white-space: nowrap; // 禁止文字换行
                flex-shrink: 0; // 禁止压缩
            }

            input[type="text"] {
                flex: 1 1 auto; // 允许压缩和扩展
                min-width: 120px; // 设置最小宽度防止过度压缩
            }

            button {
                white-space: nowrap;
                padding: 6px 12px;
                flex-shrink: 0; // 禁止按钮压缩
            }
        }
    }
</style>
