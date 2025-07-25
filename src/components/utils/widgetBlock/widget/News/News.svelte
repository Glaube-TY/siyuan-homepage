<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const NewsType = parsedContent.data?.NewsType || "daily-news-bulletin";

    let newsList: any;

    let advancedEnabled = false;

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
        if (NewsType === "daily-news-zhihu") {
            await getZhihuDailyNews();
        }
    });

    async function getZhihuDailyNews() {
        try {
            const repo = await plugin.client.forwardProxy({
                url: "https://v.api.aa1.cn/api/zhihu-news/index.php?aa1=xiarou",
                method: "GET",
                headers: [
                    {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    },
                ],
                contentType: "application/json",
                payloadEncoding: "text",
                responseEncoding: "text",
                timeout: 7000,
                payload: undefined,
            });
            const responseBody =
                typeof repo.data.body === "string"
                    ? JSON.parse(repo.data.body)
                    : repo.data.body;
            newsList = responseBody.news;
        } catch (error) {
            console.error("获取知乎日报失败:", error);
        }
    }
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div class="News-content">
            {#if NewsType === "daily-news-bulletin"}
                <img src="https://zj.v.api.aa1.cn/api/60s/" alt="60s" />
            {:else if NewsType === "daily-news-bulletin-v2"}
                <img
                    src="https://zj.v.api.aa1.cn/api/60s-v2/?cc=奈斯猫"
                    alt="60s"
                />
            {:else if NewsType === "daily-news-bulletin-v3"}
                <img
                    src="https://v.api.aa1.cn/api/60s-v3/?cc=国内要闻"
                    alt="国内要闻"
                />
            {:else if NewsType === "daily-news-bulletin-weather"}
                <img src="https://www.apii.cn/api/60s-v5/" alt="新闻天气" />
            {:else if NewsType === "daily-news-zhihu"}
                <div class="zhihu-content">
                    {#if newsList}
                        <div class="news-grid">
                            {#each newsList as news}
                                <a
                                    href={news.url.replace(/\\/g, "")}
                                    target="_blank"
                                    class="news-card"
                                >
                                    <div class="image-container">
                                        <img
                                            src={news.image.replace(/\\/g, "")}
                                            alt={news.title}
                                            loading="lazy"
                                        />
                                    </div>
                                    <div class="title">{news.title}</div>
                                </a>
                            {/each}
                        </div>
                    {:else}
                        <div class="loading">加载中...</div>
                    {/if}
                </div>
            {/if}
        </div>
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

        .News-content {
            width: 100%;
            height: 100%;
            padding: 0.1rem;
            overflow-y: auto;

            img {
                width: 100%;
                height: auto;
                object-fit: contain;
                min-height: 100%;
                max-width: 100%;
            }

            .zhihu-content {
                padding: 12px;

                .news-grid {
                    display: grid;
                    grid-template-columns: repeat(
                        auto-fill,
                        minmax(200px, 1fr)
                    );
                    gap: 16px;
                }

                .news-card {
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    transition: transform 0.2s;
                    text-decoration: none;
                    color: var(--b3-theme-primary);
                    background-color: var(--b3-theme-surface);

                    &:hover {
                        transform: translateY(-4px);
                    }

                    .image-container {
                        aspect-ratio: 16/9;

                        img {
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                        }
                    }

                    .title {
                        padding: 12px;
                        font-size: 14px;
                        line-height: 1.4;
                        min-height: 60px;
                        display: -webkit-box;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                }

                .loading {
                    text-align: center;
                    padding: 40px;
                    color: var(--b3-theme-primary);
                }
            }
        }

        .content-not-advanced {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }
    }
</style>
