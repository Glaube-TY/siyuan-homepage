<script lang="ts">
    import { onMount } from "svelte";
    import { getLatestDocuments, type latestDocumentInfo } from "./latestDocs";

    export let contentTypeJson: string = "{}";

    // 文档数据源
    let documentList: latestDocumentInfo[] = [];

    // 解析后的 payload（用于获取 limit）
    let payload: { type: string; data: any[] } | null = null;

    // 最终显示的文档
    let displayedDocs: latestDocumentInfo[] = [];

    // 模拟加载文档数据
    onMount(async () => {
        documentList = await getLatestDocuments();
    });

    $: {
        try {
            const parsed = JSON.parse(contentTypeJson);
            payload = parsed;

            if (parsed.type === "latest-docs") {
                const limit = parsed.data?.[0]?.limit || 5;

                // 排序并截取指定数量的文档
                const sorted = [...documentList].sort((a, b) =>
                    b.updated.localeCompare(a.updated),
                );
                displayedDocs = sorted.slice(0, limit);
            }
        } catch (e) {
            console.error("解析 contentTypeJson 出错", e);
            displayedDocs = [];
        }
    }

    // 日期格式化函数
    function formatDate(updated: string): string {
        const year = updated.substring(0, 4);
        const month = updated.substring(4, 6);
        const day = updated.substring(6, 8);
        const hour = updated.substring(8, 10);
        const minute = updated.substring(10, 12);
        const second = updated.substring(12, 14);
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }
</script>

<div class="content-display">
    <h3 class="widget-title">最近文档</h3>
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
                    <span class="document-updated">
                        — 更新于：{formatDate(doc.updated)}
                    </span>
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
        padding: 10px;
        box-sizing: border-box;
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
    }

    .document-item:hover {
        background-color: #eff6ff;
    }

    .document-title {
        color: #10b981;
        text-decoration: none;
        font-weight: bold;
    }

    .document-updated {
        color: #94a3b8;
        font-size: 12px;
        margin-left: 4px;
    }
</style>
