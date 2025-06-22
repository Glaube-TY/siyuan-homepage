<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    let contentTypeJsonObj: any;
    let isRunning = false;
    let isBreak = false;
    let timeLeft: number;
    let timer: any;
    let totalFocusTime = 0;
    let totalFocusTimes = 0;
    let focusBgImage =
        "https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464";
    let breakBgImage =
        "https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d"; // 默认休息图
    // 本地配置状态
    let showSettings = false;
    let localFocusDuration = 25;
    let localBreakDuration = 5;
    let selectedTimerStyle = "classic";
    let timerFontSize = 3;
    let showFocusInfo = false;
    let showSyNotif = true;

    let circumference = Math.PI * 2 * 65;
    $: baseSize = timerFontSize * 40;
    $: strokeWidth = timerFontSize * 2;
    $: radius = baseSize / 2 - strokeWidth;
    $: circumference = 2 * Math.PI * radius;
    $: progressOffset =
        circumference -
        (timeLeft /
            (isBreak ? localBreakDuration * 60 : localFocusDuration * 60)) *
            circumference;

    onMount(async () => {
        contentTypeJsonObj = JSON.parse(contentTypeJson);
        const data = contentTypeJsonObj.data || {};
        focusBgImage = data.focusBgImage || focusBgImage;
        breakBgImage = data.breakBgImage || breakBgImage;

        const savedConfig = await plugin.loadData(`widgetFocusConfig.json`);
        localFocusDuration =
            savedConfig.data?.focusDuration || localFocusDuration;
        localBreakDuration =
            savedConfig.data?.breakDuration || localBreakDuration;
        selectedTimerStyle = savedConfig.data?.timerStyle || selectedTimerStyle;
        timerFontSize = savedConfig.data?.timerFontSize || timerFontSize;
        totalFocusTime = savedConfig.data?.totalFocusTime || totalFocusTime;
        totalFocusTimes = savedConfig.data?.totalFocusTimes || totalFocusTimes;
        showFocusInfo = savedConfig.data?.showFocusInfo || showFocusInfo;
        showSyNotif = savedConfig.data?.showSyNotif ?? true;

        resetTimer("focus");
    });

    function showSystemNotification(title: string, body: string) {
        if (!("Notification" in window)) {
            console.warn("此浏览器不支持桌面通知");
            return;
        }

        const symbol = document.querySelector("svg defs symbol#iconhomepage");
        if (!symbol) {
            console.warn("未找到 iconhomepage 图标");
            return;
        }

        // 创建一个完整的 SVG 元素
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 1024 1024");
        svg.setAttribute("xmlns", svgNS);
        svg.innerHTML = symbol.innerHTML;

        // 转换为字符串并编码为 base64
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(svg);
        const base64Svg = btoa(unescape(encodeURIComponent(svgStr)));

        const iconUrl = `data:image/svg+xml;base64,${base64Svg}`;

        if (Notification.permission === "granted") {
            new Notification(title, {
                body,
                icon: iconUrl,
                requireInteraction: false,
            });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((permission) => {
                if (permission === "granted") {
                    new Notification(title, {
                        body,
                        icon: iconUrl,
                        requireInteraction: false,
                    });
                }
            });
        }
    }

    // 初始化定时器
    function resetTimer(duration: string) {
        if (duration === "focus") {
            timeLeft = localFocusDuration * 60;
        } else {
            timeLeft = localBreakDuration * 60;
        }
    }

    function startTimer() {
        if (!isRunning) {
            isRunning = true;
            timer = setInterval(() => {
                timeLeft -= 1;
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    isRunning = false;
                    handleTimerEnd();
                }
            }, 1000);
        }
    }

    function handleTimerEnd() {
        const message = isBreak ? "休息时间结束！" : "专注时间结束！";
        // 触发系统通知
        if (showSyNotif) {
            showSystemNotification(
                isBreak ? "休息时间结束" : "专注时间结束",
                isBreak
                    ? "休息时间已经结束啦！"
                    : "专注时间已完成，休息一下吧！",
            );
        }
        showMessage(message);

        if (!isBreak) {
            totalFocusTime += localFocusDuration * 60;
            totalFocusTimes += 1;
            saveConfig();
        }

        isBreak = !isBreak;
        resetTimer(isBreak ? "break" : "focus");

        if (isBreak) startTimer();
    }

    function formatDuration(seconds: number, limit: number = 2): string {
        const units = [
            { limit: 31536000, label: "年" },
            { limit: 2628000, label: "个月" },
            { limit: 86400, label: "天" },
            { limit: 3600, label: "小时" },
            { limit: 60, label: "分钟" },
            { limit: 1, label: "秒" },
        ];

        let result = [];
        for (let i = 0; i < units.length && result.length < limit; i++) {
            const unit = units[i];
            const count = Math.floor(seconds / unit.limit);
            if (count > 0) {
                result.push(`${count}${unit.label}`);
                seconds %= unit.limit;
            }
        }

        return result.join("") || "0秒";
    }

    function formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    // 新增保存配置方法
    async function saveConfig() {
        contentTypeJsonObj.data = {
            ...contentTypeJsonObj.data,
            focusDuration: localFocusDuration,
            breakDuration: localBreakDuration,
            timerStyle: selectedTimerStyle,
            timerFontSize: timerFontSize,
            totalFocusTime: totalFocusTime,
            totalFocusTimes: totalFocusTimes,
            showFocusInfo: showFocusInfo,
        };
        await plugin.saveData(`widgetFocusConfig.json`, contentTypeJsonObj);
        resetTimer(isBreak ? "break" : "focus");
        showSettings = false;
    }
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
</svelte:head>

<div
    class="content-display"
    style="background-image: url({isBreak ? breakBgImage : focusBgImage});"
>
    <div class="overlay"></div>
    {#if showSettings}
        <!-- 设置弹窗 -->
        <div class="settings-modal">
            <h4>专注设置</h4>
            <div class="form-group">
                <label
                    >专注时长/分钟：
                    <input
                        type="number"
                        min="5"
                        max="120"
                        bind:value={localFocusDuration}
                    />
                </label>
            </div>
            <div class="form-group">
                <label
                    >休息时长/分钟：
                    <input
                        type="number"
                        min="1"
                        max="30"
                        bind:value={localBreakDuration}
                    />
                </label>
            </div>
            <h4>样式设置</h4>
            <div class="form-group">
                <label>
                    倒计时样式：
                    <select bind:value={selectedTimerStyle}>
                        <option value="classic">经典样式</option>
                        <option value="modern">现代简约</option>
                        <option value="rounded">圆角卡片</option>
                        <option value="digital-clock">数码时钟风</option>
                        <option value="circular-progress">环形进度</option>
                    </select>
                </label>
            </div>
            <div class="form-group">
                <label>
                    倒计时大小：
                    <input
                        type="number"
                        min="1"
                        max="10"
                        bind:value={timerFontSize}
                        step="0.5"
                    />
                </label>
            </div>
            <div class="form-group">
                <label for="timer-show-info">
                    <input
                        id="timer-show-info"
                        type="checkbox"
                        bind:checked={showFocusInfo}
                    />显示专注信息
                </label>
            </div>
            <div class="form-group">
                <label for="timer-show-sy-notif">
                    <input
                        id="timer-show-sy-notif"
                        type="checkbox"
                        bind:checked={showSyNotif}
                    />显示系统通知
                </label>
            </div>
            <h4>专注统计</h4>
            <div class="form-group">
                <p>
                    已专注次数：{totalFocusTimes}
                </p>
                <p>
                    已专注时间：{formatDuration(totalFocusTime, 10)}
                </p>
            </div>
            <div class="modal-actions">
                <button on:click={saveConfig}>保存</button>
                <button on:click={() => (showSettings = false)}>取消</button>
            </div>
        </div>
    {:else}
        <!-- 主界面布局 -->
        <div class="focus-timer-section">
            <div class="timer-main">
                <div class="timer-wrapper">
                    <div
                        class="timer-display {selectedTimerStyle} {isBreak
                            ? 'break'
                            : 'focus'}"
                        style="font-size: {timerFontSize}rem;"
                    >
                        {#if selectedTimerStyle === "circular-progress"}
                            <div class="circular-timer">
                                <svg
                                    width={baseSize}
                                    height={baseSize}
                                    viewBox="0 0 {baseSize} {baseSize}"
                                >
                                    <!-- 内部填充背景 -->
                                    <circle
                                        cx={baseSize / 2}
                                        cy={baseSize / 2}
                                        r={radius}
                                        fill="rgba(200, 200, 200, 0.5)"
                                    />

                                    <!-- 背景圆环 -->
                                    <circle
                                        cx={baseSize / 2}
                                        cy={baseSize / 2}
                                        r={radius}
                                        stroke-width={strokeWidth}
                                        fill="none"
                                        stroke="#e6e6e6"
                                    />

                                    <!-- 进度圆环 -->
                                    <circle
                                        cx={baseSize / 2}
                                        cy={baseSize / 2}
                                        r={radius}
                                        stroke-width={strokeWidth}
                                        fill="none"
                                        stroke={isBreak
                                            ? "#60a5fa"
                                            : "var(--b3-theme-primary)"}
                                        stroke-linecap="round"
                                        transform="rotate(-90 {baseSize /
                                            2} {baseSize / 2})"
                                        style="stroke-dasharray: {circumference};
            stroke-dashoffset: {progressOffset}"
                                    />

                                    <!-- 时间文本 -->
                                    <text
                                        x={baseSize / 2}
                                        y={baseSize / 2 + 5}
                                        text-anchor="middle"
                                        font-size={timerFontSize * 10}
                                        fill="#333"
                                    >
                                        {formatTime(timeLeft)}
                                    </text>
                                </svg>
                            </div>
                        {:else}
                            {formatTime(timeLeft)}
                        {/if}
                    </div>
                    <div class="timer-controls">
                        <button
                            title="开始"
                            on:click={startTimer}
                            disabled={isRunning}
                        >
                            <i class="fas fa-play"></i>
                        </button>
                        <button
                            title="暂停"
                            on:click={() => {
                                clearInterval(timer);
                                isRunning = false;
                            }}
                        >
                            <i class="fas fa-pause"></i>
                        </button>
                        <button
                            title="停止"
                            on:click={() => {
                                clearInterval(timer);
                                isRunning = false;
                                resetTimer("focus");
                            }}
                        >
                            <i class="fas fa-stop"></i>
                        </button>
                        <button
                            title="设置"
                            on:click={() => {
                                showSettings = true;
                                resetTimer(isBreak ? "break" : "focus");
                            }}
                        >
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                </div>
                {#if showFocusInfo}
                    <div class="focus-info">
                        <p>
                            已专注{totalFocusTimes}次，总时长{formatDuration(
                                totalFocusTime,
                                2,
                            )}
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        transition: background-image 0.5s ease;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        position: relative;
        overflow: hidden;
    }

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        box-shadow: 0 4px 16px 0 rgba(31, 38, 135, 0.1);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 1;
        pointer-events: none;
    }

    .focus-timer-section {
        z-index: 2;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    .timer-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    .timer-display {
        text-align: center;
        padding: 1rem;
        transition: all 0.3s ease;
        font-weight: bolder;
        font-size: 3rem;

        &.classic {
            color: var(--b3-theme-primary);
            background: none;
            padding: 0.5rem;
            border-radius: 1rem;
            background-color: whitesmoke;
        }

        &.modern {
            color: #e5e7eb;
            background-color: #2e343d;
            border: 2px solid black;
            border-radius: 8px;
            box-shadow:
                0 4px 6px -1px rgba(0, 0, 0, 0.1),
                0 2px 4px -1px rgba(0, 0, 0, 0.06);
            padding: 0.5rem 1rem;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        &.rounded {
            color: var(--b3-theme-primary);
            background-color: var(--b3-theme-surface);
            border-radius: 999px;
            padding: 1rem 2rem;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        }

        &.digital-clock {
            font-family: "Courier New", Courier, monospace;
            color: #06b6d4;
            background-color: #0f172a;
            border-radius: 8px;
            padding: 0.8rem 1.5rem;
            letter-spacing: 2px;
        }
    }

    .timer-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .timer-controls {
        margin-top: 1.5rem;
        display: none;
        gap: 0.5rem;

        button {
            background-color: transparent;
            border: none;
            cursor: pointer;
            color: var(--b3-theme-primary);
            background-color: rgba(255, 255, 255, 0.5);
            transition: color 0.2s;

            &:hover {
                border-radius: 50%;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                transform: scale(1.1);
                width: fit-content;
                background-color: var(--b3-theme-background);
            }
        }
    }

    .content-display:hover .timer-controls {
        display: flex;
    }

    .focus-info {
        position: absolute;
        bottom: 0.2rem;
        margin-top: 1rem;
        font-size: 1rem;
        padding: 0.5rem;
        border-radius: 1rem;
        color: var(--text-color-dark);
        opacity: 0.5;
        background-color: whitesmoke;
    }

    .settings-modal {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1rem;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-height: 100%;
        background-color: var(--b3-theme-background);
        z-index: 100;
        overflow-y: auto;
    }

    .modal-actions {
        margin-top: 1.5rem;
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
    }

    button {
        padding: 0.5rem;
        font-size: 0.9rem;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 6px;
        background-color: transparent;
        transition: all 0.2s;
        cursor: pointer;
    }

    .form-group {
        label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.5rem;
        }

        input[type="number"] {
            width: 50px;
            padding: 0.3rem;
            border: 1px solid #cbd5e1;
            border-radius: 4px;

            &:hover {
                border-color: var(--b3-theme-primary);
                outline: none;
                box-shadow: 0 0 0 1px var(--b3-theme-primary);
            }

            &:focus {
                border-color: var(--b3-theme-primary);
                outline: none;
                box-shadow: 0 0 0 1px var(--b3-theme-primary);
            }
        }

        input[type="checkbox"] {
            margin-right: 0.5rem;
        }

        select {
            padding: 0.3rem;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
        }
    }

    .circular-timer {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .timer-display.circular-progress {
        background-color: transparent !important;
        color: #333;
        padding: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .timer-display .circular-timer svg circle {
        transition: stroke-dashoffset 0.3s linear;
    }

    .timer-display .circular-timer svg text {
        font-weight: bold;
        dominant-baseline: middle;
    }
</style>
