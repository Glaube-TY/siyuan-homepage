<script lang="ts">
    import { onMount } from "svelte";
    import { Howl, Howler } from "howler";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const audioUrl =
        parsedContent.audioUrl ||
        "https://er-sycdn.kuwo.cn/c170d960fe4785888223c0ff26e02380/687a4333/resource/30106/trackmedia/M800002u9R7d2Qe9IH.mp3";
    const musicFolderPath = parsedContent.musicFolderPath || "";

    let sound: Howl | null = null;
    let isPlaying = false;
    let currentTime = 0;
    let duration = 0;
    let volume = 0.5;

    onMount(() => {
        sound = new Howl({
            src: [audioUrl],
            html5: true, // 支持长音频（如音乐）
            volume: volume,
            onplay() {
                isPlaying = true;
            },
            onpause() {
                isPlaying = false;
            },
            onend() {
                isPlaying = false;
            },
            onload() {
                duration = sound?.duration() || 0;
                // 定时更新当前播放时间
                const interval = setInterval(() => {
                    if (sound && isPlaying) {
                        currentTime = sound.seek() as number;
                    }
                }, 1000);

                // 组件卸载时清除定时器
                return () => clearInterval(interval);
            },
        });

        console.log(musicFolderPath);
    });

    function togglePlay() {
        if (!sound) return;
        if (isPlaying) {
            sound.pause();
        } else {
            sound.play();
        }
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
</script>

<div class="content-display">
    <div class="player">
        <button on:click={togglePlay}>{isPlaying ? "Pause" : "Play"}</button>

        <div class="progress-bar" on:click={seek}>
            <div
                class="progress"
                style="width: {(currentTime / duration) * 100}%"
            ></div>
        </div>

        <div class="time">
            {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60)
                .toString()
                .padStart(2, "0")} /
            {Math.floor(duration / 60)}:{Math.floor(duration % 60)
                .toString()
                .padStart(2, "0")}
        </div>

        <div class="volume-control">
            Volume:
            <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                on:input={setVolume}
            />
        </div>
    </div>
</div>

<style>
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .player {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 1rem;
    }

    .progress-bar {
        height: 10px;
        background-color: #ddd;
        border-radius: 5px;
        cursor: pointer;
        position: relative;
    }

    .progress {
        height: 100%;
        background-color: #6a1b9a;
        border-radius: 5px;
        position: absolute;
        left: 0;
        top: 0;
    }

    .volume-control {
        display: flex;
        align-items: center;
        gap: 10px;
    }
</style>
