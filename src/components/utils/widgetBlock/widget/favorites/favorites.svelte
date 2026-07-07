<script lang="ts">
    import { onMount } from "svelte";
    import { getLatestFavoritesNotes } from "./favorites";
    import { openDocs } from "@/components/tools/openDocs";

    import {
        createFloatingDocPopup,
        setMouseOnTrigger,
        hideImmediately,
    } from "@/components/tools/floatingDoc";
    import { resolveBuiltinDocIcon, resolveConfiguredDocIcon, type DocIconResult } from "@/components/tools/docIcon";
    import { ensureFavoritesIndexInitialized } from "@/components/tools/siyuanComponentDataApi";
    import LocalIndexEmptyState from "../common/LocalIndexEmptyState.svelte";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        placement?: string;
    }

    let { plugin, contentTypeJson = "{}", placement = "homepage" }: Props = $props();

    const contentTypeJsonObj = $derived(JSON.parse(contentTypeJson));
    const isMobilePlacement = $derived(placement === "mobile");

    let favoritesNotes: any[] = $state([]);
    let favoritesDataStatus = $state<"ok" | "empty" | "limited" | "disabled" | "unsupported" | "error">("empty");
    let favoritesStatusMessage = $state("收藏索引为空，可重新收藏文档，或到主页设置 > 检索管理中迁移旧收藏属性。");
    const favoritiesTitle =
        $derived(contentTypeJsonObj.data?.favoritiesTitle || "💖收藏文档");
    const showNoteMeta = $derived(contentTypeJsonObj.data?.showNoteMeta ?? true);
    const favoritiesDocPrefix =
        $derived(contentTypeJsonObj.data?.favoritiesDocPrefix || "❤");
    const showFavFloatDoc = $derived(contentTypeJsonObj.data?.showFavFloatDoc ?? true);
    const favFloatDocShowTime =
        $derived(contentTypeJsonObj.data?.favFloatDocShowTime || 0.1);
    const useBuiltinDocIcon = $derived(contentTypeJsonObj.data?.useBuiltinDocIcon ?? false);

    // 组件销毁后丢弃异步 SQL 结果，避免更新已卸载状态
    let isDestroyed = false;

    // 获取文档图标（优先内置图标，否则回退到前缀）
    function getDocIcon(note: any): DocIconResult {
        if (useBuiltinDocIcon) {
            const builtin = resolveBuiltinDocIcon(note);
            if (builtin) return builtin;
        }
        return resolveConfiguredDocIcon(favoritiesDocPrefix, "❤");
    }

    // 时间戳格式化函数
    function formatDate(raw: string): string {
        const year = raw.slice(0, 4);
        const month = raw.slice(4, 6);
        const day = raw.slice(6, 8);
        return `${year}年${month}月${day}日`;
    }

    function formatMobileDate(raw: string): string {
        if (!raw || raw.length < 8) return "";
        return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
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
        isDestroyed = false;
        ensureFavoritesIndexInitialized(plugin).finally(() => {
            if (isDestroyed) return;
            getLatestFavoritesNotes(
                contentTypeJsonObj.data?.favoritiesSortOrder,
                contentTypeJsonObj.data?.favoritesNotebookId,
                useBuiltinDocIcon,
                plugin,
            ).then((result) => {
                if (isDestroyed) return;
                favoritesNotes = result.items;
                favoritesDataStatus = result.status;
                favoritesStatusMessage = result.message || favoritesStatusMessage;
            });
        });

        return () => {
            isDestroyed = true;
            clearFloatDocTimeouts();
        };
    });
</script>

{#if isMobilePlacement}
    <div class="mobile-favorites-widget">
        <header class="mobile-favorites-header">
            <div>
                <h3>{favoritiesTitle}</h3>
            </div>
            <span class="mobile-favorites-count">{favoritesNotes.length}</span>
        </header>

        <div class="mobile-favorites-list">
            {#if favoritesNotes.length}
                {#each favoritesNotes as note}
                    {@const iconResult = getDocIcon(note)}
                    <button type="button" class="mobile-favorite-row" onclick={() => openDocs(plugin, note.id, 0)}>
                        <span class="mobile-favorite-icon">
                            {#if iconResult.type === "image"}
                                <img src={iconResult.value} alt="" />
                            {:else}
                                {iconResult.value}
                            {/if}
                        </span>
                        <span class="mobile-favorite-main">
                            <strong>{note.content || "无标题文档"}</strong>
                            {#if showNoteMeta}
                                <small>
                                    {contentTypeJsonObj.data?.favoritiesSortOrder === "created" ? "创建" : "更新"}
                                    {formatMobileDate(contentTypeJsonObj.data?.favoritiesSortOrder === "created" ? note.created : note.updated)}
                                </small>
                            {/if}
                        </span>
                    </button>
                {/each}
            {:else}
                {#if favoritesDataStatus === "disabled"}
                    <LocalIndexEmptyState
                        title="本地索引为空"
                        message="收藏本地索引为空，请迁移或重建索引。"
                        {plugin}
                        hint="从文档树右键重新收藏，或到主页设置 > 检索管理中迁移旧收藏属性。"
                    />
                {:else}
                    <div class="mobile-favorites-empty">{favoritesStatusMessage}</div>
                {/if}
            {/if}
        </div>
    </div>
{:else}
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
                {#if favoritesDataStatus === "disabled"}
                    <LocalIndexEmptyState
                        title="本地索引为空"
                        message="收藏本地索引为空，请迁移或重建索引。"
                        {plugin}
                        hint="从文档树右键重新收藏，或到主页设置 > 检索管理中迁移旧收藏属性。"
                    />
                {:else}
                    <div class="favorites-empty-state">
                        <strong>收藏索引为空</strong>
                        <span>{favoritesStatusMessage}</span>
                    </div>
                {/if}
            {/if}
        </div>
    </div>
{/if}

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

        .favorites-empty-state {
            min-height: 120px;
            padding: 16px;
            border: 1px dashed var(--b3-border-color);
            border-radius: 8px;
            color: var(--b3-theme-secondary);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-align: center;

            strong {
                color: var(--b3-theme-on-surface);
            }
        }
    }

    .mobile-favorites-widget {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        box-sizing: border-box;
        background: linear-gradient(180deg, rgba(236, 72, 153, 0.08), rgba(236, 72, 153, 0.02));
    }

    .mobile-favorites-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        min-height: 24px;

        h3 {
            margin: 0;
            font-size: 14px;
            line-height: 1.15;
            color: var(--b3-theme-on-background);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .mobile-favorites-count {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: rgba(236, 72, 153, 0.12);
        color: #db2777;
        font-size: 12px;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .mobile-favorites-list {
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .mobile-favorite-row {
        min-height: 38px;
        padding: 5px;
        border: none;
        border-radius: 10px;
        background: color-mix(in srgb, var(--b3-theme-surface) 78%, transparent);
        color: inherit;
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        align-items: center;
        gap: 6px;
        text-align: left;
    }

    .mobile-favorite-icon {
        width: 28px;
        height: 28px;
        border-radius: 9px;
        background: color-mix(in srgb, #db2777 9%, var(--b3-theme-background));
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;

        img {
            width: 18px;
            height: 18px;
            object-fit: contain;
        }
    }

    .mobile-favorite-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;

        strong {
            min-width: 0;
            color: var(--b3-theme-on-background);
            font-size: 14px;
            line-height: 1.3;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        small {
            color: var(--b3-theme-secondary);
            font-size: 11px;
            line-height: 1.2;
        }
    }

    .mobile-favorites-empty {
        padding: 6px 8px;
        color: var(--b3-theme-secondary);
        font-size: 12px;
        text-align: center;
    }
</style>
