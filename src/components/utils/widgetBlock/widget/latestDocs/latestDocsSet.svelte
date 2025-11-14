<script lang="ts">
    import MultiSelect from "svelte-multiselect";
    import { onMount } from "svelte";

    export let notebooks: any[] = [];

    // 最近文档配置
    export let docLimit: number = 5;
    export let ensureOpenDocs: boolean = false;
    export let selectedNotebookIds: any[] = [];
    export let docNotebookId: string = "";
    export let latestDocsTitle: string = "最近文档";
    export let latestDocsPrefix: string = "";
    export let showLatestDocDetails: boolean = true;

    let limitOptions = [
        { value: 3, label: "3条" },
        { value: 5, label: "5条" },
        { value: 10, label: "10条" },
        { value: 15, label: "15条" },
        { value: 20, label: "20条" },
        { value: 50, label: "50条" },
        { value: 100, label: "100条" },
    ];

    // 初始化选择状态
    function initializeSelectedNotebooks() {
        if (
            docNotebookId &&
            notebooks.length > 0 &&
            selectedNotebookIds.length === 0
        ) {
            selectedNotebookIds = docNotebookId
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

    onMount(() => {
        initializeSelectedNotebooks();
    });

    // 监听变化，确保状态正确恢复
    $: if (docNotebookId && notebooks.length > 0) {
        initializeSelectedNotebooks();
    }
</script>

<div class="latest-docs-settings">
    <div class="group1">
        <div class="setting-item">
            <label for="latest-docs-title"
                >组件标题：
                <input
                    id="latest-docs-title"
                    type="text"
                    bind:value={latestDocsTitle}
                    placeholder="最近文档"
                />
            </label>
        </div>

        <div class="setting-item">
            <label for="latest-docs-prefix"
                >文档前缀：
                <input
                    id="latest-docs-prefix"
                    type="text"
                    bind:value={latestDocsPrefix}
                    placeholder=""
                />
            </label>
        </div>
    </div>

    <div class="group2">
        <div class="setting-item">
            <label for="doc-limit">显示条目数：</label>
            <select bind:value={docLimit}>
                {#each limitOptions as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            </select>
        </div>

        <div class="setting-item">
            <label>
                <input type="checkbox" bind:checked={ensureOpenDocs} />
                包含打开的文档
            </label>
        </div>

        <div class="setting-item">
            <label>
                <input type="checkbox" bind:checked={showLatestDocDetails} />
                显示文档信息
            </label>
        </div>
    </div>

    <div class="setting-item">
        <label for="doc-notebook-id">
            指定笔记本：
            <MultiSelect
                bind:selected={selectedNotebookIds}
                options={notebooks.map((notebook) => ({
                    label: notebook.name,
                    value: notebook.id,
                }))}
                placeholder="选择笔记本..."
            /></label
        >
    </div>

    <div class="component-help">
        <hr />
        <div>
            组件说明：<a
                href="https://ttl8ygt82u.feishu.cn/wiki/XQV7wtEtsihu2IkbYpWcOWSunKf?from=from_copylink"
                target="_blank">最近文档</a
            >
        </div>
    </div>
</div>

<style lang="scss">
    .group1 {
        display: flex;
        gap: 10px;
        align-items: center;

        #latest-docs-title {
            width: 200px;
        }

        #latest-docs-prefix {
            width: 50px;
        }
    }

    .group2 {
        display: flex;
        gap: 10px;
        align-items: center;
    }
</style>
