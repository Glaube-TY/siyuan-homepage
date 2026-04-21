<script lang="ts">
    import { run } from 'svelte/legacy';

    import MultiSelect from "svelte-multiselect";
    import { onMount } from "svelte";

    

    
    interface Props {
        // 收藏文档相关变量
        favoritiesTitle?: string;
        favoritiesSortOrder?: string;
        showNoteMeta?: boolean;
        favoritiesDocPrefix?: string;
        useBuiltinDocIcon?: boolean;
        favoritesNotebookId?: string;
        selectedFavoritesNotebookIds?: {
        label: string;
        value: string;
    }[];
        showFavFloatDoc?: boolean;
        favFloatDocShowTime?: number;
        // 笔记本列表
        notebooks?: any[];
    }

    let {
        favoritiesTitle = $bindable("💖收藏文档"),
        favoritiesSortOrder = $bindable("created"),
        showNoteMeta = $bindable(true),
        favoritiesDocPrefix = $bindable("❤"),
        useBuiltinDocIcon = $bindable(false),
        favoritesNotebookId = $bindable(""),
        selectedFavoritesNotebookIds = $bindable([]),
        showFavFloatDoc = $bindable(true),
        favFloatDocShowTime = $bindable(0.1),
        notebooks = []
    }: Props = $props();

    // 初始化选择状态
    function initializeSelectedNotebooks() {
        if (
            favoritesNotebookId &&
            notebooks.length > 0 &&
            selectedFavoritesNotebookIds.length === 0
        ) {
            selectedFavoritesNotebookIds = favoritesNotebookId
                .split(",")
                .filter((id) => id.trim())
                .map((id) => {
                    const notebook = notebooks.find(
                        (notebook) => notebook.id === id,
                    );
                    return {
                        label: notebook ? notebook.name : id,
                        value: id,
                    };
                });
        }
    }

    // 组件挂载时初始化
    onMount(() => {
        initializeSelectedNotebooks();
    });

    // 监听变化，确保状态正确恢复
    run(() => {
        if (favoritesNotebookId && notebooks.length > 0) {
            initializeSelectedNotebooks();
        }
    });

    // 监听选择变化，更新字符串格式
    run(() => {
        if (selectedFavoritesNotebookIds) {
            favoritesNotebookId =
                selectedFavoritesNotebookIds.length > 0
                    ? selectedFavoritesNotebookIds
                          .map((item) => item.value)
                          .join(",")
                    : "";
        }
    });
</script>

<div class="content-panel favorites">
    <!-- 收藏文档设置区域 -->
    <div class="favorites-setting-top">
        <div>
            <div class="form-group">
                <label for="favorities-title">
                    组件标题：
                    <input
                        id="favorities-title"
                        type="text"
                        bind:value={favoritiesTitle}
                        placeholder="输入组件标题"
                    />
                </label>
            </div>
            <div class="form-group">
                <label for="favorities-doc-prefix">
                    文档前缀：
                    <input
                        id="favorities-doc-prefix"
                        type="text"
                        bind:value={favoritiesDocPrefix}
                    />
                </label>
            </div>
            <div class="form-group">
                <label for="use-builtin-doc-icon">
                    <input
                        id="use-builtin-doc-icon"
                        type="checkbox"
                        bind:checked={useBuiltinDocIcon}
                    />
                    内置图标
                </label>
            </div>
        </div>
        <div>
            <div class="form-group">
                <label for="favorities-sort-order"> 排序方式： </label>
                <select
                    id="favorities-sort-order"
                    bind:value={favoritiesSortOrder}
                >
                    <option value="created">创建时间</option>
                    <option value="updated">更新时间</option>
                </select>
            </div>
            <div class="form-group">
                <label for="favorities-show-note-meta">
                    <input
                        id="favorities-show-note-meta"
                        type="checkbox"
                        bind:checked={showNoteMeta}
                    />
                    显示文档信息
                </label>
            </div>
        </div>
    </div>
    <div class="favorites-setting-bottom">
        <div class="form-group doc-notebook-id">
            <label for="doc-notebook-id"> 文档笔记本： </label>
            {#if notebooks.length > 0}
                <MultiSelect
                    id="doc-notebook-id"
                    bind:selected={selectedFavoritesNotebookIds}
                    options={notebooks.map((notebook) => ({
                        label: notebook.name,
                        value: notebook.id,
                    }))}
                    placeholder="选择笔记本..."
                />
            {:else}
                <span class="loading-placeholder">笔记本加载中...</span>
            {/if}
            <div class="form-group">
                <label for="show-fav-float-doc">
                    <input
                        id="show-fav-float-doc"
                        type="checkbox"
                        bind:checked={showFavFloatDoc}
                    />
                    显示预览弹窗
                </label>
                <label for="fav-float-doc-show-time">
                    悬停时间：
                    <input
                        type="number"
                        title="悬停多长时间显示预览弹窗"
                        bind:value={favFloatDocShowTime}
                    />
                    秒
                </label>
            </div>
        </div>
    </div>
</div>

<style lang="scss">
    .favorites-setting-top {
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        align-items: center;
        gap: 10px;

        input {
            max-width: 150px;
        }
    }
</style>
