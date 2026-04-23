<script lang="ts">
    import { openSiyuanEmojiPicker } from "@/homepage/homepageSetting/emojiPicker";
    import { normalizeSiyuanDocIcon } from "@/components/tools/docIcon";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        childDocsTitle?: string;
        childDocsPrefix?: string;
        useBuiltinDocIcon?: boolean;
        showChildDocsDetails?: boolean;
        childDocsParentId?: string;
        childDocsSortOrder?: string;
        showChildDocsFloatDoc?: boolean;
        childDocsFloatDocShowTime?: number;
    }

    let {
        childDocsTitle = $bindable("📄子文档"),
        childDocsPrefix = $bindable("📄"),
        useBuiltinDocIcon = $bindable(false),
        showChildDocsDetails = $bindable(true),
        childDocsParentId = $bindable(""),
        childDocsSortOrder = $bindable("updated"),
        showChildDocsFloatDoc = $bindable(true),
        childDocsFloatDocShowTime = $bindable(0.1)
    }: Props = $props();

    let prefixButtonRef: HTMLButtonElement | null = $state(null);

    function handlePrefixSelect() {
        if (prefixButtonRef) {
            openSiyuanEmojiPicker(prefixButtonRef, (emoji) => {
                childDocsPrefix = emoji;
            });
        }
    }
</script>

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={childDocsTitle}
            placeholder="输入组件标题"
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
            {normalizeSiyuanDocIcon(childDocsPrefix) || "📄"}
        </button>
    </SettingRow>

    <SettingRow title="内置图标" description="优先使用文档自带图标">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={useBuiltinDocIcon} />
    </SettingRow>

    <SettingRow title="排序方式">
        <select bind:value={childDocsSortOrder} class="control-sm">
            <option value="updated">更新时间</option>
            <option value="created">创建时间</option>
        </select>
    </SettingRow>

    <SettingRow title="显示详情" description="显示更新时间等元信息">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showChildDocsDetails} />
    </SettingRow>

    <SettingRow title="父文档ID" description="指定要显示子文档的父文档">
        <input
            type="text"
            bind:value={childDocsParentId}
            placeholder="输入父文档ID"
            class="control-full"
        />
    </SettingRow>

    <SettingRow title="显示预览弹窗" description="悬停时显示文档预览">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showChildDocsFloatDoc} />
    </SettingRow>

    <SettingRow title="悬停时间" description="悬停多久后显示预览（秒）">
        <input
            type="number"
            bind:value={childDocsFloatDocShowTime}
            step="0.1"
            min="0"
            class="control-xs"
        />
    </SettingRow>
</SettingSection>
