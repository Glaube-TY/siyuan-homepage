<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";
    const parsed = JSON.parse(contentTypeJson);

    const quickNotesTitle = parsed.data?.quickNotesTitle || "📝快速笔记";

    let quickNotesEnabled;
    let quickNotesPosition;

    let quickNotesList = [];

    onMount(async () => {
        const homepageSettingConfig = await plugin.loadData(
            "homepageSettingConfig.json",
        );
        quickNotesEnabled = homepageSettingConfig.quickNotesEnabled;
        quickNotesPosition = homepageSettingConfig.quickNotesPosition;

        await getQuickNotes();
    });

    async function getQuickNotes() {
        const quickNotes = await plugin.client.getChildBlocks({
            id: quickNotesPosition,
        });
        quickNotesList = quickNotes.data.filter(
            (note) => note.content && note.content.trim() !== "",
        );
    }

    async function handleDelete(noteId: string) {
        try {
            await plugin.client.deleteBlock({ id: noteId });
            await getQuickNotes();
        } catch (e) {
            console.error("删除失败:", e);
        }
    }
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
</svelte:head>

<div class="content-display">
    <h3 class="widget-title">{quickNotesTitle}</h3>
    <div class="quick-notes-content-container">
        {#if !quickNotesEnabled}
            <p>当前未开启快速笔记功能，请到主页设置中开启。</p>
        {:else if quickNotesList.length === 0}
            <p class="empty-tip">暂无快速笔记，点击添加按钮开始记录</p>
        {:else}
            <div class="notes-grid">
                {#each quickNotesList as note}
                    <div class="note-card">
                        <button
                            class="delete-btn"
                            title="删除该条笔记"
                            on:click={() => handleDelete(note.id)}
                        >
                            ×
                        </button>
                        <div class="note-content">
                            {note.content}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
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

        .quick-notes-content-container {
            width: 100%;
            height: calc(100% - 2rem);
            overflow-y: auto;

            .empty-tip {
                text-align: center;
                padding: 1rem;
            }

            .notes-grid {
                display: grid;
                gap: 1rem;
                padding: 0.5rem;

                .note-card {
                    background-color: var(--b3-theme-background);
                    border: 1px solid var(--b3-border-color);
                    border-radius: 8px;
                    padding: 1rem;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                    position: relative;

                    &:hover .delete-btn {
                        opacity: 1;
                    }

                    .note-content {
                        color: var(--b3-theme-text);
                        font-size: 14px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        user-select: text;
                        -webkit-user-select: text;
                        -moz-user-select: text;
                    }

                    .delete-btn {
                        position: absolute;
                        top: 4px;
                        right: 4px;
                        width: 20px;
                        height: 20px;
                        border: none;
                        background: var(--b3-theme-error);
                        color: white;
                        border-radius: 50%;
                        cursor: pointer;
                        opacity: 0.7;
                        transition: opacity 0.2s;
                        font-size: 18px;
                        line-height: 1;
                        opacity: 0;
                    }
                }
            }
        }
    }
</style>
