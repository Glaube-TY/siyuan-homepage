<script lang="ts">
    import { onMount } from "svelte";
    import {
        getLatestDailyNotes,
        type DailyNoteInfo,
    } from "./latestDailyNotes";

    export let contentTypeJson: string = "{}";

    // 原始数据
    let dailyNotes: DailyNoteInfo[] = [];

    // 最终显示的笔记
    let displayedDocs: DailyNoteInfo[] = [];

    onMount(async () => {
        dailyNotes = await getLatestDailyNotes();
    });

    // 解析 limit
    $: {
        try {
            const parsed = JSON.parse(contentTypeJson);
            if (parsed.type === "recent-journals") {
                const limit = parsed.data?.[0]?.limit || 5;

                // 排序并截取指定数量的文档
                const sorted = [...dailyNotes].sort((a, b) =>
                    b.created.localeCompare(a.created),
                );
                displayedDocs = sorted.slice(0, limit);
            }
        } catch (err) {
            console.error("Failed to parse contentTypeJson:", err);
            displayedDocs = [];
        }
    }
</script>

<div class="content-display">
    <h3 class="widget-title">📓最近日记</h3>
    <ul class="document-list">
        {#if displayedDocs.length > 0}
            {#each displayedDocs as doc (doc.id + "-" + doc.updated)}
                <li class="document-item">
                    <a
                        href={"siyuan://blocks/" + doc.id}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="document-title"
                    >
                        📅 {doc.content || "(无标题)"}
                    </a>
                </li>
            {/each}
        {:else}
            <p>暂无日记记录</p>
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
        padding: 10px;
        box-sizing: border-box;
    }

    .document-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: center;
        list-style: none;
        padding-left: 0;
        margin: 0;
        overflow-y: auto;
    }

    .document-item {
        flex: 0 0 auto;
        padding: 0.5rem 0.75rem;
        margin-bottom: 0.5rem;
        background-color: #f8fafc;
        border-radius: 6px;
        font-size: 14px;
        color: #475569;
        transition: background-color 0.2s ease;
    }

    .document-item:hover {
        background-color: #eff6ff;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .document-title {
        color: var(--b3-theme-primary);
        text-decoration: none;
        font-weight: bold;
    }
</style>
