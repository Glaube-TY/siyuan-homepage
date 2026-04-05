<script lang="ts">
    let {
        advancedEnabled,
        statisticalCardTitle = $bindable(),
        statisticalCardTitleSize = $bindable(),
        statisticalCardTitleColor = $bindable(),
        statisticalCardContent = $bindable(),
        statisticalCardCountSize = $bindable(),
        statisticalCardCountColor = $bindable(),
        customSQLCount = $bindable()
    } = $props();
</script>

<div class="content-panel statisticalCard">
    {#if advancedEnabled}
        <div class="content-panel statisticalCard">
            <div class="form-group statisticalCardTitle">
                <div>
                    <label for="">标题：</label><input
                        type="text"
                        bind:value={statisticalCardTitle}
                    />
                </div>
                <div>
                    <label for=""
                        >标题大小：<input
                            type="number"
                            bind:value={statisticalCardTitleSize}
                        /></label
                    >
                    <label for=""
                        >标题颜色：<input
                            type="color"
                            bind:value={statisticalCardTitleColor}
                        /></label
                    >
                </div>
            </div>
            <div class="form-group statisticalCardContent">
                <label for=""
                    >统计内容：<select
                        name=""
                        id=""
                        bind:value={statisticalCardContent}
                    >
                        <option value="notebooksCount">笔记本数</option>
                        <option value="docsCount">文档数</option>
                        <option value="blocksCount">块数</option>
                        <option value="wordsCount">字数</option>
                        <option value="tasksCount">任务数</option>
                        <option value="doneTasksCount">已完成任务数</option>
                        <option value="undoneTasksCount">未完成任务数</option>
                        <option value="dailynotesCount">日记数</option>
                        <option value="tagsCount">标签数</option>
                        <option value="citationCount">引述数</option>
                        <option value="codeBlocksCount">代码数</option>
                        <option value="mathBlocksCount">公式数</option>
                        <option value="customSQLCount">SQL 查询结果数</option>
                    </select></label
                >
                <div>
                    <label for=""
                        >数字大小：<input
                            type="number"
                            bind:value={statisticalCardCountSize}
                        /></label
                    >
                    <label for=""
                        >数字颜色：<input
                            type="color"
                            bind:value={statisticalCardCountColor}
                        /></label
                    >
                </div>
            </div>
            {#if statisticalCardContent === "customSQLCount"}
                <div class="form-group">
                    <label for=""
                        >自定义 SQL 查询：<textarea
                            bind:value={customSQLCount}
></textarea></label
                    >
                </div>
            {/if}
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/B8kGwSDdui3vy3kz55EcJkVHnHD?from=from_copylink"
            target="_blank">统计卡片</a
        >
    </div>
</div>

<style lang="scss">
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        div {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
        }
    }
</style>
