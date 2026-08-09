<script lang="ts">
    import { onMount } from "svelte";
    import type { RobotSettingsClient } from "@/features/robot-assistant/settings/robot-settings-client";

    interface Props { client: RobotSettingsClient; provider?: string; }
    interface ActivityItem {
        id: string;
        provider: string;
        direction: "in" | "out";
        status: string;
        contentPreview: string;
        resultSummary: string;
        createdAt: number;
    }

    let { client, provider = "all" }: Props = $props();
    let items = $state<ActivityItem[]>([]);
    let loading = $state(true);

    onMount(() => {
        void refresh();
        return client.subscribe("robot.historyChanged", () => { void refresh(); });
    });

    async function refresh(): Promise<void> {
        loading = true;
        try {
            const result = await client.getHistory(20);
            items = (Array.isArray(result?.items) ? result.items : [])
                .filter((item) => provider === "all" || item.provider === provider)
                .slice(-20)
                .reverse()
                .map((item) => ({
                    id: String(item.id ?? item.createdAt ?? ""),
                    provider: String(item.provider ?? "unknown"),
                    direction: item.direction === "out" ? "out" : "in",
                    status: String(item.status ?? "received"),
                    contentPreview: typeof item.contentPreview === "string" ? item.contentPreview : "",
                    resultSummary: typeof item.resultSummary === "string" ? item.resultSummary : "",
                    createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
                }));
        } finally {
            loading = false;
        }
    }

    function title(item: ActivityItem): string {
        if (item.direction === "out" && item.status === "failed") return "回复失败";
        if (item.direction === "out") return "回复已发送";
        if (item.resultSummary === "pairing_captured") return "已捕获账号";
        if (item.status === "ignored") return "消息已忽略";
        if (item.status === "failed") return "处理失败";
        if (item.status === "executed") return "处理完成";
        return "收到消息";
    }

    function detail(item: ActivityItem): string {
        return item.contentPreview || item.resultSummary || "";
    }

    function providerLabel(value: string): string {
        return value === "wechat" ? "微信" : value === "feishu" ? "飞书" : value === "qq" ? "QQ" : value;
    }

    function time(timestamp: number): string {
        if (!timestamp) return "";
        return new Intl.DateTimeFormat("zh-CN", {
            month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        }).format(timestamp);
    }
</script>

<div class="robot-log-dialog">
    <div class="robot-log-toolbar">
        <span>最近 {items.length}/20 条</span>
        <button class="b3-button b3-button--text" disabled={loading} onclick={() => refresh()}>刷新</button>
    </div>
    <div class="robot-log-list">
        {#if loading}
            <div class="robot-log-empty">加载中…</div>
        {:else if items.length === 0}
            <div class="robot-log-empty">暂无消息日志</div>
        {:else}
            {#each items as item (item.id)}
                <article class="robot-log-item robot-log-item--{item.status}">
                    <i></i>
                    <div>
                        <strong>{title(item)}</strong>
                        <span class="robot-log-provider">{providerLabel(item.provider)}</span>
                        {#if detail(item)}<span>{detail(item)}</span>{/if}
                    </div>
                    <time>{time(item.createdAt)}</time>
                </article>
            {/each}
        {/if}
    </div>
</div>

<style>
    .robot-log-dialog {
        display: flex;
        flex: 1;
        min-height: 0;
        height: 100%;
        flex-direction: column;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
    }

    .robot-log-toolbar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        padding: 8px 14px;
        border-bottom: 1px solid var(--b3-border-color);
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .robot-log-list {
        min-height: 0;
        overflow: auto;
    }

    .robot-log-item {
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 11px 14px;
    }

    .robot-log-item + .robot-log-item {
        border-top: 1px solid var(--b3-border-color);
    }

    .robot-log-item > i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22ad59;
    }

    .robot-log-item--ignored > i { background: #d38a19; }
    .robot-log-item--failed > i { background: var(--b3-theme-error); }

    .robot-log-item > div {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        min-width: 0;
        align-items: center;
        gap: 3px 8px;
    }

    .robot-log-item strong { font-size: 13px; }
    .robot-log-provider {
        justify-self: start;
        padding: 1px 6px;
        border-radius: 999px;
        color: var(--b3-theme-primary) !important;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    }
    .robot-log-item span,
    .robot-log-item time {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .robot-log-item > div > span:last-child:not(.robot-log-provider) {
        grid-column: 1 / -1;
    }

    .robot-log-empty {
        display: grid;
        min-height: 220px;
        place-items: center;
        color: var(--b3-theme-on-surface-light);
    }
</style>
