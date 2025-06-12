<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    // 示例数据格式：{ name: string, date: string (ISO 8601), id?: string }
    let countdownEvents = [];

    // 解析并初始化倒计时数据
    function initCountdownData() {
        try {
            const parsedData = JSON.parse(contentTypeJson);
            if (parsedData && parsedData.data && parsedData.data.length > 0) {
                countdownEvents = [...parsedData.data];
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
        return `${year}-${month}-${day}`;
    }

    onMount(() => {
        initCountdownData();
    });
</script>

<div class="content-display">
    <h3 class="widget-title">📅 倒数日</h3>
    <ul class="countdown-list">
        {#if countdownEvents.length > 0}
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
        {:else}
            <p>暂无倒数日记录</p>
        {/if}
    </ul>
</div>

<style>
    .widget-title {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b; /* 深灰色 */
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid #e2e8f0; /* 淡灰色下边框 */
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
        background-color: var(--bg3-color-dark);
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .countdown-list {
        list-style: none;
        padding-left: 0;
        margin: 0;
        overflow-y: auto;
    }

    .countdown-item {
        background-color: #f8fafc;
        border-radius: 6px;
        padding: 0.75rem 1rem;
        margin-bottom: 0.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background-color 0.2s ease;

        &:hover {
            background-color: #eff6ff;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
    }

    .countdown-name {
        font-size: 14px;
        font-weight: 600;
        color: #1e293b;
    }

    .countdown-date {
        font-size: 12px;
        color: #94a3b8;
        margin-left: 1rem;
    }

    .countdown-days {
        font-size: 14px;
        font-weight: 500;

        &.today strong {
            color: #e53e3e; /* 今天：红色 */
        }

        &.expired strong {
            color: #94a3b8; /* 已过：灰色 */
        }

        &.future strong {
            color: #48bb78; /* 未来：绿色 */
        }
    }
</style>
