<script lang="ts">
    export let sqlTitle: string;
    export let sqlInput: string;
    export let columnOrder: string;
    export let hiddenFields: string;
</script>

<div class="content-panel sql">
    <div class="form-group">
        <label for="sql-title">
            组件标题：
            <input id="sql-title" type="text" bind:value={sqlTitle} />
        </label>
    </div>
    <div class="form-group">
        <label for="sql-input">SQL 语句：</label>
        <textarea
            id="sql-input"
            bind:value={sqlInput}
            placeholder="请输入 SQL 语句"
        ></textarea>
    </div>
    <div class="form-group">
        <label for="column-order">
            列排序（逗号分隔）：
            <input
                id="column-order"
                type="text"
                placeholder="例如：id,alias"
                bind:value={columnOrder}
            />
        </label>
    </div>
    <div class="form-group">
        <label for="hidden-fields">
            隐藏字段（逗号分隔）：
            <input
                id="hidden-fields"
                type="text"
                placeholder="例如：alias,path"
                bind:value={hiddenFields}
            />
        </label>
    </div>

    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/QG5nw3GPkiKjk3kIG9lcYpzOn6g?from=from_copylink"
            target="_blank">SQL查询</a
        >
    </div>
</div>
