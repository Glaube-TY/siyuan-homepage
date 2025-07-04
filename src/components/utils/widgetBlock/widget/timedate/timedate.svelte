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

    let morningImageType = "remote";
    let afternoonImageType = "remote";
    let nightImageType = "remote";

    let morningBgUrl: string =
        "https://haowallpaper.com/link/common/file/previewFileImg/16637944029171072";
    let afternoonBgUrl: string =
        "https://haowallpaper.com/link/common/file/previewFileImg/16989237330693504";
    let nightBgUrl: string =
        "https://haowallpaper.com/link/common/file/previewFileImg/15477811848581440";

    let morningBgImage: string = "";
    let afternoonBgImage: string = "";
    let nightBgImage: string = "";

    onMount(() => {
        updateTime();
        updateDateAndLunar();

        const intervalId = setInterval(updateTime, 50);
        const timeUntilMidnight = getMidnightTimestamp() - Date.now();
        const tomorrowUpdateTimeout = setTimeout(() => {
            updateDateAndLunar();
            setInterval(updateDateAndLunar, 24 * 60 * 60 * 1000);
        }, timeUntilMidnight);

        return () => {
            clearInterval(intervalId);
            clearTimeout(tomorrowUpdateTimeout);
        };
    });

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

                    morningImageType =
                        config.data.morningImageType || morningImageType;
                    afternoonImageType =
                        config.data.afternoonImageType || afternoonImageType;
                    nightImageType =
                        config.data.nightImageType || nightImageType;

                    morningBgUrl = config.data.morningBgUrl || morningBgUrl;
                    afternoonBgUrl =
                        config.data.afternoonBgUrl || afternoonBgUrl;
                    nightBgUrl = config.data.nightBgUrl || nightBgUrl;

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
                style="font-size: {timedateFontSize / 2}rem;">{solarTerm}</span
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
        font-family: "Segoe UI", sans-serif;
        text-align: center;
        word-wrap: break-word;
        word-break: break-all;
        white-space: normal;
        position: relative;
        max-width: 100%;
        max-height: 100%;

        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        background-blend-mode: overlay;
    }

    .text-overlay {
        background-color: color-mix(in srgb, var(--b3-theme-surface) 50%, transparent);
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        display: inline-block;
        margin: 0.3rem 0;
    }

    .content-display.night::before,
    .content-display.afternoon::before,
    .content-display.morning::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        backdrop-filter: blur(4px);
        z-index: 1;
        border-radius: 8px;
    }

    .content-display > * {
        position: relative;
        z-index: 2;
    }

    .content-display .time,
    .content-display .date,
    .content-display .day-status,
    .content-display .lunar,
    .content-display .zodiac,
    .content-display .solar-term-line span {
        transition: color 0.5s ease-in-out;
    }

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
