<script lang="ts">
    export let quickNotesTitle: string;
    export let quickNotesSort: string;
</script>

<div class="content-panel quick-notes">
    <div class="form-group quick-notes-title">
        <label for="quick-notes-title"
            >组件标题：
            <input
                id="quick-notes-title"
                type="text"
                bind:value={quickNotesTitle}
                placeholder="输入组件标题"
            />
        </label>
    </div>
    <label for="quick-notes-sort"
        >排序方式：
        <select id="quick-notes-sort" bind:value={quickNotesSort}>
            <option value="DOC_ASC">文档正序</option>
            <option value="DOC_INV">文档逆序</option>
            <option value="UPD">更新时间</option>
            <option value="CRE">创建时间</option>
        </select>
    </label>
    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/XhZ7ww1PDimrZxkbxPqcvZrKnIb?from=from_copylink"
            target="_blank">快速笔记</a
        >
    </div>
</div>
