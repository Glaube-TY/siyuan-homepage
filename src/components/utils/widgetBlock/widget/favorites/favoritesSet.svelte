<script lang="ts">
    import { showMessage } from "siyuan";
    import { onMount, onDestroy } from "svelte";
    import DocIconPickerRow from "../../shared/DocIconPickerRow.svelte";
    import NotebookMultiSelectRow from "../../shared/NotebookMultiSelectRow.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import type { NotebookOption } from "../common/componentMigrationTypes";
    import {
        FAVORITES_SORT_OPTIONS,
        normalizeFavoritesSortOrder,
        loadGroupListForSettings,
    } from "./favorites";
    import { VIRTUAL_UNGROUPED_ID, VIRTUAL_UNGROUPED_NAME } from "@/features/favorites-manager/types";
    import { openFavoritesManagerDialog } from "@/features/favorites-manager/open-favorites-manager";
    import { onFavoritesUpdated } from "@/features/favorites-manager/favorites-events";

    interface Props {
        // 收藏文档相关变量
        favoritiesTitle?: string;
        favoritiesSortOrder?: string;
        showNoteMeta?: boolean;
        favoritiesDocPrefix?: string;
        useBuiltinDocIcon?: boolean;
        favoritesNotebookId?: string;
        selectedFavoritesNotebookIds?: NotebookOption[];
        showFavFloatDoc?: boolean;
        favFloatDocShowTime?: number;
        // 分组相关
        favoritesGroupingEnabled?: boolean;
        favoritesGroupIds?: string;
        // 笔记本列表和插件
        notebooks?: any[];
        plugin?: any;
        advancedEnabled?: boolean;
    }

    let {
        favoritiesTitle = $bindable("💖收藏文档"),
        favoritiesSortOrder = $bindable("favoritedDesc"),
        showNoteMeta = $bindable(true),
        favoritiesDocPrefix = $bindable("❤"),
        useBuiltinDocIcon = $bindable(false),
        favoritesNotebookId = $bindable(""),
        selectedFavoritesNotebookIds = $bindable<NotebookOption[]>([]),
        showFavFloatDoc = $bindable(true),
        favFloatDocShowTime = $bindable(0.1),
        favoritesGroupingEnabled = $bindable(false),
        favoritesGroupIds = $bindable(""),
        notebooks = [],
        plugin = undefined,
        advancedEnabled = false,
    }: Props = $props();
    const normalizedSortOrder = $derived(
        normalizeFavoritesSortOrder(favoritiesSortOrder),
    );

    // 分组选项三态：loading / ok / error
    type GroupListState =
        | { kind: "loading" }
        | { kind: "ok"; groups: { label: string; value: string }[] }
        | { kind: "error"; message: string };

    let groupListState = $state<GroupListState>({ kind: "loading" });
    let groupOptionsInitialized = false;
    let fsDestroyed = false;
    let fsLoadVersion = 0;

    async function refreshGroupOptions() {
        if (!advancedEnabled) return;
        const version = ++fsLoadVersion;
        groupListState = { kind: "loading" };
        const result = await loadGroupListForSettings();
        if (fsDestroyed || version !== fsLoadVersion) return;
        if (result.kind === "error") {
            groupListState = { kind: "error", message: result.message };
            return;
        }
        const options = [
            { label: VIRTUAL_UNGROUPED_NAME, value: VIRTUAL_UNGROUPED_ID },
            ...result.groups.map((g) => ({ label: g.name, value: g.id })),
        ];
        groupListState = { kind: "ok", groups: options };
    }

    // 当前选中的分组 ID 集合
    let selectedGroupIdSet = $derived(
        favoritesGroupIds
            ? new Set(favoritesGroupIds.split(",").map((id) => id.trim()).filter(Boolean))
            : new Set<string>(),
    );

    function toggleGroupId(groupId: string) {
        const current = new Set(selectedGroupIdSet);
        if (current.has(groupId)) {
            current.delete(groupId);
        } else {
            current.add(groupId);
        }
        favoritesGroupIds = [...current].join(",");
    }

    function openManager() {
        if (!advancedEnabled) {
            showMessage(
                "已有分组和组件设置会完整保留，开通或续费后可继续使用。",
                5000,
                "info",
            );
            return;
        }
        if (plugin) {
            void openFavoritesManagerDialog(plugin);
        }
    }

    // 分组开关与 VIP 状态联动：开启时加载，关闭/VIP失效时重置
    $effect(() => {
        if (!favoritesGroupingEnabled || !advancedEnabled) {
            groupOptionsInitialized = false;
            fsLoadVersion++;
            return;
        }
        if (!groupOptionsInitialized) {
            groupOptionsInitialized = true;
            void refreshGroupOptions();
        }
    });

    // 订阅收藏更新事件，管理弹窗操作后自动刷新分组列表
    let unsubFavUpdate: (() => void) | null = null;
    onMount(() => {
        unsubFavUpdate = onFavoritesUpdated(() => {
            if (advancedEnabled && favoritesGroupingEnabled) void refreshGroupOptions();
        });
    });
    onDestroy(() => {
        fsDestroyed = true;
        fsLoadVersion++;
        if (unsubFavUpdate) unsubFavUpdate();
    });
</script>

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={favoritiesTitle}
            placeholder="输入组件标题"
            class="control-full"
        />
    </SettingRow>

    <DocIconPickerRow
        title="文档前缀"
        description="设置文档列表前的图标"
        bind:value={favoritiesDocPrefix}
        fallback="❤"
        buttonTitle="点击选择表情"
    />

    <SettingRow title="内置图标" description="优先使用文档自带图标">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={useBuiltinDocIcon} />
    </SettingRow>

    <SettingRow
        title="排序方式"
        description="自动排序按所选规则；选择自定义排序后，可在组件中拖动文档"
    >
        <select
            value={normalizedSortOrder}
            onchange={(event) => (favoritiesSortOrder = event.currentTarget.value)}
            class="control-md"
        >
            {#each FAVORITES_SORT_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>
    </SettingRow>

    <SettingRow title="显示文档信息" description="显示更新时间等元信息">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showNoteMeta} />
    </SettingRow>

    <NotebookMultiSelectRow
        title="文档笔记本"
        notebooks={notebooks}
        bind:selected={selectedFavoritesNotebookIds}
        initialNotebookIds={favoritesNotebookId}
        placeholder="选择笔记本..."
    />

    <SettingRow title="显示预览弹窗" description="悬停时显示文档预览">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showFavFloatDoc} />
    </SettingRow>

    <SettingRow title="收藏管理" description="管理分组、搜索并收藏文档" premium>
        <button type="button" class="b3-button fm-manager-btn" class:fm-vip-locked={!advancedEnabled} onclick={openManager}>
            打开收藏文档管理
        </button>
    </SettingRow>

    <SettingRow title="按分组显示" description="开启后按分组分区展示收藏文档" premium>
        <span class="fm-switch-wrapper">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={favoritesGroupingEnabled} disabled={!advancedEnabled} />
        </span>
    </SettingRow>

    {#if favoritesGroupingEnabled && !advancedEnabled}
        <div class="favorites-group-selector__vip-hint" style="font-size:12px;color:var(--b3-theme-secondary);padding:0 0 8px">已有分组设置已保留，当前按免费版平铺方式展示，开通后自动恢复。</div>
    {/if}

    {#if favoritesGroupingEnabled && advancedEnabled}
        <div class="favorites-group-selector">
            <div class="favorites-group-selector__label">选择显示的分组（空=全部分组）</div>
            {#if groupListState.kind === "loading"}
                <div class="favorites-group-selector__loading">分组列表加载中...</div>
            {:else if groupListState.kind === "error"}
                <div class="favorites-group-selector__error">
                    分组列表暂不可用（{groupListState.message}）
                    <button type="button" class="fm-retry-btn" onclick={() => { void refreshGroupOptions(); }}>重试</button>
                </div>
            {:else}
                {#if groupListState.groups.length === 0}
                    <div class="favorites-group-selector__empty">暂无自定义分组</div>
                {:else}
                    <div class="favorites-group-selector__list">
                        {#each groupListState.groups as option (option.value)}
                            <label class="favorites-group-selector__item">
                                <input type="checkbox" checked={selectedGroupIdSet.has(option.value)} onchange={() => toggleGroupId(option.value)} />
                                <span>{option.label}</span>
                            </label>
                        {/each}
                    </div>
                    <!-- 已失效分组（可手动清除） -->
                    {@const validIds = new Set(groupListState.groups.map(g => g.value))}
                    {@const selectedIds = favoritesGroupIds ? favoritesGroupIds.split(",").map(s => s.trim()).filter(Boolean) : []}
                    {@const staleSelected = selectedIds.filter(id => id !== VIRTUAL_UNGROUPED_ID && !validIds.has(id))}
                    {#if staleSelected.length > 0}
                        <div class="favorites-group-selector__label">已失效分组（可取消选择）</div>
                        <div class="favorites-group-selector__list">
                            {#each staleSelected as id}
                                <label class="favorites-group-selector__item favorites-group-selector__item--stale">
                                    <input type="checkbox" checked={true} onchange={() => toggleGroupId(id)} />
                                    <span>{id.slice(0, 8)}...</span>
                                </label>
                            {/each}
                        </div>
                    {/if}
                {/if}
            {/if}
        </div>
    {/if}
</SettingSection>

<style lang="scss">
    .favorites-group-selector {
        padding: 4px 0 12px;

        &__label {
            font-size: 12px;
            color: var(--b3-theme-secondary);
            margin-bottom: 6px;
        }

        &__list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        &__item {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            user-select: none;

            &:hover {
                background: var(--b3-list-hover);
            }
        }

        &__loading,
        &__empty {
            font-size: 12px;
            color: var(--b3-theme-secondary);
            padding: 4px 0;
        }
    }

    .fm-manager-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 32px;
        padding: 0 14px;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
        color: var(--b3-theme-primary);
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;

        &:hover {
            background: color-mix(in srgb, var(--b3-theme-primary) 14%, var(--b3-theme-background));
            border-color: var(--b3-theme-primary);
        }
        &:active {
            background: color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-theme-background));
        }
        &:focus-visible {
            outline: 2px solid var(--b3-theme-primary);
            outline-offset: 2px;
        }

        &.fm-vip-locked {
            background: var(--b3-theme-surface);
            border: 1px dashed var(--b3-border-color);
            color: var(--b3-theme-secondary);
            cursor: pointer;
        }
    }

    .fm-switch-wrapper {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .fm-retry-btn {
        margin-left: 8px;
        padding: 2px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: transparent;
        color: var(--b3-theme-primary);
        font-size: 12px;
        cursor: pointer;
        &:hover {
            background: var(--b3-list-hover);
        }
    }
</style>
