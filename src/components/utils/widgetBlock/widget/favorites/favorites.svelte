<script lang="ts">
    import { onMount } from "svelte";
    import {
        getLatestFavoritesNotes,
        type FavoritesNoteInfo,
    } from "./favorites";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    let favoritesNotes: FavoritesNoteInfo[] = [];

    // 时间戳格式化函数
    function formatDate(raw: string): string {
        const year = raw.slice(0, 4);
        const month = raw.slice(4, 6);
        const day = raw.slice(6, 8);
        return `${year}年${month}月${day}日`;
    }

    onMount(async () => {
        favoritesNotes = await getLatestFavoritesNotes();
        console.log("获取到的收藏文档：", favoritesNotes);
    });
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
</svelte:head>

<div class="content-display">
    <h3 class="widget-title">💖收藏文档</h3>
    <div class="favorites-content-container">
        {#if favoritesNotes.length}
            <ul class="favorites-list">
                {#each favoritesNotes as note}
                    <li class="favorites-item">
                        <a
                            href={`/stage?r=${note.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <i class="fas fa-star"></i>
                            {note.content}
                        </a>
                        <div class="note-meta">
                            创建时间：{formatDate(note.created)}
                        </div>
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
        padding: 0;
    }

    .favorites-item {
        padding: 0.5rem 0;
        border-bottom: 1px solid #e2e8f0;
    }

    .favorites-item a {
        text-decoration: none;
        color: #3b82f6; /* 链接颜色 */
        font-weight: bold;
    }

    .note-meta {
        font-size: 0.875em;
        color: #64748b; /* 灰色文字 */
    }
</style>
