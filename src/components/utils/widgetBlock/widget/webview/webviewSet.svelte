<script lang="ts">
    export let customWebUrl: string = "";
</script>

<div class="content-panel custom-web">
    <div class="form-group">
        <label for="custom-web-url">网页地址：</label>
        <input
            id="custom-web-url"
            type="text"
            bind:value={customWebUrl}
            placeholder="输入要显示的网页地址：https://example.com"
        />
    </div>

    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/Tk3mwYwMTiQrpSkkzQpcPsdGnUd?from=from_copylink"
            target="_blank">网页浏览器</a
        >
    </div>
</div>