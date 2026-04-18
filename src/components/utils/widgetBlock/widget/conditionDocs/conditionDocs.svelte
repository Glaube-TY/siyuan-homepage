<script lang="ts">
    import { onMount } from "svelte";
    import { openDocs } from "@/components/tools/openDocs";
    import {
        getConditionDocsByKeyword,
        getConditionDocsByTag,
    } from "./conditionDocs";
    import { formatDateShort } from "@/components/tools/formatDate";
    import {
        createFloatingDocPopup,
        setMouseOnTrigger,
        hideImmediately,
    } from "@/components/tools/floatingDoc";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();
    const parsed = $derived(JSON.parse(contentTypeJson));
    const conditionDocsTitle = $derived(parsed.data?.conditionDocsTitle || "📄条件文档");
    const conditionDocsPrefix = $derived(parsed.data?.conditionDocsPrefix || "📄");
    const showConditionDocsDetails =
        $derived(parsed.data?.showConditionDocsDetails ?? true);
    const conditionDocsCondition =
        $derived(parsed.data?.conditionDocsCondition || "keyword");
    const conditionDocsKeyPosition =
        $derived(parsed.data?.conditionDocsKeyPosition || "anywhere");
    const conditionDocsKeyWord = $derived(parsed.data?.conditionDocsKeyWord || "");
    const conditionDocsSortOrder =
        $derived(parsed.data?.conditionDocsSortOrder || "updated");
    const showConditionDocsFloatDoc =
        $derived(parsed.data?.showConditionDocsFloatDoc ?? true);
    const conditionDocsFloatDocShowTime =
        $derived(parsed.data?.conditionDocsFloatDocShowTime || 0.1);
    const conditionDocsTag = $derived(parsed.data?.conditionDocsTag || "");

    let displayedDocs: any[] = $state([]);

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
        if (conditionDocsCondition === "keyword") {
            getConditionDocsByKeyword(
                conditionDocsKeyPosition,
                conditionDocsKeyWord,
                conditionDocsSortOrder,
            ).then((docs) => {
                displayedDocs = docs;
            });
        } else if (conditionDocsCondition === "tag") {
            getConditionDocsByTag(
                conditionDocsTag,
                conditionDocsSortOrder,
            ).then((docs) => {
                displayedDocs = docs;
            });
        }

        return () => {
            clearFloatDocTimeouts();
        };
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{conditionDocsTitle}</h3>
    <ul class="document-list">
        {#if displayedDocs.length > 0}
            {#each displayedDocs as doc (doc.id + "-" + doc.updated)}
                <li class="document-item">
                    <div
                        class="document-item-content"
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                openDocs(plugin, doc.id);
                            }
                        }}
                        onmouseenter={(e) => {
                            if (showConditionDocsFloatDoc && !plugin.isMobile) {
                                // 清除之前的定时器
                                if (floatDocTimeout) {
                                    clearTimeout(floatDocTimeout);
                                }
                                // 设置新的定时器
                                floatDocTimeout = window.setTimeout(() => {
                                    createFloatingDocPopup(doc, e, plugin);
                                    floatDocTimeout = null;
                                }, conditionDocsFloatDocShowTime * 1000);
                            }
                        }}
                        onmouseleave={() => {
                            // 延迟隐藏，让用户有时间移入弹窗
                            if (showConditionDocsFloatDoc && !plugin.isMobile) {
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
                            if (showConditionDocsFloatDoc && !plugin.isMobile) {
                                hideImmediately();
                            }
                            openDocs(plugin, doc.id);
                        }}
                        role="button"
                        tabindex="0"
                        aria-label="打开最近文档：{doc.content}"
                    >
                        {conditionDocsPrefix}
                        {doc.content}
                    </div>
                    {#if showConditionDocsDetails}
                        {#if conditionDocsSortOrder === "updated"}
                            <div class="document-updated-container">
                                <span class="document-updated">
                                    更新于：📅{formatDateShort(doc.updated)}
                                </span>
                            </div>
                        {:else if conditionDocsSortOrder === "created"}
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
        }

    }
</style>
