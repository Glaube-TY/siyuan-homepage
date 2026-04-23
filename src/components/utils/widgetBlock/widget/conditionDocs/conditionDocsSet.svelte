<script lang="ts">
    import { openSiyuanEmojiPicker } from "@/homepage/homepageSetting/emojiPicker";
    import { normalizeSiyuanDocIcon } from "@/components/tools/docIcon";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        conditionDocsTitle?: string;
        conditionDocsPrefix?: string;
        useBuiltinDocIcon?: boolean;
        showConditionDocsDetails?: boolean;
        conditionDocsCondition?: string;
        conditionDocsKeyPosition?: string;
        conditionDocsKeyWord?: string;
        conditionDocsSortOrder?: string;
        showConditionDocsFloatDoc?: boolean;
        conditionDocsFloatDocShowTime?: number;
        conditionDocsTag?: string;
    }

    let {
        conditionDocsTitle = $bindable("📄子文档"),
        conditionDocsPrefix = $bindable("📄"),
        useBuiltinDocIcon = $bindable(false),
        showConditionDocsDetails = $bindable(true),
        conditionDocsCondition = $bindable("keyword"),
        conditionDocsKeyPosition = $bindable("anywhere"),
        conditionDocsKeyWord = $bindable(""),
        conditionDocsSortOrder = $bindable("updated"),
        showConditionDocsFloatDoc = $bindable(true),
        conditionDocsFloatDocShowTime = $bindable(0.1),
        conditionDocsTag = $bindable("")
    }: Props = $props();

    let prefixButtonRef: HTMLButtonElement | null = $state(null);

    function handlePrefixSelect() {
        if (prefixButtonRef) {
            openSiyuanEmojiPicker(prefixButtonRef, (emoji) => {
                conditionDocsPrefix = emoji;
            });
        }
    }
</script>

<SettingSection>
    <SettingRow title="组件标题">
        <input
            type="text"
            bind:value={conditionDocsTitle}
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
            {normalizeSiyuanDocIcon(conditionDocsPrefix) || "📄"}
        </button>
    </SettingRow>

    <SettingRow title="内置图标" description="优先使用文档自带图标">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={useBuiltinDocIcon} />
    </SettingRow>

    <SettingRow title="排序方式">
        <select bind:value={conditionDocsSortOrder} class="control-sm">
            <option value="updated">更新时间</option>
            <option value="created">创建时间</option>
        </select>
    </SettingRow>

    <SettingRow title="显示详情" description="显示更新时间等元信息">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showConditionDocsDetails} />
    </SettingRow>

    <SettingRow title="筛选条件">
        <select bind:value={conditionDocsCondition} class="control-sm">
            <option value="keyword">关键词</option>
            <option value="tag">标签</option>
        </select>
    </SettingRow>

    {#if conditionDocsCondition === "keyword"}
        <SettingRow title="关键词位置">
            <select bind:value={conditionDocsKeyPosition} class="control-md">
                <option value="anywhere">任意位置</option>
                <option value="DocTitle">文档标题</option>
                <option value="body">正文</option>
                <option value="bodyTitle">正文标题</option>
                <option value="paragraph">段落</option>
                <option value="list">列表</option>
                <option value="table">表格</option>
                <option value="code">代码</option>
                <option value="quote">引述</option>
                <option value="formula">公式</option>
            </select>
        </SettingRow>

        <SettingRow title="关键词" description="用于筛选文档的关键词">
            <input
                type="text"
                bind:value={conditionDocsKeyWord}
                placeholder="输入关键词"
                class="control-full"
            />
        </SettingRow>
    {:else if conditionDocsCondition === "tag"}
        <SettingRow title="标签" description="用于筛选文档的标签">
            <input
                type="text"
                bind:value={conditionDocsTag}
                placeholder="输入标签"
                class="control-full"
            />
        </SettingRow>
    {/if}

    <SettingRow title="显示预览弹窗" description="悬停时显示文档预览">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showConditionDocsFloatDoc} />
    </SettingRow>

    <SettingRow title="悬停时间" description="悬停多久后显示预览（秒）">
        <input
            type="number"
            bind:value={conditionDocsFloatDocShowTime}
            step="0.1"
            min="0"
            class="control-xs"
        />
    </SettingRow>
</SettingSection>
