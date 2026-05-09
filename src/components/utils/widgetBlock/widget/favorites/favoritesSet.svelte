<script lang="ts">
    import DocIconPickerRow from "../../shared/DocIconPickerRow.svelte";
    import NotebookMultiSelectRow from "../../shared/NotebookMultiSelectRow.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

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

    <SettingRow title="排序方式">
        <select bind:value={favoritiesSortOrder} class="control-sm">
            <option value="created">创建时间</option>
            <option value="updated">更新时间</option>
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

    <SettingRow title="悬停时间" description="悬停多久后显示预览（秒）">
        <input
            type="number"
            bind:value={favFloatDocShowTime}
            step="0.1"
            min="0"
            class="control-xs"
        />
    </SettingRow>
</SettingSection>
