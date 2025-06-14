<script lang="ts">
    import { onMount } from "svelte";
    import { getLatestDocuments, type latestDocumentInfo } from "./latestDocs";

    export let contentTypeJson: string = "{}";

    // 文档数据源
    let documentList: latestDocumentInfo[] = [];

    // 最终显示的文档
    let displayedDocs: latestDocumentInfo[] = [];

    // 模拟加载文档数据
    onMount(async () => {
        documentList = await getLatestDocuments();
    });

    $: {
        try {
            const parsed = JSON.parse(contentTypeJson);
            if (parsed.type === "latest-docs") {
                const limit = parsed.data?.[0]?.limit || 5;
                displayedDocs = documentList.slice(0, limit);
            }
        } catch (e) {
            console.error("解析 contentTypeJson 出错", e);
            displayedDocs = [];
        }
    }

    // 日期格式化函数
    function formatDate(updated: string): string {
        const hour = updated.substring(8, 10);
        const minute = updated.substring(10, 12);
        const second = updated.substring(12, 14);
        return `${hour}:${minute}:${second}`;
    }

    // 获取时间差并格式化为“X天前”或“今天”
    function getTimeAgo(updated: string): string {
        const now = new Date();
        const year = parseInt(updated.substring(0, 4));
        const month = parseInt(updated.substring(4, 6)) - 1; // 月份从 0 开始
        const day = parseInt(updated.substring(6, 8));
        const hour = parseInt(updated.substring(8, 10));
        const minute = parseInt(updated.substring(10, 12));
        const second = parseInt(updated.substring(12, 14));

        const docDate = new Date(year, month, day, hour, minute, second);
        const diffTime = now.getTime() - docDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            const today = formatDate(updated);
            return `今天 ${today}`;
        } else {
            return `${diffDays}天前`;
        }
    }
</script>

<div class="content-display">
    <h3 class="widget-title">🕒最近文档</h3>
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
                        📄 {doc.content || "(无标题)"}
                    </a>
                    <div class="document-updated-container">
                        <span class="document-updated">
                            更新于：📅{getTimeAgo(doc.updated)}
                        </span>
                    </div>
                </li>
            {/each}
        {:else}
            <p>暂无文档</p>
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

    .document-list {
        list-style: none;
        padding-left: 0;
        margin: 0;
        overflow-y: auto;
    }

    .document-item {
        padding: 0.5rem 0.75rem;
        margin-bottom: 0.5rem;
        background-color: #f8fafc;
        border-radius: 6px;
        font-size: 14px;
        color: #475569;
        transition: background-color 0.2s ease;

        &:hover {
            background-color: #eff6ff;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
    }

    .document-title {
        display: block;
        color: var(--b3-theme-primary);
        text-decoration: none;
        font-weight: bold;
    }

    .document-updated-container {
        margin-top: 4px;
    }

    .document-updated {
        color: #94a3b8;
        font-size: 12px;
        margin-left: 4px;
    }
</style>
