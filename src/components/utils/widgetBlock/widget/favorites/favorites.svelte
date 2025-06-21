<script lang="ts">
    import { onMount } from "svelte";
    import { openTab } from "siyuan";
    import {
        getLatestFavoritesNotes,
        type FavoritesNoteInfo,
    } from "./favorites";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    let favoritesNotes: FavoritesNoteInfo[] = [];
    let favoritiesTitle: string = "💖收藏文档";
    let contentTypeJsonObj: any;
    let showNoteMeta: boolean = true;
    let favoritiesDocPrefix: string = "❤";

    // 时间戳格式化函数
    function formatDate(raw: string): string {
        const year = raw.slice(0, 4);
        const month = raw.slice(4, 6);
        const day = raw.slice(6, 8);
        return `${year}年${month}月${day}日`;
    }

    onMount(async () => {
        contentTypeJsonObj = JSON.parse(contentTypeJson);
        favoritesNotes = await getLatestFavoritesNotes(
            contentTypeJsonObj.data?.favoritiesSortOrder,
        );
        favoritiesTitle =
            contentTypeJsonObj.data?.favoritiesTitle || favoritiesTitle;
        showNoteMeta = contentTypeJsonObj.data?.showNoteMeta ?? showNoteMeta;
        favoritiesDocPrefix = contentTypeJsonObj.data?.favoritiesDocPrefix || favoritiesDocPrefix;
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{favoritiesTitle}</h3>
    <div class="favorites-content-container">
        {#if favoritesNotes.length}
            <ul class="favorites-list">
                {#each favoritesNotes as note}
                    <li class="favorites-item">
                        <div
                            class="favorites-item-content"
                            on:click={() =>
                                openTab({
                                    app: plugin.app,
                                    doc: {
                                        id: note.id,
                                    },
                                })}
                            on:keydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    openTab({
                                        app: plugin.app,
                                        doc: {
                                            id: note.id,
                                        },
                                    });
                                }
                            }}
                            role="button"
                            tabindex="0"
                            aria-label="打开收藏文档：{note.content}"
                        >
                            {favoritiesDocPrefix} {note.content}
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

    .favorites-list {
        list-style: none;
        padding-left: 0;
        margin: 0;
        overflow-y: auto;
    }

    .favorites-item {
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

    .favorites-item-content {
        margin-top: 4px;
        display: block;
        color: var(--b3-theme-primary);
        text-decoration: none;
        font-weight: bold;
        cursor: pointer;

        &:hover {
            text-decoration: underline;
        }
    }

    .note-meta {
        color: #94a3b8;
        font-size: 12px;
        margin-left: 4px;
    }
</style>
