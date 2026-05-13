<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import { showMessage, Protyle } from "siyuan";
    import { findEmptyDocuments, deleteEmptyDocuments, type DocItem } from "./emptyDocCleanerService";

    interface Props {
        plugin: any;
    }

    let { plugin }: Props = $props();

    let emptyDocs: DocItem[] = $state([]);
    let selectedIds: string[] = $state([]);
    let scanning = $state(true);
    let scanError = $state<string | null>(null);
    let deleting = $state(false);
    let showConfirmDialog = $state(false);
    let deleteCount = $state(0);

    let protyle: Protyle | null = $state(null);
    let protyleContainer: HTMLDivElement | null = $state(null);
    let selectedDoc: DocItem | null = $state(null);

    onMount(async () => {
        try {
            emptyDocs = await findEmptyDocuments();
        } catch (error: any) {
            scanError = error?.message || "扫描失败";
            showMessage(`扫描空文档失败: ${scanError}`, 5000, "error");
        } finally {
            scanning = false;
        }
    });

    onDestroy(() => {
        if (protyle) {
            try {
                protyle.destroy();
            } catch {
                // 忽略销毁错误
            }
            protyle = null;
        }
    });

    function toggleSelectAll() {
        if (deleting) return;
        if (selectedIds.length === emptyDocs.length) {
            selectedIds = [];
        } else {
            selectedIds = emptyDocs.map((d) => d.id);
        }
    }

    function toggleSelect(id: string) {
        if (deleting) return;
        if (selectedIds.includes(id)) {
            selectedIds = selectedIds.filter((sid) => sid !== id);
        } else {
            selectedIds = [...selectedIds, id];
        }
    }

    async function handleDocClick(doc: DocItem) {
        if (deleting) return;
        selectedDoc = doc;
        await tick();
        if (protyle) {
            try {
                protyle.destroy();
            } catch {
                // 忽略销毁错误
            }
        }
        if (protyleContainer) {
            protyle = new Protyle(plugin.app, protyleContainer, {
                blockId: doc.id,
                render: {
                    background: false,
                    title: false,
                    gutter: true,
                },
            });
        }
    }

    function handleDeleteClick() {
        if (selectedIds.length === 0 || deleting) return;
        deleteCount = selectedIds.length;
        showConfirmDialog = true;
    }

    async function confirmDelete() {
        if (deleting) return;
        deleting = true;
        showConfirmDialog = false;
        try {
            const docsToDelete = emptyDocs.filter((doc) =>
                selectedIds.includes(doc.id),
            );
            const result = await deleteEmptyDocuments(docsToDelete);

            let msg: string;
            if (result.deleted.length === 0) {
                msg = `未删除文档`;
                if (result.skipped.length > 0) {
                    msg += `，跳过 ${result.skipped.length} 个`;
                }
                if (result.failed.length > 0) {
                    msg += `，失败 ${result.failed.length} 个`;
                }
            } else {
                msg = `已删除 ${result.deleted.length} 个空文档`;
                if (result.skipped.length > 0) {
                    msg += `，跳过 ${result.skipped.length} 个`;
                }
                if (result.failed.length > 0) {
                    msg += `，失败 ${result.failed.length} 个`;
                }
            }
            showMessage(msg, 3000, result.failed.length > 0 ? "error" : "info");

            const deletedIds = new Set(result.deleted.map((d) => d.id));
            emptyDocs = emptyDocs.filter((doc) => !deletedIds.has(doc.id));
            selectedIds = selectedIds.filter((id) => !deletedIds.has(id));
            if (selectedDoc && deletedIds.has(selectedDoc.id)) {
                selectedDoc = null;
                if (protyle) {
                    try {
                        protyle.destroy();
                    } catch {
                        // 忽略销毁错误
                    }
                    protyle = null;
                }
            }
        } catch (error: any) {
            showMessage(`删除失败: ${error?.message || "未知错误"}`, 5000, "error");
        } finally {
            deleting = false;
        }
    }
</script>

<div class="cleaner-content">
    <div class="cleaner-header">
        <span class="scan-info">
            {#if scanning}
                正在扫描空文档...
            {:else}
                共找到 {emptyDocs.length} 个空文档
            {/if}
        </span>
        {#if !scanning && emptyDocs.length > 0}
            <div class="header-actions">
                <button
                    class="b3-button b3-button--outline"
                    disabled={deleting}
                    onclick={toggleSelectAll}
                >
                    {selectedIds.length === emptyDocs.length ? "取消全选" : "全选"}
                </button>
                <button
                    class="b3-button b3-button--outline"
                    disabled={selectedIds.length === 0 || deleting}
                    onclick={handleDeleteClick}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    删除
                </button>
            </div>
        {/if}
    </div>

    {#if scanError}
        <div class="error-tip">扫描出错: {scanError}</div>
    {:else if scanning}
        <div class="loading-tip">扫描中...</div>
    {:else if emptyDocs.length === 0}
        <div class="empty-tip">没有找到空文档，太棒了！</div>
    {:else}
        <div class="main-body">
            <div class="list-panel">
                <div class="doc-list">
                    {#each emptyDocs as doc (doc.id)}
                        <div class="doc-item">
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(doc.id)}
                                disabled={deleting}
                                onchange={() => toggleSelect(doc.id)}
                            />
                            <button
                                type="button"
                                class="doc-name-btn"
                                class:active={selectedDoc?.id === doc.id}
                                disabled={deleting}
                                onclick={() => handleDocClick(doc)}
                            >
                                📄 {doc.name || "(无标题)"}
                            </button>
                        </div>
                    {/each}
                </div>
            </div>

            <div class="preview-panel">
                {#if selectedDoc}
                    <div class="protyle-info">
                        正在预览: {selectedDoc.name || "(无标题)"} (ID: {selectedDoc.id})
                    </div>
                    <div class="protyle-container" bind:this={protyleContainer}></div>
                {:else}
                    <div class="protyle-placeholder">选择左侧文档进行预览</div>
                {/if}
            </div>
        </div>
    {/if}
</div>

{#if showConfirmDialog}
    <div class="confirm-overlay">
        <div class="confirm-dialog">
            <div class="confirm-header">
                <svg class="confirm-icon"><use xlink:href="#iconTrashcan"></use></svg>
                <h2>确认删除</h2>
            </div>
            <div class="confirm-body">
                确定要删除 <strong>{deleteCount}</strong> 个空文档吗？
                <span class="warning-text">此操作不可撤销！</span>
            </div>
            <div class="confirm-footer">
                <button class="b3-button b3-button--text" onclick={() => showConfirmDialog = false}>
                    取消
                </button>
                <button class="b3-button b3-button--text" onclick={confirmDelete}>
                    确认删除
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .cleaner-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        min-width: 0;
        height: 100%;
        box-sizing: border-box;
        padding: 14px 16px 16px;
        gap: 12px;
        overflow: hidden;
        background: var(--b3-theme-background);
    }

    .cleaner-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0;
        min-height: 32px;
        gap: 12px;
        flex-shrink: 0;
    }

    .scan-info {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .header-actions {
        display: flex;
        gap: 0.5rem;
    }

    .error-tip,
    .loading-tip,
    .empty-tip {
        text-align: center;
        padding: 2rem 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
    }

    .empty-tip {
        color: var(--b3-theme-primary);
    }

    .main-body {
        display: flex;
        flex: 1;
        min-height: 0;
        gap: 14px;
        overflow: hidden;
    }

    .list-panel {
        width: 340px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        box-sizing: border-box;
        overflow: hidden;
    }

    .doc-list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }

    .doc-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 0.6rem;
        background: var(--b3-theme-background);
        border: 1px solid transparent;
        border-radius: 6px;
    }

    .doc-item input[type="checkbox"] {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
    }

    .doc-name-btn {
        flex: 1;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        padding: 0.25rem 0;
        border-radius: 4px;
        transition: background 0.15s ease;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .doc-name-btn:hover:not(:disabled) {
        background: var(--b3-theme-hover);
    }

    .doc-name-btn.active {
        background: var(--b3-theme-primary-light);
        color: var(--b3-theme-primary);
    }

    .doc-name-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .preview-panel {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        box-sizing: border-box;
        overflow: hidden;
    }

    .protyle-info {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        padding: 0.25rem 0;
        flex-shrink: 0;
    }

    .protyle-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
        flex-shrink: 0;
    }

    .protyle-container {
        flex: 1;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        border-radius: 6px;
        background: var(--b3-theme-background);
        overflow: hidden;
    }

    .confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        background: var(--b3-theme-scrim);
    }

    .confirm-dialog {
        background: var(--b3-theme-surface);
        border-radius: var(--b3-border-radius-dialog);
        width: 400px;
        max-width: 90vw;
        box-shadow: var(--b3-dialog-shadow);
        animation: dialog-enter 0.2s ease;
    }

    @keyframes dialog-enter {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .confirm-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .confirm-header h2 {
        font-size: 1em;
        margin: 0;
    }

    .confirm-icon {
        width: 18px;
        height: 18px;
        color: var(--b3-theme-error);
    }

    .confirm-body {
        padding: 16px;
        font-size: 14px;
        line-height: 1.6;
        text-align: center;
    }

    .warning-text {
        color: var(--b3-theme-error);
        font-weight: 600;
        display: block;
        margin-top: 0.5rem;
    }

    .confirm-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
    }

    @media (max-width: 640px) {
        .main-body {
            flex-direction: column;
        }

        .list-panel {
            width: 100%;
            max-height: 200px;
        }
    }
</style>
