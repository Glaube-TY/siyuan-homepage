<script lang="ts">
    import { onDestroy } from "svelte";
    import ArrowLeft from "@lucide/svelte/icons/arrow-left";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import Disc3 from "@lucide/svelte/icons/disc-3";
    import Heart from "@lucide/svelte/icons/heart";
    import ListMusic from "@lucide/svelte/icons/list-music";
    import ListPlus from "@lucide/svelte/icons/list-plus";
    import Music from "@lucide/svelte/icons/music";
    import Play from "@lucide/svelte/icons/play";
    import Plus from "@lucide/svelte/icons/plus";
    import Search from "@lucide/svelte/icons/search";
    import Users from "@lucide/svelte/icons/users";
    import type { MusicTrack } from "./musicPlayerTypes";
    import { formatPlaybackTime } from "./musicPlayerUtils";
    import type { SubsonicMusicProvider } from "./subsonic/subsonicProvider";
    import { mapSubsonicSongToTrack } from "./subsonic/subsonicTrack";
    import type { SubsonicAlbum, SubsonicArtist, SubsonicPlaylist } from "./subsonic/subsonicTypes";

    type LibraryScreen =
        | { kind: "root"; title: "音乐库" }
        | { kind: "songs"; title: string }
        | { kind: "favorites"; title: string }
        | { kind: "albums"; title: string; artistId?: string }
        | { kind: "artists"; title: string }
        | { kind: "playlists"; title: string }
        | { kind: "tracks"; title: string; albumId?: string; playlistId?: string }
        | { kind: "search"; title: string };

    interface Props {
        provider: SubsonicMusicProvider;
        currentTrack?: MusicTrack;
        onRegisterTracks: (tracks: MusicTrack[]) => void;
        onPlayTrack: (track: MusicTrack) => void;
        onReplaceQueue: (tracks: MusicTrack[]) => void;
        onAppendQueue: (tracks: MusicTrack[]) => void;
        onBack: () => void;
    }

    let {
        provider,
        currentTrack,
        onRegisterTracks,
        onPlayTrack,
        onReplaceQueue,
        onAppendQueue,
        onBack,
    }: Props = $props();

    let screen = $state<LibraryScreen>({ kind: "root", title: "音乐库" });
    let history = $state<LibraryScreen[]>([]);
    let tracks = $state<MusicTrack[]>([]);
    let albums = $state<SubsonicAlbum[]>([]);
    let artists = $state<SubsonicArtist[]>([]);
    let playlists = $state<SubsonicPlaylist[]>([]);
    let currentPlaylist = $state<SubsonicPlaylist | null>(null);
    let query = $state("");
    let loading = $state(false);
    let error = $state("");
    let offset = $state(0);
    let hasMore = $state(false);
    let playlistEditorId = $state<string | null>(null);
    let playlistName = $state("");
    let deleteConfirmId = $state<string | null>(null);
    let requestEpoch = 0;
    let searchTimer: ReturnType<typeof setTimeout> | null = null;

    const categories = [
        { kind: "songs" as const, label: "全部歌曲", description: "分页浏览服务器曲库", icon: Music },
        { kind: "albums" as const, label: "专辑", description: "按专辑查找音乐", icon: Disc3 },
        { kind: "artists" as const, label: "艺术家", description: "按艺术家逐级浏览", icon: Users },
        { kind: "favorites" as const, label: "收藏", description: "服务器收藏的歌曲", icon: Heart },
        { kind: "playlists" as const, label: "播放列表", description: "管理服务器播放列表", icon: ListMusic },
        { kind: "search" as const, label: "搜索", description: "搜索歌曲、专辑或艺术家", icon: Search },
    ];

    onDestroy(() => {
        requestEpoch += 1;
        if (searchTimer) clearTimeout(searchTimer);
    });

    function resetContent(): void {
        loading = false;
        tracks = [];
        albums = [];
        artists = [];
        currentPlaylist = null;
        error = "";
        offset = 0;
        hasMore = false;
        playlistEditorId = null;
        playlistName = "";
        deleteConfirmId = null;
    }

    async function navigate(next: LibraryScreen): Promise<void> {
        history = [...history, screen];
        screen = next;
        await loadScreen(next);
    }

    async function goBack(): Promise<void> {
        if (history.length === 0) {
            onBack();
            return;
        }
        const nextHistory = [...history];
        const previous = nextHistory.pop() || { kind: "root", title: "音乐库" };
        history = nextHistory;
        screen = previous;
        await loadScreen(previous);
    }

    async function loadScreen(target: LibraryScreen): Promise<void> {
        const epoch = ++requestEpoch;
        resetContent();
        if (target.kind === "root") return;
        if (target.kind === "search") {
            if (query.trim()) scheduleSearch();
            return;
        }
        loading = true;
        try {
            if (target.kind === "songs") {
                const result = await provider.library.getAllSongsPage(0, 50);
                if (epoch !== requestEpoch) return;
                tracks = result;
                onRegisterTracks(result);
                hasMore = result.length === 50;
            } else if (target.kind === "favorites") {
                const result = await provider.library.getStarredSongs();
                if (epoch !== requestEpoch) return;
                tracks = result;
                onRegisterTracks(result);
            } else if (target.kind === "albums") {
                const result = target.artistId
                    ? (await provider.library.getArtist(target.artistId)).album
                    : await provider.library.getAlbumList("alphabeticalByName", 0, 50);
                if (epoch !== requestEpoch) return;
                albums = result;
                hasMore = !target.artistId && result.length === 50;
            } else if (target.kind === "artists") {
                const result = await provider.library.getArtists();
                if (epoch !== requestEpoch) return;
                artists = result;
            } else if (target.kind === "playlists") {
                const result = await provider.library.getPlaylists();
                if (epoch !== requestEpoch) return;
                playlists = result;
            } else if (target.kind === "tracks" && target.albumId) {
                const album = await provider.library.getAlbum(target.albumId);
                if (epoch !== requestEpoch) return;
                tracks = album.song.map((song) => mapSubsonicSongToTrack(song, provider.profile.id));
                onRegisterTracks(tracks);
            } else if (target.kind === "tracks" && target.playlistId) {
                const playlist = await provider.library.getPlaylist(target.playlistId);
                if (epoch !== requestEpoch) return;
                currentPlaylist = playlist;
                tracks = playlist.entry.map((song) => mapSubsonicSongToTrack(song, provider.profile.id));
                onRegisterTracks(tracks);
            }
        } catch (reason) {
            if (epoch === requestEpoch) error = reason instanceof Error ? reason.message : "音乐库加载失败";
        } finally {
            if (epoch === requestEpoch) loading = false;
        }
    }

    async function loadMore(): Promise<void> {
        if (loading || !hasMore) return;
        const epoch = ++requestEpoch;
        const nextOffset = offset + 50;
        loading = true;
        error = "";
        try {
            if (screen.kind === "songs") {
                const result = await provider.library.getAllSongsPage(nextOffset, 50);
                if (epoch !== requestEpoch) return;
                tracks = [...tracks, ...result];
                onRegisterTracks(result);
                offset = nextOffset;
                hasMore = result.length === 50;
            } else if (screen.kind === "albums" && !screen.artistId) {
                const result = await provider.library.getAlbumList("alphabeticalByName", nextOffset, 50);
                if (epoch !== requestEpoch) return;
                albums = [...albums, ...result];
                offset = nextOffset;
                hasMore = result.length === 50;
            }
        } catch (reason) {
            if (epoch === requestEpoch) error = reason instanceof Error ? reason.message : "加载失败";
        } finally {
            if (epoch === requestEpoch) loading = false;
        }
    }

    function scheduleSearch(): void {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const keyword = query.trim();
            const epoch = ++requestEpoch;
            tracks = [];
            albums = [];
            artists = [];
            error = "";
            if (!keyword) {
                loading = false;
                return;
            }
            loading = true;
            try {
                const result = await provider.library.search(keyword, 0, 50);
                if (epoch !== requestEpoch) return;
                tracks = result.songs.map((song) => mapSubsonicSongToTrack(song, provider.profile.id));
                albums = result.albums;
                artists = result.artists;
                onRegisterTracks(tracks);
            } catch (reason) {
                if (epoch === requestEpoch) error = reason instanceof Error ? reason.message : "搜索失败";
            } finally {
                if (epoch === requestEpoch) loading = false;
            }
        }, 300);
    }

    function beginCreatePlaylist(): void {
        playlistEditorId = "__new__";
        playlistName = "";
        deleteConfirmId = null;
    }

    function beginRenamePlaylist(item: SubsonicPlaylist): void {
        playlistEditorId = item.id;
        playlistName = item.name;
        deleteConfirmId = null;
    }

    async function savePlaylistName(): Promise<void> {
        const name = playlistName.trim();
        if (!name || !playlistEditorId || loading) return;
        loading = true;
        error = "";
        try {
            if (playlistEditorId === "__new__") await provider.library.createPlaylist(name);
            else await provider.library.updatePlaylist(playlistEditorId, { name });
            playlistEditorId = null;
            playlistName = "";
            playlists = await provider.library.getPlaylists();
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "播放列表保存失败";
        } finally {
            loading = false;
        }
    }

    async function deletePlaylist(item: SubsonicPlaylist): Promise<void> {
        if (deleteConfirmId !== item.id) {
            deleteConfirmId = item.id;
            playlistEditorId = null;
            return;
        }
        loading = true;
        error = "";
        try {
            await provider.library.deletePlaylist(item.id);
            playlists = await provider.library.getPlaylists();
            deleteConfirmId = null;
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "播放列表删除失败";
        } finally {
            loading = false;
        }
    }

    async function addCurrentToPlaylist(item: SubsonicPlaylist): Promise<void> {
        if (!currentTrack?.sourceTrackId || loading) return;
        loading = true;
        error = "";
        try {
            await provider.library.updatePlaylist(item.id, { songIdsToAdd: [currentTrack.sourceTrackId] });
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "添加歌曲失败";
        } finally {
            loading = false;
        }
    }

    async function removeFromCurrentPlaylist(index: number): Promise<void> {
        if (!currentPlaylist || loading) return;
        loading = true;
        error = "";
        try {
            currentPlaylist = await provider.library.updatePlaylist(currentPlaylist.id, { songIndexesToRemove: [index] });
            tracks = currentPlaylist.entry.map((song) => mapSubsonicSongToTrack(song, provider.profile.id));
            onRegisterTracks(tracks);
        } catch (reason) {
            error = reason instanceof Error ? reason.message : "移除歌曲失败";
        } finally {
            loading = false;
        }
    }
</script>

<section class="mobile-library" aria-label="NAS 音乐库">
    <header class="mobile-library-header">
        <button type="button" class="icon-button" aria-label="返回" onclick={goBack}><ArrowLeft size={22} /></button>
        <div>
            <h2>{screen.title}</h2>
            {#if screen.kind !== "root"}<p>{tracks.length || albums.length || artists.length || playlists.length} 项</p>{/if}
        </div>
    </header>

    {#if screen.kind === "root"}
        <div class="category-list">
            {#each categories as category}
                <button type="button" class="category-row" onclick={() => navigate({ kind: category.kind, title: category.label })}>
                    <span class="category-icon"><category.icon size={22} /></span>
                    <span class="category-copy"><strong>{category.label}</strong><small>{category.description}</small></span>
                    <ChevronRight size={20} />
                </button>
            {/each}
        </div>
    {:else}
        <div class="mobile-library-content">
            {#if screen.kind === "search"}
                <label class="search-box">
                    <Search size={19} />
                    <input bind:value={query} oninput={scheduleSearch} placeholder="搜索歌曲、专辑或艺术家" aria-label="搜索音乐" />
                </label>
            {/if}

            {#if screen.kind === "playlists"}
                <button type="button" class="primary-row-button" onclick={beginCreatePlaylist}><Plus size={18} />新建播放列表</button>
            {/if}

            {#if playlistEditorId}
                <form class="playlist-editor" onsubmit={(event) => { event.preventDefault(); void savePlaylistName(); }}>
                    <input bind:value={playlistName} placeholder="播放列表名称" aria-label="播放列表名称" />
                    <button type="submit" disabled={!playlistName.trim() || loading}>保存</button>
                    <button type="button" onclick={() => playlistEditorId = null}>取消</button>
                </form>
            {/if}

            {#if tracks.length}
                <div class="bulk-actions">
                    <button type="button" onclick={() => onReplaceQueue(tracks)}><Play size={17} fill="currentColor" />播放全部</button>
                    <button type="button" onclick={() => onAppendQueue(tracks)}><ListPlus size={17} />加入队列</button>
                </div>
                <div class="track-list">
                    {#each tracks as track, index}
                        <article class="track-row">
                            <button type="button" class="track-main" onclick={() => onPlayTrack(track)}>
                                <span class="track-index">{index + 1}</span>
                                <span class="track-copy"><strong>{track.title}</strong><small>{track.artist || "未知艺术家"}{track.album ? ` · ${track.album}` : ""}</small></span>
                                <span class="track-duration">{formatPlaybackTime(track.duration, true)}</span>
                            </button>
                            {#if currentPlaylist}
                                <button type="button" class="track-action danger" aria-label="从播放列表移除" onclick={() => removeFromCurrentPlaylist(index)}>×</button>
                            {:else}
                                <button type="button" class="track-action" aria-label="添加到播放队列" onclick={() => onAppendQueue([track])}><Plus size={18} /></button>
                            {/if}
                        </article>
                    {/each}
                </div>
            {/if}

            {#if albums.length}
                <div class="entity-list">
                    {#each albums as album}
                        <button type="button" class="entity-row" onclick={() => navigate({ kind: "tracks", title: album.name, albumId: album.id })}>
                            <span class="entity-icon"><Disc3 size={21} /></span>
                            <span><strong>{album.name}</strong><small>{album.artist || "未知艺术家"}</small></span>
                            <ChevronRight size={19} />
                        </button>
                    {/each}
                </div>
            {/if}

            {#if artists.length}
                <div class="entity-list">
                    {#each artists as artist}
                        <button type="button" class="entity-row" onclick={() => navigate({ kind: "albums", title: artist.name, artistId: artist.id })}>
                            <span class="entity-icon"><Users size={21} /></span>
                            <span><strong>{artist.name}</strong><small>{artist.albumCount || artist.album.length} 张专辑</small></span>
                            <ChevronRight size={19} />
                        </button>
                    {/each}
                </div>
            {/if}

            {#if screen.kind === "playlists" && playlists.length}
                <div class="playlist-list">
                    {#each playlists as item}
                        <article class="playlist-row">
                            <button type="button" class="playlist-main" onclick={() => navigate({ kind: "tracks", title: item.name, playlistId: item.id })}>
                                <span class="entity-icon"><ListMusic size={21} /></span>
                                <span><strong>{item.name}</strong><small>{item.songCount || 0} 首歌曲</small></span>
                                <ChevronRight size={19} />
                            </button>
                            <div class="playlist-actions">
                                <button type="button" disabled={!currentTrack?.sourceTrackId || loading} onclick={() => addCurrentToPlaylist(item)}>加入当前歌曲</button>
                                <button type="button" onclick={() => beginRenamePlaylist(item)}>重命名</button>
                                <button type="button" class:danger={deleteConfirmId === item.id} onclick={() => deletePlaylist(item)}>{deleteConfirmId === item.id ? "确认删除" : "删除"}</button>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}

            {#if hasMore}
                <button type="button" class="load-more" disabled={loading} onclick={loadMore}>{loading ? "正在加载…" : "加载更多"}</button>
            {/if}
            {#if loading && !tracks.length && !albums.length && !artists.length && !playlists.length}<p class="state-message">正在加载…</p>{/if}
            {#if error}<p class="state-message error">{error}</p>{/if}
            {#if !loading && !error && screen.kind !== "search" && !tracks.length && !albums.length && !artists.length && !playlists.length}<p class="state-message">这里还没有内容</p>{/if}
            {#if screen.kind === "search" && query.trim() && !loading && !error && !tracks.length && !albums.length && !artists.length}<p class="state-message">没有找到匹配内容</p>{/if}
        </div>
    {/if}
</section>

<style lang="scss">
    .mobile-library { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; color:var(--mp-detail-text,#f8fafc); }
    .mobile-library-header { display:flex; align-items:center; gap:12px; min-height:56px; padding:8px 14px; flex:none; }
    .mobile-library-header h2 { margin:0; font-size:1.08rem; }
    .mobile-library-header p { margin:2px 0 0; color:var(--mp-detail-muted,rgba(255,255,255,.72)); font-size:.72rem; }
    button, input { font:inherit; }
    button { color:inherit; }
    .icon-button { display:grid; place-items:center; width:42px; height:42px; border:1px solid var(--mp-panel-border,rgba(255,255,255,.16)); border-radius:50%; background:var(--mp-button-bg,rgba(0,0,0,.32)); }
    .category-list, .entity-list, .playlist-list, .track-list { display:flex; flex-direction:column; gap:8px; }
    .category-list { padding:10px 14px 24px; overflow-y:auto; }
    .category-row, .entity-row { display:grid; grid-template-columns:46px minmax(0,1fr) auto; align-items:center; gap:11px; width:100%; min-height:66px; padding:9px 12px; border:1px solid var(--mp-panel-border,rgba(255,255,255,.16)); border-radius:16px; background:var(--mp-panel-bg,rgba(0,0,0,.34)); text-align:left; }
    .category-icon, .entity-icon { display:grid; place-items:center; width:42px; height:42px; border-radius:13px; background:var(--mp-button-bg,rgba(0,0,0,.42)); }
    .category-copy, .entity-row > span:nth-child(2), .playlist-main > span:nth-child(2), .track-copy { min-width:0; display:flex; flex-direction:column; gap:3px; }
    strong, small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    small { color:var(--mp-detail-muted,rgba(255,255,255,.72)); font-size:.76rem; }
    .mobile-library-content { flex:1; min-height:0; overflow-y:auto; padding:8px 14px calc(24px + env(safe-area-inset-bottom)); }
    .search-box { display:flex; align-items:center; gap:9px; min-height:48px; padding:0 13px; margin-bottom:12px; border:1px solid var(--mp-panel-border,rgba(255,255,255,.16)); border-radius:14px; background:var(--mp-panel-bg-strong,rgba(0,0,0,.46)); }
    .search-box input, .playlist-editor input { min-width:0; flex:1; border:0; outline:0; background:transparent; color:inherit; }
    .search-box input::placeholder, .playlist-editor input::placeholder { color:var(--mp-detail-muted,rgba(255,255,255,.64)); }
    .bulk-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:12px; }
    .bulk-actions button, .primary-row-button, .load-more { display:flex; align-items:center; justify-content:center; gap:7px; min-height:44px; padding:8px 12px; border:1px solid var(--mp-button-border,rgba(255,255,255,.18)); border-radius:13px; background:var(--mp-button-bg,rgba(0,0,0,.4)); }
    .track-row, .playlist-row { border-bottom:1px solid var(--mp-panel-border,rgba(255,255,255,.12)); }
    .track-row { display:flex; align-items:center; min-height:60px; }
    .track-main { display:grid; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; gap:8px; flex:1; min-width:0; min-height:58px; padding:6px 4px; border:0; background:transparent; text-align:left; }
    .track-index, .track-duration { color:var(--mp-detail-muted,rgba(255,255,255,.7)); font-size:.75rem; text-align:center; }
    .track-action { display:grid; place-items:center; width:42px; height:42px; flex:none; border:0; border-radius:50%; background:transparent; }
    .track-action.danger { color:#fecaca; }
    .entity-row { min-height:62px; border-radius:14px; }
    .playlist-row { padding:7px 0 10px; }
    .playlist-main { display:grid; grid-template-columns:46px minmax(0,1fr) auto; align-items:center; gap:10px; width:100%; min-height:58px; padding:0; border:0; background:transparent; text-align:left; }
    .playlist-actions { display:flex; flex-wrap:wrap; gap:7px; padding-left:56px; }
    .playlist-actions button, .playlist-editor button { min-height:36px; padding:6px 10px; border:1px solid var(--mp-button-border,rgba(255,255,255,.18)); border-radius:10px; background:var(--mp-button-bg,rgba(0,0,0,.4)); }
    .playlist-actions button.danger { border-color:rgba(248,113,113,.6); color:#fecaca; }
    .primary-row-button { width:100%; margin-bottom:10px; }
    .playlist-editor { display:flex; flex-wrap:wrap; gap:8px; padding:10px; margin-bottom:10px; border-radius:13px; background:var(--mp-panel-bg-strong,rgba(0,0,0,.45)); }
    .playlist-editor input { flex-basis:100%; min-height:42px; padding:0 8px; border-bottom:1px solid var(--mp-panel-border,rgba(255,255,255,.16)); }
    .load-more { margin:16px auto 0; }
    .state-message { padding:28px 12px; text-align:center; color:var(--mp-detail-muted,rgba(255,255,255,.68)); }
    .state-message.error { color:var(--mp-error-text,#fecaca); }
    button:disabled { opacity:.45; }
</style>
