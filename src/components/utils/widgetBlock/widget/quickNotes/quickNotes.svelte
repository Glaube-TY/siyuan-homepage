<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import DOMPurify from "dompurify";
    import { mdToHtml } from "@/components/tools/mdToHtml";
    import { selectByIdsBatched } from "@/components/tools/siyuanSqlPaging";
    import { getChildBlocks, deleteBlock } from "@/api";
    import { loadHomepageConfigDataStrict } from "@/homepage/configLoader";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();
    const parsed = $derived(JSON.parse(contentTypeJson));

    const quickNotesTitle = $derived(parsed.data?.quickNotesTitle || "快速笔记");
    const quickNotesSort = $derived(parsed.data?.quickNotesSort || "DOC_ASC");

    let quickNotesEnabled = $state();
    let quickNotesPosition;

    const SIYUAN_NODE_ID_RE = /^\d{14}-[a-z0-9]{7}$/;
    function isValidSiyuanNodeId(value) {
        return typeof value === "string" && SIYUAN_NODE_ID_RE.test(value);
    }

    let quickNotesList = $state([]);

    onMount(async () => {
        const homepageSettingConfig = (await loadHomepageConfigDataStrict(plugin)).data;
        quickNotesEnabled = homepageSettingConfig.quickNotesEnabled;
        quickNotesPosition = homepageSettingConfig.quickNotesPosition;
        if (!quickNotesEnabled || !isValidSiyuanNodeId(quickNotesPosition)) {
            quickNotesList = [];
            return;
        }
        await getQuickNotes();
    });

    async function getQuickNotes() {
        if (!isValidSiyuanNodeId(quickNotesPosition)) {
            quickNotesList = [];
            return;
        }
        const quickNotes = await getChildBlocks(quickNotesPosition);

        if (!quickNotes || !Array.isArray(quickNotes)) {
            quickNotesList = [];
            return;
        }

        quickNotesList = quickNotes
            .filter((note) => note.markdown && note.markdown.trim() !== "")
            .map((note) => {
                const rawHtml = mdToHtml(note.markdown);
                return {
                    ...note,
                    htmlContent: DOMPurify.sanitize(rawHtml).trimEnd(),
                    created: "",
                    updated: "",
                };
            });

        if (quickNotesSort === "UPD" && quickNotesList.length > 0) {
            const result = await selectByIdsBatched(
                quickNotesList.map((note) => note.id),
                (escapedIds) => `SELECT id, updated FROM blocks WHERE id IN (${escapedIds})`,
                64,
            );

            const updatedMap = {};
            result.forEach((row) => {
                updatedMap[row.id] = row.updated;
            });

            quickNotesList = quickNotesList.map((note) => ({
                ...note,
                updated: updatedMap[note.id] || note.updated || "",
            }));

            quickNotesList.sort((a, b) => b.updated.localeCompare(a.updated));
        } else if (quickNotesSort === "CRE" && quickNotesList.length > 0) {
            const result = await selectByIdsBatched(
                quickNotesList.map((note) => note.id),
                (escapedIds) => `SELECT id, created FROM blocks WHERE id IN (${escapedIds})`,
                64,
            );

            const createdMap = {};
            result.forEach((row) => {
                createdMap[row.id] = row.created;
            });

            quickNotesList = quickNotesList.map((note) => ({
                ...note,
                created: createdMap[note.id] || note.created || "",
            }));

            quickNotesList.sort((a, b) => b.created.localeCompare(a.created));
        } else if (quickNotesSort === "DOC_INV") {
            quickNotesList.reverse();
        }
    }

    async function handleDelete(noteId: string) {
        try {
            await deleteBlock(noteId);
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
                            onclick={() => handleDelete(note.id)}
                        >
                            ×
                        </button>
                        <button
                            class="copy-btn"
                            title="复制笔记"
                            onclick={() => {
                                navigator.clipboard.writeText(note.content);
                                showMessage("复制成功");
                            }}>C</button
                        >
                        <div class="note-content">
                            {@html note.htmlContent}
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
                display: flex;
                flex-direction: column;
                gap: 1rem;
                padding: 0.5rem;

                .note-card {
                    background-color: var(--b3-theme-background);
                    border: 1px solid var(--b3-border-color);
                    border-radius: 8px;
                    padding: 1rem;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                    position: relative;
                    height: fit-content;

                    &:hover .delete-btn,
                    &:hover .copy-btn {
                        opacity: 1;
                    }

                    .note-content {
                        color: var(--b3-theme-on-surface);
                        font-size: 14px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        word-break: break-all;
                        overflow-wrap: break-word;
                        user-select: text;
                        -webkit-user-select: text;
                        -moz-user-select: text;
                    }

                    .delete-btn,
                    .copy-btn {
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
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }

                    .copy-btn {
                        right: 30px;
                        background: var(--b3-theme-primary);
                        font-size: 15px;
                    }
                }
            }
        }
    }
</style>
