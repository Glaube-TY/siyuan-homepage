<script lang="ts">
    import { onMount } from "svelte";
    import { getLatestFavoritesNotes } from "./favorites";
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

    const contentTypeJsonObj = $derived(JSON.parse(contentTypeJson));

    let favoritesNotes: any[] = $state([]);
    const favoritiesTitle =
        $derived(contentTypeJsonObj.data?.favoritiesTitle || "💖收藏文档");
    const showNoteMeta = $derived(contentTypeJsonObj.data?.showNoteMeta ?? true);
    const favoritiesDocPrefix =
        $derived(contentTypeJsonObj.data?.favoritiesDocPrefix || "❤");
    const showFavFloatDoc = $derived(contentTypeJsonObj.data?.showFavFloatDoc ?? true);
    const favFloatDocShowTime =
        $derived(contentTypeJsonObj.data?.favFloatDocShowTime || 0.1);
    const useBuiltinDocIcon = $derived(contentTypeJsonObj.data?.useBuiltinDocIcon ?? false);

    // 获取文档图标（优先内置图标，否则回退到前缀）
    function getDocIcon(note: any): DocIconResult {
        if (useBuiltinDocIcon) {
            const builtin = resolveBuiltinDocIcon(note);
            if (builtin) return builtin;
        }
        return { type: "text", value: favoritiesDocPrefix };
    }

    // 时间戳格式化函数
    function formatDate(raw: string): string {
        const year = raw.slice(0, 4);
        const month = raw.slice(4, 6);
        const day = raw.slice(6, 8);
        return `${year}年${month}月${day}日`;
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

    onMount(() => {
        getLatestFavoritesNotes(
            contentTypeJsonObj.data?.favoritiesSortOrder,
            contentTypeJsonObj.data?.favoritesNotebookId,
        ).then((notes) => {
            favoritesNotes = notes;
        });

        return () => {
            clearFloatDocTimeouts();
        };
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{favoritiesTitle}</h3>
    <div class="favorites-content-container">
        {#if favoritesNotes.length}
            <ul class="favorites-list">
                {#each favoritesNotes as note}
                    {@const iconResult = getDocIcon(note)}
                    <li class="favorites-item">
                        <div
                            class="favorites-item-content"
                            onkeydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    openDocs(plugin, note.id, 0);
                                }
                            }}
                            onmouseenter={(e) => {
                                if (showFavFloatDoc && !plugin.isMobile) {
                                    // 清除之前的定时器
                                    if (floatDocTimeout) {
                                        clearTimeout(floatDocTimeout);
                                    }
                                    // 设置新的定时器
                                    floatDocTimeout = window.setTimeout(() => {
                                        createFloatingDocPopup(note, e, plugin);
                                        floatDocTimeout = null;
                                    }, favFloatDocShowTime * 1000);
                                }
                            }}
                            onmouseleave={() => {
                                if (showFavFloatDoc && !plugin.isMobile) {
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
                            onclick={() => {
                                // 点击时立即隐藏弹窗并打开文档
                                if (showFavFloatDoc && !plugin.isMobile) {
                                    hideImmediately();
                                }
                                openDocs(plugin, note.id, 0);
                            }}
                            role="button"
                            tabindex="0"
                            aria-label="打开收藏文档：{note.content}"
                        >
                            {#if iconResult.type === "image"}
                                <img class="doc-icon-image" src={iconResult.value} alt="" />
                            {:else}
                                <span class="doc-icon">{iconResult.value}</span>
                            {/if}
                            <span class="doc-title">{note.content}</span>
                        </div>
                        {#if showNoteMeta}
                            <div class="note-meta">
                                {#if contentTypeJsonObj.data?.favoritiesSortOrder === "created"}
                                    创建时间：{formatDate(note.created)}
                                {:else}
                                    更新时间：{formatDate(note.updated)}
                                {/if}
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>
        {:else}
            <p>暂无收藏的文档，可在文档树上右键选择收藏</p>
        {/if}
    </div>
</div>

<style lang="scss">
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

    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

        .favorites-content-container {
            width: 100%;
            height: 100%;
            overflow-y: auto;
        }

        .favorites-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            grid-gap: 1rem;
            list-style: none;
            padding-left: 0;
            margin: 0;
        }

        .favorites-item {
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
        }

        .favorites-item-content {
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

        .note-meta {
            font-size: 12px;
            margin-top: 4px;
            margin-left: 4px;
        }

        .doc-icon-image {
            width: 1.2em;
            height: 1.2em;
            vertical-align: middle;
            margin-right: 0.3em;
        }
    }
</style>
