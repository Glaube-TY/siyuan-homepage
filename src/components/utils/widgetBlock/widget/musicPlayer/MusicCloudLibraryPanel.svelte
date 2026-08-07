<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { MusicTrack } from "./musicPlayerTypes";
    import type { SubsonicMusicProvider } from "./subsonic/subsonicProvider";
    import type { SubsonicAlbum, SubsonicArtist, SubsonicPlaylist } from "./subsonic/subsonicTypes";
    import { mapSubsonicSongToTrack } from "./subsonic/subsonicTrack";
    import { formatPlaybackTime } from "./musicPlayerUtils";

    type Tab = "songs" | "albums" | "artists" | "favorites" | "playlists" | "search";
    interface Props {
        provider: SubsonicMusicProvider;
        currentTrack?: MusicTrack;
        onRegisterTracks: (tracks: MusicTrack[]) => void;
        onPlayTrack: (track: MusicTrack) => void;
        onReplaceQueue: (tracks: MusicTrack[]) => void;
        onAppendQueue: (tracks: MusicTrack[]) => void;
    }
    let { provider, currentTrack, onRegisterTracks, onPlayTrack, onReplaceQueue, onAppendQueue }: Props = $props();
    let tab = $state<Tab>("songs");
    let loading = $state(false);
    let error = $state("");
    let tracks = $state<MusicTrack[]>([]);
    let albums = $state<SubsonicAlbum[]>([]);
    let artists = $state<SubsonicArtist[]>([]);
    let playlists = $state<SubsonicPlaylist[]>([]);
    let selectedPlaylist = $state<SubsonicPlaylist | null>(null);
    let query = $state("");
    let offset = $state(0);
    let hasMoreSongs = $state(true);
    let hasMoreAlbums = $state(true);
    let playlistEditorId = $state<string | null>(null);
    let playlistName = $state("");
    let deleteConfirmId = $state<string | null>(null);
    let requestEpoch = 0;
    let searchTimer: ReturnType<typeof setTimeout> | null = null;

    onMount(() => {
        void loadTab("songs");
    });
    onDestroy(() => { requestEpoch += 1; if (searchTimer) clearTimeout(searchTimer); });

    async function loadTab(next: Tab) {
        tab = next; error = ""; selectedPlaylist = null; offset = 0;
        hasMoreSongs = true; hasMoreAlbums = true; playlistEditorId = null; deleteConfirmId = null;
        tracks = []; albums = []; artists = [];
        if (next === "playlists") playlists = [];
        const epoch = ++requestEpoch; loading = true;
        try {
            if (next === "songs") {
                const result = await provider.library.getAllSongsPage(0, 50);
                if (epoch === requestEpoch) { tracks = result; onRegisterTracks(result); hasMoreSongs = result.length === 50; }
            } else if (next === "albums") {
                const result = await provider.library.getAlbumList("alphabeticalByName", 0, 50);
                if (epoch === requestEpoch) { albums = result; hasMoreAlbums = result.length === 50; }
            } else if (next === "artists") {
                const result = await provider.library.getArtists();
                if (epoch === requestEpoch) artists = result;
            } else if (next === "favorites") {
                const result = await provider.library.getStarredSongs();
                if (epoch === requestEpoch) { tracks = result; onRegisterTracks(result); }
            } else if (next === "playlists") {
                const result = await provider.library.getPlaylists();
                if (epoch === requestEpoch) playlists = result;
            }
        } catch (e) { if (epoch === requestEpoch) error = e instanceof Error ? e.message : "音乐库加载失败"; }
        finally { if (epoch === requestEpoch) loading = false; }
    }

    async function loadMoreSongs() {
        const epoch = ++requestEpoch; const nextOffset = offset + 50; loading = true; error = "";
        try { const next = await provider.library.getAllSongsPage(nextOffset, 50); if (epoch === requestEpoch) { tracks = [...tracks, ...next]; onRegisterTracks(next); offset = nextOffset; hasMoreSongs = next.length === 50; } }
        catch (e) { if (epoch === requestEpoch) error = e instanceof Error ? e.message : "加载失败"; }
        finally { if (epoch === requestEpoch) loading = false; }
    }
    async function loadMoreAlbums() {
        const epoch = ++requestEpoch; const nextOffset = offset + 50; loading = true; error = "";
        try { const next = await provider.library.getAlbumList("alphabeticalByName", nextOffset, 50); if (epoch === requestEpoch) { albums = [...albums, ...next]; offset = nextOffset; hasMoreAlbums = next.length === 50; } }
        catch (e) { if (epoch === requestEpoch) error = e instanceof Error ? e.message : "加载失败"; }
        finally { if (epoch === requestEpoch) loading = false; }
    }
    async function openAlbum(album: SubsonicAlbum) { const epoch = ++requestEpoch; loading = true; error = ""; try { const full = await provider.library.getAlbum(album.id); if (epoch === requestEpoch) { tracks = full.song.map((song) => mapSubsonicSongToTrack(song, provider.profile.id)); onRegisterTracks(tracks); tab = "songs"; hasMoreSongs = false; } } catch (e) { if (epoch === requestEpoch) error = e instanceof Error ? e.message : "专辑加载失败"; } finally { if (epoch === requestEpoch) loading = false; } }
    async function openArtist(artist: SubsonicArtist) { const epoch = ++requestEpoch; loading = true; error = ""; try { const full = await provider.library.getArtist(artist.id); if (epoch === requestEpoch) { albums = full.album; tab = "albums"; hasMoreAlbums = false; } } catch (e) { if (epoch === requestEpoch) error = e instanceof Error ? e.message : "艺术家加载失败"; } finally { if (epoch === requestEpoch) loading = false; } }
    async function openPlaylist(item: SubsonicPlaylist) { const epoch = ++requestEpoch; loading = true; error = ""; try { const result = await provider.library.getPlaylist(item.id); if (epoch === requestEpoch) { selectedPlaylist = result; tracks = result.entry.map((song) => mapSubsonicSongToTrack(song, provider.profile.id)); onRegisterTracks(tracks); } } catch (e) { if (epoch === requestEpoch) error = e instanceof Error ? e.message : "播放列表加载失败"; } finally { if (epoch === requestEpoch) loading = false; } }

    function scheduleSearch() {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const epoch = ++requestEpoch; loading = true; error = "";
            try { const result = await provider.library.search(query.trim(), 0, 50); if (epoch === requestEpoch) { tracks = result.songs.map((s) => mapSubsonicSongToTrack(s, provider.profile.id)); onRegisterTracks(tracks); albums = result.albums; artists = result.artists; } }
            catch (e) { if (epoch === requestEpoch) error = e instanceof Error ? e.message : "搜索失败"; }
            finally { if (epoch === requestEpoch) loading = false; }
        }, 300);
    }

    function beginCreatePlaylist() { playlistEditorId = "__new__"; playlistName = ""; deleteConfirmId = null; }
    function beginRenamePlaylist(item: SubsonicPlaylist) { playlistEditorId = item.id; playlistName = item.name; deleteConfirmId = null; }
    async function savePlaylistName() {
        const name = playlistName.trim(); if (!name || !playlistEditorId || loading) return;
        loading = true; error = "";
        try {
            if (playlistEditorId === "__new__") await provider.library.createPlaylist(name);
            else await provider.library.updatePlaylist(playlistEditorId, { name });
            playlists = await provider.library.getPlaylists(); playlistEditorId = null; playlistName = "";
        } catch (e) { error = e instanceof Error ? e.message : "播放列表保存失败"; }
        finally { loading = false; }
    }
    async function deletePlaylist(item: SubsonicPlaylist) {
        if (deleteConfirmId !== item.id) { deleteConfirmId = item.id; playlistEditorId = null; return; }
        loading = true; error = "";
        try { await provider.library.deletePlaylist(item.id); playlists = await provider.library.getPlaylists(); selectedPlaylist = null; deleteConfirmId = null; }
        catch (e) { error = e instanceof Error ? e.message : "播放列表删除失败"; }
        finally { loading = false; }
    }
    async function addCurrentToPlaylist(item: SubsonicPlaylist) { if (!currentTrack?.sourceTrackId || loading) return; loading = true; error = ""; try { await provider.library.updatePlaylist(item.id, { songIdsToAdd: [currentTrack.sourceTrackId] }); await openPlaylist(item); } catch (e) { error = e instanceof Error ? e.message : "添加歌曲失败"; } finally { loading = false; } }
    async function removeFromPlaylist(index: number) { if (!selectedPlaylist || loading) return; loading = true; error = ""; try { selectedPlaylist = await provider.library.updatePlaylist(selectedPlaylist.id, { songIndexesToRemove: [index] }); tracks = selectedPlaylist.entry.map((song) => mapSubsonicSongToTrack(song, provider.profile.id)); onRegisterTracks(tracks); } catch (e) { error = e instanceof Error ? e.message : "移除歌曲失败"; } finally { loading = false; } }
</script>

<div class="cloud-library">
    <nav>{#each [["songs","歌曲"],["albums","专辑"],["artists","艺术家"],["favorites","收藏"],["playlists","播放列表"],["search","搜索"]] as item}<button class:active={tab === item[0]} onclick={() => loadTab(item[0] as Tab)}>{item[1]}</button>{/each}</nav>
    {#if tab === "search"}<input class="search" bind:value={query} oninput={scheduleSearch} placeholder="搜索歌曲、专辑或艺术家" />{/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if tab === "search"}
        {#if tracks.length}<h4>歌曲</h4><div class="queue-actions"><button onclick={() => onReplaceQueue(tracks)}>播放全部</button><button onclick={() => onAppendQueue(tracks)}>添加到队列</button></div><div class="items search-results">{#each tracks as track}<div class="track"><button class="main" onclick={() => onPlayTrack(track)}><strong>{track.title}</strong><span>{track.artist || "未知艺术家"} · {track.album || "未知专辑"}</span></button><span>{formatPlaybackTime(track.duration, true)}</span></div>{/each}</div>{/if}
        {#if albums.length}<h4>专辑</h4><div class="cards search-results">{#each albums as album}<button onclick={() => openAlbum(album)}><strong>{album.name}</strong><span>{album.artist || "未知艺术家"}</span></button>{/each}</div>{/if}
        {#if artists.length}<h4>艺术家</h4><div class="cards search-results">{#each artists as artist}<button onclick={() => openArtist(artist)}><strong>{artist.name}</strong><span>{artist.albumCount || artist.album.length} 张专辑</span></button>{/each}</div>{/if}
        {#if !loading && !tracks.length && !albums.length && !artists.length}<p class="empty">没有匹配的歌曲、专辑或艺术家</p>{/if}
    {:else if (tab === "songs" || tab === "favorites" || selectedPlaylist) && tracks.length}
        <div class="queue-actions"><button onclick={() => onReplaceQueue(tracks)}>播放全部</button><button onclick={() => onAppendQueue(tracks)}>添加到队列</button></div>
        <div class="items">{#each tracks as track, index}<div class="track"><button class="main" onclick={() => onPlayTrack(track)}><strong>{track.title}</strong><span>{track.artist || "未知艺术家"} · {track.album || "未知专辑"}</span></button><span>{formatPlaybackTime(track.duration, true)}</span>{#if selectedPlaylist}<button title="从播放列表移除" onclick={() => removeFromPlaylist(index)}>×</button>{/if}</div>{/each}</div>
        {#if tab === "songs" && !selectedPlaylist && hasMoreSongs}<button class="more" disabled={loading} onclick={loadMoreSongs}>加载更多</button>{/if}
    {:else if tab === "albums"}
        <div class="cards">{#each albums as album}<button onclick={() => openAlbum(album)}><strong>{album.name}</strong><span>{album.artist || "未知艺术家"}</span></button>{/each}</div>
        {#if hasMoreAlbums}<button class="more" disabled={loading} onclick={loadMoreAlbums}>加载更多</button>{/if}
    {:else if tab === "artists"}
        <div class="cards">{#each artists as artist}<button onclick={() => openArtist(artist)}><strong>{artist.name}</strong><span>{artist.albumCount || artist.album.length} 张专辑</span></button>{/each}</div>
    {:else if tab === "playlists"}
        <div class="queue-actions"><button onclick={beginCreatePlaylist}>新建播放列表</button></div>
        {#if playlistEditorId}<form class="playlist-editor" onsubmit={(event) => { event.preventDefault(); void savePlaylistName(); }}><input bind:value={playlistName} placeholder="播放列表名称" aria-label="播放列表名称" /><button type="submit" disabled={!playlistName.trim() || loading}>保存</button><button type="button" onclick={() => playlistEditorId = null}>取消</button></form>{/if}
        <div class="items">{#each playlists as item}<div class="track"><button class="main" onclick={() => openPlaylist(item)}><strong>{item.name}</strong><span>{item.songCount || 0} 首</span></button><button onclick={() => addCurrentToPlaylist(item)} disabled={!currentTrack?.sourceTrackId || loading}>＋当前</button><button onclick={() => beginRenamePlaylist(item)}>重命名</button><button class:danger={deleteConfirmId === item.id} onclick={() => deletePlaylist(item)}>{deleteConfirmId === item.id ? "确认删除" : "删除"}</button></div>{/each}</div>
    {:else if !loading}<p class="empty">没有可显示的内容</p>{/if}
    {#if loading}<p class="empty">正在加载…</p>{/if}
</div>

<style lang="scss">
    .cloud-library {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        gap: 0.6rem;
        color: var(--mp-detail-text, var(--b3-theme-on-surface));
    }

    nav,
    .queue-actions,
    .playlist-editor {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
    }

    button {
        border: 1px solid var(--mp-button-border, var(--b3-border-color));
        border-radius: 6px;
        padding: 0.35rem 0.55rem;
        background: var(--mp-button-bg, var(--b3-theme-surface));
        color: var(--mp-detail-text, var(--b3-theme-on-surface));
        cursor: pointer;
    }

    button:hover {
        border-color: var(--mp-button-hover-border, var(--b3-theme-primary));
        background: var(--mp-button-hover-bg, var(--b3-theme-primary));
        color: var(--mp-button-hover-text, var(--b3-theme-on-primary));
    }

    button.danger {
        border-color: color-mix(in srgb, #ef4444 55%, transparent);
        background: color-mix(in srgb, #7f1d1d 52%, var(--mp-panel-bg-strong, transparent));
        color: var(--mp-detail-text, var(--b3-card-error-color, #dc2626));
    }

    nav button.active {
        border-color: var(--mp-active-bg, var(--b3-theme-primary));
        background: var(--mp-active-bg, var(--b3-theme-primary));
        color: var(--mp-active-text, var(--b3-theme-on-primary));
    }

    .search,
    .playlist-editor input {
        padding: 0.5rem;
        border: 1px solid var(--mp-panel-border, var(--b3-border-color));
        border-radius: 6px;
        background: var(--mp-panel-bg-strong, var(--b3-theme-background));
        color: var(--mp-detail-text, var(--b3-theme-on-surface));
    }

    .search::placeholder,
    .playlist-editor input::placeholder {
        color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));
        opacity: 1;
    }

    .playlist-editor input {
        flex: 1;
        min-width: 10rem;
    }

    .items {
        overflow: auto;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .track {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem;
        border-bottom: 1px solid var(--mp-panel-border, var(--b3-border-color));
    }

    .track .main {
        display: flex;
        flex: 1;
        min-width: 0;
        flex-direction: column;
        align-items: flex-start;
        border-color: transparent;
        background: transparent;
        text-align: left;
    }

    .track .main:hover {
        border-color: transparent;
        background: var(--mp-panel-highlight, transparent);
        color: var(--mp-detail-text, var(--b3-theme-on-surface));
    }

    .track strong,
    .track span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .track span,
    .cards span {
        color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));
        font-size: 0.76rem;
    }

    .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 0.5rem;
        overflow: auto;
    }

    .cards button {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-align: left;
    }

    .search-results {
        max-height: 13rem;
        flex: none;
    }

    h4 {
        margin: 0.1rem 0;
        font-size: 0.85rem;
    }

    .error {
        color: var(--mp-error-text, var(--b3-card-error-color, #dc2626));
    }

    .empty {
        text-align: center;
        opacity: 0.72;
    }

    .more {
        align-self: center;
    }
</style>
