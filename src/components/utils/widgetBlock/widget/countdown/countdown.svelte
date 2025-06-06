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
                countdownEvents = [
                    { name: "纪念日", date: "2023-05-20" },
                ];
            }
        } catch (e) {
            console.error("无法解析 contentTypeJson", e);
            countdownEvents = [
                { name: "纪念日", date: "2023-05-20" },
            ];
        }
    }

    // 计算倒计时天数
    function getDaysLeft(targetDateStr: string): number | string {
        const now = new Date();
        const targetDate = new Date(targetDateStr);
        const diffTime = targetDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 0) {
            return `还剩 ${diffDays} 天`;
        } else {
            return `已过 ${Math.abs(diffDays)} 天`;
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
    <h3 class="widget-title">倒数日</h3>
    <ul class="countdown-list">
        {#if countdownEvents.length > 0}
            {#each countdownEvents as event (event.name)}
                <li class="countdown-item">
                    <div class="countdown-name">{event.name}</div>
                    <div class="countdown-date">
                        📅 {formatDate(event.date)}
                    </div>
                    <div class="countdown-days">
                        <strong>{getDaysLeft(event.date)}</strong>
                    </div>
                </li>
            {/each}
        {:else}
            <p>暂无倒数日记录</p>
        {/if}
    </ul>
</div>

<style>
    .content-display {
        width: 100%;
        padding: 10px;
        box-sizing: border-box;
        font-family: sans-serif;
    }

    .widget-title {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid #e2e8f0;
        text-align: center;
        display: inline-block;
        line-height: 1.2;
    }

    .countdown-list {
        list-style: none;
        padding-left: 0;
        margin-top: 1rem;
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
    }

    .countdown-item:hover {
        background-color: #eff6ff;
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
        color: #48bb78; /* 绿色 */
    }

    .countdown-days strong {
        color: #2f855a;
    }

    .expired {
        color: #e53e3e;
        font-weight: bold;
    }
</style>
