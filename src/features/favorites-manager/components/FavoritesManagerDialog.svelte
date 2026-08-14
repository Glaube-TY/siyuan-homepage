<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { confirmDialogBoolean } from "@/libs/dialog";
    import {
        loadFavoritesForUI,
        setItemGroup,
        removeFavoriteItem,
        addFavoriteItem,
        createGroup,
        renameGroup,
        deleteGroup,
    } from "../favorites-store";
    import {
        searchDocsByKeywordApi,
        type ComponentDocInfo,
    } from "@/components/tools/siyuanComponentDataApi";
    import {
        VIRTUAL_UNGROUPED_ID,
        VIRTUAL_UNGROUPED_NAME,
        type FavoriteGroupRecord,
        type FavoriteItemRecord,
    } from "../types";

    interface Props {
        plugin: any;
        mobile: boolean;
        onClose: () => void;
    }

    let { plugin, mobile, onClose }: Props = $props();

    let activeTab = $state<"manage" | "groups">("manage");
    let items = $state<FavoriteItemRecord[]>([]);
    let groups = $state<FavoriteGroupRecord[]>([]);
    let loading = $state(true);
    let loadError = $state("");
    let destroyed = false;

    // 搜索
    let searchKeyword = $state("");
    let searchResults = $state<ComponentDocInfo[]>([]);
    let searchLoading = $state(false);
    let searchVersion = 0;
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    let existingIds = $state(new Set<string>());

    // 分组选择
    let editingGroupId = $state<Record<string, string>>({});

    // 操作防重复
    let updatingItemGroupIds = $state(new Set<string>());
    let renamingGroupIds = $state(new Set<string>());
    let deletingGroupIds = $state(new Set<string>());

    // 分组创建和编辑状态
    let newGroupName = $state("");
    let creating = $state(false);
    let editingGroupId2 = $state<string | null>(null);
    let editingGroupName = $state("");

    // 操作按钮状态
    let removingIds = $state(new Set<string>());
    let favoritingIds = $state(new Set<string>());

    async function reloadData() {
        if (destroyed) return;
        try {
            const payload = await loadFavoritesForUI();
            if (destroyed) return;
            items = payload.items;
            groups = payload.groups;
            existingIds = new Set(payload.items.map((item) => item.id));
            const edits: Record<string, string> = {};
            for (const item of payload.items) {
                edits[item.id] = item.favoriteGroupId || VIRTUAL_UNGROUPED_ID;
            }
            editingGroupId = edits;
            loading = false;
            loadError = "";
        } catch (error) {
            if (destroyed) return;
            loadError = error instanceof Error ? error.message : String(error);
            loading = false;
        }
    }

    function groupLabel(groupId: string | undefined | null): string {
        if (!groupId || groupId === VIRTUAL_UNGROUPED_ID) return VIRTUAL_UNGROUPED_NAME;
        return groups.find((g) => g.id === groupId)?.name || `未知 (${groupId.slice(0, 8)})`;
    }

    async function handleGroupChange(itemId: string, newGroupId: string) {
        if (updatingItemGroupIds.has(itemId)) return;
        if (editingGroupId[itemId] === newGroupId) return;
        const previous = editingGroupId[itemId];
        editingGroupId[itemId] = newGroupId;
        if (!destroyed) {
            updatingItemGroupIds = new Set([...updatingItemGroupIds, itemId]);
        }
        try {
            await setItemGroup(itemId, newGroupId === VIRTUAL_UNGROUPED_ID ? null : newGroupId);
            await reloadData();
        } catch (error) {
            editingGroupId[itemId] = previous;
            showMessage(error instanceof Error ? error.message : "设置分组失败", 4000, "error");
        } finally {
            if (!destroyed) {
                const next = new Set(updatingItemGroupIds);
                next.delete(itemId);
                updatingItemGroupIds = next;
            }
        }
    }

    async function handleRemoveItem(itemId: string) {
        if (removingIds.has(itemId)) return;
        removingIds = new Set([...removingIds, itemId]);
        try {
            const confirmed = await confirmDialogBoolean({
                title: "移出收藏",
                content: "确定要将此文档移出收藏吗？",
            });
            if (!confirmed) return;
            await removeFavoriteItem(itemId);
            await reloadData();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "移出收藏失败", 4000, "error");
        } finally {
            if (!destroyed) {
                const next = new Set(removingIds);
                next.delete(itemId);
                removingIds = next;
            }
        }
    }

    function handleSearchInput() {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            void doSearch();
        }, 300);
    }

    async function doSearch() {
        const keyword = searchKeyword.trim();
        if (!keyword) {
            searchResults = [];
            return;
        }
        searchLoading = true;
        const version = ++searchVersion;
        try {
            const docs = await searchDocsByKeywordApi("DocTitle", keyword);
            if (!destroyed && version === searchVersion) {
                searchResults = docs;
                searchLoading = false;
            }
        } catch (error) {
            if (!destroyed && version === searchVersion) {
                showMessage(error instanceof Error ? error.message : "搜索失败", 4000, "error");
                searchLoading = false;
            }
        }
    }

    function clearSearch() {
        searchVersion++;
        searchKeyword = "";
        searchResults = [];
        searchLoading = false;
        if (searchTimer) {
            clearTimeout(searchTimer);
            searchTimer = null;
        }
    }

    async function handleFavoriteFromSearch(doc: ComponentDocInfo) {
        if (existingIds.has(doc.id) || favoritingIds.has(doc.id)) return;
        favoritingIds = new Set([...favoritingIds, doc.id]);
        try {
            await addFavoriteItem({
                id: doc.id,
                content: doc.content,
                box: doc.box,
                path: doc.path,
                hpath: doc.hpath,
                icon: doc.icon,
                created: doc.created,
                updated: doc.updated,
                favoritedAt: new Date().toISOString(),
            } as any);
            await reloadData();
            searchResults = searchResults.slice();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "收藏失败", 4000, "error");
        } finally {
            const next = new Set(favoritingIds);
            next.delete(doc.id);
            favoritingIds = next;
        }
    }

    async function handleCreateGroup(name: string) {
        if (creating) return;
        creating = true;
        try {
            await createGroup(name);
            await reloadData();
            newGroupName = "";
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "创建分组失败", 4000, "error");
        } finally {
            if (!destroyed) creating = false;
        }
    }

    async function handleRenameGroup(groupId: string, name: string) {
        if (renamingGroupIds.has(groupId)) return;
        renamingGroupIds = new Set([...renamingGroupIds, groupId]);
        try {
            await renameGroup(groupId, name);
            await reloadData();
            editingGroupId2 = null;
            editingGroupName = "";
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "重命名分组失败", 4000, "error");
        } finally {
            if (!destroyed) {
                const next = new Set(renamingGroupIds);
                next.delete(groupId);
                renamingGroupIds = next;
            }
        }
    }

    async function handleDeleteGroup(groupId: string) {
        if (deletingGroupIds.has(groupId)) return;
        deletingGroupIds = new Set([...deletingGroupIds, groupId]);
        try {
            const confirmed = await confirmDialogBoolean({
                title: "删除分组",
                content: "确定要删除此分组吗？该组内的收藏将保留并归入默认分组。",
            });
            if (!confirmed) return;
            await deleteGroup(groupId);
            await reloadData();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "删除分组失败", 4000, "error");
        } finally {
            if (!destroyed) {
                const next = new Set(deletingGroupIds);
                next.delete(groupId);
                deletingGroupIds = next;
            }
        }
    }

    const ungroupedCount = $derived(items.filter((i) => !i.favoriteGroupId).length);
    const groupedCount = $derived(items.filter((i) => !!i.favoriteGroupId).length);

    onMount(() => {
        reloadData();
        // 会员失效监听
        function handleAdvancedUnavailable() {
            if (destroyed) return;
            showMessage("会员状态已失效，收藏文档管理即将关闭。已有分组数据完整保留。", 4000, "warn");
            onClose();
        }
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
        return () => {
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
        };
    });

    onDestroy(() => {
        destroyed = true;
        if (searchTimer) clearTimeout(searchTimer);
    });
</script>

<div class="fm-root" class:fm-mobile={mobile}>
    <header class="fm-topbar">
        <div class="fm-topbar-left">
            <span class="fm-topbar-icon">💖</span>
            <div class="fm-topbar-title">
                <strong>收藏文档管理</strong>
                <small>管理分组、搜索并整理收藏文档</small>
            </div>
        </div>
        <button type="button" class="fm-close" onclick={onClose} title="关闭" aria-label="关闭收藏文档管理">&times;</button>
    </header>

    <nav class="fm-nav">
        <button class="fm-nav-btn" class:active={activeTab === "manage"} onclick={() => (activeTab = "manage")}>
            📋 收藏文档 ({items.length})
        </button>
        <button class="fm-nav-btn" class:active={activeTab === "groups"} onclick={() => (activeTab = "groups")}>
            📁 分组管理 ({groups.length})
        </button>
    </nav>

    <main class="fm-body">
        {#if loading}
            <div class="fm-loading">正在加载收藏数据...</div>
        {:else if loadError}
            <div class="fm-error">
                <p>{loadError}</p>
                <button type="button" class="fm-btn" onclick={() => { loading = true; void reloadData(); }}>重新加载</button>
            </div>
        {:else if activeTab === "manage"}
            <!-- 搜索工具栏 -->
            <div class="fm-search-bar">
                <span class="fm-search-icon">🔍</span>
                <input
                    type="text"
                    bind:value={searchKeyword}
                    oninput={handleSearchInput}
                    placeholder="搜索思源文档标题..."
                    class="fm-search-input"
                />
                {#if searchKeyword}
                    <button type="button" class="fm-search-clear" onclick={clearSearch}>✕</button>
                {/if}
                <button type="button" class="fm-btn" onclick={doSearch} disabled={searchLoading || !searchKeyword.trim()}>
                    {searchLoading ? "搜索中..." : "搜索"}
                </button>
            </div>

            <!-- 搜索结果 -->
            {#if searchResults.length > 0}
                <div class="fm-search-results">
                    {#each searchResults as doc (doc.id)}
                        {@const favorited = existingIds.has(doc.id)}
                        <div class="fm-search-row" class:fm-search-row-favorited={favorited}>
                            <span class="fm-search-title">{doc.content || "无标题"}</span>
                            <span class="fm-search-path">{doc.hpath || doc.path || "-"}</span>
                            {#if favorited}
                                <span class="fm-badge-done">已收藏</span>
                            {:else}
                                <button type="button" class="fm-btn"
                                    disabled={favoritingIds.has(doc.id)}
                                    onclick={() => handleFavoriteFromSearch(doc)}>
                                    {favoritingIds.has(doc.id) ? "收藏中..." : "收藏"}
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            {:else if searchKeyword && !searchLoading}
                <div class="fm-search-empty">未找到匹配文档</div>
            {/if}

            <!-- 收藏摘要 -->
            <div class="fm-summary">
                <span class="fm-summary-item">共 {items.length} 篇</span>
                <span class="fm-summary-item">未分组 {ungroupedCount} 篇</span>
                <span class="fm-summary-item">{groups.length} 个分组 · {groupedCount} 篇已分组</span>
            </div>

            <!-- 已收藏列表 -->
            {#if items.length === 0}
                <div class="fm-empty">暂无收藏文档。使用上方搜索栏搜索并收藏文档。</div>
            {:else}
                <div class="fm-list">
                    {#each items as item (item.id)}
                        <div class="fm-card">
                            <div class="fm-card-main">
                                <span class="fm-card-icon">📄</span>
                                <div class="fm-card-info">
                                    <span class="fm-card-title" title={item.content}>{item.content || "无标题"}</span>
                                    <span class="fm-card-path" title={item.hpath || item.path}>{item.hpath || item.path || "-"}</span>
                                </div>
                            </div>
                            <div class="fm-card-actions">
                                <select
                                    value={editingGroupId[item.id] || VIRTUAL_UNGROUPED_ID}
                                    onchange={(e) => handleGroupChange(item.id, e.currentTarget.value)}
                                    class="fm-select"
                                    disabled={updatingItemGroupIds.has(item.id)}
                                >
                                    <option value={VIRTUAL_UNGROUPED_ID}>{VIRTUAL_UNGROUPED_NAME}</option>
                                    {#each groups as group (group.id)}
                                        <option value={group.id}>{group.name}</option>
                                    {/each}
                                </select>
                                <button type="button" class="fm-btn-danger"
                                    disabled={removingIds.has(item.id)}
                                    onclick={() => handleRemoveItem(item.id)}>
                                    {removingIds.has(item.id) ? "移除中..." : "移出"}
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        {:else}
            <!-- 分组管理 -->
            <div class="fm-group-create">
                <div class="fm-group-create-label">创建新分组</div>
                <div class="fm-group-create-row">
                    <input type="text" bind:value={newGroupName} placeholder="输入分组名称" class="fm-input"
                        onkeydown={(e) => { if (e.key === "Enter") { const n = newGroupName.trim(); if (n) handleCreateGroup(n); } }} />
                    <button type="button" class="fm-btn-primary"
                        disabled={creating || !newGroupName.trim()}
                        onclick={() => { const n = newGroupName.trim(); if (!n) return; handleCreateGroup(n); }}>
                        {creating ? "创建中..." : "创建"}
                    </button>
                </div>
            </div>
            {#if groups.length === 0}
                <div class="fm-empty">暂无自定义分组。在上方创建第一个分组。</div>
            {:else}
                <div class="fm-list">
                    {#each groups.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) as group (group.id)}
                        {@const count = items.filter((i) => i.favoriteGroupId === group.id).length}
                        <div class="fm-card">
                            <div class="fm-card-main">
                                <span class="fm-card-icon">📁</span>
                                <div class="fm-card-info">
                                    <span class="fm-card-title">{group.name}</span>
                                    <span class="fm-card-path">{count} 篇文档</span>
                                </div>
                            </div>
                            <div class="fm-card-actions">
                                {#if editingGroupId2 === group.id}
                                    <input type="text" bind:value={editingGroupName} class="fm-input-sm" disabled={renamingGroupIds.has(group.id)}
                                        onkeydown={(e) => { if (renamingGroupIds.has(group.id)) return; if (e.key === "Enter") { const n = editingGroupName.trim(); if (n && n !== group.name) { handleRenameGroup(group.id, n); } else { editingGroupId2 = null; } } if (e.key === "Escape") { editingGroupId2 = null; } }} />
                                    <button type="button" class="fm-btn-sm" disabled={renamingGroupIds.has(group.id)}
                                        onclick={() => { const n = editingGroupName.trim(); if (n && n !== group.name) { handleRenameGroup(group.id, n); } else { editingGroupId2 = null; } }}>保存</button>
                                    <button type="button" class="fm-btn-sm" disabled={renamingGroupIds.has(group.id)} onclick={() => { editingGroupId2 = null; }}>取消</button>
                                {:else}
                                    <button type="button" class="fm-btn-sm" onclick={() => { editingGroupId2 = group.id; editingGroupName = group.name; }}>重命名</button>
                                    <button type="button" class="fm-btn-danger-sm" onclick={() => handleDeleteGroup(group.id)} disabled={deletingGroupIds.has(group.id) || renamingGroupIds.has(group.id)}>删除</button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    </main>
</div>

<style lang="scss">
    .fm-root {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        flex: 1 1 0;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 14px;
    }

    :global(.favorites-manager-dialog-host .dialog-content) {
        width: 100%;
        min-width: 0;
        overflow: hidden;
    }
    :global(.favorites-manager-dialog-host .b3-dialog__container) {
        overflow: hidden;
    }

    .fm-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid var(--b3-border-color);
        gap: 12px;
    }
    .fm-topbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }
    .fm-topbar-icon { font-size: 22px; }
    .fm-topbar-title {
        display: flex;
        flex-direction: column;
        min-width: 0;
        strong { font-size: 15px; font-weight: 600; }
        small { font-size: 12px; color: var(--b3-theme-secondary); }
    }
    .fm-close {
        width: 44px; height: 44px;
        border: none; background: transparent;
        font-size: 20px; color: var(--b3-theme-secondary);
        cursor: pointer; border-radius: 10px;
        flex-shrink: 0;
        &:hover { background: var(--b3-list-hover); color: var(--b3-theme-on-background); }
    }

    .fm-nav {
        display: flex;
        border-bottom: 1px solid var(--b3-border-color);
        padding: 0 12px; gap: 0;
    }
    .fm-nav-btn {
        padding: 8px 16px; border: none; background: transparent;
        color: var(--b3-theme-secondary); font-size: 13px; cursor: pointer;
        border-bottom: 2px solid transparent;
        &:hover { color: var(--b3-theme-on-background); }
        &.active {
            color: var(--b3-theme-primary);
            border-bottom-color: var(--b3-theme-primary);
        }
    }

    .fm-body {
        flex: 1; min-height: 0; overflow-y: auto;
        padding: 12px 16px;
    }

    .fm-loading, .fm-empty, .fm-search-empty {
        padding: 32px 16px; text-align: center;
        color: var(--b3-theme-secondary);
    }
    .fm-error {
        padding: 20px 16px; text-align: center;
        p { color: var(--b3-theme-error); margin: 0 0 10px; }
    }

    .fm-search-bar {
        display: flex; gap: 8px; align-items: center;
        margin-bottom: 8px;
    }
    .fm-search-icon { font-size: 16px; flex-shrink: 0; }
    .fm-search-input {
        flex: 1; min-width: 0;
        padding: 6px 10px; border: 1px solid var(--b3-border-color);
        border-radius: 6px; background: var(--b3-theme-background);
        color: var(--b3-theme-on-background); font-size: 13px;
    }
    .fm-search-clear {
        width: 24px; height: 24px; flex-shrink: 0;
        border: none; background: transparent;
        color: var(--b3-theme-secondary); cursor: pointer;
        font-size: 14px; border-radius: 50%;
        &:hover { background: var(--b3-list-hover); }
    }

    .fm-search-results {
        margin-bottom: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px; overflow: hidden;
    }
    .fm-search-row {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; border-bottom: 1px solid var(--b3-border-color);
        font-size: 13px;
        &:last-child { border-bottom: none; }
        &-favorited { background: color-mix(in srgb, var(--b3-theme-primary) 5%, transparent); }
    }
    .fm-search-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .fm-search-path {
        color: var(--b3-theme-secondary); font-size: 12px;
        max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .fm-summary {
        display: flex; gap: 12px; flex-wrap: wrap;
        padding: 6px 0 10px; font-size: 12px; color: var(--b3-theme-secondary);
    }
    .fm-summary-item {
        padding: 2px 8px; background: var(--b3-theme-surface);
        border-radius: 10px;
    }

    .fm-list {
        display: flex; flex-direction: column; gap: 6px;
    }
    .fm-card {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; border: 1px solid var(--b3-border-color);
        border-radius: 8px; background: var(--b3-theme-background);
        flex-wrap: wrap;
    }
    .fm-card-main {
        display: flex; align-items: center; gap: 8px;
        flex: 1; min-width: 0;
    }
    .fm-card-icon { font-size: 16px; flex-shrink: 0; }
    .fm-card-info {
        display: flex; flex-direction: column; min-width: 0; gap: 2px;
    }
    .fm-card-title {
        font-weight: 500; font-size: 13px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .fm-card-path {
        color: var(--b3-theme-secondary); font-size: 12px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .fm-card-actions {
        display: flex; align-items: center; gap: 6px;
        flex-shrink: 0; flex-wrap: wrap;
    }

    .fm-select {
        padding: 4px 8px; border: 1px solid var(--b3-border-color);
        border-radius: 5px; background: var(--b3-theme-background);
        color: var(--b3-theme-on-background); font-size: 12px;
        max-width: 130px;
    }

    .fm-btn {
        padding: 5px 14px; border: 1px solid var(--b3-border-color);
        border-radius: 6px; background: var(--b3-theme-background);
        color: var(--b3-theme-on-background); cursor: pointer; font-size: 12px;
        white-space: nowrap;
        &:hover:not(:disabled) { background: var(--b3-list-hover); }
        &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .fm-btn-primary {
        padding: 5px 14px; border: none; border-radius: 6px;
        background: var(--b3-theme-primary); color: #fff;
        cursor: pointer; font-size: 12px; white-space: nowrap;
        &:hover:not(:disabled) { opacity: 0.85; }
        &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .fm-btn-danger {
        padding: 4px 10px; border: 1px solid var(--b3-theme-error);
        border-radius: 6px; background: transparent;
        color: var(--b3-theme-error); cursor: pointer; font-size: 12px;
        white-space: nowrap;
        &:hover:not(:disabled) { background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent); }
        &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .fm-btn-sm {
        padding: 3px 10px; border: 1px solid var(--b3-border-color);
        border-radius: 5px; background: var(--b3-theme-background);
        color: var(--b3-theme-on-background); cursor: pointer; font-size: 12px;
        &:hover { background: var(--b3-list-hover); }
    }
    .fm-btn-danger-sm {
        padding: 3px 10px; border: 1px solid var(--b3-theme-error);
        border-radius: 5px; background: transparent;
        color: var(--b3-theme-error); cursor: pointer; font-size: 12px;
        &:hover { background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent); }
    }

    .fm-badge-done {
        display: inline-block; padding: 2px 8px; border-radius: 10px;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary); font-size: 11px;
    }

    .fm-group-create {
        margin-bottom: 12px;
        padding: 12px; border: 1px solid var(--b3-border-color);
        border-radius: 8px;
    }
    .fm-group-create-label { font-size: 12px; color: var(--b3-theme-secondary); margin-bottom: 6px; }
    .fm-group-create-row { display: flex; gap: 8px; }
    .fm-input {
        flex: 1; min-width: 0;
        padding: 6px 10px; border: 1px solid var(--b3-border-color);
        border-radius: 6px; background: var(--b3-theme-background);
        color: var(--b3-theme-on-background); font-size: 13px;
    }
    .fm-input-sm {
        flex: 1; min-width: 0; padding: 4px 8px;
        border: 1px solid var(--b3-theme-primary); border-radius: 5px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background); font-size: 12px;
    }
</style>
