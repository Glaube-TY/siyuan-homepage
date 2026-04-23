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
    import { resolveBuiltinDocIcon, normalizeSiyuanDocIcon, type DocIconResult } from "@/components/tools/docIcon";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();
    const parsed = $derived(JSON.parse(contentTypeJson));
    const childDocsTitle = $derived(parsed.data?.childDocsTitle || "📄子文档");
    const childDocsPrefix = $derived(parsed.data?.childDocsPrefix || "📄");
    const showChildDocsDetails = $derived(parsed.data?.showChildDocsDetails ?? true);
    const childDocsParentId = $derived(parsed.data?.childDocsParentId || "");
    const childDocsSortOrder = $derived(parsed.data?.childDocsSortOrder || "updated");
    const showChildDocsFloatDoc = $derived(parsed.data?.showChildDocsFloatDoc ?? true);
    const childDocsFloatDocShowTime =
        $derived(parsed.data?.childDocsFloatDocShowTime || 0.1);
    const useBuiltinDocIcon = $derived(parsed.data?.useBuiltinDocIcon ?? false);

    let displayedDocs: any[] = $state([]);

    // 获取文档图标（优先内置图标，否则回退到前缀）
    function getDocIcon(doc: any): DocIconResult {
        if (useBuiltinDocIcon) {
            const builtin = resolveBuiltinDocIcon(doc);
            if (builtin) return builtin;
        }
        return { type: "text", value: normalizeSiyuanDocIcon(childDocsPrefix) || "📄" };
    }

    // 悬浮窗定时器
    let floatDocTimeout: number | null = $state(null);
    let mouseLeaveTimeout: number | null = $state(null);

    // 清理所有悬浮预览相关的 timeout
    function clearFloatDocTimeouts() {
        if (floatDocTimeout) {
            clearTimeout(floatDocTimeout);
            floatDocTimeout = null;
        }
        if (mouseLeaveTimeout) {
            clearTimeout(mouseLeaveTimeout);
            mouseLeaveTimeout = null;
        }
    }

    // 模拟加载文档数据
    onMount(() => {
        getChildDocs();

        return () => {
            clearFloatDocTimeouts();
        };
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
    <h3 class="widget-title">{childDocsTitle}</h3>
    <ul class="document-list">
        {#if displayedDocs.length > 0}
            {#each displayedDocs as doc (doc.id + "-" + doc.updated)}
                {@const iconResult = getDocIcon(doc)}
                <li class="document-item">
                    <div
                        class="document-item-content"
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                openDocs(plugin, doc.id, 0);
                            }
                        }}
                        onmouseenter={(e) => {
                            if (showChildDocsFloatDoc && !plugin.isMobile) {
                                // 清除之前的定时器
                                if (floatDocTimeout) {
                                    clearTimeout(floatDocTimeout);
                                }
                                // 设置新的定时器
                                floatDocTimeout = window.setTimeout(() => {
                                    createFloatingDocPopup(doc, e, plugin);
                                    floatDocTimeout = null;
                                }, childDocsFloatDocShowTime * 1000);
                            }
                        }}
                        onmouseleave={() => {
                            if (showChildDocsFloatDoc && !plugin.isMobile) {
                                // 清除悬浮窗显示定时器
                                if (floatDocTimeout) {
                                    clearTimeout(floatDocTimeout);
                                    floatDocTimeout = null;
                                }
                                // 清除之前的 mouseleave timeout
                                if (mouseLeaveTimeout) {
                                    clearTimeout(mouseLeaveTimeout);
                                }
                                mouseLeaveTimeout = window.setTimeout(() => {
                                    setMouseOnTrigger(false);
                                    mouseLeaveTimeout = null;
                                }, 150);
                            }
                        }}
                        onclick={() => {
                            // 点击时立即隐藏弹窗并打开文档
                            if (showChildDocsFloatDoc && !plugin.isMobile) {
                                hideImmediately();
                            }
                            openDocs(plugin, doc.id, 0);
                        }}
                        role="button"
                        tabindex="0"
                        aria-label="打开最近文档：{doc.content}"
                    >
                        {#if iconResult.type === "image"}
                            <img class="doc-icon-image" src={iconResult.value} alt="" />
                        {:else}
                            <span class="doc-icon">{iconResult.value}</span>
                        {/if}
                        <span class="doc-title">{doc.content}</span>
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

            .doc-icon-image {
                width: 1.2em;
                height: 1.2em;
                vertical-align: middle;
                margin-right: 0.3em;
            }
        }
    }
</style>
