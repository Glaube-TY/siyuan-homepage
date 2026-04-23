<script lang="ts">
    import { openSiyuanEmojiPicker } from "@/homepage/homepageSetting/emojiPicker";
    import { normalizeSiyuanDocIcon } from "@/components/tools/docIcon";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        docJournalLimit?: number;
        recentJournalsShowType?: string;
        recentJournalsCalendarIcon?: string;
        recentJournalsCalendarIconSize?: number;
        useBuiltinDocIcon?: boolean;
        showLatestDailyNotesFloatDoc?: boolean;
        latestDailyNotesFloatDocShowTime?: number;
    }

    let {
        docJournalLimit = $bindable(5),
        recentJournalsShowType = $bindable("list"),
        recentJournalsCalendarIcon = $bindable("📝"),
        recentJournalsCalendarIconSize = $bindable(16),
        useBuiltinDocIcon = $bindable(false),
        showLatestDailyNotesFloatDoc = $bindable(true),
        latestDailyNotesFloatDocShowTime = $bindable(0.1)
    }: Props = $props();

    let iconButtonRef: HTMLButtonElement | null = $state(null);

    function handleIconSelect() {
        if (iconButtonRef) {
            openSiyuanEmojiPicker(iconButtonRef, (emoji) => {
                recentJournalsCalendarIcon = emoji;
            });
        }
    }

    // 下拉选项
    const limitOptions = [5, 10, 15, 20, 50, 100];
</script>

<SettingSection>
    <SettingRow title="选择显示模式">
        <select bind:value={recentJournalsShowType} class="control-sm">
            <option value="list">列表模式</option>
            <option value="calendar">日历模式</option>
        </select>
    </SettingRow>

    {#if recentJournalsShowType === "list"}
        <SettingRow title="显示日记数">
            <select bind:value={docJournalLimit} class="control-sm">
                {#each limitOptions as option}
                    <option value={option}>{option}</option>
                {/each}
            </select>
        </SettingRow>

        <SettingRow title="内置图标" description="优先使用文档自带图标">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={useBuiltinDocIcon} />
        </SettingRow>
    {/if}

    {#if recentJournalsShowType === "calendar"}
        <SettingRow title="日记图标" description="日历中显示日记的图标">
            <button
                type="button"
                class="emoji-btn"
                bind:this={iconButtonRef}
                onclick={handleIconSelect}
                title="点击选择表情"
            >
                {normalizeSiyuanDocIcon(recentJournalsCalendarIcon) || "📝"}
            </button>
        </SettingRow>

        <SettingRow title="图标大小" description="日历中日记图标的大小（像素）">
            <input
                type="number"
                bind:value={recentJournalsCalendarIconSize}
                min="10"
                max="50"
                class="control-xs"
            />
        </SettingRow>

        <SettingRow title="内置图标" description="优先使用文档自带图标">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={useBuiltinDocIcon} />
        </SettingRow>
    {/if}

    <SettingRow title="显示预览弹窗" description="悬停时显示文档预览">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showLatestDailyNotesFloatDoc} />
    </SettingRow>

    <SettingRow title="悬停时间" description="悬停多久后显示预览（秒）">
        <input
            type="number"
            bind:value={latestDailyNotesFloatDocShowTime}
            step="0.1"
            min="0"
            class="control-xs"
        />
    </SettingRow>
</SettingSection>
