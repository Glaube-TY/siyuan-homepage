<script lang="ts">
    import { onMount } from "svelte";

    export let contentTypeJson: string = "{}";

    // 时间相关状态
    let currentTime = new Date();
    let timeOfDay = "afternoon";
    let timedateFontSize = 2;

    // 农历信息
    let lunarYear = ""; // 天干地支年，例如“乙巳年”
    let lunarMonthDay = ""; // 月份+日，例如“五月十七”
    let lunarZodiac = ""; // 生肖，例如“蛇年”
    let solarTerm = ""; // 节气
    let lunarZodiacIcon = ""; // 生肖图标

    // 星期与工作日状态
    let weekDay = ""; // 星期几
    let weekDayWithWorkStatus = "加载中...";

    // 设置项默认值
    let showSeconds: boolean = true;
    let dateFormat: string = "YYYY-MM-DD";
    let showLunar: boolean = true;
    let showZodiac: boolean = true;
    let showSolarTerm: boolean = true;
    let showWeek: boolean = true;
    let showDate: boolean = true;

    // 十二生肖图标映射
    const zodiacIcons: Record<string, string> = {
        鼠: "🐭",
        牛: "🐮",
        虎: "🐯",
        兔: "🐰",
        龙: "🐉",
        蛇: "🐍",
        马: "🐴",
        羊: "🐑",
        猴: "🐵",
        鸡: "🐔",
        狗: "🐶",
        猪: "🐷",
    };

    // 更新时间段（早/中/晚）
    const updateTimeOfDay = () => {
        const hour = currentTime.getHours();
        if (hour >= 6 && hour < 12) {
            timeOfDay = "morning";
        } else if (hour >= 12 && hour < 18) {
            timeOfDay = "afternoon";
        } else {
            timeOfDay = "night";
        }
    };

    // 根据当前时间更新显示内容
    const updateTime = () => {
        currentTime = new Date();
        updateTimeOfDay();
        currentDateStr = formatDateString(currentTime);
    };

    // 获取农历等信息
    const updateDateAndLunar = async () => {
        const url = `https://v.api.aa1.cn/api/nl/`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("网络响应失败");

            const data = await response.json();
            const nl = data.nl || "";

            // 解析农历数据
            if (nl.includes("农历")) {
                const content = nl.replace("农历", "").trim();

                // 匹配年份
                const yearMatch = content.match(/^([\u4e00-\u9fa5]{2})年/);
                if (yearMatch) {
                    lunarYear = yearMatch[0];
                    let restContent = content.substring(yearMatch[0].length);

                    // 匹配生肖
                    const zodiacMatch =
                        restContent.match(/([\u4e00-\u9fa5])年$/);
                    if (zodiacMatch) {
                        lunarZodiac = zodiacMatch[0];
                        restContent = restContent
                            .substring(
                                0,
                                restContent.length - zodiacMatch[0].length,
                            )
                            .trim();
                    }

                    // 处理闰月和日期
                    lunarMonthDay = restContent.replace(/闰/g, "闰 ").trim();
                    const zodiacName = lunarZodiac.replace("年", "");
                    lunarZodiacIcon = zodiacIcons[zodiacName] || "";
                }
            }

            // 节气与星期
            solarTerm = data.jq || "";
            weekDay = data.xq || "";
            weekDayWithWorkStatus = `${weekDay} ${data.gzr || ""}`;
        } catch (error) {
            console.error("获取农历失败:", error);
            solarTerm = "";
            weekDay = "";
        }
    };

    // 日期格式化函数
    const formatDateString = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        switch (dateFormat) {
            case "YYYY年MM月DD日":
                return `${year}年${month}月${day}日`;
            case "YYYY-MM-DD":
                return `${year}-${month}-${day}`;
            case "YYYY/MM/DD":
                return `${year}/${month}/${day}`;
            case "YYYY.MM.DD":
                return `${year}.${month}.${day}`;
            default:
                return date.toLocaleDateString();
        }
    };

    // 当前日期字符串（根据格式变化）
    let currentDateStr = formatDateString(currentTime);

    // 获取今天零点的时间戳
    const getMidnightTimestamp = (): number => {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0); // 设置为明天零点
        return midnight.getTime();
    };

    let morningImageType: "remote" | "local" = "remote";
    let afternoonImageType: "remote" | "local" = "remote";
    let nightImageType: "remote" | "local" = "remote";

    let morningBgUrl: string = "";
    let afternoonBgUrl: string = "";
    let nightBgUrl: string = "";

    let morningBgImage: string = "";
    let afternoonBgImage: string = "";
    let nightBgImage: string = "";

    // 初始化及定时刷新
    onMount(() => {
        // 初始更新时间和农历
        updateTime();
        updateDateAndLunar();

        // 更新时间
        const intervalId = setInterval(updateTime, 50);

        // 计算到午夜的时间，并在午夜刷新一次
        const timeUntilMidnight = getMidnightTimestamp() - Date.now();
        const tomorrowUpdateTimeout = setTimeout(() => {
            updateDateAndLunar();
            setInterval(updateDateAndLunar, 24 * 60 * 60 * 1000); // 此后每天刷新一次
        }, timeUntilMidnight);

        // 返回清理函数
        return () => {
            clearInterval(intervalId);
            clearTimeout(tomorrowUpdateTimeout);
        };
    });

    // 响应式解析传入的配置
    $: {
        if (contentTypeJson) {
            try {
                const config = JSON.parse(contentTypeJson);
                if (config.type === "timedate" && config.data) {
                    showSeconds = config.data.showSeconds ?? true;
                    dateFormat = config.data.dateFormat ?? "YYYY-MM-DD";
                    showLunar = config.data.showLunar ?? true;
                    showZodiac = config.data.showZodiac ?? true;
                    showSolarTerm = config.data.showSolarTerm ?? true;
                    showWeek = config.data.showWeek ?? true;
                    showDate = config.data.showDate ?? true;

                    morningImageType = config.data.morningImageType ?? "remote";
                    afternoonImageType =
                        config.data.afternoonImageType ?? "remote";
                    nightImageType = config.data.nightImageType ?? "remote";

                    morningBgUrl =
                        config.data.morningBgUrl ||
                        "https://haowallpaper.com/link/common/file/previewFileImg/16637944029171072";
                    afternoonBgUrl =
                        config.data.afternoonBgUrl ||
                        "https://haowallpaper.com/link/common/file/previewFileImg/16989237330693504";
                    nightBgUrl =
                        config.data.nightBgUrl ||
                        "https://haowallpaper.com/link/common/file/previewFileImg/15477811848581440";

                    morningBgImage = config.data.morningBgImage || "";
                    afternoonBgImage = config.data.afternoonBgImage || "";
                    nightBgImage = config.data.nightBgImage || "";
                    timedateFontSize =
                        config.data.timedateFontSize || timedateFontSize;
                }
            } catch (e) {
                console.warn("无法解析 contentTypeJson", e);
            }
        }
    }
</script>

<div
    class="content-display"
    class:morning={timeOfDay === "morning"}
    class:afternoon={timeOfDay === "afternoon"}
    class:night={timeOfDay === "night"}
    style="
        background-image: url({timeOfDay === 'morning'
        ? morningImageType === 'remote'
            ? morningBgUrl
            : morningBgImage
        : timeOfDay === 'afternoon'
          ? afternoonImageType === 'remote'
              ? afternoonBgUrl
              : afternoonBgImage
          : nightImageType === 'remote'
            ? nightBgUrl
            : nightBgImage});
    "
>
    <!-- 时间 -->
    <div class="time-line">
        <span
            class="time text-overlay"
            style="font-size: {timedateFontSize}rem;"
        >
            {currentTime.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                second: showSeconds ? "2-digit" : undefined,
            })}
        </span>
    </div>

    <!-- 日期 -->
    {#if showDate}
        <div class="date-line">
            <span
                class="date text-overlay"
                style="font-size: {timedateFontSize / 2}rem;"
                >{currentDateStr}</span
            >
        </div>
    {/if}

    <!-- 星期 + 工作日状态 -->
    {#if showWeek}
        <div class="week-day-line">
            <span
                class="day-status text-overlay"
                style="font-size: {timedateFontSize / 2}rem;"
            >
                {weekDayWithWorkStatus}
            </span>
        </div>
    {/if}

    <!-- 农历 -->
    {#if showLunar}
        <div class="lunar-line">
            <span
                class="lunar text-overlay"
                style="font-size: {timedateFontSize / 2}rem;"
                >{lunarYear} {lunarMonthDay}</span
            >
        </div>
    {/if}

    <!-- 生肖 -->
    {#if showZodiac}
        <div class="zodiac-line">
            <span
                class="zodiac text-overlay"
                style="font-size: {timedateFontSize / 2}rem;"
                >{lunarZodiac.replace("年", "")}{lunarZodiacIcon}</span
            >
        </div>
    {/if}

    <!-- 节气 -->
    {#if showSolarTerm}
        <div class="solar-term-line">
            <span
                class="text-overlay"
                style="font-size: {timedateFontSize / 2}rem;"
                >{solarTerm}</span
            >
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border-radius: 16px;
        padding: 2rem;
        box-sizing: border-box;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        color: white;
        font-family: "Segoe UI", sans-serif;
        text-align: center;
        word-wrap: break-word;
        word-break: break-all;
        white-space: normal;
        position: relative;
        max-width: 100%;
        max-height: 100%;
        transition:
            background 0.5s ease-in-out,
            color 0.5s ease-in-out;

        /* 默认背景 */
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        background-blend-mode: overlay; // 混合模式增强可读性
    }

    .text-overlay {
        background-color: rgba(255, 255, 255, 0.3); // 半透明白底
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        display: inline-block;
        margin: 0.3rem 0;
    }

    /* 早晨背景：使用网络图片 */
    .content-display.morning {
        background-image: url("https://haowallpaper.com/link/common/file/previewFileImg/16637944029171072");
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        color: #222;
        position: relative;
    }

    /* 中午背景：使用网络图片 */
    .content-display.afternoon {
        background-image: url("https://haowallpaper.com/link/common/file/previewFileImg/16989237330693504");
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        color: #222;
        position: relative;
    }

    /* 晚上背景：使用网络图片 */
    .content-display.night {
        background-image: url("https://haowallpaper.com/link/common/file/previewFileImg/15477811848581440");
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        color: #222;
        position: relative;
    }

    /* 添加白色毛玻璃层 */
    .content-display.night::before,
    .content-display.afternoon::before,
    .content-display.morning::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.15); // 更加透明，柔和
        backdrop-filter: blur(4px);
        z-index: 1;
        border-radius: 8px;
    }

    /* 所有内容置顶显示在毛玻璃层之上 */
    .content-display > * {
        position: relative;
        z-index: 2;
    }

    /* 通用样式：用于适配不同时间段下的文字颜色 */
    .content-display .time,
    .content-display .date,
    .content-display .day-status,
    .content-display .lunar,
    .content-display .zodiac,
    .content-display .solar-term-line span {
        transition: color 0.5s ease-in-out;
    }

    .content-display.morning .time,
    .content-display.morning .date,
    .content-display.morning .day-status,
    .content-display.morning .lunar,
    .content-display.morning .zodiac,
    .content-display.morning .solar-term-line span {
        color: #222 !important;
    }

    .content-display.afternoon .time,
    .content-display.afternoon .date,
    .content-display.afternoon .day-status,
    .content-display.afternoon .lunar,
    .content-display.afternoon .zodiac,
    .content-display.afternoon .solar-term-line span {
        color: #222 !important;
    }

    .content-display.night .time,
    .content-display.night .date,
    .content-display.night .day-status,
    .content-display.night .lunar,
    .content-display.night .zodiac,
    .content-display.night .solar-term-line span {
        color: #222 !important;
    }

    /* 基础布局与动画 */
    .time-line,
    .date-line,
    .week-day-line,
    .lunar-line,
    .zodiac-line,
    .solar-term-line {
        display: flex;
        align-items: center;
        opacity: 0.95;
        transition:
            transform 0.2s ease,
            opacity 0.3s ease;
        flex-wrap: wrap;
        justify-content: center;
        text-align: center;
        width: 100%;
        padding: 0 1rem;
        box-sizing: border-box;
    }

    @keyframes pulse {
        0% {
            opacity: 0.6;
        }
        50% {
            opacity: 1;
        }
        100% {
            opacity: 0.6;
        }
    }

    .time {
        font-weight: bold;
        letter-spacing: 1px;
        color: #ffffff;
        word-wrap: break-word;
        word-break: break-all;
        white-space: normal;
        max-width: 100%;
    }

    .date,
    .day-status,
    .lunar,
    .zodiac,
    .solar-term-line span {
        color: #d1d5db;
        word-wrap: break-word;
        word-break: break-all;
        white-space: normal;
        max-width: 100%;
    }

    @media (max-width: 480px) {
        .time {
            font-size: 1.4rem;
        }

        .date,
        .day-status,
        .lunar,
        .zodiac {
            font-size: 0.95rem;
        }
    }
</style>
