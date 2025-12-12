<script lang="ts">
    import { onMount } from "svelte";
    import { UapiClient } from "uapi-sdk-typescript";

    export let contentTypeJson: string = "{}";

    // 热搜通用数据结构定义
    interface HotItem {
        title: string;
        heat: string;
        link: string;
    }

    let hotList: HotItem[] = [];
    let loading: boolean = true;
    let error: string | null = null;
    let widgetTitle: string = "热榜🔥";

    // 解析函数集合
    const parsers = {
        bilibili(data: any): HotItem[] {
            return data.data.map((item) => ({
                title: item.title,
                heat: item.hot,
                link: item.url,
            }));
        },
        baidu(data: any): HotItem[] {
            return data.data.map((item) => ({
                title: item.title,
                heat: item.hot,
                link: item.url,
            }));
        },
        weibo(data: any): HotItem[] {
            return data.data.map((item) => ({
                title: item.title,
                heat: `${item.hot.toLocaleString()}热度`,
                link: item.mobilUrl || item.url,
            }));
        },
        douyin(data: any): HotItem[] {
            return data.data.map((item) => ({
                title: item.word,
                heat: `${item.hot_value.toLocaleString()}热度`,
                link: `https://www.douyin.com/search/${encodeURIComponent(item.word)}`,
            }));
        },
        // 合并处理 uapisSource 相同格式的热榜数据
        zhihu(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        toutiao(data: any): HotItem[] {
            return parseUapisHotData(data, false); // 今日头条热度未知
        },
        kuaishou(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        acfun(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        tieba(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        "douban-movie"(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        "douban-group"(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        hellogithub(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        hupu(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        miyoushe(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        ngabbs(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        v2ex(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        "52pojie"(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        hostloc(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        coolapk(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        thepaper(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        "qq-news"(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        sina(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        "sina-news"(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        "netease-news"(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        huxiu(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        ifanr(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        sspai(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        ithome(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        "ithome-xijiayi"(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        juejin(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        jianshu(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        guokr(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        "36kr"(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        "51cto"(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        csdn(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        nodeseek(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        lol(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
        genshin(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        honkai(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        starrail(data: any): HotItem[] {
            return parseUapisHotData(data, false);
        },
        weread(data: any): HotItem[] {
            return parseUapisHotData(data);
        },
    };

    // 统一处理 uapisSource 返回的热榜数据
    function parseUapisHotData(data: any, hasHeat: boolean = true): HotItem[] {
        return data.map((item) => ({
            title: item.title,
            heat: hasHeat ? item.hot_value : "热度未知",
            link: item.url,
        }));
    }

    async function fetchData(source: string) {
        let url = "";
        let data: any = {};
        if (source === "bilibili") {
            url = "https://dailyhotapi.3yu3.top/bilibili";
        } else if (source === "baidu") {
            url = "https://v2.xxapi.cn/api/baiduhot";
        } else if (source === "weibo") {
            url = "https://v2.xxapi.cn/api/weibohot";
        } else if (source === "douyin") {
            url = "https://v2.xxapi.cn/api/douyinhot";
        } else {
            data = await uapisSource(source);
            const parser = parsers[source];
            if (!parser) throw new Error(`未找到 ${source} 的解析器`);
            hotList = parser(data);
            widgetTitle = `${
                source === "zhihu"
                    ? "知乎"
                    : source === "toutiao"
                      ? "今日头条"
                      : source === "kuaishou"
                        ? "快手"
                        : source === "acfun"
                          ? "ACFun"
                          : source === "tieba"
                            ? "百度贴吧"
                            : source === "douban-movie"
                              ? "豆瓣电影"
                              : source === "douban-group"
                                ? "豆瓣小组"
                                : source === "hellogithub"
                                  ? "HelloGitHub"
                                  : source === "hupu"
                                    ? "虎扑"
                                    : source === "miyoushe"
                                      ? "米游社"
                                      : source === "ngabbs"
                                        ? "NGA"
                                        : source === "v2ex"
                                          ? "V2EX"
                                          : source === "52pojie"
                                            ? "吾爱破解"
                                            : source === "hostloc"
                                              ? "全球主机交流"
                                              : source === "coolapk"
                                                ? "酷安"
                                                : source === "thepaper"
                                                  ? "澎湃新闻"
                                                  : source === "qq-news"
                                                    ? "腾讯新闻"
                                                    : source === "sina"
                                                      ? "新浪"
                                                      : source === "sina-news"
                                                        ? "新浪新闻"
                                                        : source ===
                                                            "netease-news"
                                                          ? "网易新闻"
                                                          : source === "huxiu"
                                                            ? "虎嗅网"
                                                            : source === "ifanr"
                                                              ? "爱范儿"
                                                              : source ===
                                                                  "sspai"
                                                                ? "少数派"
                                                                : source ===
                                                                    "ithome"
                                                                  ? "IT之家"
                                                                  : source ===
                                                                      "ithome-xijiayi"
                                                                    ? "IT之家·喜加一"
                                                                    : source ===
                                                                        "juejin"
                                                                      ? "掘金"
                                                                      : source ===
                                                                          "jianshu"
                                                                        ? "简书"
                                                                        : source ===
                                                                            "guokr"
                                                                          ? "果壳"
                                                                          : source ===
                                                                              "36kr"
                                                                            ? "36氪"
                                                                            : source ===
                                                                                "51cto"
                                                                              ? "51CTO"
                                                                              : source ===
                                                                                  "csdn"
                                                                                ? "CSDN"
                                                                                : source ===
                                                                                    "nodeseek"
                                                                                  ? "NodeSeek"
                                                                                  : source ===
                                                                                      "lol"
                                                                                    ? "英雄联盟"
                                                                                    : source ===
                                                                                        "genshin"
                                                                                      ? "原神"
                                                                                      : source ===
                                                                                          "honkai"
                                                                                        ? "崩坏3"
                                                                                        : source ===
                                                                                            "starrail"
                                                                                          ? "星穹铁道"
                                                                                          : source ===
                                                                                              "weread"
                                                                                            ? "微信读书"
                                                                                            : "未知"
            }热榜🔥`;
            loading = false;
            return;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("网络响应失败");
            data = await response.json();

            const parser = parsers[source];
            if (!parser) throw new Error(`未找到 ${source} 的解析器`);

            hotList = parser(data);
            widgetTitle = `${
                source === "bilibili"
                    ? "哔哩哔哩"
                    : source === "baidu"
                      ? "百度"
                      : source === "weibo"
                        ? "微博"
                        : source === "douyin"
                          ? "抖音"
                          : "未知"
            }热榜🔥`;
        } catch (err) {
            console.error(err);
            error = `加载${widgetTitle}失败`;
        } finally {
            loading = false;
        }
    }

    async function uapisSource(source: string) {
        try {
            const client = new UapiClient("https://uapis.cn");
            const payload = {
                type: source,
            };
            // @ts-ignore - 临时忽略类型检查
            const response = await client.misc.getMiscHotboard(payload);

            // 处理响应数据
            if (response && response.list) {
                return response.list;
            }
        } catch (error) {
            console.error("uapis API调用失败:", error);
            // 可以在这里添加备用处理逻辑
        }
    }

    onMount(() => {
        try {
            const config = JSON.parse(contentTypeJson);
            const source = config?.data?.source || "bilibili"; // 默认是 B站
            fetchData(source);
        } catch (e) {
            console.error("配置解析失败", e);
            error = "配置错误";
            loading = false;
        }
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{widgetTitle}</h3>
    <div class="HOT-content-container">
        {#if loading}
            <p>加载中...</p>
        {:else if error}
            <p style="color: red;">{error}</p>
        {:else}
            <ul class="hot-list">
                {#each hotList as item, index}
                    <li
                        class="hot-item {index < 3 ? 'top-' + (index + 1) : ''}"
                    >
                        <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {#if index === 0}
                                <span class="rank-icon">🏆</span>
                            {:else if index === 1}
                                <span class="rank-icon">🥈</span>
                            {:else if index === 2}
                                <span class="rank-icon">🥉</span>
                            {:else}
                                <span class="rank-icon">🔥</span>
                            {/if}

                            <span class="rank">{index + 1}</span>
                            <span class="title">{item.title}</span>
                            <span class="heat">{item.heat}</span>
                        </a>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</div>

<style>
    .widget-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--b3-border-color);
        text-align: center;
        display: inline-block;
        line-height: 1.2;
    }

    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .HOT-content-container {
        flex: 1;
        overflow-y: auto;
        padding-right: 0.5rem;
    }

    .hot-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .hot-item {
        background-color: var(--b3-theme-surface);
        border-radius: 8px;
        margin-bottom: 8px;
        padding: 0.75rem 1rem;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        transition: all 0.2s ease-in-out;
    }

    .hot-item a {
        text-decoration: none;
        display: flex;
        align-items: center;
        font-family: "Segoe UI", sans-serif;
        line-height: 1.5;
    }

    .rank-icon {
        margin-right: 8px;
        font-size: 14px;
    }

    .rank {
        min-width: 24px;
        text-align: center;
        font-weight: bold;
    }

    .title {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--b3-theme-primary);
    }

    .heat {
        background-color: var(--b3-theme-background);
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 500;
        font-size: 0.8rem;
        width: max-content;
        white-space: nowrap;
    }

    .hot-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
</style>
