<script lang="ts">
    import type { MusicLyricLine } from "./musicPlayerTypes";
    import { getCurrentLyricLine } from "./musicLyricsService";

    interface Props {
        lyrics: MusicLyricLine[];
        unsyncedLyricsText?: string;
        currentTime: number;
        lyricsStatus: string;
    }

    let { lyrics, unsyncedLyricsText, currentTime, lyricsStatus }: Props = $props();

    const currentLine = $derived(getCurrentLyricLine(lyrics, currentTime));
    const currentIndex = $derived(
        currentLine ? lyrics.findIndex((l) => Math.abs(l.time - currentLine.time) < 0.01) : -1,
    );
    const prevLine = $derived(currentIndex > 0 ? lyrics[currentIndex - 1] : undefined);
    const nextLine = $derived(currentIndex >= 0 && currentIndex < lyrics.length - 1 ? lyrics[currentIndex + 1] : undefined);
</script>

<div class="lyrics-panel">
    {#if lyrics.length > 0}
        <div class="lyrics-lines">
            {#if prevLine}
                <p class="lyric-prev">{prevLine.primary}</p>
                {#if prevLine.translation}
                    <p class="lyric-prev translation">{prevLine.translation}</p>
                {/if}
            {:else}
                <p class="lyric-empty"></p>
            {/if}

            {#if currentLine}
                <p class="lyric-current">{currentLine.primary}</p>
                {#if currentLine.translation}
                    <p class="lyric-current translation">{currentLine.translation}</p>
                {/if}
            {:else}
                <p class="lyric-empty"></p>
            {/if}

            {#if nextLine}
                <p class="lyric-next">{nextLine.primary}</p>
                {#if nextLine.translation}
                    <p class="lyric-next translation">{nextLine.translation}</p>
                {/if}
            {:else}
                <p class="lyric-empty"></p>
            {/if}
        </div>
    {:else if unsyncedLyricsText}
        <div class="lyrics-unsynced">
            {#each unsyncedLyricsText.split("\n") as line}
                {#if line.trim()}
                    <p>{line}</p>
                {/if}
            {/each}
        </div>
    {:else if lyricsStatus === "failed"}
        <p class="lyric-status">歌词读取失败</p>
    {:else if lyricsStatus === "none"}
        <p class="lyric-status">暂无歌词</p>
    {:else if lyricsStatus === "loading" || lyricsStatus === "pending"}
        <p class="lyric-status">歌词解析中</p>
    {:else}
        <p class="lyric-status"></p>
    {/if}
</div>

<style lang="scss">
    .lyrics-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        padding: 1.25rem;
        box-sizing: border-box;
        overflow: hidden;
        background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 50%, transparent));
        border-radius: 16px;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08);

        .lyrics-lines {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 0.85rem;
        }

        p {
            margin: 0;
            transition: all 0.2s ease;
            line-height: 1.5;
        }

        .lyric-prev,
        .lyric-next {
            font-size: 0.92rem;
            color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));
            opacity: 0.9;
        }

        .lyric-current {
            font-size: 1.35rem;
            font-weight: 700;
            color: var(--mp-detail-text, var(--b3-theme-on-surface));
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }

        .translation {
            font-size: 0.85rem;
            opacity: 0.95;
        }

        .lyric-empty {
            min-height: 1.6rem;
        }

        .lyric-status {
            font-size: 0.95rem;
            font-weight: 500;
            color: var(--mp-detail-text, var(--b3-theme-on-surface));
            padding: 0.6rem 1rem;
            border-radius: 999px;
            background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface-light) 70%, transparent));
        }

        .lyrics-unsynced {
            width: 100%;
            max-height: 100%;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 0.45rem;
            padding: 0 0.5rem;
            box-sizing: border-box;

            p {
                margin: 0;
                font-size: 0.95rem;
                color: var(--mp-detail-text, var(--b3-theme-on-surface));
                line-height: 1.6;
                white-space: pre-wrap;
                word-break: break-word;
            }
        }
    }
</style>
