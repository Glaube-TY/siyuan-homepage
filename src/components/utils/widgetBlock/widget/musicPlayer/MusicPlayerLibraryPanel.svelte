<script lang="ts">
    import type {
        MusicTrack,
        MusicPlayerSortMode,
        MusicPlayerSortDirection,
        MusicPlayerViewMode,
        MusicPlaylist,
    } from "./musicPlayerTypes";
    import type { PlaybackStatsTrackEntry } from "./musicPlaybackStatsStore";
    import { getTrackKey } from "./musicPlaybackStatsStore";
    import MusicPlayerPlaylistPanel from "./MusicPlayerPlaylistPanel.svelte";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";
    import { inputDialogSync, confirmDialogBoolean } from "@/libs/dialog";

    interface Props {
        musicFiles: MusicTrack[];
        currentTrackIndex: number;
        playTrack: (index: number) => void;
        onRequestLightMetadata?: (indices: number[]) => void;
        sortMode: MusicPlayerSortMode;
        sortDirection: MusicPlayerSortDirection;
        setSortMode: (mode: MusicPlayerSortMode) => void;
        setSortDirection: (direction: MusicPlayerSortDirection) => void;
        getTrackStats?: (trackKey: string) => PlaybackStatsTrackEntry | undefined;
        viewMode: MusicPlayerViewMode;
        selectedPlaylistId: string | null;
        favoriteTrackKeys: string[];
        playlists: MusicPlaylist[];
        toggleFavoriteTrack: (trackKey: string) => void;
        setViewMode: (mode: MusicPlayerViewMode) => void;
        selectPlaylist: (id: string | null) => void;
        createPlaylist: (name: string) => string | null;
        renamePlaylist: (id: string, name: string) => boolean;
        deletePlaylist: (id: string) => boolean;
        addCurrentTrackToPlaylist: (playlistId: string) => boolean;
        addTrackToPlaylist: (playlistId: string, trackKey: string) => boolean;
        removeTrackFromPlaylist: (playlistId: string, trackKey: string) => boolean;
        exportPlaylistM3U8?: (playlistId: string, pathMode: "absolute" | "relative") => { content: string; missingCount: number } | null;
        importM3U8?: (text: string) => { name: string; trackKeys: string[]; missingCount: number } | null;
        exportLibraryJSON?: () => string;
        importLibraryJSON?: (text: string) => { favoritesCount: number; playlistsCount: number } | null;
        syncLibraryState?: () => void;
        musicFolderPath?: string;
        currentTrack?: MusicTrack;
        statsVersion?: number;
        onVisibleQueueChange?: (indices: number[]) => void;
        activeQueueTrackKeys?: string[];
        onReplaceActiveQueue?: () => void;
        onAppendActiveQueue?: () => void;
        onAppendTrackToActiveQueue?: (originalIndex: number) => void;
        onOpenQueueDialog?: () => void;
    }

    let {
        musicFiles,
        currentTrackIndex,
        playTrack,
        onRequestLightMetadata,
        sortMode,
        sortDirection,
        setSortMode,
        setSortDirection,
        getTrackStats,
        viewMode,
        selectedPlaylistId,
        favoriteTrackKeys,
        playlists,
        toggleFavoriteTrack,
        setViewMode,
        selectPlaylist,
        createPlaylist,
        renamePlaylist,
        deletePlaylist,
        addCurrentTrackToPlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        exportPlaylistM3U8,
        importM3U8,
        exportLibraryJSON,
        importLibraryJSON,
        syncLibraryState,
        currentTrack,
        statsVersion = 0,
        onVisibleQueueChange,
        activeQueueTrackKeys = [],
        onReplaceActiveQueue,
        onAppendActiveQueue,
        onAppendTrackToActiveQueue,
    }: Props = $props();

    let menuOpen = $state(false);
    let downloadAnchor: HTMLAnchorElement | null = $state(null);
    let m3uInput: HTMLInputElement | null = $state(null);
    let jsonInput: HTMLInputElement | null = $state(null);

    const trackKeyToIndex = $derived(new Map(musicFiles.map((t, i) => [getTrackKey(t), i])));
    const currentPlaylist = $derived(playlists.find((p) => p.id === selectedPlaylistId));

    const displayFiles = $derived(getDisplayFiles());

    function getDisplayFiles(): MusicTrack[] {
        if (viewMode === "favorites") {
            return favoriteTrackKeys
                .map((k) => trackKeyToIndex.get(k))
                .filter((i): i is number => i !== undefined)
                .map((i) => musicFiles[i]);
        }
        if (viewMode === "playlists") {
            if (!currentPlaylist) return [];
            return currentPlaylist.trackKeys
                .map((k) => trackKeyToIndex.get(k))
                .filter((i): i is number => i !== undefined)
                .map((i) => musicFiles[i]);
        }
        return musicFiles;
    }

    function handleTabClick(mode: MusicPlayerViewMode) {
        setViewMode(mode);
        if (mode === "playlists" && playlists.length > 0 && !selectedPlaylistId) {
            selectPlaylist(playlists[0].id);
        }
    }

    function handlePlaylistSelect(e: Event) {
        const value = (e.currentTarget as HTMLSelectElement).value;
        selectPlaylist(value || null);
    }

    async function showMessage(message: string) {
        await confirmDialogBoolean({ title: "提示", content: message });
    }

    async function handleCreatePlaylist() {
        const name = await inputDialogSync({
            title: "新建歌单",
            placeholder: "请输入新歌单名称",
            defaultText: "我的歌单",
        });
        if (!name) return;
        const id = createPlaylist(name.trim());
        if (id) {
            setViewMode("playlists");
            selectPlaylist(id);
        }
    }

    async function handleRenamePlaylist() {
        if (!currentPlaylist) return;
        const name = await inputDialogSync({
            title: "重命名歌单",
            placeholder: "请输入新歌单名称",
            defaultText: currentPlaylist.name,
        });
        if (!name) return;
        renamePlaylist(currentPlaylist.id, name.trim());
    }

    async function handleDeletePlaylist() {
        if (!currentPlaylist) return;
        const ok = await confirmDialogBoolean({
            title: "删除歌单",
            content: `确定删除歌单「${currentPlaylist.name}」吗？歌单中的歌曲记录会被移除，但本地音乐文件不会被删除。`,
        });
        if (!ok) return;
        deletePlaylist(currentPlaylist.id);
    }

    function handleAddCurrentToPlaylist() {
        if (!currentPlaylist || !currentTrack) return;
        const ok = addCurrentTrackToPlaylist(currentPlaylist.id);
        if (!ok) {
            // 可能已存在，静默处理
        }
    }

    function handleRemoveFromPlaylist(playlistId: string, trackKey: string) {
        removeTrackFromPlaylist(playlistId, trackKey);
    }

    const TAB_LABELS: Record<MusicPlayerViewMode, string> = {
        all: "全部歌曲",
        favorites: "收藏",
        playlists: "歌单",
    };

    function stripFileExtension(name: string): string {
        const idx = name.lastIndexOf(".");
        return idx > 0 ? name.slice(0, idx) : name;
    }

    function triggerDownload(content: string, fileName: string, mimeType: string) {
        if (!downloadAnchor) return;
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        downloadAnchor.href = url;
        downloadAnchor.download = fileName;
        downloadAnchor.click();
        URL.revokeObjectURL(url);
    }

    async function handleExportM3U8(pathMode: "absolute" | "relative") {
        if (!currentPlaylist || !exportPlaylistM3U8) return;
        const result = exportPlaylistM3U8(currentPlaylist.id, pathMode);
        if (!result) return;
        const safeName = currentPlaylist.name.replace(/[\\/:*?"<>|]/g, "_");
        triggerDownload("\ufeff" + result.content, `${safeName}.m3u8`, "audio/x-mpegurl;charset=utf-8");
        if (result.missingCount > 0) {
            await showMessage(`已导出，但有 ${result.missingCount} 首歌曲在当前音乐库中不存在，已自动跳过。`);
        }
        menuOpen = false;
    }

    async function handleExportJSON() {
        if (!exportLibraryJSON) return;
        const content = exportLibraryJSON();
        const fileName = `music-player-library-${new Date().toISOString().slice(0, 10)}.json`;
        triggerDownload(content, fileName, "application/json;charset=utf-8");
        menuOpen = false;
    }

    async function readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("读取失败"));
            reader.readAsText(file, "UTF-8");
        });
    }

    async function handleImportM3U8(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || !importM3U8) return;
        try {
            const text = await readFileAsText(file);
            const result = importM3U8(text);
            if (!result) {
                await showMessage("未能解析该 M3U 文件。");
                return;
            }
            const playlistName = result.name && result.name !== "导入的歌单" ? result.name : stripFileExtension(file.name);
            const id = createPlaylist(playlistName);
            if (!id) {
                await showMessage("导入失败：无法创建歌单。");
                return;
            }
            for (const trackKey of result.trackKeys) {
                addTrackToPlaylist(id, trackKey);
            }
            setViewMode("playlists");
            selectPlaylist(id);
            syncLibraryState?.();
            if (result.missingCount > 0) {
                await showMessage(`已导入 ${result.trackKeys.length} 首歌曲，${result.missingCount} 首未匹配。`);
            }
        } catch {
            await showMessage("读取文件失败。");
        } finally {
            menuOpen = false;
        }
    }

    async function handleImportJSON(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || !importLibraryJSON || !syncLibraryState) return;
        try {
            const text = await readFileAsText(file);
            const result = importLibraryJSON(text);
            if (!result) {
                await showMessage("JSON 备份格式不正确。");
                return;
            }
            syncLibraryState();
            await showMessage(`已恢复 ${result.playlistsCount} 个歌单、${result.favoritesCount} 条收藏。`);
        } catch {
            await showMessage("读取文件失败。");
        } finally {
            menuOpen = false;
        }
    }

</script>

<div class="music-library-panel">
    <div class="library-tabs">
        {#each Object.entries(TAB_LABELS) as [mode, label]}
            <button
                class="library-tab"
                class:is-active={viewMode === mode}
                onclick={() => handleTabClick(mode as MusicPlayerViewMode)}
            >
                {label}
            </button>
        {/each}
    </div>

    {#if viewMode === "playlists"}
        <div class="playlist-manager">
            <select class="playlist-select" value={selectedPlaylistId ?? ""} onchange={handlePlaylistSelect}>
                {#if playlists.length === 0}
                    <option value="">暂无歌单</option>
                {/if}
                {#each playlists as playlist (playlist.id)}
                    <option value={playlist.id}>{playlist.name} ({playlist.trackKeys.length})</option>
                {/each}
            </select>
            <div class="playlist-actions">
                <button class="playlist-action" onclick={handleCreatePlaylist} title="新建歌单"><MusicPlayerIcon name="add" size={16} /></button>
                {#if currentPlaylist}
                    <button class="playlist-action" onclick={handleRenamePlaylist} title="重命名"><MusicPlayerIcon name="edit" size={16} /></button>
                    <button class="playlist-action" onclick={handleDeletePlaylist} title="删除"><MusicPlayerIcon name="trash" size={16} /></button>
                    <button class="playlist-action" onclick={handleAddCurrentToPlaylist} title="将当前歌曲加入歌单" disabled={!currentTrack}>
                        <MusicPlayerIcon name="queueAdd" size={16} />
                    </button>
                {/if}
            </div>
            <div class="playlist-menu-wrap">
                <button
                    class="playlist-action"
                    class:is-active={menuOpen}
                    onclick={() => (menuOpen = !menuOpen)}
                    title="导入/导出"
                >
                    <MusicPlayerIcon name="more" size={16} />
                </button>
                {#if menuOpen}
                    <div class="playlist-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
                        <button class="playlist-menu-item" onclick={() => handleExportM3U8("absolute")}>
                            导出为 M3U8（绝对路径）
                        </button>
                        <button class="playlist-menu-item" onclick={() => handleExportM3U8("relative")}>
                            导出为 M3U8（相对路径）
                        </button>
                        <button class="playlist-menu-item" onclick={() => m3uInput?.click()}>
                            从 M3U8 导入
                        </button>
                        <button class="playlist-menu-item" onclick={handleExportJSON}>
                            导出为 JSON（插件备份）
                        </button>
                        <button class="playlist-menu-item" onclick={() => jsonInput?.click()}>
                            从 JSON 导入
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <a bind:this={downloadAnchor} class="hidden-download" aria-hidden="true" href="data:text/plain,"></a>
    <input bind:this={m3uInput} type="file" accept=".m3u,.m3u8" class="hidden-file-input" onchange={handleImportM3U8} />
    <input bind:this={jsonInput} type="file" accept=".json" class="hidden-file-input" onchange={handleImportJSON} />

    <div class="library-list">
        <MusicPlayerPlaylistPanel
            {musicFiles}
            {displayFiles}
            {currentTrackIndex}
            {playTrack}
            {onRequestLightMetadata}
            {sortMode}
            {sortDirection}
            {setSortMode}
            {setSortDirection}
            {getTrackStats}
            {favoriteTrackKeys}
            onToggleFavorite={toggleFavoriteTrack}
            {viewMode}
            {selectedPlaylistId}
            onRemoveFromPlaylist={viewMode === "playlists" ? handleRemoveFromPlaylist : undefined}
            {statsVersion}
            {onVisibleQueueChange}
            {activeQueueTrackKeys}
            {onReplaceActiveQueue}
            {onAppendActiveQueue}
            {onAppendTrackToActiveQueue}
        />
    </div>
</div>

<style lang="scss">
    .music-library-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;

        .library-tabs {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 0.35rem;
            margin-bottom: 0.75rem;
        }

        .library-tab {
            flex: 1;
            padding: 0.55rem 0.5rem;
            border: 1px solid transparent;
            border-radius: 12px;
            background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent));
            color: var(--mp-detail-text, var(--b3-theme-on-surface));
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

            &:hover {
                background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
            }

            &.is-active {
                background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
                border-color: var(--mp-panel-border, var(--b3-border-color));
                font-weight: 600;
            }
        }

        .playlist-manager {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.75rem;

            .playlist-select {
                flex: 1;
                min-width: 0;
                padding: 0.55rem 0.6rem;
                border: 1px solid transparent;
                border-radius: 10px;
                background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent));
                color: var(--mp-detail-text, var(--b3-theme-on-surface));
                font-size: 0.8rem;
                cursor: pointer;

                &:focus {
                    outline: none;
                    background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
                    border-color: var(--mp-panel-border, var(--b3-border-color));
                }
            }

            .playlist-actions {
                flex-shrink: 0;
                display: flex;
                align-items: center;
                gap: 0.35rem;
            }

            .playlist-action {
                width: 2rem;
                height: 2rem;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid transparent;
                border-radius: 10px;
                background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent));
                color: var(--mp-detail-text, var(--b3-theme-on-surface));
                font-size: 0.85rem;
                cursor: pointer;
                transition: background 0.15s ease, border-color 0.15s ease;

                &:hover:not(:disabled) {
                    background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
                    border-color: var(--mp-panel-border, var(--b3-border-color));
                }

                &:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
            }
        }

        .library-list {
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        .playlist-menu-wrap {
            position: relative;
            flex-shrink: 0;

            .playlist-action.is-active {
                background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
                border-color: var(--mp-panel-border, var(--b3-border-color));
            }
        }

        .playlist-menu {
            position: absolute;
            top: calc(100% + 0.35rem);
            right: 0;
            min-width: 12rem;
            padding: 0.35rem;
            border: 1px solid var(--mp-panel-border, var(--b3-border-color));
            border-radius: 12px;
            background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent));
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
            z-index: 10;
        }

        .playlist-menu-item {
            width: 100%;
            padding: 0.55rem 0.7rem;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: var(--mp-detail-text, var(--b3-theme-on-surface));
            font-size: 0.8rem;
            text-align: left;
            cursor: pointer;
            transition: background 0.15s ease;

            &:hover {
                background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
            }
        }

        .hidden-download,
        .hidden-file-input {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
    }
</style>
