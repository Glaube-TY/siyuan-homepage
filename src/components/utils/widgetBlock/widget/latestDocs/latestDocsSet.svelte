<script lang="ts">
    import { run } from 'svelte/legacy';

    import MultiSelect from "svelte-multiselect";
    import { onMount } from "svelte";
    import { openSiyuanEmojiPicker } from "@/homepage/homepageSetting/emojiPicker";
    import { normalizeSiyuanDocIcon } from "@/components/tools/docIcon";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        notebooks?: any[];
        // 最近文档配置
        docLimit?: number;
        ensureOpenDocs?: boolean;
        selectedNotebookIds?: any[];
        docNotebookId?: string;
        latestDocsTitle?: string;
        latestDocsPrefix?: string;
        useBuiltinDocIcon?: boolean;
        showLatestDocDetails?: boolean;
        showLatestDocFloatDoc?: boolean;
        latestDocsFloatDocShowTime?: number;
    }

    let {
        notebooks = [],
        docLimit = $bindable(5),
        ensureOpenDocs = $bindable(false),
        selectedNotebookIds = $bindable([]),
        docNotebookId = $bindable(""),
        latestDocsTitle = $bindable("最近文档"),
        latestDocsPrefix = $bindable(""),
        useBuiltinDocIcon = $bindable(false),
        showLatestDocDetails = $bindable(true),
        showLatestDocFloatDoc = $bindable(true),
        latestDocsFloatDocShowTime = $bindable(0.1)
    }: Props = $props();

    let prefixButtonRef: HTMLButtonElement | null = $state(null);

    function handlePrefixSelect() {
        if (prefixButtonRef) {
            openSiyuanEmojiPicker(prefixButtonRef, (emoji) => {
                latestDocsPrefix = emoji;
            });
        }
    }

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
    run(() => {
        if (docNotebookId && notebooks.length > 0) {
            initializeSelectedNotebooks();
        }
    });
</script>

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={latestDocsTitle}
            placeholder="最近文档"
            class="control-full"
        />
    </SettingRow>

    <SettingRow title="文档前缀" description="设置文档列表前的图标">
        <button
            type="button"
            class="emoji-btn"
            bind:this={prefixButtonRef}
            onclick={handlePrefixSelect}
            title="点击选择表情"
        >
            {normalizeSiyuanDocIcon(latestDocsPrefix) || "📄"}
        </button>
    </SettingRow>

    <SettingRow title="内置图标" description="优先使用文档自带图标">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={useBuiltinDocIcon} />
    </SettingRow>

    <SettingRow title="显示条目数">
        <select bind:value={docLimit} class="control-sm">
            {#each limitOptions as option}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>
    </SettingRow>

    <SettingRow title="包含打开的文档" description="将当前打开的文档纳入列表">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={ensureOpenDocs} />
    </SettingRow>

    <SettingRow title="显示文档信息" description="显示更新时间等元信息">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showLatestDocDetails} />
    </SettingRow>

    <SettingRow title="指定笔记本">
        {#if notebooks.length > 0}
            <MultiSelect
                bind:selected={selectedNotebookIds}
                options={notebooks.map((notebook) => ({
                    label: notebook.name,
                    value: notebook.id,
                }))}
                placeholder="选择笔记本..."
            />
        {:else}
            <span>笔记本加载中...</span>
        {/if}
    </SettingRow>

    <SettingRow title="显示预览弹窗" description="悬停时显示文档预览">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showLatestDocFloatDoc} />
    </SettingRow>

    <SettingRow title="悬停时间" description="悬停多久后显示预览（秒）">
        <input
            type="number"
            bind:value={latestDocsFloatDocShowTime}
            step="0.1"
            min="0"
            class="control-xs"
        />
    </SettingRow>
</SettingSection>
