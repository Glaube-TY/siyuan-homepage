<script lang="ts">
    import { onMount } from "svelte";
    import { Howl, Howler } from "howler";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const musicFolderPath = parsedContent.data?.musicFolderPath || "";

    let musicFiles = [];
    let currentTrackIndex = 0;

    let sound: Howl | null = null;
    let isPlaying = false;
    let currentTime = 0;
    let duration = 0;
    let volume = 0.5;

    onMount(async () => {
        await loadMusicFiles();

        if (musicFiles.length > 0) {
            loadTrack(currentTrackIndex);
        }
    });

    async function loadMusicFiles() {
        try {
            const fs = window.require("fs");
            const pathLib = window.require("path");

            const audioExtensions = [
                ".mp3",
                ".wav",
                ".ogg",
                ".flac",
                ".aac",
                ".m4a",
            ];
            const files = fs.readdirSync(musicFolderPath);

            musicFiles = files
                .filter((file) =>
                    audioExtensions.includes(
                        pathLib.extname(file).toLowerCase(),
                    ),
                )
                .map((file) => ({
                    name: file,
                    path: `file://${pathLib.join(musicFolderPath, file)}`,
                }));
        } catch (error) {
            console.error("读取音乐文件夹时出错:", error);
        }
    }

    function loadTrack(index: number) {
        if (!musicFiles[index]) return;

        if (sound) {
            sound.stop();
        }

        sound = new Howl({
            src: [musicFiles[index].path],
            html5: true,
            volume: volume,
            onplay() {
                isPlaying = true;
            },
            onpause() {
                isPlaying = false;
            },
            onend() {
                nextTrack();
            },
            onload() {
                duration = sound?.duration() || 0;
                const interval = setInterval(() => {
                    if (sound && isPlaying) {
                        currentTime = sound.seek() as number;
                    }
                }, 1000);
                return () => clearInterval(interval);
            },
        });
    }

    function togglePlay() {
        if (!sound) return;
        if (isPlaying) {
            sound.pause();
        } else {
            sound.play();
        }
    }

    function nextTrack() {
        currentTrackIndex = (currentTrackIndex + 1) % musicFiles.length;
        loadTrack(currentTrackIndex);
        sound?.play();
    }

    function prevTrack() {
        currentTrackIndex =
            (currentTrackIndex - 1 + musicFiles.length) % musicFiles.length;
        loadTrack(currentTrackIndex);
        sound?.play();
    }

    function seek(e: any) {
        if (!sound) return;
        const progress = e.offsetX / e.currentTarget.offsetWidth;
        const seekTime = progress * duration;
        sound.seek(seekTime);
        currentTime = seekTime;
    }

    function setVolume(e: any) {
        const vol = parseFloat(e.target.value);
        volume = vol;
        Howler.volume(vol);
    }

    function playTrack(index: number) {
        currentTrackIndex = index;
        loadTrack(index);
        sound?.play();
    }
</script>

<div class="content-display">
    <div class="player">
        <div class="track-info">
            <h3>{musicFiles[currentTrackIndex]?.name || "无音乐"}</h3>
        </div>

        <div class="controls">
            <button on:click={prevTrack} title="上一曲">⏮️</button>
            <button on:click={togglePlay}>{isPlaying ? "⏸️" : "▶️"}</button>
            <button on:click={nextTrack} title="下一曲">⏭️</button>
        </div>

        <div
            class="progress-bar"
            on:click={seek}
            role="slider"
            aria-valuenow={currentTime}
            aria-valuemin={0}
            aria-valuemax={duration}
            tabindex="0"
            on:keydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    seek(e);
                    e.preventDefault();
                }
            }}
        >
            <div
                class="progress"
                style="width: {(currentTime / duration) * 100}%"
            ></div>
        </div>

        <div class="time">
            {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60)
                .toString()
                .padStart(2, "0")} /{" "}
            {Math.floor(duration / 60)}:{Math.floor(duration % 60)
                .toString()
                .padStart(2, "0")}
        </div>

        <div class="volume-control">
            <label
                >🔊 <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    on:input={setVolume}
                /></label
            >
        </div>
    </div>

    <div class="playlist">
        <h4>播放列表</h4>
        <ul>
            {#each musicFiles as track, i}
                <li class="track-item">
                    <button
                        class="track-button"
                        aria-pressed={i === currentTrackIndex}
                        on:click={() => playTrack(i)}
                        on:keydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                playTrack(i);
                                e.preventDefault();
                            }
                        }}
                    >
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

        overflow-y: auto;
    }

    .player {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .track-info h3 {
        text-align: center;
        font-size: 1.2rem;
        color: #333;
    }

    .controls {
        display: flex;
        justify-content: center;
        gap: 1rem;
    }

    .controls button {
        background: #6a1b9a;
        color: white;
        border: none;
        padding: 0.6rem 1rem;
        border-radius: 50%;
        font-size: 1.2rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .controls button:hover {
        background: #510d85;
    }

    .progress-bar {
        height: 6px;
        background-color: #ddd;
        border-radius: 4px;
        cursor: pointer;
        position: relative;
    }

    .progress {
        height: 100%;
        background-color: #6a1b9a;
        border-radius: 4px;
        transition: width 0.2s;
    }

    .time {
        text-align: center;
        font-size: 0.9rem;
        color: #555;
    }

    .volume-control {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .volume-control input {
        flex: 1;
    }

    .playlist {
        margin-top: 1rem;
    }

    .playlist h4 {
        margin-bottom: 0.5rem;
        font-size: 1rem;
        color: #333;
    }

    .playlist ul {
        list-style: none;
        padding: 0;
        margin: 0;
        max-height: 200px;
        overflow-y: auto;
    }

    .playlist li {
        padding: 0.5rem;
        cursor: pointer;
        border-radius: 6px;
        transition: background 0.2s ease;

        &:hover {
            background: #f5f5f5;
        }
    }

    .track-item {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .track-button {
        width: 100%;
        padding: 0.5rem;
        background: none;
        border: none;
        text-align: left;
        cursor: pointer;
        border-radius: 6px;
        transition: background 0.2s ease;
    }

    .track-button:hover,
    .track-button[aria-pressed="true"] {
        background: #eee;
    }
</style>
