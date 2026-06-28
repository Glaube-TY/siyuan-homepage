<script lang="ts">
    import type { MusicPlayerVmStore, MusicPlayerActions } from "./musicPlayerTypes";
    import { formatPlaybackTime } from "./musicPlayerUtils";
    import { getTrackKey } from "./musicPlaybackStatsStore";
    import { confirmDialogBoolean } from "@/libs/dialog";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";

    interface Props {
        vmStore: MusicPlayerVmStore;
        actions: MusicPlayerActions;
        onClose: () => void;
    }

    let {
        vmStore,
        actions,
        onClose,
    }: Props = $props();

    const vm = $derived($vmStore);
    const musicFiles = $derived(vm.musicFiles);
    const currentTrackIndex = $derived(vm.currentTrackIndex);
    const activeQueueTrackKeys = $derived(vm.activeQueueTrackKeys);

    const trackKeyToIndex = $derived(new Map(musicFiles.map((t, i) => [getTrackKey(t), i])));

    interface QueueEntry {
        trackKey: string;
        index: number;
    }

    const queueEntries = $derived(
        activeQueueTrackKeys.map((key) => {
            const idx = trackKeyToIndex.get(key) ?? -1;
            return { trackKey: key, index: idx };
        }),
    );

    function handlePlay(entry: QueueEntry) {
        if (entry.index >= 0) {
            actions.playTrack(entry.index);
        }
    }

    function handleRemove(entry: QueueEntry) {
        actions.removeTrackFromActiveQueue(entry.trackKey);
    }

    async function handleClear() {
        const ok = await confirmDialogBoolean({
            title: "清空播放列表",
            content: "确定要清空当前播放列表吗？不会删除本地文件。",
        });
        if (!ok) return;
        actions.clearActiveQueue();
    }

    function handleKeydown(e: KeyboardEvent, entry: QueueEntry) {
        if (e.key === "Enter" || e.key === " ") {
            handlePlay(entry);
        }
    }

    function handleRemoveKeydown(e: KeyboardEvent, entry: QueueEntry) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            handleRemove(entry);
        }
    }
</script>

<div class="queue-dialog">
    <div class="queue-inner">
        {#if queueEntries.length === 0}
            <div class="queue-empty">
                <MusicPlayerIcon name="queue" size={40} />
                <span class="queue-empty-text">播放列表为空</span>
                <span class="queue-empty-hint">从歌曲列表中添加歌曲到播放队列</span>
            </div>
        {:else}
            <div class="queue-header">
                <span class="queue-title">播放队列</span>
                <span class="queue-count">{queueEntries.length} 首</span>
                <button class="queue-clear-btn" onclick={handleClear} title="清空播放列表">
                    <MusicPlayerIcon name="trash" size={15} />
                </button>
            </div>
            <ul class="queue-list">
                {#each queueEntries as entry, displayIdx (entry.trackKey)}
                    {@const track = entry.index >= 0 ? musicFiles[entry.index] : undefined}
                    <li
                        class="queue-item"
                        class:is-current={entry.index === currentTrackIndex}
                        class:is-missing={entry.index < 0}
                    >
                        <button
                            class="queue-track-btn"
                            onclick={() => handlePlay(entry)}
                            onkeydown={(e) => handleKeydown(e, entry)}
                            disabled={entry.index < 0}
                        >
                            <span class="queue-number">{displayIdx + 1}</span>
                            <span class="queue-info">
                                <span class="queue-item-title">
                                    {track?.title || track?.baseName || track?.fileName || "未找到"}
                                </span>
                                <span class="queue-item-subtitle">
                                    {#if entry.index < 0}
                                        文件不存在
                                    {:else}
                                        {track?.artist?.trim() || "未知艺术家"}
                                    {/if}
                                </span>
                            </span>
                            <span class="queue-duration">
                                {track ? formatPlaybackTime(track.duration) : "--:--"}
                            </span>
                        </button>
                        <button
                            class="queue-remove-btn"
                            onclick={() => handleRemove(entry)}
                            onkeydown={(e) => handleRemoveKeydown(e, entry)}
                            title="从播放列表移除"
                            aria-label="从播放列表移除"
                        >
                            <MusicPlayerIcon name="close" size={14} />
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</div>

<style lang="scss">
    .queue-dialog {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 24px;
        background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
        backdrop-filter: blur(22px) saturate(1.25);
        box-shadow: inset 0 1px 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.14);
        color: var(--mp-detail-text, var(--b3-theme-on-surface));

        .queue-inner {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .queue-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));

            .queue-empty-text {
                font-size: 0.95rem;
                font-weight: 500;
            }

            .queue-empty-hint {
                font-size: 0.78rem;
                opacity: 0.7;
            }
        }

        .queue-header {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.75rem;

            .queue-title {
                font-size: 1rem;
                font-weight: 700;
            }

            .queue-count {
                font-size: 0.78rem;
                color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));
            }

            .queue-clear-btn {
                margin-left: auto;
                width: 2rem;
                height: 2rem;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid transparent;
                border-radius: 10px;
                background: transparent;
                color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));
                cursor: pointer;
                transition: background 0.15s ease, color 0.15s ease;

                &:hover {
                    background: color-mix(in srgb, #e94e5a 14%, transparent);
                    color: #e94e5a;
                }
            }
        }

        .queue-list {
            list-style: none;
            padding: 0;
            margin: 0;
            overflow-y: auto;
            flex: 1;
            min-height: 0;
        }

        .queue-item {
            display: flex;
            align-items: center;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 0.15rem;
            transition: background 0.15s ease;

            &.is-current {
                background: linear-gradient(90deg, color-mix(in srgb, var(--b3-theme-primary) 16%, transparent) 0%, transparent 85%);
                .queue-track-btn { font-weight: 600; }
            }
            &.is-missing { opacity: 0.45; }
        }

        .queue-track-btn {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.55rem 0.65rem;
            background: transparent;
            border: none;
            color: inherit;
            text-align: left;
            cursor: pointer;
            border-radius: 10px;
            transition: background 0.15s ease;

            &:hover:not(:disabled) { background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent); }
            &:disabled { cursor: not-allowed; }

            .queue-number { width: 1.5rem; flex-shrink: 0; font-size: 0.75rem; text-align: center; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); }
            .queue-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
            .queue-item-title { font-size: 0.9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .queue-item-subtitle { font-size: 0.75rem; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .queue-duration { flex-shrink: 0; font-size: 0.75rem; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); }
        }

        .queue-remove-btn {
            flex-shrink: 0;
            width: 1.8rem;
            height: 1.8rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;

            &:hover { background: color-mix(in srgb, #e94e5a 14%, transparent); color: #e94e5a; }
        }

        .queue-item:hover .queue-remove-btn,
        .queue-item.is-current .queue-remove-btn { opacity: 1; }
    }
</style>
