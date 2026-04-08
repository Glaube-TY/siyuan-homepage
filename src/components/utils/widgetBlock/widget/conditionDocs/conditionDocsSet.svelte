<script lang="ts">
    interface Props {
        conditionDocsTitle?: string;
        conditionDocsPrefix?: string;
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
        showConditionDocsDetails = $bindable(true),
        conditionDocsCondition = $bindable("keyword"),
        conditionDocsKeyPosition = $bindable("anywhere"),
        conditionDocsKeyWord = $bindable(""),
        conditionDocsSortOrder = $bindable("updated"),
        showConditionDocsFloatDoc = $bindable(true),
        conditionDocsFloatDocShowTime = $bindable(0.1),
        conditionDocsTag = $bindable("")
    }: Props = $props();
</script>

<div class="content-display">
    <div class="content-panel conditionDocs">
        <div class="form-group conditionDocs-title">
            <label for="conditionDocs-title">
                组件标题：
                <input
                    id="conditionDocs-title"
                    type="text"
                    bind:value={conditionDocsTitle}
                    placeholder="输入组件标题"
                />
            </label>
        </div>
        <div class="form-group conditionDocs-prefix">
            <label for="conditionDocs-prefix">
                文档前缀：
                <input
                    id="conditionDocs-prefix"
                    type="text"
                    bind:value={conditionDocsPrefix}
                    placeholder="输入文档前缀"
                />
            </label>
            <label for="conditionDocs-sortOrder">
                排序方式：
                <select
                    id="conditionDocs-sortOrder"
                    bind:value={conditionDocsSortOrder}
                >
                    <option value="updated">更新时间</option>
                    <option value="created">创建时间</option>
                </select>
            </label>
            <label for="conditionDocs-showconditionDocsDetails">
                显示详情：
                <input
                    id="conditionDocs-showconditionDocsDetails"
                    type="checkbox"
                    bind:checked={showConditionDocsDetails}
                />
            </label>
        </div>
        <hr />
        <div
            class="form-group conditionDocs-condition"
            style="display: flex; flex-direction: column;"
        >
            <label for="conditionDocs-condition">
                筛选条件：
                <select
                    id="conditionDocs-condition"
                    bind:value={conditionDocsCondition}
                    placeholder="选择筛选条件"
                >
                    <option value="keyword">关键词</option>
                    <option value="tag">标签</option>
                    <!-- <option value="parentId">时间段</option> -->
                </select>
            </label>

            {#if conditionDocsCondition === "keyword"}
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label for="conditionDocs-key-position">
                        关键词位置：
                        <select
                            id="conditionDocs-key-position"
                            bind:value={conditionDocsKeyPosition}
                        >
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
                    </label>
                    <label for="conditionDocs-key">
                        关键词：
                        <input
                            id="conditionDocs-key"
                            type="text"
                            bind:value={conditionDocsKeyWord}
                            placeholder="输入关键词"
                            style="width: 50%;"
                        />
                    </label>
                </div>
            {:else if conditionDocsCondition === "tag"}
                <label for="conditionDocs-tag">
                    标签：
                    <input
                        id="conditionDocs-tag"
                        type="text"
                        bind:value={conditionDocsTag}
                        placeholder="输入标签"
                        style="width: 50%;"
                    />
                </label>
                <!-- {:else if conditionDocsCondition === "parentId"}
                    <label for="conditionDocs-parentId"> 时间段： </label> -->
            {/if}
        </div>
        <hr />
        <div class="form-group">
            <label for="show-conditionDocs-float-doc">
                <input
                    id="show-conditionDocs-float-doc"
                    type="checkbox"
                    bind:checked={showConditionDocsFloatDoc}
                />
                显示预览弹窗
            </label>
            <label for="conditionDocs-float-doc-show-time">
                悬停时间：
                <input
                    type="number"
                    title="悬停多长时间显示预览弹窗"
                    bind:value={conditionDocsFloatDocShowTime}
                />
                秒
            </label>
        </div>
    </div>
</div>

<style lang="scss">
    .conditionDocs {
        .conditionDocs-prefix {
            display: flex;
            flex-direction: row;
            justify-content: flex-start;
            align-items: center;
            gap: 10px;

            input {
                max-width: 50px;
            }
        }
    }
</style>
