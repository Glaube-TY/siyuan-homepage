<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let musicFiles: any;
    export let currentTrackIndex: number; // 接收当前曲目索引
    export let playTrack: (index: number) => void; // 接收播放方法
    export let close: () => void;

    const themeMode = window.siyuan.config.appearance.mode;

    onMount(async () => {});

    function handleKeydown(e: KeyboardEvent, index: number) {
        if (e.key === "Enter" || e.key === " ") {
            playTrack(index);
            close();
        }
    }
</script>

<div class="content-display">
    <div class="playlist">
        <ul>
            {#each musicFiles as track, i}
                <li class="track-item">
                    <button
                        class="track-button"
                        aria-pressed={i === currentTrackIndex}
                        on:click={() => {
                            playTrack(i);
                            close();
                        }}
                        on:keydown={(e) => handleKeydown(e, i)}
                    >
                        {#if i === currentTrackIndex}
                            {#if themeMode === 0}
                                <img
                                    src={`/plugins/siyuan-homepage/asset/musicPlayerIcon/playLight.svg`}
                                    alt="播放"
                                    style="width: 1rem; height: 1rem;"
                                />
                            {:else}
                                <img
                                    src={`/plugins/siyuan-homepage/asset/musicPlayerIcon/playDark.svg`}
                                    alt="播放"
                                    style="width: 1rem; height: 1rem;"
                                />
                            {/if}
                        {/if}
                        {track.name}
                    </button>
                </li>
            {/each}
        </ul>
    </div>
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

        .playlist {
            height: calc(100%);
            display: flex;
            flex-direction: column;
            padding: 0.2rem;
            box-sizing: border-box;
            border-radius: 12px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

            ul {
                list-style: none;
                padding: 0;
                gap: 0.2rem;
                margin: 0;
                overflow-y: auto;
            }

            li {
                list-style: none;
                padding: 0.5rem;
                cursor: pointer;
                border-radius: 6px;
                transition: all 0.2s ease;

                &:hover {
                    background: var(--b3-theme-primary);
                }
            }

            button {
                width: 100%;
                color: var(--b3-theme-text);
                padding: 0.5rem;
                background: none;
                border: none;
                text-align: left;
                cursor: pointer;
                border-radius: 6px;
                transition: all 0.2s ease;

                &:hover {
                    background: var(--b3-theme-surface-light);
                }

                &[aria-pressed="true"] {
                    background: var(--b3-theme-primary);
                    color: var(--b3-theme-on-primary);
                }
            }
        }
    }
</style>
