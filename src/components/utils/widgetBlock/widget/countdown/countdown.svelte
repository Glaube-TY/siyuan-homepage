<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";

    interface Props {
        contentTypeJson?: string;
    }

    let { contentTypeJson = "{}" }: Props = $props();
    const parsed = JSON.parse(contentTypeJson);

    let countdownEvents = parsed.data?.eventList || [];
    let countdownStyle = parsed.data?.countdownStyle || "list";

    let countdownCard1LocalBg = parsed.data?.countdownCard1LocalBg || "";
    let countdownCard1RemoteBg =
        $state(parsed.data?.countdownCard1RemoteBg ||
        "https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664");
    let countdownCard1BgSelect =
        parsed.data?.countdownCard1BgSelect || "remote";

    let countdownCard2BgColor = parsed.data?.countdownCard2BgColor || "#000000";

    let countdownList2BgColor = parsed.data?.countdownList2BgColor || "#000000";

    // 当前事件索引
    let currentEventIndex = $state(0);

    // 卡片配置管理器（方便后续扩展更多卡片类型）
    const cardConfig = {
        card1: {
            fontSize: { maxSize: 40, minSize: 20, decrement: 8 },
            dimensions: { width: 90, height: 90, rx: 5, ry: 5 },
            colors: {
                bg: "rgba(0, 0, 0, 0.5)",
                text: "rgba(255, 255, 255, 0.8)",
            },
        },
        card2: {
            fontSize: { maxSize: 35, minSize: 20, decrement: 6 },
            dimensions: { width: 100, height: 30, rx: 0, ry: 0 },
            colors: { bg: countdownCard2BgColor, text: "black" },
        },
        // 可以继续添加更多卡片配置...
        // card3: { ... },
        // card4: { ... },
    };

    // 计算倒计时天数
    function getDaysLeft(targetDateStr: string, isAnniversary: boolean = false): {
        text: string;
        status: "today" | "expired" | "future";
    } {
        const now = new Date();
        const targetDate = new Date(targetDateStr);
        
        // 如果是周年事件，计算到下一个周年还有多少天
        if (isAnniversary) {
            const currentYear = now.getFullYear();
            const targetMonth = targetDate.getMonth();
            const targetDay = targetDate.getDate();
            
            // 创建今年的周年日期
            let anniversaryDate = new Date(currentYear, targetMonth, targetDay);
            
            // 如果今年的周年日期已经过了，则计算到明年的周年日期
            if (anniversaryDate < now) {
                anniversaryDate = new Date(currentYear + 1, targetMonth, targetDay);
            }
            
            const diffTime = anniversaryDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 0) {
                return { text: `${diffDays}`, status: "future" };
            } else if (diffDays === 0) {
                return { text: "今天", status: "today" };
            } else {
                return { text: `${Math.abs(diffDays)}`, status: "expired" };
            }
        } else {
            // 非周年事件，按原始逻辑处理
            const diffTime = targetDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 0) {
                return { text: `${diffDays}`, status: "future" };
            } else if (diffDays === 0) {
                return { text: "今天", status: "today" };
            } else {
                return { text: `${Math.abs(diffDays)}`, status: "expired" };
            }
        }
    }

    // 格式化日期
    function formatDate(dateStr: string): string {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}年${month}月${day}日`;
    }

    // 根据数字长度获取适配的字体大小（使用配置管理器）
    function getAdaptiveFontSize(daysText: string, cardType: string): number {
        // 获取当前卡片的字体配置，默认为card1的配置
        const config =
            cardConfig[cardType]?.fontSize || cardConfig.card1.fontSize;
        const { maxSize, minSize, decrement } = config;

        // 数字长度
        const length = daysText.length;

        // 根据长度调整字体大小
        if (length <= 2) {
            return maxSize; // 两位数及以下用最大字体
        } else if (length === 3) {
            return Math.max(minSize, maxSize - decrement); // 三位数减小
        } else if (length === 4) {
            return Math.max(minSize, maxSize - decrement * 1.5); // 四位数减小更多
        } else {
            return minSize; // 五位数及以上用最小字体
        }
    }

    onMount(async () => {
        if (countdownCard1BgSelect === "remote") {
            countdownCard1RemoteBg = await getImage(countdownCard1RemoteBg);
        }
    });

    // 切换到上一个事件
    function previousEvent() {
        if (countdownEvents.length === 0) return;
        currentEventIndex =
            currentEventIndex > 0
                ? currentEventIndex - 1
                : countdownEvents.length - 1;
    }

    // 切换到下一个事件
    function nextEvent() {
        if (countdownEvents.length === 0) return;
        currentEventIndex =
            currentEventIndex < countdownEvents.length - 1
                ? currentEventIndex + 1
                : 0;
    }
</script>

<div class="content-display">
    {#if countdownStyle === "list1"}
        <div class="content-display-list1">
            <h3 class="widget-title">📅 倒数日</h3>
            <ul class="countdown-list">
                {#each countdownEvents as event (event.name)}
                    <li class="countdown-item">
                        <div class="countdown-name">{event.name}</div>
                        <div class="countdown-date">
                            📅 {formatDate(event.date)}
                            {#if event.anniversary}
                                <span class="anniversary-badge">周年</span>
                            {/if}
                        </div>
                        <div
                            class="countdown-days {getDaysLeft(event.date, event.anniversary)
                                .status}"
                        >
                            <strong>{getDaysLeft(event.date, event.anniversary).text}</strong>
                        </div>
                    </li>
                {/each}
            </ul>
        </div>
    {:else if countdownStyle === "list2"}
        <div class="content-display-list2">
            <ul class="countdown-list">
                {#each countdownEvents as event (event.name)}
                    <li class="countdown-item">
                        <div class="countdown-name">
                            {#if getDaysLeft(event.date, event.anniversary).status === "expired"}
                                {event.name}已过
                            {:else}
                                {event.name}
                                {#if event.anniversary}
                                    <span class="anniversary-badge">周年</span>
                                {/if}
                            {/if}
                        </div>
                        <div
                            class="countdown-days"
                            style="
                                background-color: {countdownList2BgColor};
                            "
                        >
                            {getDaysLeft(event.date, event.anniversary).text}
                        </div>
                    </li>
                {/each}
            </ul>
        </div>
    {:else if countdownStyle === "card1"}
        <div
            class="content-display-card1"
            style="
        background-image: url({countdownCard1BgSelect === 'remote'
                ? countdownCard1RemoteBg
                : countdownCard1LocalBg});
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
    "
        >
            <button
                class="countdown-button countdown-button-left"
                onclick={previousEvent}>◀︎</button
            >
            {#if countdownEvents.length > 0}
                <svg viewBox="0 0 100 100">
                    <!-- 倒计时卡片背景 -->
                    <rect
                        x="5"
                        y="5"
                        width="90"
                        height="90"
                        rx="5"
                        ry="5"
                        fill="rgba(0, 0, 0, 0.5)"
                    />
                    <!-- 倒计时卡片虚线 -->
                    <line
                        x1="10"
                        y1="50"
                        x2="90"
                        y2="50"
                        stroke="rgba(255, 255, 255, 0.8)"
                        stroke-width="1"
                        stroke-linecap="round"
                        stroke-dasharray="10,6"
                    />
                    <!-- 倒计时卡片数字 -->
                    <text
                        x="50%"
                        y="30%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size={getAdaptiveFontSize(
                            getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary)
                                .text,
                            "card1",
                        )}
                        font-weight="600"
                        fill="rgba(255, 255, 255, 0.8)"
                    >
                        {getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary)
                            .text}
                    </text>
                    <!-- 事件名称 -->
                    <text
                        x="50%"
                        y="65%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size="12"
                        font-weight="600"
                        fill="rgba(255, 255, 255, 0.8)"
                    >
                        {#if getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary).status === "future"}
                            {countdownEvents[currentEventIndex].name}
                            {#if countdownEvents[currentEventIndex].anniversary}
                                (周年)
                            {/if}
                        {:else}
                            {countdownEvents[currentEventIndex].name}
                            {#if countdownEvents[currentEventIndex].anniversary}
                                (周年)
                            {/if}
                        {/if}
                    </text>
                    <!-- 日期 -->
                    <text
                        x="50%"
                        y="80%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size="10"
                        fill="rgba(255, 255, 255, 0.8)"
                    >
                        {formatDate(countdownEvents[currentEventIndex].date)}
                    </text>
                </svg>
            {:else}
                <svg viewBox="0 0 100 100">
                    <rect
                        x="5"
                        y="5"
                        width="90"
                        height="90"
                        rx="5"
                        ry="5"
                        fill="rgba(255, 255, 255, 0.8)"
                    />
                    <text
                        x="50%"
                        y="50%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size="14px"
                        fill="var(--b3-theme-secondary)"
                    >
                        暂无事件
                    </text>
                </svg>
            {/if}
            <button
                class="countdown-button countdown-button-right"
                onclick={nextEvent}>▶︎</button
            >
        </div>
    {:else if countdownStyle === "card2"}
        <div class="content-display-card2">
            <button
                class="countdown-button countdown-button-left"
                onclick={previousEvent}>◀︎</button
            >
            {#if countdownEvents.length > 0}
                <svg viewBox="0 0 100 100">
                    <!-- 倒计时卡片背景 -->
                    <rect
                        x="0"
                        y="0"
                        width="100"
                        height="30"
                        fill={countdownCard2BgColor}
                    />
                    <!-- 倒计时卡片数字 -->
                    <text
                        x="50%"
                        y="60%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size={getAdaptiveFontSize(
                            getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary)
                                .text,
                            "card2",
                        )}
                        font-weight="600"
                        fill="black"
                    >
                        {getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary)
                            .text}
                    </text>
                    <!-- 事件名称 -->
                    <text
                        x="50%"
                        y="15%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size="12"
                        font-weight="600"
                        fill="white"
                    >
                        {#if getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary).status === "future"}
                            {countdownEvents[currentEventIndex].name}
                            {#if countdownEvents[currentEventIndex].anniversary}
                                (周年)
                            {/if}
                        {:else if getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary).status === "expired"}
                            {countdownEvents[currentEventIndex].name}已过
                            {#if countdownEvents[currentEventIndex].anniversary}
                                (周年)
                            {/if}
                        {:else if getDaysLeft(countdownEvents[currentEventIndex].date, countdownEvents[currentEventIndex].anniversary).status === "today"}
                            {countdownEvents[currentEventIndex].name}
                            {#if countdownEvents[currentEventIndex].anniversary}
                                (周年)
                            {/if}
                        {/if}
                    </text>
                    <!-- 日期 -->
                    <text
                        x="50%"
                        y="85%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size="8"
                        fill="rgba(0, 0, 0, 0.6)"
                    >
                        {formatDate(countdownEvents[currentEventIndex].date)}
                    </text>
                </svg>
            {:else}
                <svg viewBox="0 0 100 100">
                    <rect
                        x="5"
                        y="5"
                        width="90"
                        height="90"
                        rx="5"
                        ry="5"
                        fill="rgba(255, 255, 255, 0.8)"
                    />
                    <text
                        x="50%"
                        y="50%"
                        dominant-baseline="middle"
                        text-anchor="middle"
                        font-size="14px"
                        fill="var(--b3-theme-secondary)"
                    >
                        暂无事件
                    </text>
                </svg>
            {/if}
            <button
                class="countdown-button countdown-button-right"
                onclick={nextEvent}>▶︎</button
            >
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        display: flex;
        flex-direction: column;
        height: 100%;

        .content-display-list1 {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            padding: 1rem;
            box-sizing: border-box;

            .widget-title {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 0.5rem;
                padding-bottom: 0.3rem;
                border-bottom: 1px solid var(--b3-border-color);
                text-align: center;
                display: inline-block;
                line-height: 1.2;
            }

            .countdown-list {
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                list-style: none;
                padding-left: 0;
                margin: 0;

                .countdown-item {
                    background-color: var(--b3-theme-surface);
                    border-radius: 6px;
                    padding: 0.75rem 1rem;
                    margin-bottom: 0.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: background-color 0.2s ease;

                    &:hover {
                        background-color: var(--b3-list-icon-hover);
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    }
                }

                .countdown-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--b3-theme-primary);
                }

                .countdown-date {
                    font-size: 12px;
                    color: var(--b3-theme-secondary);
                    margin-left: 1rem;
                }

                .countdown-days {
                    font-size: 14px;
                    font-weight: 500;

                    &.today strong {
                        color: #e53e3e;
                    }

                    &.expired strong {
                        color: #94a3b8;
                    }

                    &.future strong {
                        color: var(--b3-theme-primary);
                    }
                }

                .anniversary-badge {
                    display: inline-block;
                    background-color: var(--b3-theme-primary);
                    color: white;
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-left: 6px;
                    font-weight: 500;
                }
            }
        }

        .content-display-list2 {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            padding: 1rem;
            box-sizing: border-box;
            overflow-y: auto;

            .countdown-list {
                list-style: none;
                padding-left: 0;
                margin: 0;
                overflow-y: auto;

                .countdown-item {
                    background-color: white;
                    border-radius: 6px;
                    margin-bottom: 0.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;

                    &:hover {
                        background-color: var(--b3-list-icon-hover);
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    }

                    .countdown-name {
                        font-size: 18px;
                        font-weight: 600;
                        color: black;
                        padding: 0.5rem;
                        display: flex;
                        align-items: center;

                        .anniversary-badge {
                            display: inline-block;
                            background-color: var(--b3-theme-primary);
                            color: white;
                            font-size: 10px;
                            padding: 2px 6px;
                            border-radius: 10px;
                            margin-left: 8px;
                            font-weight: 500;
                        }
                    }

                    .countdown-days {
                        width: auto;
                        height: 100%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        font-size: 20px;
                        font-weight: 600;
                        color: white;
                        background-color: var(--b3-theme-primary);
                        padding: 0.5rem 1.5rem;
                        border-radius: 0 6px 6px 0;
                    }
                }
            }
        }

        .content-display-card1 {
            width: 100%;
            height: 100%;
            display: flex;
            gap: 0;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            position: relative;
        }

        .countdown-button {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            border: none;
            background-color: transparent;
            color: var(--b3-theme-primary);
            font-size: 24px;
            cursor: pointer;
            transition: all 0.3s ease;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;

            &:hover {
                transform: translateY(-50%) scale(1.1);
            }
        }

        .countdown-button-left {
            left: 10px;
        }

        .countdown-button-right {
            right: 10px;
        }

        &:hover .countdown-button {
            opacity: 1;
        }
    }
</style>
