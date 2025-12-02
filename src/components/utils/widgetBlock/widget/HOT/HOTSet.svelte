<script lang="ts">
    export let hotSource: string;

    // 热搜平台分类选项
    const hotSourceCategories = [
        {
            category: "视频/社区",
            sources: [
                { value: "bilibili", label: "哔哩哔哩" },
                { value: "acfun", label: "A站" },
                { value: "weibo", label: "新浪微博" },
                { value: "zhihu", label: "知乎" },
                { value: "douyin", label: "抖音" },
                { value: "kuaishou", label: "快手" },
                { value: "douban-movie", label: "豆瓣电影" },
                { value: "douban-group", label: "豆瓣小组" },
                { value: "tieba", label: "百度贴吧" },
                { value: "hupu", label: "虎扑" },
                { value: "miyoushe", label: "米游社" },
                { value: "ngabbs", label: "NGA" },
                { value: "v2ex", label: "V2EX" },
                { value: "52pojie", label: "吾爱破解" },
                { value: "hostloc", label: "全球主机交流" },
                { value: "coolapk", label: "酷安" },
            ],
        },
        {
            category: "新闻/资讯",
            sources: [
                { value: "baidu", label: "百度热搜" },
                { value: "thepaper", label: "澎湃新闻" },
                { value: "toutiao", label: "今日头条" },
                { value: "qq-news", label: "腾讯新闻" },
                { value: "sina", label: "新浪热搜" },
                { value: "sina-news", label: "新浪新闻" },
                { value: "netease-news", label: "网易新闻" },
                { value: "huxiu", label: "虎嗅网" },
                { value: "ifanr", label: "爱范儿" },
            ],
        },
        {
            category: "技术/IT",
            sources: [
                { value: "sspai", label: "少数派" },
                { value: "ithome", label: "IT之家" },
                { value: "ithome-xijiayi", label: "IT之家·喜加一" },
                { value: "juejin", label: "掘金" },
                { value: "jianshu", label: "简书" },
                { value: "guokr", label: "果壳" },
                { value: "36kr", label: "36氪" },
                { value: "51cto", label: "51CTO" },
                { value: "csdn", label: "CSDN" },
                { value: "nodeseek", label: "NodeSeek" },
                { value: "hellogithub", label: "HelloGitHub" },
            ],
        },
        {
            category: "游戏",
            sources: [
                { value: "lol", label: "英雄联盟" },
                { value: "genshin", label: "原神" },
                { value: "honkai", label: "崩坏3" },
                { value: "starrail", label: "星穹铁道" },
            ],
        },
        {
            category: "其他",
            sources: [{ value: "weread", label: "微信读书" }],
        },
    ];
</script>

<div class="hot-set">
    <div class="form-group">
        <label for="hot-source">
            热搜平台：
            <select id="hot-source" bind:value={hotSource}>
                {#each hotSourceCategories as category}
                    <optgroup label={category.category}>
                        {#each category.sources as source}
                            <option value={source.value}>{source.label}</option>
                        {/each}
                    </optgroup>
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
