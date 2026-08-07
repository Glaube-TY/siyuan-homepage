<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import ArrowLeft from "@lucide/svelte/icons/arrow-left";
    import Globe2 from "@lucide/svelte/icons/globe-2";
    import Laptop from "@lucide/svelte/icons/laptop";
    import Server from "@lucide/svelte/icons/server";
    import X from "@lucide/svelte/icons/x";
    import type { MusicPlayerActions, MusicPlayerVmStore, MusicTrack } from "./musicPlayerTypes";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";
    import MusicPlayerLyricsPanel from "./MusicPlayerLyricsPanel.svelte";
    import MusicCloudMobileLibrary from "./MusicCloudMobileLibrary.svelte";
    import { formatPlaybackTime } from "./musicPlayerUtils";
    import { getTrackKey } from "./musicPlaybackStatsStore";
    import type { SubsonicMusicProvider } from "./subsonic/subsonicProvider";
    import type { SubsonicEndpointState } from "./subsonic/subsonicEndpointManager";

    type MobilePlayerPage = "now" | "lyrics" | "library" | "queue";

    interface Props {
        vmStore: MusicPlayerVmStore;
        actions: MusicPlayerActions;
        provider: SubsonicMusicProvider;
        onClose: () => void;
        onRegisterTracks: (tracks: MusicTrack[]) => void;
        onPlayCloudTrack: (track: MusicTrack) => void;
        onReplaceCloudQueue: (tracks: MusicTrack[]) => void;
        onAppendCloudQueue: (tracks: MusicTrack[]) => void;
    }

    let {
        vmStore,
        actions,
        provider,
        onClose,
        onRegisterTracks,
        onPlayCloudTrack,
        onReplaceCloudQueue,
        onAppendCloudQueue,
    }: Props = $props();

    const vm = $derived($vmStore);
    const currentTrack = $derived(vm.musicFiles[vm.currentTrackIndex]);
    const progressPercent = $derived(vm.duration > 0 ? Math.max(0, Math.min(100, vm.currentTime / vm.duration * 100)) : 0);
    const currentFavorite = $derived(!!currentTrack && vm.favoriteTrackKeys.includes(getTrackKey(currentTrack)));
    const queueTracks = $derived(vm.activeQueueTrackKeys
        .map((key) => vm.musicFiles.find((track) => getTrackKey(track) === key))
        .filter((track): track is MusicTrack => !!track));
    let page = $state<MobilePlayerPage>("now");
    let endpointState = $state<SubsonicEndpointState | null>(null);
    let unsubscribeEndpoint: (() => void) | null = null;

    const activeHealth = $derived(endpointState?.activeKind ? endpointState[endpointState.activeKind] : null);
    const pageTitle = $derived(page === "lyrics" ? "歌词" : page === "library" ? "音乐库" : page === "queue" ? "播放队列" : "正在播放");

    onMount(() => {
        unsubscribeEndpoint = provider.endpointManager.subscribe((state) => {
            endpointState = state;
        });
    });

    onDestroy(() => {
        unsubscribeEndpoint?.();
        unsubscribeEndpoint = null;
    });

    function formatServerName(serverType: string): string {
        const name = serverType.trim();
        return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : "Subsonic";
    }

    function goTo(next: MobilePlayerPage): void {
        page = next;
    }

    function goBackToNow(): void {
        page = "now";
    }

    function handleSeek(event: Event): void {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        if (!Number.isFinite(value) || vm.duration <= 0) return;
        actions.seekTo(value / 100 * vm.duration);
    }

    function playModeTitle(): string {
        if (vm.playMode === "repeat") return "单曲循环";
        if (vm.playMode === "shuffle") return "随机播放";
        return "顺序播放";
    }
</script>

<div
    class="mobile-player-page"
    class:has-cover={!!currentTrack?.coverObjectUrl}
    style={currentTrack?.coverObjectUrl ? `--mobile-cover-url: url(${currentTrack.coverObjectUrl})` : ""}
>
    <div class="mobile-player-backdrop" aria-hidden="true"></div>
    <div class="mobile-player-shade" aria-hidden="true"></div>

    {#if page === "now"}
        <header class="mobile-now-header">
            <div class="mobile-title-copy">
                <span>正在播放</span>
                <strong>{currentTrack?.title || "NAS 音乐"}</strong>
            </div>
            <div class="mobile-connection" aria-label="NAS 连接状态">
                {#if endpointState?.activeKind === "local"}
                    <span class="active local"><Laptop size={13} />本地</span>
                {:else if endpointState?.activeKind === "remote"}
                    <span class="active remote"><Globe2 size={13} />远程</span>
                {:else}
                    <span class="offline">离线</span>
                {/if}
                {#if activeHealth?.serverType}<span><Server size={13} />{formatServerName(activeHealth.serverType)}</span>{/if}
            </div>
            <button type="button" class="header-icon" aria-label="关闭播放器" onclick={onClose}><X size={23} /></button>
        </header>
    {:else}
        <button type="button" class="floating-close" aria-label="关闭播放器" onclick={onClose}><X size={22} /></button>
    {/if}

    <main class="mobile-player-main" class:subpage={page !== "now"}>
        {#if page === "now"}
            <section class="now-playing-view">
                <div class="mobile-cover">
                    {#if currentTrack?.coverObjectUrl}
                        <img src={currentTrack.coverObjectUrl} alt="专辑封面" />
                    {:else}
                        <MusicPlayerIcon name="musicNote" size={88} />
                    {/if}
                </div>
                <div class="mobile-track-meta">
                    <h1>{currentTrack?.title || "暂无歌曲"}</h1>
                    <p>{currentTrack?.artist || "未知艺术家"}</p>
                    <small>{currentTrack?.album || "未知专辑"}</small>
                </div>
                <div class="mobile-primary-actions">
                    <button type="button" class:active={currentFavorite} onclick={actions.toggleFavorite}>
                        <MusicPlayerIcon name={currentFavorite ? "heartFilled" : "heart"} size={21} />
                        {currentFavorite ? "已收藏" : "收藏"}
                    </button>
                    <button type="button" onclick={() => goTo("lyrics")}><MusicPlayerIcon name="lyrics" size={21} />歌词</button>
                    <button type="button" onclick={() => goTo("library")}><MusicPlayerIcon name="listMusic" size={21} />音乐库</button>
                    <button type="button" onclick={() => goTo("queue")}><MusicPlayerIcon name="queue" size={21} />队列 {vm.activeQueueCount}</button>
                </div>
                {#if vm.errorMessage}<p class="mobile-player-error">{vm.errorMessage}</p>{/if}
            </section>
        {:else if page === "lyrics"}
            <section class="simple-subpage">
                <header class="subpage-header">
                    <button type="button" class="header-icon" aria-label="返回正在播放" onclick={goBackToNow}><ArrowLeft size={23} /></button>
                    <div><h2>{pageTitle}</h2><p>{currentTrack?.title || "暂无歌曲"}</p></div>
                </header>
                <div class="mobile-lyrics">
                    <MusicPlayerLyricsPanel
                        lyrics={currentTrack?.lyrics || []}
                        unsyncedLyricsText={currentTrack?.unsyncedLyricsText}
                        currentTime={vm.currentTime}
                        lyricsStatus={currentTrack?.lyricsStatus || "none"}
                    />
                </div>
            </section>
        {:else if page === "library"}
            <MusicCloudMobileLibrary
                {provider}
                {currentTrack}
                {onRegisterTracks}
                onPlayTrack={onPlayCloudTrack}
                onReplaceQueue={onReplaceCloudQueue}
                onAppendQueue={onAppendCloudQueue}
                onBack={goBackToNow}
            />
        {:else}
            <section class="simple-subpage">
                <header class="subpage-header">
                    <button type="button" class="header-icon" aria-label="返回正在播放" onclick={goBackToNow}><ArrowLeft size={23} /></button>
                    <div><h2>{pageTitle}</h2><p>{queueTracks.length} 首歌曲</p></div>
                    {#if queueTracks.length}<button type="button" class="clear-queue" onclick={actions.clearActiveQueue}>清空</button>{/if}
                </header>
                <div class="mobile-queue-list">
                    {#each queueTracks as track, index}
                        <article class:current={currentTrack && getTrackKey(currentTrack) === getTrackKey(track)}>
                            <button type="button" class="queue-main" onclick={() => actions.playTrackByKey(getTrackKey(track))}>
                                <span>{index + 1}</span>
                                <span><strong>{track.title}</strong><small>{track.artist || "未知艺术家"}</small></span>
                            </button>
                            <button type="button" class="queue-remove" aria-label="从队列移除" onclick={() => actions.removeTrackFromActiveQueue(getTrackKey(track))}>×</button>
                        </article>
                    {:else}
                        <p class="empty-queue">播放队列为空，可以从音乐库添加歌曲。</p>
                    {/each}
                </div>
            </section>
        {/if}
    </main>

    {#if page !== "now"}
        <button type="button" class="now-playing-mini" onclick={goBackToNow}>
            <span class="mini-cover">
                {#if currentTrack?.coverObjectUrl}<img src={currentTrack.coverObjectUrl} alt="" />{:else}<MusicPlayerIcon name="musicNote" size={23} />{/if}
            </span>
            <span class="mini-copy"><strong>{currentTrack?.title || "暂无歌曲"}</strong><small>{currentTrack?.artist || "未知艺术家"}</small></span>
            <span class="mini-state">{vm.isPlaying ? "正在播放" : "已暂停"}</span>
        </button>
    {/if}

    <footer class="mobile-player-controls">
        <input
            class="mobile-progress"
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progressPercent}
            aria-label="播放进度"
            oninput={handleSeek}
            style={`--mobile-progress: ${progressPercent}%`}
        />
        <div class="mobile-time"><span>{formatPlaybackTime(vm.currentTime)}</span><span>{formatPlaybackTime(vm.duration)}</span></div>
        <div class="transport-controls">
            <button type="button" title={playModeTitle()} aria-label={playModeTitle()} onclick={actions.togglePlayMode}>
                <MusicPlayerIcon name={vm.playMode === "shuffle" ? "shuffle" : vm.playMode === "repeat" ? "repeatOne" : "repeat"} size={22} />
            </button>
            <button type="button" aria-label="上一首" onclick={actions.prevTrack}><MusicPlayerIcon name="previous" size={28} /></button>
            <button type="button" class="play-toggle" aria-label={vm.isPlaying ? "暂停" : "播放"} onclick={actions.togglePlay}>
                <MusicPlayerIcon name={vm.isPlaying ? "pause" : "play"} size={31} />
            </button>
            <button type="button" aria-label="下一首" onclick={actions.nextTrack}><MusicPlayerIcon name="next" size={28} /></button>
            <button type="button" aria-label="播放队列" onclick={() => goTo("queue")}>
                <MusicPlayerIcon name="queue" size={23} />
                {#if vm.activeQueueCount}<span class="queue-badge">{vm.activeQueueCount}</span>{/if}
            </button>
        </div>
    </footer>
</div>

<style lang="scss">
    .mobile-player-page {
        --mp-detail-text:#f8fafc; --mp-detail-muted:rgba(248,250,252,.72); --mp-panel-bg:rgba(7,10,14,.44); --mp-panel-bg-strong:rgba(7,10,14,.64); --mp-panel-border:rgba(255,255,255,.16); --mp-button-bg:rgba(7,10,14,.52); --mp-button-border:rgba(255,255,255,.2); --mp-error-text:#fecaca;
        position:relative; isolation:isolate; display:flex; flex-direction:column; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; background:#111827; color:var(--mp-detail-text); padding-top:env(safe-area-inset-top); box-sizing:border-box;
    }
    .mobile-player-backdrop { position:absolute; inset:-28px; z-index:-3; background:var(--mobile-cover-url,none),linear-gradient(160deg,#28374f,#111827); background-size:cover; background-position:center; filter:blur(32px) brightness(.5) saturate(1.15); }
    .mobile-player-shade { position:absolute; inset:0; z-index:-2; background:linear-gradient(180deg,rgba(4,7,12,.38),rgba(4,7,12,.68) 58%,rgba(4,7,12,.94)); }
    button,input { font:inherit; }
    button { color:inherit; -webkit-tap-highlight-color:transparent; }
    .mobile-now-header { display:grid; grid-template-columns:minmax(0,1fr) auto 44px; align-items:center; gap:8px; min-height:64px; padding:6px 14px; flex:none; }
    .mobile-title-copy { min-width:0; display:flex; flex-direction:column; gap:2px; }
    .mobile-title-copy span { color:var(--mp-detail-muted); font-size:.72rem; }
    .mobile-title-copy strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:1.05rem; }
    .mobile-connection { display:flex; align-items:center; gap:5px; white-space:nowrap; }
    .mobile-connection span { display:inline-flex; align-items:center; gap:4px; min-height:27px; padding:3px 8px; border:1px solid var(--mp-panel-border); border-radius:999px; background:var(--mp-button-bg); font-size:.68rem; font-weight:650; }
    .mobile-connection .local { border-color:rgba(74,222,128,.72); background:rgba(21,128,61,.74); }
    .mobile-connection .remote { border-color:rgba(96,165,250,.74); background:rgba(29,78,216,.76); }
    .mobile-connection .offline { border-color:rgba(248,113,113,.68); background:rgba(153,27,27,.7); }
    .header-icon,.floating-close { display:grid; place-items:center; width:42px; height:42px; border:1px solid var(--mp-panel-border); border-radius:50%; background:var(--mp-button-bg); }
    .floating-close { position:absolute; top:calc(env(safe-area-inset-top) + 10px); right:14px; z-index:8; }
    .mobile-player-main { flex:1; min-height:0; overflow:hidden; padding-bottom:134px; }
    .mobile-player-main.subpage { padding-bottom:196px; }
    .now-playing-view { height:100%; overflow-y:auto; display:flex; flex-direction:column; align-items:center; padding:12px 20px 30px; box-sizing:border-box; }
    .mobile-cover { display:grid; place-items:center; width:min(74vw,350px); aspect-ratio:1; flex:none; margin-top:2dvh; border-radius:28px; overflow:hidden; background:var(--mp-panel-bg-strong); box-shadow:0 24px 64px rgba(0,0,0,.36); }
    .mobile-cover img { width:100%; height:100%; object-fit:cover; }
    .mobile-track-meta { width:100%; max-width:440px; margin-top:24px; text-align:center; }
    .mobile-track-meta h1 { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(1.45rem,6vw,2rem); }
    .mobile-track-meta p { margin:9px 0 0; font-size:1rem; }
    .mobile-track-meta small { display:block; margin-top:5px; color:var(--mp-detail-muted); font-size:.84rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mobile-primary-actions { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; width:100%; max-width:460px; margin-top:24px; }
    .mobile-primary-actions button { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; min-height:64px; padding:7px 4px; border:1px solid var(--mp-panel-border); border-radius:16px; background:var(--mp-panel-bg); font-size:.72rem; }
    .mobile-primary-actions button.active { color:#fda4af; }
    .mobile-player-error { margin:16px 0 0; color:var(--mp-error-text); text-align:center; }
    .simple-subpage { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; }
    .subpage-header { display:grid; grid-template-columns:44px minmax(0,1fr) auto; align-items:center; gap:10px; min-height:62px; padding:6px 68px 6px 14px; flex:none; }
    .subpage-header h2,.subpage-header p { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .subpage-header h2 { font-size:1.08rem; }
    .subpage-header p { margin-top:2px; color:var(--mp-detail-muted); font-size:.72rem; }
    .clear-queue { min-height:36px; padding:5px 11px; border:1px solid var(--mp-panel-border); border-radius:10px; background:var(--mp-button-bg); }
    .mobile-lyrics { flex:1; min-height:0; margin:4px 14px 16px; overflow:hidden; border-radius:22px; background:var(--mp-panel-bg); }
    .mobile-queue-list { flex:1; min-height:0; overflow-y:auto; padding:4px 14px 24px; }
    .mobile-queue-list article { display:flex; align-items:center; min-height:62px; border-bottom:1px solid var(--mp-panel-border); }
    .mobile-queue-list article.current { border-radius:12px; background:rgba(255,255,255,.1); }
    .queue-main { display:grid; grid-template-columns:30px minmax(0,1fr); align-items:center; gap:8px; flex:1; min-width:0; min-height:60px; padding:5px 8px; border:0; background:transparent; text-align:left; }
    .queue-main > span:first-child { color:var(--mp-detail-muted); text-align:center; }
    .queue-main > span:last-child { min-width:0; display:flex; flex-direction:column; gap:3px; }
    .queue-main strong,.queue-main small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .queue-main small { color:var(--mp-detail-muted); }
    .queue-remove { width:44px; height:44px; flex:none; border:0; background:transparent; font-size:1.4rem; }
    .empty-queue { padding:64px 24px; color:var(--mp-detail-muted); text-align:center; }
    .now-playing-mini { position:absolute; left:14px; right:14px; bottom:calc(132px + env(safe-area-inset-bottom)); z-index:5; display:grid; grid-template-columns:46px minmax(0,1fr) auto; align-items:center; gap:10px; min-height:58px; padding:6px 12px 6px 7px; border:1px solid var(--mp-panel-border); border-radius:17px; background:rgba(8,11,16,.86); backdrop-filter:blur(22px); text-align:left; }
    .mini-cover { display:grid; place-items:center; width:44px; height:44px; overflow:hidden; border-radius:12px; background:var(--mp-panel-bg); }
    .mini-cover img { width:100%; height:100%; object-fit:cover; }
    .mini-copy { min-width:0; display:flex; flex-direction:column; gap:3px; }
    .mini-copy strong,.mini-copy small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mini-copy small,.mini-state { color:var(--mp-detail-muted); font-size:.7rem; }
    .mobile-player-controls { position:absolute; left:0; right:0; bottom:0; z-index:6; min-height:122px; padding:10px 18px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid var(--mp-panel-border); background:rgba(5,8,12,.86); backdrop-filter:blur(24px); box-sizing:border-box; }
    .mobile-progress { width:100%; height:5px; margin:0; border-radius:999px; appearance:none; background:linear-gradient(90deg,#f8fafc var(--mobile-progress),rgba(255,255,255,.24) var(--mobile-progress)); }
    .mobile-progress::-webkit-slider-thumb { width:15px; height:15px; border:2px solid rgba(0,0,0,.3); border-radius:50%; appearance:none; background:#fff; }
    .mobile-time { display:flex; justify-content:space-between; margin-top:5px; color:var(--mp-detail-muted); font-size:.68rem; }
    .transport-controls { display:grid; grid-template-columns:1fr 1fr 1.35fr 1fr 1fr; align-items:center; max-width:460px; margin:4px auto 0; }
    .transport-controls button { position:relative; display:grid; place-items:center; width:48px; height:48px; justify-self:center; border:0; border-radius:50%; background:transparent; }
    .transport-controls .play-toggle { width:58px; height:58px; background:#f8fafc; color:#111827; }
    .queue-badge { position:absolute; top:2px; right:1px; min-width:15px; padding:1px 3px; border-radius:999px; background:#f8fafc; color:#111827; font-size:.58rem; font-weight:700; }

    @media (max-width:390px) {
        .mobile-now-header { grid-template-columns:minmax(0,1fr) auto 42px; padding-inline:10px; }
        .mobile-connection span { padding-inline:6px; }
        .mobile-connection span:last-child :global(svg) { display:none; }
        .mobile-cover { width:min(70vw,300px); border-radius:23px; }
        .mobile-primary-actions { gap:6px; }
    }

    @media (max-height:700px) {
        .mobile-cover { width:min(58vw,270px); margin-top:0; }
        .mobile-track-meta { margin-top:14px; }
        .mobile-primary-actions { margin-top:14px; }
    }

    :global(.music-player-mobile-detail-host .b3-dialog__container) { width:100vw !important; height:100dvh !important; max-width:100vw !important; max-height:100dvh !important; padding:0 !important; border-radius:0 !important; overflow:hidden !important; background:transparent !important; }
    :global(.music-player-mobile-detail-host .b3-dialog__header) { display:none !important; }
    :global(.music-player-mobile-detail-host .b3-dialog__content),
    :global(.music-player-mobile-detail-host .dialog-content) { width:100%; height:100%; min-width:0; min-height:0; padding:0 !important; overflow:hidden !important; scrollbar-gutter:auto; }
</style>
