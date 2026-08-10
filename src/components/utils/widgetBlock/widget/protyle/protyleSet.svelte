<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import {
        getProtyleDisplayPreset,
        PROTYLE_CONTENT_PADDING_OPTIONS,
        PROTYLE_OUTER_PADDING_OPTIONS,
        type ProtyleContentPadding,
        type ProtyleContentWidthMode,
        type ProtyleDisplayPreset,
        type ProtyleOuterPadding,
    } from "./protyleDisplayConfig";

    interface Props {
        isRandomDoc?: boolean;
        customBlockID?: string;
        displayPreset?: ProtyleDisplayPreset;
        showBreadcrumb?: boolean;
        showDocumentTitle?: boolean;
        contentWidthMode?: ProtyleContentWidthMode;
        outerPadding?: ProtyleOuterPadding;
        contentPadding?: ProtyleContentPadding;
        innerCard?: boolean;
    }

    let {
        isRandomDoc = $bindable(false),
        customBlockID = $bindable(""),
        displayPreset = $bindable<ProtyleDisplayPreset>("compact"),
        showBreadcrumb = $bindable(true),
        showDocumentTitle = $bindable(true),
        contentWidthMode = $bindable<ProtyleContentWidthMode>("full"),
        outerPadding = $bindable<ProtyleOuterPadding>(8),
        contentPadding = $bindable<ProtyleContentPadding>(12),
        innerCard = $bindable(false),
    }: Props = $props();

    function applyPreset(preset: ProtyleDisplayPreset): void {
        if (preset === "custom") {
            displayPreset = "custom";
            return;
        }
        const config = getProtyleDisplayPreset(preset);
        displayPreset = config.displayPreset;
        showBreadcrumb = config.showBreadcrumb;
        showDocumentTitle = config.showDocumentTitle;
        contentWidthMode = config.contentWidthMode;
        outerPadding = config.outerPadding;
        contentPadding = config.contentPadding;
        innerCard = config.innerCard;
    }

    function markCustom(): void {
        displayPreset = "custom";
    }
</script>

<SettingSection title="文档来源">
    <SettingRow title="随机漫游文档">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={isRandomDoc} />
    </SettingRow>
    {#if !isRandomDoc}
        <SettingRow title="文档块 ID">
            <input
                type="text"
                bind:value={customBlockID}
                placeholder="例如：20250310094404-1yla4zz"
                class="control-full"
            />
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="显示布局">
    <SettingRow title="布局预设" description="紧凑模式减少留白；沉浸模式同时隐藏顶部导航与文档标题。">
        <select
            class="b3-select control-md"
            bind:value={displayPreset}
            onchange={(event) => applyPreset(event.currentTarget.value as ProtyleDisplayPreset)}
        >
            <option value="standard">标准</option>
            <option value="compact">紧凑</option>
            <option value="immersive">沉浸</option>
            <option value="custom">自定义</option>
        </select>
    </SettingRow>
    <SettingRow title="显示顶部导航栏" description="包含文档路径、锁定状态和更多菜单；隐藏后可用组件右上角的“打开原文”按钮。">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showBreadcrumb} onchange={markCustom} />
    </SettingRow>
    <SettingRow title="显示文档标题">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showDocumentTitle} onchange={markCustom} />
    </SettingRow>
    <SettingRow title="内容宽度" description="“充满组件”只影响当前组件，不会修改思源编辑器的全局宽度设置。">
        <select class="b3-select control-md" bind:value={contentWidthMode} onchange={markCustom}>
            <option value="system">跟随思源</option>
            <option value="full">充满组件</option>
        </select>
    </SettingRow>
    <SettingRow title="组件外边距">
        <select class="b3-select control-sm" bind:value={outerPadding} onchange={markCustom}>
            {#each PROTYLE_OUTER_PADDING_OPTIONS as padding}
                <option value={padding}>{padding}px</option>
            {/each}
        </select>
    </SettingRow>
    <SettingRow title="正文内边距">
        <select class="b3-select control-sm" bind:value={contentPadding} onchange={markCustom}>
            {#each PROTYLE_CONTENT_PADDING_OPTIONS as padding}
                <option value={padding}>{padding === "system" ? "跟随思源" : `${padding}px`}</option>
            {/each}
        </select>
    </SettingRow>
    <SettingRow title="内层卡片效果" description="关闭后文档编辑器会更自然地融入主页组件。">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={innerCard} onchange={markCustom} />
    </SettingRow>
</SettingSection>
