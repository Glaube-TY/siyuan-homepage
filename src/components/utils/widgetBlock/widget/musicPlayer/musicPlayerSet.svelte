<script lang="ts">
    import { showMessage } from "siyuan";
    import { onDestroy } from "svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { canUseElectronLocalFileSystem } from "@/components/tools/runtimeEnv";
    import {
        buildMusicPlayerIndex,
        rebuildMusicPlayerIndex,
        getMusicPlayerIndexProgress,
    } from "./musicPlayerIndexController";
    import type { MusicPlayerIndexActionResult } from "./musicPlayerIndexController";
    import type { MusicMetadataIndexProgress } from "./musicPlayerTypes";
    import { DEFAULT_MUSIC_METADATA_INDEX_PROGRESS } from "./musicPlayerTypes";
    import { MusicMetadataIndexStore } from "./musicMetadataIndexStore";

    interface Props {
        advancedEnabled: boolean;
        plugin?: any;
        blockId?: string;
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
        plugin = undefined,
        blockId = "",
        musicFolderPath = $bindable(""),
        autoPlay = $bindable(false),
        showLyrics = $bindable(true),
        showCover = $bindable(true),
        scanSubfolders = $bindable(false),
        parseMetadata = $bindable(true),
        showFloatingMini = $bindable(false),
    }: Props = $props();

    let indexing = $state(false);
    let progress = $state<MusicMetadataIndexProgress>(DEFAULT_MUSIC_METADATA_INDEX_PROGRESS);
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let store: MusicMetadataIndexStore | null = null;
    let destroyed = false;

    function ensureStore(): MusicMetadataIndexStore | null {
        if (!plugin) return null;
        if (!store) store = new MusicMetadataIndexStore(plugin);
        return store;
    }

    async function refreshProgress() {
        const live = getMusicPlayerIndexProgress(blockId);
        if (live && (live.running || live.completedAt || live.total > 0)) {
            if (!destroyed) progress = live;
            return;
        }

        const s = ensureStore();
        if (s && musicFolderPath) {
            const stored = await s.getStoredLibraryProgress(musicFolderPath, scanSubfolders);
            if (!destroyed && stored) {
                progress = stored;
                return;
            }
        }

        if (!destroyed) {
            progress = DEFAULT_MUSIC_METADATA_INDEX_PROGRESS;
        }
    }

    function startProgressTimer() {
        if (progressTimer) return;
        progressTimer = setInterval(() => {
            refreshProgress();
        }, 1000);
    }

    function stopProgressTimer() {
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    }

    $effect(() => {
        if (progress.running) {
            startProgressTimer();
        } else {
            stopProgressTimer();
        }
    });

    onDestroy(() => {
        destroyed = true;
        stopProgressTimer();
    });

    function buildIndexMessage(result: MusicPlayerIndexActionResult, action: "build" | "rebuild"): string {
        if (result.ok === false) {
            switch (result.reason) {
                case "metadata_disabled":
                    return `请先开启“解析元数据”后再${action === "build" ? "建立" : "重建"}索引`;
                case "no_controller":
                    return "请先打开/加载该音乐播放器后再建立索引";
                case "no_music":
                    return "当前没有可索引的音乐文件";
                case "no_store":
                    return "索引存储未就绪，请稍后重试";
            }
        }
        if (result.status === "running") {
            return "音乐索引正在后台进行中";
        }
        if (result.status === "up_to_date") {
            return "当前音乐索引已是最新";
        }
        return action === "build"
            ? "已开始建立音乐索引，将在后台逐步完成"
            : "已开始重建当前音乐文件夹索引";
    }

    function formatIndexTime(ts?: number): string {
        if (!ts) return "--";
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    async function handleBuildIndex() {
        if (indexing) return;
        if (!blockId) {
            showMessage("请先保存并放置音乐播放器后再建立索引");
            return;
        }
        indexing = true;
        try {
            const result = await buildMusicPlayerIndex(blockId);
            refreshProgress();
            showMessage(buildIndexMessage(result, "build"));
        } catch {
            showMessage("建立索引失败，请稍后重试");
        } finally {
            indexing = false;
            refreshProgress();
        }
    }

    async function handleRebuildIndex() {
        if (indexing) return;
        if (!blockId) {
            showMessage("请先保存并放置音乐播放器后再重建索引");
            return;
        }
        indexing = true;
        try {
            const result = await rebuildMusicPlayerIndex(blockId);
            refreshProgress();
            showMessage(buildIndexMessage(result, "rebuild"));
        } catch {
            showMessage("重建索引失败，请稍后重试");
        } finally {
            indexing = false;
            refreshProgress();
        }
    }

    $effect(() => {
        void blockId;
        void musicFolderPath;
        void scanSubfolders;
        refreshProgress();
    });

    async function selectMusicDirectory() {
        try {
            if (!canUseElectronLocalFileSystem()) {
                return showMessage("此功能仅在桌面版可用");
            }
            const { filePaths } = await window
                .require("@electron/remote")
                .dialog.showOpenDialog({
                    properties: ["openDirectory", "createDirectory"],
                });
            if (filePaths && filePaths.length > 0) {
                musicFolderPath = filePaths[0];
            }
        } catch {
            // 静默处理
        }
    }
</script>

<div class="music-player-settings">
    {#if advancedEnabled}
        <SettingSection title="音乐库设置">
            <SettingRow title="音乐路径">
                <div class="file-path-group">
                    <input type="text" bind:value={musicFolderPath} placeholder="请选择音乐文件夹" class="control-full" readonly />
                    <button title="选择音乐文件夹" onclick={selectMusicDirectory} class="file-action-btn">
                        <SiyuanIcon name="folder" size={14} />
                    </button>
                </div>
            </SettingRow>
            <SettingRow title="扫描子文件夹">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={scanSubfolders} />
            </SettingRow>
            <div class="index-actions">
                <p class="index-hint">只索引歌名、歌手、专辑、时长，不索引封面和歌词。索引数据仅保存在本地插件文件中。</p>
                <div class="index-buttons">
                    <button class="b3-button" disabled={indexing || progress.running} onclick={handleBuildIndex}>建立索引</button>
                    <button class="b3-button b3-button--outline" disabled={indexing || progress.running} onclick={handleRebuildIndex}>重建索引</button>
                </div>
                {#if progress.running}
                    <p class="index-status">正在建立索引：已处理 {progress.processed}/{progress.total}，读取到标签 {progress.indexed}，已读取基础信息 {progress.basic}，基础信息不足 {progress.noTag}，失败 {progress.failed}</p>
                {:else if progress.completedAt}
                    <p class="index-status">索引完成：读取到标签 {progress.indexed}，已读取基础信息 {progress.basic}，基础信息不足 {progress.noTag}，失败 {progress.failed}，更新于 {formatIndexTime(progress.completedAt)}</p>
                {:else if progress.lastMessage}
                    <p class="index-status">{progress.lastMessage}</p>
                {:else if blockId}
                    <p class="index-status-placeholder">暂无索引记录，可打开播放器或点击建立索引</p>
                {/if}
            </div>
        </SettingSection>

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
            <SettingRow title="显示右下角迷你播放器">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showFloatingMini} />
            </SettingRow>
            <SettingRow title="解析元数据">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={parseMetadata} />
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
    .index-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .index-hint {
        margin: 0;
        font-size: 0.8rem;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
    }
    .index-buttons {
        display: flex;
        gap: 0.5rem;
    }
    .index-status {
        margin: 0;
        font-size: 0.8rem;
        color: var(--mp-detail-text, var(--b3-theme-on-surface));
        line-height: 1.4;
    }
    .index-status-placeholder {
        margin: 0;
        font-size: 0.8rem;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
    }
</style>
