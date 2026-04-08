<script lang="ts">
    interface Props {
        isRandomDoc?: boolean;
        customBlockID?: string;
    }

    let { isRandomDoc = $bindable(false), customBlockID = $bindable("") }: Props = $props();
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
</div>
