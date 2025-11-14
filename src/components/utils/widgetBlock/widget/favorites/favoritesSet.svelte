<script lang="ts">
    import MultiSelect from "svelte-multiselect";
    import { onMount } from "svelte";

    // 收藏文档相关变量
    export let favoritiesTitle: string = "💖收藏文档";
    export let favoritiesSortOrder: string = "created";
    export let showNoteMeta: boolean = true;
    export let favoritiesDocPrefix: string = "❤";
    export let favoritesNotebookId: string = "";
    export let selectedFavoritesNotebookIds: {
        label: string;
        value: string;
    }[] = [];

    // 笔记本列表
    export let notebooks: any[] = [];

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
    $: if (favoritesNotebookId && notebooks.length > 0) {
        initializeSelectedNotebooks();
    }

    // 监听选择变化，更新字符串格式
    $: if (selectedFavoritesNotebookIds) {
        favoritesNotebookId =
            selectedFavoritesNotebookIds.length > 0
                ? selectedFavoritesNotebookIds
                      .map((item) => item.value)
                      .join(",")
                : "";
    }
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
            <MultiSelect
                id="doc-notebook-id"
                bind:selected={selectedFavoritesNotebookIds}
                options={notebooks.map((notebook) => ({
                    label: notebook.name,
                    value: notebook.id,
                }))}
                placeholder="选择笔记本..."
            />
        </div>
    </div>
    <hr />
    <div>
        组件说明：
        <a
            href="https://ttl8ygt82u.feishu.cn/wiki/HCICwChqpi9Iglkw6nwcVuP1nsf?from=from_copylink"
            target="_blank"
        >
            收藏文档
        </a>
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
