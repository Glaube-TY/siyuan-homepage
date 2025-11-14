<script lang="ts">
    export let hotSource: string;

    // 热搜平台选项
    const hotSources = [
        { value: "bilibili", label: "B站" },
        { value: "weibo", label: "微博" },
        { value: "baidu", label: "百度" },
        { value: "zhihu", label: "知乎" },
        { value: "toutiao", label: "头条" },
        { value: "douyin", label: "抖音" },
        { value: "GitHub", label: "GitHub" },
    ];
</script>

<div class="hot-set">
    <div class="form-group">
        <label for="hot-source">
            选择热搜平台：
            <select id="hot-source" bind:value={hotSource}>
                {#each hotSources as source}
                    <option value={source.value}>{source.label}</option>
                {/each}
            </select>
        </label>
    </div>
    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/W7u5wQCEOibCxhkyA7mc5mDWnWh?from=from_copylink"
            target="_blank">热搜</a
        >
    </div>
    <p>注：若某一热搜来源失效请联系我更新~</p>
</div>

<style lang="scss">
</style>
