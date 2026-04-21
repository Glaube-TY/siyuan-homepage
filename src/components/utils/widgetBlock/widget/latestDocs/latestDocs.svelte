<script lang="ts">
    import { onMount } from "svelte";
    import { getLatestDocuments, type latestDocumentInfo } from "./latestDocs";
    import { openDocs } from "@/components/tools/openDocs";
    import {
        createFloatingDocPopup,
        setMouseOnTrigger,
        hideImmediately,
    } from "@/components/tools/floatingDoc";
    import { resolveBuiltinDocIcon, type DocIconResult } from "@/components/tools/docIcon";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    const parsed = $derived(JSON.parse(contentTypeJson));
    const limit = $derived(parsed.data?.[0]?.limit || 5);
    const title = $derived(parsed.data?.[0]?.latestDocsTitle || "🕒最近文档");
    const prefix = $derived(parsed.data?.[0]?.latestDocsPrefix || "📄");
    const showLatestDocDetails = $derived(parsed.data?.[0]?.showLatestDocDetails ?? true);
    const showLatestDocFloatDoc =
        $derived(parsed.data?.[0]?.showLatestDocFloatDoc ?? true);
    const latestDocsFloatDocShowTime =
        $derived(parsed.data?.[0]?.latestDocsFloatDocShowTime || 0.1);
    const useBuiltinDocIcon = $derived(parsed.data?.[0]?.useBuiltinDocIcon ?? false);

    // 获取文档图标（优先内置图标，否则回退到前缀）
    function getDocIcon(doc: latestDocumentInfo): DocIconResult {
        if (useBuiltinDocIcon) {
            const builtin = resolveBuiltinDocIcon(doc);
            if (builtin) return builtin;
        }
        return { type: "text", value: prefix };
    }

    // 文档数据源
    let documentList: latestDocumentInfo[] = [];
    let displayedDocs: latestDocumentInfo[] = $state([]);
    
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
        getLatestDocuments(
            parsed.data?.[0]?.docNotebookId,
            parsed.data?.[0]?.ensureOpenDocs,
        ).then((docs) => {
            documentList = docs;
            displayedDocs = documentList.slice(0, limit);
        });

        return () => {
            clearFloatDocTimeouts();
        };
    });

    // 获取时间差并格式化为“X天前”或“今天”
    function getTimeAgo(updated: string): string {
        // 空值检查
        if (!updated || updated.length < 14) {
            return "未知时间";
        }
        const year = parseInt(updated.substring(0, 4));
        const month = parseInt(updated.substring(4, 6)) - 1;
        const day = parseInt(updated.substring(6, 8));
        const hour = parseInt(updated.substring(8, 10));
        const minute = parseInt(updated.substring(10, 12));
        const second = parseInt(updated.substring(12, 14));
        // 检查解析是否有效
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            return "未知时间";
        }
        const docDate = new Date(year, month, day, hour, minute, second);
        const docDateMidnight = new Date(docDate);
        docDateMidnight.setHours(0, 0, 0, 0);
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const diffTime = todayMidnight.getTime() - docDateMidnight.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            const timeStr = `${updated.substring(8, 10)}:${updated.substring(10, 12)}`;
            return `今天 ${timeStr}`;
        } else {
            return `${diffDays}天前`;
        }
    }
</script>

<div class="content-display">
    <h3 class="widget-title">{title}</h3>
    <ul class="document-list">
        {#if displayedDocs.length > 0}
            {#each displayedDocs as doc (doc.id + "-" + doc.updated)}
                {@const iconResult = getDocIcon(doc)}
                <li class="document-item">
                    <div
                        class="document-item-content"
                        onkeydown={(e) =>
                            e.key === "Enter" && openDocs(plugin, doc.id, 0)}
                        onclick={() => {
                            if (showLatestDocFloatDoc && !plugin.isMobile) {
                                hideImmediately();
                            }
                            openDocs(plugin, doc.id, 0);
                        }}
                        onmouseenter={(e) => {
                            if (showLatestDocFloatDoc && !plugin.isMobile) {
                                // 清除之前的定时器
                                if (floatDocTimeout) {
                                    clearTimeout(floatDocTimeout);
                                }
                                // 设置新的定时器
                                floatDocTimeout = window.setTimeout(() => {
                                    createFloatingDocPopup(doc, e, plugin);
                                    floatDocTimeout = null;
                                }, latestDocsFloatDocShowTime * 1000);
                            }
                        }}
                        onmouseleave={() => {
                            if (showLatestDocFloatDoc && !plugin.isMobile) {
                                // 清除悬浮窗显示定时器
                                if (floatDocTimeout) {
                                    clearTimeout(floatDocTimeout);
                                    floatDocTimeout = null;
                                }
                                // 清除之前的 mouseleave timeout
                                if (mouseLeaveTimeout) {
                                    clearTimeout(mouseLeaveTimeout);
                                }
                                // 使用配置的延迟时间，确保用户有足够时间查看弹窗
                                mouseLeaveTimeout = window.setTimeout(() => {
                                    setMouseOnTrigger(false);
                                    mouseLeaveTimeout = null;
                                }, 150);
                            }
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
                        <span class="doc-title">{doc.content || "(无标题)"}</span>
                    </div>
                    {#if showLatestDocDetails}
                        <div class="document-updated-container">
                            <span class="document-updated">
                                更新于：📅{getTimeAgo(doc.updated)}
                            </span>
                        </div>
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
