<script lang="ts">
    export let isRandomDoc: boolean = false;
    export let customBlockID: string = "";
</script>

<div class="content-panel custom-protyle">
    <div class="form-group">
        <label for="">
            <input type="checkbox" bind:checked={isRandomDoc} />
            随机漫游文档
        </label>
    </div>
    {#if !isRandomDoc}
        <div class="form-group">
            <label for="protyle-block-id">输入想要显示的文档块 ID：</label>
            <input
                id="protyle-block-id"
                type="text"
                bind:value={customBlockID}
                placeholder="例如：20250310094404-1yla4zz"
            />
        </div>
    {/if}

    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/XQV7wtEtsihu2IkbYpWcOWSunKf?from=from_copylink"
            target="_blank">文档编辑器</a
        >
    </div>
</div>
