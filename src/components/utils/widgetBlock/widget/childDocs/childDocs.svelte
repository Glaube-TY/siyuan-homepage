<script lang="ts">
    import { onMount } from "svelte";
    import { openDocs } from "@/components/tools/openDocs";
    import { sql } from "@/api";
    import { formatDateShort } from "@/components/tools/formatDate";
    import {
        createFloatingDocPopup,
        setMouseOnTrigger,
        hideImmediately,
    } from "@/components/tools/floatingDoc";

    export let plugin: any;
    export let contentTypeJson: string = "{}";
    const parsed = JSON.parse(contentTypeJson);
    const childDocsTitle = parsed.data?.childDocsTitle || "📄子文档";
    const childDocsPrefix = parsed.data?.childDocsPrefix || "📄";
    const showChildDocsDetails = parsed.data?.showChildDocsDetails ?? true;
    const childDocsParentId = parsed.data?.childDocsParentId || "";
    const childDocsSortOrder = parsed.data?.childDocsSortOrder || "updated";

    let displayedDocs: any[] = [];
    let advancedEnabled = false;

    // 模拟加载文档数据
    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
        await getChildDocs();
    });

    async function getChildDocs() {
        const query = `
            SELECT *
            FROM blocks
            WHERE type = 'd'
            AND path LIKE '%/${childDocsParentId}/%'
            ORDER BY ${childDocsSortOrder} DESC
        `;
        displayedDocs = await sql(query);
    }
</script>

<div class="content-display">
    {#if advancedEnabled}
        <h3 class="widget-title">{childDocsTitle}</h3>
        <ul class="document-list">
            {#if displayedDocs.length > 0}
                {#each displayedDocs as doc (doc.id + "-" + doc.updated)}
                    <li class="document-item">
                        <div
                            class="document-item-content"
                            on:keydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    openDocs(plugin, doc.id);
                                }
                            }}
                            on:mouseenter={(e) => {
                                // 延迟显示，避免鼠标快速滑过时触发
                                setTimeout(() => {
                                    createFloatingDocPopup(doc, e, plugin);
                                }, 100);
                            }}
                            on:click={() => openDocs(plugin, doc.id)}
                            on:mouseleave={() => {
                                // 延迟隐藏，让用户有时间移入弹窗
                                setTimeout(() => {
                                    setMouseOnTrigger(false);
                                }, 150);
                            }}
                            on:click={() => {
                                // 点击时立即隐藏弹窗并打开文档
                                hideImmediately();
                                openDocs(plugin, doc.id);
                            }}
                            role="button"
                            tabindex="0"
                            aria-label="打开最近文档：{doc.content}"
                        >
                            {childDocsPrefix}
                            {doc.content}
                        </div>
                        {#if showChildDocsDetails}
                            {#if childDocsSortOrder === "updated"}
                                <div class="document-updated-container">
                                    <span class="document-updated">
                                        更新于：📅{formatDateShort(doc.updated)}
                                    </span>
                                </div>
                            {:else if childDocsSortOrder === "created"}
                                <div class="document-updated-container">
                                    <span class="document-updated">
                                        创建于：📅{formatDateShort(doc.created)}
                                    </span>
                                </div>
                            {/if}
                        {/if}
                    </li>
                {/each}
            {:else}
                <p>暂无文档</p>
            {/if}
        </ul>
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
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

        .document-list {
            list-style: none;
            padding-left: 0;
            margin: 0;
            overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            grid-gap: 1rem;
            align-items: start;
        }

        .document-item {
            padding: 0.5rem 0.75rem;
            background-color: var(--b3-theme-surface);
            border-radius: 6px;
            font-size: 14px;
            transition: background-color 0.2s ease;
            break-inside: avoid;
            display: flex;
            flex-direction: column;

            &:hover {
                background-color: var(--b3-list-hover);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }

            .document-item-content {
                margin-top: 4px;
                display: block;
                color: var(--b3-theme-primary);
                text-decoration: none;
                font-weight: bold;
                cursor: pointer;
                flex-grow: 1;

                &:hover {
                    text-decoration: underline;
                }
            }

            .document-updated-container {
                font-size: 12px;
                margin-left: 0;
                margin-top: 4px;
            }
        }

        .content-not-advanced {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }
    }
</style>