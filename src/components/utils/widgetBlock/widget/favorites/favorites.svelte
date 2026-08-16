<script lang="ts">
    import { onMount } from "svelte";
    import Sortable from "sortablejs";
    import { showMessage } from "siyuan";
    import {
        favoriteTimeValue,
        getLatestFavoritesNotes,
        normalizeFavoritesSortOrder,
        groupFavoritesByGroup,
    } from "./favorites";
    import { openDocs } from "@/components/tools/openDocs";

    import {
        createFloatingDocPopup,
        setMouseOnTrigger,
        hideImmediately,
    } from "@/components/tools/floatingDoc";
    import { resolveBuiltinDocIcon, resolveConfiguredDocIcon, type DocIconResult } from "@/components/tools/docIcon";
    import {
        ensureFavoritesIndexInitialized,
        reorderFavoriteIndexItems,
        type ComponentDocInfo,
    } from "@/components/tools/siyuanComponentDataApi";
    import {
        onFavoritesUpdated,
    } from "@/features/favorites-manager/favorites-events";
    import { loadFavoritesForUI } from "@/features/favorites-manager/favorites-store";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import LocalIndexEmptyState from "../common/LocalIndexEmptyState.svelte";
    import WidgetSemanticTitle from "@/homepage/theme/widgetPresentation/components/WidgetSemanticTitle.svelte";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        placement?: string;
    }

    let { plugin, contentTypeJson = "{}", placement = "homepage" }: Props = $props();

    const contentTypeJsonObj = $derived(JSON.parse(contentTypeJson));
    const isMobilePlacement = $derived(placement === "mobile");

    let favoritesNotes: ComponentDocInfo[] = $state([]);
    let favoritesDataStatus = $state<"ok" | "empty" | "limited" | "disabled" | "unsupported" | "error">("empty");
    let favoritesStatusMessage = $state("收藏索引为空，可从文档树重新收藏文档。");

    // 分组加载状态机
    type GroupLoadState = { kind: "idle" } | { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };
    let groupLoadState = $state<GroupLoadState>({ kind: "idle" });
    let groupedResult = $state<Awaited<ReturnType<typeof groupFavoritesByGroup>> | null>(null);
    let invalidSelectedGroupIds = $state<string[]>([]);
    let orphanedItems = $state<ComponentDocInfo[]>([]);

    const favoritiesTitle =
        $derived(contentTypeJsonObj.data?.favoritiesTitle || "💖收藏文档");
    const showNoteMeta = $derived(contentTypeJsonObj.data?.showNoteMeta ?? true);
    const favoritiesDocPrefix =
        $derived(contentTypeJsonObj.data?.favoritiesDocPrefix || "❤");
    const showFavFloatDoc = $derived(contentTypeJsonObj.data?.showFavFloatDoc ?? true);
    const favFloatDocShowTime =
        $derived(contentTypeJsonObj.data?.favFloatDocShowTime || 0.1);
    const useBuiltinDocIcon = $derived(contentTypeJsonObj.data?.useBuiltinDocIcon ?? false);
    const favoritesSortOrder = $derived(
        normalizeFavoritesSortOrder(contentTypeJsonObj.data?.favoritiesSortOrder),
    );
    const favoritesGroupIds = $derived(contentTypeJsonObj.data?.favoritesGroupIds || "");

    // VIP 状态
    let advancedEnabled = $state(false);
    let groupLoadVersion = 0;
    const configuredGroupingEnabled = $derived(contentTypeJsonObj.data?.favoritesGroupingEnabled ?? false);
    const effectiveGroupingEnabled = $derived(advancedEnabled && configuredGroupingEnabled);

    let favoritesListElement: HTMLUListElement | null = $state(null);
    let dragHandleSuppressed = $state(false);

    // 组件销毁后丢弃异步 SQL 结果，避免更新已卸载状态
    let isDestroyed = false;
    let unsubscribeFavoritesUpdate: (() => void) | null = null;

    // 获取文档图标（优先内置图标，否则回退到前缀）
    function getDocIcon(note: ComponentDocInfo): DocIconResult {
        if (useBuiltinDocIcon) {
            const builtin = resolveBuiltinDocIcon(note);
            if (builtin) return builtin;
        }
        return resolveConfiguredDocIcon(favoritiesDocPrefix, "❤");
    }

    // 时间戳格式化函数
    function formatDate(raw: unknown): string {
        const timestamp = favoriteTimeValue(raw);
        if (timestamp === null) return "未记录";
        const date = new Date(timestamp);
        return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`;
    }

    function formatMobileDate(raw: unknown): string {
        const timestamp = favoriteTimeValue(raw);
        if (timestamp === null) return "未记录";
        const date = new Date(timestamp);
        return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    }

    function noteMeta(note: ComponentDocInfo): {
        label: string;
        mobileLabel: string;
        value: unknown;
    } {
        if (favoritesSortOrder.startsWith("created")) {
            return { label: "创建时间", mobileLabel: "创建", value: note.created };
        }
        if (favoritesSortOrder.startsWith("favorited") || favoritesSortOrder === "manual") {
            return { label: "收藏时间", mobileLabel: "收藏", value: note.favoritedAt };
        }
        return { label: "更新时间", mobileLabel: "更新", value: note.updated };
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

    async function safeLoadFavorites(): Promise<void> {
        try {
            await loadFavorites();
        } catch (error) {
            if (isDestroyed) return;
            favoritesDataStatus = "error";
            favoritesStatusMessage = error instanceof Error ? error.message : "加载收藏数据失败";
        }
    }

    async function loadFavorites(): Promise<void> {
        const result = await getLatestFavoritesNotes(
            favoritesSortOrder,
            contentTypeJsonObj.data?.favoritesNotebookId,
            useBuiltinDocIcon,
            plugin,
        );
        if (isDestroyed) return;
        favoritesNotes = result.items;
        favoritesDataStatus = result.status;
        favoritesStatusMessage = result.message || favoritesStatusMessage;

        // 有效分组关闭时不读取分组数据
        if (!effectiveGroupingEnabled) {
            groupLoadState = { kind: "idle" };
            groupedResult = null;
            invalidSelectedGroupIds = [];
            orphanedItems = [];
            return;
        }

        // 分组功能开启时加载分组（带版本号守卫）
        groupLoadVersion++;
        const version = groupLoadVersion;
        groupLoadState = { kind: "loading" };
        try {
            const payload = await loadFavoritesForUI();
            if (isDestroyed || version !== groupLoadVersion) return;
            const resolved = groupFavoritesByGroup(favoritesNotes, payload.groups, favoritesGroupIds);
            groupedResult = resolved;
            invalidSelectedGroupIds = resolved.invalidSelectedGroupIds;
            orphanedItems = resolved.orphanedItems;
            groupLoadState = { kind: "ready" };
        } catch (error) {
            if (isDestroyed || version !== groupLoadVersion) return;
            groupLoadState = { kind: "error", message: error instanceof Error ? error.message : "收藏分组数据暂不可用" };
        }
    }

    async function persistManualOrder(
        next: ComponentDocInfo[],
        previous: ComponentDocInfo[],
    ): Promise<void> {
        favoritesNotes = next;
        try {
            await reorderFavoriteIndexItems(next.map((note) => note.id));
        } catch (error) {
            favoritesNotes = previous;
            showMessage(
                error instanceof Error ? error.message : "收藏文档排序保存失败",
                4000,
                "error",
            );
        }
    }

    $effect(() => {
        const element = favoritesListElement;
        if (
            !element ||
            isMobilePlacement ||
            favoritesSortOrder !== "manual" ||
            favoritesNotes.length < 2
        ) return;
        const sortable = new Sortable(element, {
            animation: 150,
            handle: ".favorites-drag-handle",
            draggable: ".favorites-item",
            onStart: () => {
                dragHandleSuppressed = false;
            },
            onEnd: (event) => {
                dragHandleSuppressed = true;
                const oldIndex = event.oldIndex;
                const newIndex = event.newIndex;
                if (
                    typeof oldIndex !== "number" ||
                    typeof newIndex !== "number" ||
                    oldIndex === newIndex
                ) return;
                const previous = [...favoritesNotes];
                const next = [...favoritesNotes];
                const [target] = next.splice(oldIndex, 1);
                next.splice(newIndex, 0, target);
                void persistManualOrder(next, previous);
            },
        });
        return () => sortable.destroy();
    });

    // 分组模式的组内 Sortable（仅桌面、manual 排序、分组开启）
    const groupListElements = new Map<string, HTMLUListElement>();
    function registerGroupList(node: HTMLUListElement, groupId: string) {
        groupListElements.set(groupId, node);
        return {
            destroy() {
                if (groupListElements.get(groupId) === node) {
                    groupListElements.delete(groupId);
                }
            },
        };
    }

    let groupSortables = new Map<string, Sortable>();
    $effect(() => {
        if (
            isMobilePlacement ||
            favoritesSortOrder !== "manual" ||
            groupedResult?.groups === undefined ||
            groupedResult.groups.size === 0
        ) {
            for (const s of groupSortables.values()) s.destroy();
            groupSortables.clear();
            return;
        }
        // 清理旧实例
        for (const s of groupSortables.values()) s.destroy();
        groupSortables.clear();

        for (const [groupId] of groupedResult!.groups.entries()) {
            const el = groupListElements.get(groupId);
            if (!el || el.querySelectorAll(".favorites-item").length < 2) continue;
            const sortable = new Sortable(el, {
                animation: 150,
                handle: ".favorites-drag-handle",
                draggable: ".favorites-item",
                onEnd: (event) => {
                    const oldIdx = event.oldIndex;
                    const newIdx = event.newIndex;
                    if (
                        typeof oldIdx !== "number" ||
                        typeof newIdx !== "number" ||
                        oldIdx === newIdx
                    ) return;
                    const itemEls = el.querySelectorAll(".favorites-item");
                    const orderedIds = Array.from(itemEls)
                        .map((child) => child.getAttribute("data-favorite-id") || "")
                        .filter(Boolean);
                    void persistManualOrderForGroup(orderedIds);
                },
            });
            groupSortables.set(groupId, sortable);
        }
    });

    async function persistManualOrderForGroup(orderedIds: string[]) {
        try {
            await reorderFavoriteIndexItems(orderedIds);
            await loadFavorites();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "排序保存失败", 4000, "error");
            try { await loadFavorites(); } catch { /* 二次刷新失败不再抛出 */ }
        }
    }

    onMount(() => {
        isDestroyed = false;
        advancedEnabled = Boolean(plugin?.ADVANCED);

        // VIP 事件监听（同步定义以便 cleanup 引用）
        function handleAdvancedReady() {
            advancedEnabled = true;
            if (!isDestroyed) void safeLoadFavorites();
        }
        function handleAdvancedUnavailable() {
            advancedEnabled = false;
            groupLoadVersion++;
            groupLoadState = { kind: "idle" };
            groupedResult = null;
            orphanedItems = [];
            invalidSelectedGroupIds = [];
            for (const s of groupSortables.values()) s.destroy();
            groupSortables.clear();
        }
        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);

        // 异步初始化（IIFE，不阻塞 onMount 返回清理函数）
        void (async () => {
            try {
                await ensureFavoritesIndexInitialized(plugin);
            } catch {
                // 初始化失败仍尝试读取已有索引
            }
            if (isDestroyed) return;
            void safeLoadFavorites();
            // 订阅收藏更新（最多一次）
            if (!unsubscribeFavoritesUpdate) {
                unsubscribeFavoritesUpdate = onFavoritesUpdated(() => {
                    if (isDestroyed) return;
                    void safeLoadFavorites();
                });
            }
        })();

        // 同步返回清理函数
        return () => {
            isDestroyed = true;
            groupLoadVersion++;
            window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
            clearFloatDocTimeouts();
            if (unsubscribeFavoritesUpdate) {
                unsubscribeFavoritesUpdate();
                unsubscribeFavoritesUpdate = null;
            }
            for (const s of groupSortables.values()) s.destroy();
            groupSortables.clear();
            groupListElements.clear();
        };
    });
</script>

{#if isMobilePlacement}
    <div class="mobile-favorites-widget" data-widget-part="root">
        <header class="mobile-favorites-header" data-widget-part="header">
            <div>
                <h3>{favoritiesTitle}</h3>
            </div>
            <span class="mobile-favorites-count">{favoritesNotes.length}</span>
        </header>

        <div class="mobile-favorites-list" data-widget-part="body">
            {#if favoritesNotes.length}
                {#if effectiveGroupingEnabled && groupLoadState.kind === "loading"}
                    <div class="mobile-favorites-empty">正在加载收藏分组...</div>
                {:else if effectiveGroupingEnabled && groupLoadState.kind === "error"}
                    <div class="mobile-favorites-empty">收藏分组数据暂不可用（{groupLoadState.message}）</div>
                {:else if effectiveGroupingEnabled && groupedResult !== null}
                    {#if groupedResult.groups.size > 0}
                        {#each [...groupedResult.groups.entries()] as [groupId, groupData] (groupId)}
                            <div class="mobile-favorites-group-title">{groupData.name}</div>
                            {#each groupData.items as note (note.id)}
                                {@const iconResult = getDocIcon(note)}
                                {@const meta = noteMeta(note)}
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
                                            <small>{meta.mobileLabel} {formatMobileDate(meta.value)}</small>
                                        {/if}
                                    </span>
                                </button>
                            {/each}
                        {/each}
                    {/if}
                    {#if orphanedItems.length > 0}
                        <div class="mobile-favorites-group-title">未识别分组</div>
                        {#each orphanedItems as note (note.id)}
                            {@const iconResult = getDocIcon(note)}
                            {@const meta = noteMeta(note)}
                            <button type="button" class="mobile-favorite-row" onclick={() => openDocs(plugin, note.id, 0)}>
                                <span class="mobile-favorite-icon">
                                    {#if iconResult.type === "image"}<img src={iconResult.value} alt="" />{:else}{iconResult.value}{/if}
                                </span>
                                <span class="mobile-favorite-main">
                                    <strong>{note.content || "无标题文档"}</strong>
                                </span>
                            </button>
                        {/each}
                    {/if}
                    {#if invalidSelectedGroupIds.length > 0}
                        <div class="mobile-favorites-empty">部分所选分组已失效，请检查组件设置</div>
                    {/if}
                    {#if groupedResult.groups.size === 0 && orphanedItems.length === 0}
                        <div class="mobile-favorites-empty">所选分组暂无收藏文档</div>
                    {/if}
                {:else}
                    {#each favoritesNotes as note (note.id)}
                        {@const iconResult = getDocIcon(note)}
                        {@const meta = noteMeta(note)}
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
                                        {meta.mobileLabel} {formatMobileDate(meta.value)}
                                    </small>
                                {/if}
                            </span>
                        </button>
                    {/each}
                {/if}
            {:else}
                {#if favoritesDataStatus === "disabled"}
                    <LocalIndexEmptyState
                        title="本地索引为空"
                        message="收藏本地索引为空，请重新收藏文档或刷新索引。"
                        {plugin}
                        hint="从文档树右键重新收藏，或到主页设置 > 检索管理中刷新收藏索引。"
                    />
                {:else}
                    <div class="mobile-favorites-empty">{favoritesStatusMessage}</div>
                {/if}
            {/if}
        </div>
    </div>
{:else}
    <div class="content-display" data-widget-part="root">
        <WidgetSemanticTitle
            widgetType="favorites"
            configuredTitle={favoritiesTitle}
            semanticLabel="收藏文档"
            fallbackIcon="iconBookmark"
        />
        <div class="favorites-content-container" data-widget-part="body">
            {#if favoritesNotes.length}
                {#if effectiveGroupingEnabled && groupLoadState.kind === "loading"}
                    <div class="favorites-empty-state" data-widget-part="loading">正在加载收藏分组...</div>
                {:else if effectiveGroupingEnabled && groupLoadState.kind === "error"}
                    <div class="favorites-empty-state" data-widget-part="error"><strong>收藏分组数据暂不可用</strong><span>{groupLoadState.message}</span></div>
                {:else if effectiveGroupingEnabled && groupedResult !== null}
                    {#if groupedResult.groups.size === 0 && favoritesNotes.length > 0}
                        <div class="favorites-empty-state"><strong>所选分组暂无收藏文档</strong></div>
                    {/if}
                    <!-- 分组模式 -->
                    {#each [...groupedResult.groups.entries()] as [groupId, groupData] (groupId)}
                        <section class="favorites-group-section">
                            <h4 class="favorites-group-title">{groupData.name}</h4>
                            <ul class="favorites-list" data-widget-part="list" use:registerGroupList={groupId}>
                                {#each groupData.items as note (note.id)}
                                    {@const iconResult = getDocIcon(note)}
                                    {@const meta = noteMeta(note)}
                                    <li class="favorites-item" data-widget-part="item" data-favorite-id={note.id} onpointerleave={() => (dragHandleSuppressed = false)}>
                                        {#if favoritesSortOrder === "manual"}
                                            <div class="favorites-manual-actions">
                                                <button type="button" class="favorites-manual-button favorites-drag-handle" title="拖动排序"
                                                    aria-label="拖动 {note.content || "无标题文档"} 调整顺序">
                                                    <SiyuanIcon name="drag" size={14} /></button>
                                            </div>
                                        {/if}
                                        <div
                                            class="favorites-item-content"
                                            data-widget-part="primary"
                                            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { openDocs(plugin, note.id, 0); } }}
                                            onmouseenter={(e) => {
                                                if (showFavFloatDoc && !plugin.isMobile) {
                                                    if (floatDocTimeout) clearTimeout(floatDocTimeout);
                                                    floatDocTimeout = window.setTimeout(() => {
                                                        createFloatingDocPopup(note, e, plugin);
                                                        floatDocTimeout = null;
                                                    }, favFloatDocShowTime * 1000);
                                                }
                                            }}
                                            onmouseleave={() => {
                                                if (showFavFloatDoc && !plugin.isMobile) {
                                                    if (floatDocTimeout) { clearTimeout(floatDocTimeout); floatDocTimeout = null; }
                                                    if (mouseLeaveTimeout) clearTimeout(mouseLeaveTimeout);
                                                    mouseLeaveTimeout = window.setTimeout(() => {
                                                        setMouseOnTrigger(false);
                                                        mouseLeaveTimeout = null;
                                                    }, 150);
                                                }
                                            }}
                                            onclick={() => {
                                                if (showFavFloatDoc && !plugin.isMobile) hideImmediately();
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
                                            <span class="doc-title" data-widget-part="primary">{note.content}</span>
                                        </div>
                                        {#if showNoteMeta}
                                            <div class="note-meta" data-widget-part="meta">{meta.label}：{formatDate(meta.value)}</div>
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        </section>
                    {/each}
                    {#if orphanedItems.length > 0}
                        <section class="favorites-group-section">
                            <h4 class="favorites-group-title">未识别分组</h4>
                            <div class="favorites-empty-state" style="padding:4px 0;font-size:12px">以下收藏引用已删除的分组，数据保留</div>
                            <ul class="favorites-list" data-widget-part="list">
                                {#each orphanedItems as note (note.id)}
                                    {@const iconResult = getDocIcon(note)}
                                    {@const meta = noteMeta(note)}
                                    <li class="favorites-item" data-widget-part="item" data-favorite-id={note.id}>
                                        <div class="favorites-item-content" data-widget-part="primary"
                                            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { openDocs(plugin, note.id, 0); } }}
                                            onclick={() => openDocs(plugin, note.id, 0)}
                                            role="button" tabindex="0" aria-label="打开收藏文档：{note.content}">
                                            {#if iconResult.type === "image"}<img class="doc-icon-image" src={iconResult.value} alt="" />{:else}<span class="doc-icon">{iconResult.value}</span>{/if}
                                            <span class="doc-title">{note.content}</span>
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        </section>
                    {/if}
                    {#if invalidSelectedGroupIds.length > 0}
                        <div class="favorites-empty-state" style="padding:4px 0;font-size:12px;color:var(--b3-theme-warning, #d08215)">部分所选分组已失效，请检查组件设置</div>
                    {/if}
                {:else if !effectiveGroupingEnabled || groupLoadState.kind === "idle"}
                    <!-- 平铺模式 -->
                    <ul class="favorites-list" data-widget-part="list" class:suppress-drag-handle={dragHandleSuppressed} bind:this={favoritesListElement}>
                        {#each favoritesNotes as note (note.id)}
                            {@const iconResult = getDocIcon(note)}
                            {@const meta = noteMeta(note)}
                            <li class="favorites-item" data-widget-part="item" data-favorite-id={note.id} onpointerleave={() => (dragHandleSuppressed = false)}>
                                {#if favoritesSortOrder === "manual"}
                                    <div class="favorites-manual-actions">
                                        <button type="button" class="favorites-manual-button favorites-drag-handle" title="拖动排序"
                                            aria-label="拖动 {note.content || "无标题文档"} 调整顺序">
                                            <SiyuanIcon name="drag" size={14} />
                                        </button>
                                    </div>
                                {/if}
                                <div class="favorites-item-content" data-widget-part="primary"
                                    onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { openDocs(plugin, note.id, 0); } }}
                                    onmouseenter={(e) => {
                                        if (showFavFloatDoc && !plugin.isMobile) {
                                            if (floatDocTimeout) clearTimeout(floatDocTimeout);
                                            floatDocTimeout = window.setTimeout(() => {
                                                createFloatingDocPopup(note, e, plugin);
                                                floatDocTimeout = null;
                                            }, favFloatDocShowTime * 1000);
                                        }
                                    }}
                                    onmouseleave={() => {
                                        if (showFavFloatDoc && !plugin.isMobile) {
                                            if (floatDocTimeout) { clearTimeout(floatDocTimeout); floatDocTimeout = null; }
                                            if (mouseLeaveTimeout) clearTimeout(mouseLeaveTimeout);
                                            mouseLeaveTimeout = window.setTimeout(() => {
                                                setMouseOnTrigger(false);
                                                mouseLeaveTimeout = null;
                                            }, 150);
                                        }
                                    }}
                                    onclick={() => {
                                        if (showFavFloatDoc && !plugin.isMobile) hideImmediately();
                                        openDocs(plugin, note.id, 0);
                                    }}
                                    role="button" tabindex="0" aria-label="打开收藏文档：{note.content}">
                                    {#if iconResult.type === "image"}<img class="doc-icon-image" src={iconResult.value} alt="" />
                                    {:else}<span class="doc-icon">{iconResult.value}</span>{/if}
                                    <span class="doc-title" data-widget-part="primary">{note.content}</span>
                                </div>
                                {#if showNoteMeta}<div class="note-meta" data-widget-part="meta">{meta.label}：{formatDate(meta.value)}</div>{/if}
                            </li>
                        {/each}
                    </ul>
                {/if}
            {:else}
                {#if favoritesDataStatus === "disabled"}
                    <LocalIndexEmptyState title="本地索引为空" message="收藏本地索引为空，请重新收藏文档或刷新索引。" {plugin}
                        hint="从文档树右键重新收藏，或到主页设置 > 检索管理中刷新收藏索引。" />
                {:else}
                    <div class="favorites-empty-state" data-widget-part="empty"><strong>收藏索引为空</strong><span>{favoritesStatusMessage}</span></div>
                {/if}
            {/if}
        </div>
    </div>
{/if}

<style lang="scss">
    .favorites-group-section {
        margin-bottom: 12px;

        .favorites-group-title {
            font-size: 14px;
            font-weight: 600;
            margin: 0 0 6px 0;
            padding: 4px 8px;
            color: var(--b3-theme-on-surface);
            background: var(--b3-theme-surface);
            border-radius: 4px;
        }
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
            position: relative;
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

        .favorites-manual-actions {
            position: absolute;
            top: 4px;
            right: 4px;
            display: inline-flex;
            align-items: center;
            gap: 2px;
            padding: 2px;
            border-radius: 6px;
            background: var(--b3-theme-background);
            opacity: 0;
            transition: opacity 0.15s ease;
            z-index: 1;
        }

        .favorites-list:not(.suppress-drag-handle)
            .favorites-item:hover
            .favorites-manual-actions {
            opacity: 1;
        }

        .favorites-manual-button {
            width: 26px;
            height: 26px;
            padding: 0;
            border: 0;
            border-radius: 5px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            color: var(--b3-theme-on-surface);
            cursor: pointer;

            &:hover,
            &:focus-visible {
                background: var(--b3-list-hover);
                color: var(--b3-theme-primary);
            }
        }

        .favorites-drag-handle {
            cursor: grab;

            &:active {
                cursor: grabbing;
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
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background)),
            color-mix(in srgb, var(--b3-theme-primary) 2%, var(--b3-theme-background))
        );
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
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface));
        color: var(--b3-theme-primary);
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
        background: color-mix(in srgb, var(--b3-theme-primary) 9%, var(--b3-theme-background));
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
