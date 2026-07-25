<script lang="ts">
    import { showMessage } from "siyuan";
    import type { FavoriteGroupRecord } from "../types";

    interface Props {
        groups: FavoriteGroupRecord[];
        onCreate: (name: string) => Promise<void>;
        onRename: (groupId: string, name: string) => Promise<void>;
        onDelete: (groupId: string) => Promise<void>;
    }

    let { groups, onCreate, onRename, onDelete }: Props = $props();

    let newGroupName = $state("");
    let creating = $state(false);

    // 重命名状态
    let editingId = $state<string | null>(null);
    let editingName = $state("");

    async function handleCreate() {
        const name = newGroupName.trim();
        if (!name) {
            showMessage("请输入分组名称", 2000, "info");
            return;
        }
        creating = true;
        try {
            await onCreate(name);
            newGroupName = "";
        } catch {
            // 错误已在父组件处理
        } finally {
            creating = false;
        }
    }

    function startRename(group: FavoriteGroupRecord) {
        editingId = group.id;
        editingName = group.name;
    }

    function cancelRename() {
        editingId = null;
        editingName = "";
    }

    async function confirmRename() {
        const name = editingName.trim();
        if (!name || !editingId) return;
        try {
            await onRename(editingId, name);
            editingId = null;
            editingName = "";
        } catch {
            // 错误已在父组件处理
        }
    }

    async function handleDelete(groupId: string, groupName: string) {
        if (!confirm(`确定要删除分组"${groupName}"吗？\n\n该组内的收藏将保留并归入"默认分组（未分组）"。`)) return;
        try {
            await onDelete(groupId);
        } catch {
            // 错误已在父组件处理
        }
    }
</script>

<div class="fm-group-editor">
    <div class="fm-group-create">
        <input
            type="text"
            bind:value={newGroupName}
            placeholder="输入新分组名称"
            class="control-md"
            onkeydown={(e) => { if (e.key === "Enter") handleCreate(); }}
        />
        <button type="button" class="fm-btn-primary" onclick={handleCreate} disabled={creating || !newGroupName.trim()}>
            {creating ? "创建中..." : "创建分组"}
        </button>
    </div>

    {#if groups.length === 0}
        <div class="fm-empty">暂无自定义分组</div>
    {:else}
        <div class="fm-group-list">
            {#each groups.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) as group (group.id)}
                <div class="fm-group-item">
                    {#if editingId === group.id}
                        <input
                            type="text"
                            bind:value={editingName}
                            class="control-sm"
                            onkeydown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") cancelRename(); }}
                        />
                        <div class="fm-group-actions">
                            <button type="button" class="fm-btn-sm" onclick={confirmRename}>保存</button>
                            <button type="button" class="fm-btn-sm" onclick={cancelRename}>取消</button>
                        </div>
                    {:else}
                        <span class="fm-group-name">{group.name}</span>
                        <div class="fm-group-actions">
                            <button type="button" class="fm-btn-sm" onclick={() => startRename(group)}>重命名</button>
                            <button type="button" class="fm-btn-danger-sm" onclick={() => handleDelete(group.id, group.name)}>删除</button>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .fm-group-editor {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .fm-group-create {
        display: flex;
        gap: 8px;
        align-items: center;

        .control-md {
            flex: 1;
            min-width: 0;
            padding: 6px 10px;
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
            background: var(--b3-theme-background);
            color: var(--b3-theme-on-background);
            font-size: 13px;
        }
    }

    .fm-btn-primary {
        padding: 6px 16px;
        border: none;
        border-radius: 4px;
        background: var(--b3-theme-primary, #3575f0);
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        &:hover:not(:disabled) {
            opacity: 0.9;
        }
    }

    .fm-group-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .fm-group-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        gap: 8px;

        .control-sm {
            flex: 1;
            min-width: 0;
            padding: 4px 8px;
            border: 1px solid var(--b3-theme-primary, #3575f0);
            border-radius: 4px;
            background: var(--b3-theme-background);
            color: var(--b3-theme-on-background);
            font-size: 13px;
        }
    }

    .fm-group-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    }

    .fm-group-actions {
        display: flex;
        gap: 6px;
        white-space: nowrap;
    }

    .fm-btn-sm {
        padding: 3px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 3px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 12px;

        &:hover {
            background: var(--b3-list-hover);
        }
    }

    .fm-btn-danger-sm {
        padding: 3px 10px;
        border: 1px solid var(--b3-theme-error, #e0245e);
        border-radius: 3px;
        background: transparent;
        color: var(--b3-theme-error, #e0245e);
        cursor: pointer;
        font-size: 12px;

        &:hover {
            background: rgba(224, 36, 94, 0.08);
        }
    }

    .fm-empty {
        padding: 24px 16px;
        text-align: center;
        color: var(--b3-theme-secondary);
        font-size: 13px;
    }
</style>
