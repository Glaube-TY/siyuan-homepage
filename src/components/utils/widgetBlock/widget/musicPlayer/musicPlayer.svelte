<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { Howl, Howler } from "howler";
    import { svelteDialog } from "@/libs/dialog";
    import musicList from "./musicList.svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const musicFolderPath = parsedContent.data?.musicFolderPath || "";
    const savedTrackIndex = parsedContent.data?.currentTrackIndex || 0;
    let playMode = parsedContent.data?.playMode || "order";
    let isMuted = parsedContent.data?.isMuted || false;
    let volume = parsedContent.data?.volume || 0.5;
    let autoPlay = parsedContent.data?.autoPlay || false;

    const themeMode = window.siyuan.config.appearance.mode;

    let musicFiles = [];
    let currentTrackIndex = savedTrackIndex;

    let sound: Howl | null = null;
    let isPlaying = false;
    let currentTime = 0;
    let duration = 0;

    let advancedEnabled = false;

    onMount(async () => {
        await loadMusicFiles();

        if (musicFiles.length > 0) {
            loadTrack(currentTrackIndex);
        }

        advancedEnabled = plugin.ADVANCED;
    });

    // 组件卸载时清理播放器
    onDestroy(() => {
        cleanup();
    });

    async function saveConfig() {
        await plugin.saveData(`widget-${parsedContent.blockId}.json`, {
            ...parsedContent,
            data: {
                ...parsedContent.data,
                playMode,
                isMuted,
                volume,
                currentTrackIndex,
            },
        });
    }

    // 清理播放器
    function cleanup() {
        if (sound) {
            sound.stop();
            sound.unload();
            sound = null;
        }
        // 停止所有音频
        Howler.unload();
    }

    // 加载音乐文件
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

    // 加载曲目
    function loadTrack(index: number) {
        if (!musicFiles[index]) return;

        cleanup();

        if (sound) {
            sound.stop();
            sound.unload();
        }

        sound = new Howl({
            src: [musicFiles[index].path],
            html5: true,
            volume: volume,
            autoplay: autoPlay,
            onplay() {
                isPlaying = true;
            },
            onpause() {
                isPlaying = false;
            },
            onend() {
                if (playMode === "repeat") {
                    sound?.play(); // 单曲循环时直接重播
                } else {
                    nextTrack(); // 其他模式切换到下一曲
                }
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
            onloaderror(error: any) {
                console.error("加载音频失败:", error);
                // 如果加载失败，尝试播放下一首
                nextTrack();
            },
        });
    }

    // 切换播放模式
    function togglePlayMode() {
        if (playMode === "order") {
            playMode = "repeat";
        } else if (playMode === "repeat") {
            playMode = "shuffle";
        } else {
            playMode = "order";
        }

        saveConfig();
    }

    // 播放/暂停
    function togglePlay() {
        if (!sound) return;
        if (isPlaying) {
            sound.pause();
        } else {
            autoPlay = true;
            sound.play();
        }
    }

    // 下一曲
    function nextTrack() {
        if (playMode === "shuffle") {
            // 随机播放：随机选择下一首
            const randomIndex = Math.floor(Math.random() * musicFiles.length);
            currentTrackIndex = randomIndex;
            loadTrack(randomIndex);
            autoPlay = true;
            sound?.play();
        } else {
            // 默认顺序播放
            currentTrackIndex = (currentTrackIndex + 1) % musicFiles.length;
            loadTrack(currentTrackIndex);
            autoPlay = true;
            sound?.play();
        }

        saveConfig();
    }

    // 上一曲
    function prevTrack() {
        if (playMode === "shuffle") {
            // 随机播放：随机选择上一首
            const randomIndex = Math.floor(Math.random() * musicFiles.length);
            currentTrackIndex = randomIndex;
            loadTrack(randomIndex);
            autoPlay = true;
            sound?.play();
        } else {
            // 默认顺序播放
            currentTrackIndex =
                (currentTrackIndex - 1 + musicFiles.length) % musicFiles.length;
            loadTrack(currentTrackIndex);
            autoPlay = true;
            sound?.play();
        }

        saveConfig();
    }

    // 快进/快退
    function seek(e: any) {
        if (!sound) return;
        const progress = e.offsetX / e.currentTarget.offsetWidth;
        const seekTime = progress * duration;
        sound.seek(seekTime);
        currentTime = seekTime;
    }

    // 设置音量
    function setVolume(e: any) {
        const vol = parseFloat(e.target.value);
        volume = vol;
        Howler.volume(vol);

        saveConfig();
    }

    // 切换静音
    function toggleMute() {
        isMuted = !isMuted;
        Howler.mute(isMuted);
        saveConfig();
    }

    // 播放指定曲目
    function playTrack(index: number) {
        currentTrackIndex = index;
        loadTrack(index);
        autoPlay = true;
        sound?.play();
        saveConfig();
    }

    // 打开音乐列表
    function openMusicList() {
        const dialog = svelteDialog({
            height: "60vh",
            title: "🎵音乐列表",
            constructor: (containerEl: HTMLElement) => {
                return new musicList({
                    target: containerEl,
                    props: {
                        plugin: plugin,
                        musicFiles: musicFiles,
                        currentTrackIndex: currentTrackIndex,
                        playTrack: (index: number) => {
                            playTrack(index);
                            dialog.close();
                        },
                        close: () => {
                            dialog.close();
                        },
                    },
                });
            },
        });
    }
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div class="player">
            <div class="track-info">
                <h3>{musicFiles[currentTrackIndex]?.name || "无音乐"}</h3>
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

            <div class="controls">
                <button on:click={prevTrack} title="上一曲">
                    {#if themeMode === 0}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/backwardLight.svg`}
                            alt="上一曲"
                            style="width: 1rem; height: 1rem;"
                        />
                    {:else}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/backwardDark.svg`}
                            alt="上一曲"
                            style="width: 1rem; height: 1rem;"
                        />
                    {/if}
                </button>
                <button on:click={togglePlay}>
                    {#if isPlaying}
                        {#if themeMode === 0}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/pauseLight.svg`}
                                alt="暂停"
                                style="width: 1rem; height: 1rem;"
                            />
                        {:else}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/pauseDark.svg`}
                                alt="暂停"
                                style="width: 1rem; height: 1rem;"
                            />
                        {/if}
                    {:else if themeMode === 0}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/playLight.svg`}
                            alt="播放"
                            style="width: 1rem; height: 1rem;"
                        />
                    {:else}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/playDark.svg`}
                            alt="播放"
                            style="width: 1rem; height: 1rem;"
                        />
                    {/if}
                </button>
                <button on:click={nextTrack} title="下一曲">
                    {#if themeMode === 0}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/forwardLight.svg`}
                            alt="上一曲"
                            style="width: 1rem; height: 1rem;"
                        />
                    {:else}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/forwardDark.svg`}
                            alt="上一曲"
                            style="width: 1rem; height: 1rem;"
                        />
                    {/if}
                </button>
                <button on:click={togglePlayMode} title="切换播放模式">
                    {#if playMode === "order"}
                        {#if themeMode === 0}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/orderLight.svg`}
                                alt="顺序播放"
                                style="width: 1rem; height: 1rem;"
                            />
                        {:else}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/orderDark.svg`}
                                alt="顺序播放"
                                style="width: 1rem; height: 1rem;"
                            />
                        {/if}
                    {:else if playMode === "repeat"}
                        {#if themeMode === 0}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/repeatLight.svg`}
                                alt="单曲循环"
                                style="width: 1rem; height: 1rem;"
                            />
                        {:else}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/repeatDark.svg`}
                                alt="单曲循环"
                                style="width: 1rem; height: 1rem;"
                            />
                        {/if}
                    {:else if themeMode === 0}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/shuffleLight.svg`}
                            alt="随机播放"
                            style="width: 1rem; height: 1rem;"
                        />
                    {:else}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/shuffleDark.svg`}
                            alt="随机播放"
                            style="width: 1rem; height: 1rem;"
                        />
                    {/if}
                </button>
            </div>

            <div class="volume-control">
                <button on:click={toggleMute} title="切换静音">
                    {#if isMuted}
                        {#if themeMode === 0}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/muteLight.svg`}
                                alt="静音"
                                style="width: 1rem; height: 1rem;"
                            />
                        {:else}
                            <img
                                src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/muteDark.svg`}
                                alt="静音"
                                style="width: 1rem; height: 1rem;"
                            />
                        {/if}
                    {:else if themeMode === 0}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/volumeLight.svg`}
                            alt="音量"
                            style="width: 1rem; height: 1rem;"
                        />
                    {:else}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/volumeDark.svg`}
                            alt="音量"
                            style="width: 1rem; height: 1rem;"
                        />
                    {/if}
                </button>

                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    on:input={setVolume}
                    disabled={isMuted}
                />
                <button class="music-list-btn" on:click={openMusicList}>
                    {#if themeMode === 0}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/musicListLight.svg`}
                            alt="音乐列表"
                            style="width: 1rem; height: 1rem;"
                        />
                    {:else}
                        <img
                            src={`${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/musicPlayerIcon/musicListDark.svg`}
                            alt="音乐列表"
                            style="width: 1rem; height: 1rem;"
                        />
                    {/if}
                </button>
            </div>
        </div>
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
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
    }

    .player {
        height: calc(100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        padding: 1rem;
        background: var(--b3-theme-surface);
        border-radius: 10px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

        .track-info {
            width: 100%;
            overflow: hidden;
        }

        .track-info h3 {
            text-align: center;
            font-size: 1.2rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            // 添加滚动效果
            &:hover {
                overflow: visible;
                text-overflow: clip;
                animation: scroll-left 10s linear infinite;
            }
        }

        // 添加滚动动画
        @keyframes scroll-left {
            0% {
                transform: translateX(0%);
            }
            100% {
                transform: translateX(-100%);
            }
        }

        .controls {
            display: flex;
            justify-content: center;
            gap: 0.5rem;

            button {
                background: transparent;
                border: none;
                padding: 5px;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s ease;

                &:hover {
                    background: var(--b3-theme-primary);
                    transform: scale(1.1);
                }
            }
        }

        .progress-bar {
            width: 90%;
            height: 6px;
            background-color: var(--b3-border-color);
            border-radius: 4px;
            cursor: pointer;

            &:hover {
                transform: scale(1.1);
            }

            .progress {
                height: 100%;
                background-color: var(--b3-theme-primary);
                border-radius: 4px;
                transition: width 0.2s;
            }
        }

        .time {
            text-align: center;
            font-size: 0.9rem;
        }

        .volume-control {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;

            button {
                background-color: transparent;
                border: none;
                cursor: pointer;
                transition: all 0.2s ease;

                &:hover {
                    color: var(--b3-theme-primary);
                    transform: scale(1.1);
                }
            }

            input[type="range"] {
                width: 100%;
                height: 6px;
                cursor: pointer;
                accent-color: var(--b3-theme-primary);
            }
        }
    }

    .content-not-advanced {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
    }
</style>
