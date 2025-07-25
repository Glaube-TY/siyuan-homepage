<script lang="ts">
    import { onMount } from "svelte";

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
                heat: item.heat,
                link: item.link,
            }));
        },
        baidu(data: any): HotItem[] {
            return data.data.map((item) => ({
                title: item.title,
                heat: `${parseInt(item.hot).toLocaleString()}热度`,
                link: item.mobilUrl || item.url,
            }));
        },
        weibo(data: any): HotItem[] {
            return data.data.map((item) => ({
                title: item.title,
                heat: `${item.hot.toLocaleString()}热度`,
                link: item.mobilUrl || item.url,
            }));
        },
    };

    async function fetchData(source: string) {
        let url = "";
        if (source === "bilibili") {
            url = "https://v.api.aa1.cn/api/bilibili-rs/";
        } else if (source === "baidu") {
            url = "https://zj.v.api.aa1.cn/api/baidu-rs/";
        } else if (source === "weibo") {
            url = "https://zj.v.api.aa1.cn/api/weibo-rs/";
        } else {
            throw new Error("未知平台");
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("网络响应失败");
            const data = await response.json();

            const parser = parsers[source];
            if (!parser) throw new Error(`未找到 ${source} 的解析器`);

            hotList = parser(data);
            widgetTitle = `${source === "bilibili" ? "哔哩哔哩" : source === "baidu" ? "百度" : source === "weibo" ? "微博" : "未知"}热榜🔥`;
        } catch (err) {
            console.error(err);
            error = `加载${widgetTitle}失败`;
        } finally {
            loading = false;
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
