<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";

    export let contentTypeJson: string = "{}";

    let countdownEvents = [];
    let countdownStyle = "list";
    let currentIndex = 0;
    let countdownLocalBg = "";
    let countdownFullBg =
        "https://haowallpaper.com/link/common/file/previewFileImg/17021275790298496";
    let countdownFullBgSelect = "remote";
    let countdownFontSize = 3;

    function nextEvent() {
        if (currentIndex < countdownEvents.length - 1) {
            currentIndex += 1;
        }
    }

    function prevEvent() {
        if (currentIndex > 0) {
            currentIndex -= 1;
        }
    }
    // 解析并初始化倒计时数据
    function initCountdownData() {
        try {
            const parsedData = JSON.parse(contentTypeJson);
            countdownStyle = parsedData.data?.countdownStyle || countdownStyle;
            countdownLocalBg = parsedData.data?.countdownLocalBg || "";
            countdownFullBg = parsedData.data?.countdownFullBg || "";
            countdownFullBgSelect =
                parsedData.data?.countdownFullBgSelect || "";
            countdownFontSize =
                parsedData.data?.countdownFontSize || countdownFontSize;

            if (
                parsedData &&
                parsedData.data?.eventList &&
                parsedData.data.eventList.length > 0
            ) {
                countdownEvents = [...parsedData.data.eventList];
            } else {
                // 默认示例数据
                countdownEvents = [{ name: "纪念日", date: "2023-05-20" }];
            }
        } catch (e) {
            console.error("无法解析 contentTypeJson", e);
            countdownEvents = [{ name: "纪念日", date: "2023-05-20" }];
        }
    }

    // 计算倒计时天数
    function getDaysLeft(targetDateStr: string): {
        text: string;
        status: "today" | "expired" | "future";
    } {
        const now = new Date();
        const targetDate = new Date(targetDateStr);
        const diffTime = targetDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
            return { text: `还剩 ${diffDays} 天`, status: "future" };
        } else if (diffDays === 0) {
            return { text: "今天", status: "today" };
        } else {
            return { text: `已过 ${Math.abs(diffDays)} 天`, status: "expired" };
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

    onMount(async () => {
        initCountdownData();

        if (countdownFullBgSelect === "remote") {
            countdownFullBg = await getImage(countdownFullBg);
        }
    });
</script>

<svelte:head>
    <link
        href="https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&family=Caveat:wght@700&family=Fredericka+the+Great&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<div
    class="content-display {countdownStyle === 'full' ? 'mode-full' : ''}"
    style:background-image={countdownStyle === "full"
        ? `url(${countdownFullBgSelect === "remote" ? countdownFullBg : countdownLocalBg})`
        : ""}
>
    {#if countdownStyle === "list"}
        <h3 class="widget-title">📅 倒数日</h3>
        <ul class="countdown-list">
            {#each countdownEvents as event (event.name)}
                <li class="countdown-item">
                    <div class="countdown-name">{event.name}</div>
                    <div class="countdown-date">
                        📅 {formatDate(event.date)}
                    </div>
                    <div
                        class="countdown-days {getDaysLeft(event.date).status}"
                    >
                        <strong>{getDaysLeft(event.date).text}</strong>
                    </div>
                </li>
            {/each}
        </ul>
    {:else if countdownStyle === "full"}
        <div class="overlay"></div>
        <div class="full-page-container">
            <button class="nav-button left" on:click={prevEvent}>&lt;</button>
            <div class="full-page-event">
                <div
                    class="full-page-name"
                    style="font-size: {countdownFontSize}rem;"
                >
                    {countdownEvents[currentIndex].name}
                </div>

                <div
                    class="full-page-date"
                    style="font-size: {countdownFontSize / 2 + 0.5}rem;"
                >
                    {formatDate(countdownEvents[currentIndex].date)}
                </div>

                <div
                    class="full-page-days {getDaysLeft(
                        countdownEvents[currentIndex].date,
                    ).status}"
                    style="font-size: {countdownFontSize}rem;"
                >
                    <strong
                        >{getDaysLeft(countdownEvents[currentIndex].date)
                            .text}</strong
                    >
                </div>
            </div>
            <button class="nav-button right" on:click={nextEvent}>&gt;</button>
        </div>
    {/if}
</div>

<style lang="scss">
    .widget-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--b3-theme-on-primary);
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--b3-border-color);
        text-align: center;
        display: inline-block;
        line-height: 1.2;
    }

    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        background-color: var(--b3-theme-background);
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        overflow: hidden;
        transition: background-image 0.3s ease;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
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

    .countdown-list {
        list-style: none;
        padding-left: 0;
        margin: 0;
        overflow-y: auto;
    }

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
        color: var(--b3-theme-on-primary);
    }

    .countdown-date {
        font-size: 12px;
        color: var(--b3-theme-on-secondary);
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

    .full-page-container {
        display: flex;
        z-index: 2;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        height: 100%;
        position: relative;
        box-sizing: border-box;
    }

    .full-page-event {
        flex: 1;
        text-align: center;
        padding: 4rem 2rem;
        box-sizing: border-box;
        border-radius: 12px;
        background-color: color-mix(
            in srgb,
            var(--b3-theme-surface) 50%,
            transparent
        );
        margin: 0 1rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .nav-button {
        display: none;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 10;
        background-color: color-mix(
            in srgb,
            var(--b3-theme-primary) 50%,
            transparent
        );
        border: none;
        color: var(--b3-theme-on-primary);
        font-size: 20px;
        padding: 0.5rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .content-display:hover .nav-button {
        display: flex;
        align-items: center;
    }

    .left {
        left: 1rem;
    }

    .right {
        right: 1rem;
    }

    .mode-full {
        .full-page-name {
            font-size: 3rem;
            font-family: "Great Vibes", cursive; /* 艺术标题字体 */
            font-weight: 400;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
        }

        .full-page-date {
            font-size: 1.5rem;
            font-family: "Caveat", cursive; /* 手写风日期 */
            margin-bottom: 2rem;
            text-shadow: 1px 1px 6px rgba(0, 0, 0, 0.4);
        }

        .full-page-days {
            font-size: 3rem;
            font-family: "Caveat", cursive;
            font-weight: 700;
            text-shadow: 1px 1px 6px rgba(0, 0, 0, 0.4);

            &.today {
                strong {
                    color: rgb(226, 60, 60); /* 今天：红色 */
                }

                &:hover {
                    border-radius: 50%;
                    background-color: var(--b3-list-hover);
                }
            }

            &.expired {
                strong {
                    color: #94a3b8;
                }

                &:hover {
                    border-radius: 50%;
                    background-color: var(--b3-list-hover);
                }
            }

            &.future {
                &:hover {
                    border-radius: 50%;
                    background-color: var(--b3-list-hover);
                }

                strong {
                    color: var(--b3-theme-primary);
                }
            }

            strong {
                font-weight: 700;
            }
        }
    }
</style>
