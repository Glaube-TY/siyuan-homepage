<script lang="ts">
    export let docJournalLimit: number = 5;
    export let recentJournalsShowType: string = "list";
    export let recentJournalsCalendarIcon: string = "📝";
    export let recentJournalsCalendarIconSize: number = 16;
    export let showLatestDailyNotesFloatDoc: boolean = true;
    export let latestDailyNotesFloatDocShowTime: number = 0.1;

    // 下拉选项
    const limitOptions = [5, 10, 15, 20, 50, 100];
</script>

<div class="content-panel recent-journals">
    <div>
        <label for="recentJournalsShowType">选择显示模式：</label>
        <select
            id="recentJournalsShowType"
            class="form-control"
            bind:value={recentJournalsShowType}
        >
            <option value="list">列表模式</option>
            <option value="calendar">日历模式</option>
        </select>
    </div>
    {#if recentJournalsShowType === "list"}
        <div class="form-group">
            <label for="journal-limit">显示日记数：</label>
            <select id="journal-limit" bind:value={docJournalLimit}>
                {#each limitOptions as option}
                    <option value={option}>{option}</option>
                {/each}
            </select>
        </div>
    {/if}
    {#if recentJournalsShowType === "calendar"}
        <div class="form-group recent-journals-calendar">
            <label for="recentJournalsCalendarIcon">
                日记图标：
                <input
                    id="recentJournalsCalendarIcon"
                    type="text"
                    bind:value={recentJournalsCalendarIcon}
                />
            </label>
            <label for="recentJournalsCalendarIconSize">
                图标大小：
                <input
                    id="recentJournalsCalendarIconSize"
                    min="10"
                    max="50"
                    type="number"
                    bind:value={recentJournalsCalendarIconSize}
                />
            </label>
        </div>
    {/if}

    <div class="form-group">
        <label for="show-latest-daily-notes-float-doc">
            <input
                id="show-latest-daily-notes-float-doc"
                type="checkbox"
                bind:checked={showLatestDailyNotesFloatDoc}
            />
            显示预览弹窗
        </label>
        <label for="latest-daily-notes-float-doc-show-time">
            悬停时间：
            <input
                type="number"
                title="悬停多长时间显示预览弹窗"
                bind:value={latestDailyNotesFloatDocShowTime}
            />
            秒
        </label>
    </div>

    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/JeWrwUDxmiPX5lk0XbZcHI1bn5g?from=from_copylink"
            target="_blank">最近日记</a
        >
    </div>
</div>

<style lang="scss">
    .recent-journals-calendar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 10px;

        #recentJournalsCalendarIcon,
        #recentJournalsCalendarIconSize {
            width: 50px;
        }
    }
</style>
