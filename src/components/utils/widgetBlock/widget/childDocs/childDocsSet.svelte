<script lang="ts">
    export let advancedEnabled: boolean = false;
    export let childDocsTitle: string = "📄子文档";
    export let childDocsPrefix: string = "📄";
    export let showChildDocsDetails: boolean = true;
    export let childDocsParentId: string = "";
    export let childDocsSortOrder: string = "updated";
    export let showChildDocsFloatDoc: boolean = true;
    export let childDocsFloatDocShowTime: number = 0.1;
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div class="content-panel childDocs">
            <div class="form-group childDocs-title">
                <label for="childDocs-title">
                    组件标题：
                    <input
                        id="childDocs-title"
                        type="text"
                        bind:value={childDocsTitle}
                        placeholder="输入组件标题"
                    />
                </label>
            </div>
            <div class="form-group childDocs-prefix">
                <label for="childDocs-prefix">
                    文档前缀：
                    <input
                        id="childDocs-prefix"
                        type="text"
                        bind:value={childDocsPrefix}
                        placeholder="输入文档前缀"
                    />
                </label>
                <label for="childDocs-sortOrder">
                    排序方式：
                    <select
                        id="childDocs-sortOrder"
                        bind:value={childDocsSortOrder}
                    >
                        <option value="updated">更新时间</option>
                        <option value="created">创建时间</option>
                    </select>
                </label>
                <label for="childDocs-showChildDocsDetails">
                    显示详情：
                    <input
                        id="childDocs-showChildDocsDetails"
                        type="checkbox"
                        bind:checked={showChildDocsDetails}
                    />
                </label>
            </div>
            <div class="form-group childDocs-parentId">
                <label for="childDocs-parentId">
                    父文档ID：
                    <input
                        id="childDocs-parentId"
                        type="text"
                        bind:value={childDocsParentId}
                        placeholder="输入父文档ID"
                    />
                </label>
            </div>
            <div class="form-group">
                <label for="show-childDocs-float-doc">
                    <input
                        id="show-childDocs-float-doc"
                        type="checkbox"
                        bind:checked={showChildDocsFloatDoc}
                    />
                    显示预览弹窗
                </label>
                <label for="childDocs-float-doc-show-time">
                    悬停时间：
                    <input
                        type="number"
                        title="悬停多长时间显示预览弹窗"
                        bind:value={childDocsFloatDocShowTime}
                    />
                    秒
                </label>
            </div>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/DAaIweKDBipUhbkGXOvcL6Q5nqh?from=from_copylink"
            target="_blank">子文档</a
        >
    </div>
</div>

<style lang="scss">
    .childDocs {
        .childDocs-prefix {
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
