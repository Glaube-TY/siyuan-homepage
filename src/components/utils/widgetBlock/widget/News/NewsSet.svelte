<script lang="ts">
    export let advancedEnabled: boolean;
    export let NewsType: string = "daily-news-bulletin";
</script>

<!-- 完全保持现有的UI结构 -->
{#if advancedEnabled}
    <div class="content-panel News">
        <div class="form-group News-type">
            <label for="News-type">
                新闻类型：
                <select name="News-type" id="News-type" bind:value={NewsType}>
                    <option value="daily-news-bulletin">每日新闻快报</option>
                    <option value="daily-news-bulletin-v2"
                        >每日新闻快报v2</option
                    >
                    <option value="daily-news-bulletin-v3"
                        >每日新闻快报v3</option
                    >
                    <option value="daily-news-bulletin-weather"
                        >每日新闻快报+当地天气</option
                    >
                    <option value="daily-news-zhihu">知乎日报</option>
                </select>
            </label>
        </div>
    </div>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
<hr />
<div>
    组件说明：<a
        href="https://ttl8ygt82u.feishu.cn/wiki/FM0PwE2KVin6ytkQBuzca5pWnZf?from=from_copylink"
        target="_blank">新闻资讯</a
    >
</div>
<p>注：若某一接口失效请联系我更新~</p>
