<script lang="ts">
    import { onMount } from "svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";
    const parsed = JSON.parse(contentTypeJson);

    const dailyQuoteMode = parsed.data?.dailyQuoteMode || "custom";
    const dailyQuoteSource = parsed.data?.dailyQuoteSource || "classic";
    const customDailyQuoteContent = parsed.data?.customDailyQuoteContent || "";
    const dailyQuoteFontSize = parsed.data?.dailyQuoteFontSize || 1;
    const dailyQuoteRemoteBg =
        parsed.data?.dailyQuoteRemoteBg ||
        "https://haowallpaper.com/link/common/file/previewFileImg/17169460970507648";
    const dailyQuoteLocalBg = parsed.data?.dailyQuoteLocalBg || "";
    const dailyQuoteBgSelect = parsed.data?.dailyQuoteBgSelect || "remote";

    let dailyQuote = "";

    let advancedEnabled = false;

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
        await getDailyQuote();
    });

    async function getDailyQuote() {
        try {
            if (dailyQuoteMode === "remote") {
                let apiUrl, responseData;
                if (dailyQuoteSource === "emotion") {
                    apiUrl =
                        "https://v.api.aa1.cn/api/api-wenan-qg/index.php?aa1=json";
                    responseData = await (await fetch(apiUrl)).json();
                    dailyQuote = responseData[0]?.qinggan || "情感语录获取失败";
                } else if (dailyQuoteSource === "classic") {
                    apiUrl = "https://v.api.aa1.cn/api/yiyan/index.php";
                    const text = await (await fetch(apiUrl)).text();
                    const match = text.match(/<p>(.*?)<\/p>/);
                    dailyQuote = match ? match[1] : "今日语录获取失败";
                } else if (dailyQuoteSource === "pyq") {
                    apiUrl = "https://v.api.aa1.cn/api/pyq/index.php?aa1=json";
                    responseData = await (await fetch(apiUrl)).json();
                    dailyQuote = responseData?.pyq || "朋友圈语录获取失败";
                } else if (dailyQuoteSource === "straybirdsZH") {
                    apiUrl =
                        "https://api.mu-jie.cc/stray-birds/range?type=json";
                    responseData = await (await fetch(apiUrl)).json();
                    dailyQuote = responseData?.cn || "中文语录获取失败";
                } else if (dailyQuoteSource === "straybirdsEN") {
                    apiUrl =
                        "https://api.mu-jie.cc/stray-birds/range?type=json";
                    responseData = await (await fetch(apiUrl)).json();
                    dailyQuote = responseData?.en || "English quote failed";
                } else if (dailyQuoteSource === "gaoxiao") {
                    apiUrl =
                        "https://v.api.aa1.cn/api/api-wenan-gaoxiao/index.php?aa1=json";
                    responseData = await (await fetch(apiUrl)).json();
                    dailyQuote = responseData[0]?.gaoxiao || "搞笑语录获取失败";
                } else if (dailyQuoteSource === "lovegarden") {
                    apiUrl = "https://api.kuleu.com/api/aiqinggongyu";
                    responseData = await (await fetch(apiUrl)).json();
                    dailyQuote = responseData?.data || "爱情公寓语录获取失败";
                } else if (dailyQuoteSource === "celebrity") {
                    apiUrl =
                        "https://v.api.aa1.cn/api/api-wenan-mingrenmingyan/index.php?aa1=json";
                    responseData = await (await fetch(apiUrl)).json();
                    dailyQuote =
                        responseData[0]?.mingrenmingyan || "名人名言获取失败";
                }
            } else if (dailyQuoteMode === "custom") {
                const quotes = customDailyQuoteContent
                    .split("\n")
                    .filter((line) => line.trim() !== "");

                dailyQuote =
                    quotes.length > 0
                        ? quotes[Math.floor(Math.random() * quotes.length)]
                        : "请先自定义语录";
            }
        } catch (e) {
            console.error("获取每日一言失败:", e);
            dailyQuote = "今日语录加载失败，请稍后再试";
        }
    }
</script>

<div
    class="content-display"
    style="
        background-image: url({dailyQuoteBgSelect === 'remote'
        ? dailyQuoteRemoteBg
        : dailyQuoteLocalBg});
        font-size: {dailyQuoteFontSize}rem
    "
>
    <div class="overlay"></div>
    {#if advancedEnabled}
        <div class="daily-quote-content-container">
            {dailyQuote || "每日一言加载中..."}
        </div>
    {:else if dailyQuoteMode === "custom"}
        <div class="daily-quote-content-container">
            {dailyQuote || "每日一言加载中..."}
        </div>
    {:else if dailyQuoteMode === "remote"}
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
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;

        .overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 1;
            pointer-events: none;
        }

        .daily-quote-content-container {
            flex: 1;
            z-index: 2;
            padding: 1.5rem;
            min-height: 120px;
            display: flex;
            overflow-y: auto;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-weight: bold;
            border-radius: 8px;
            position: relative;
            line-height: 1.8;
            color: var(--b3-theme-text);
            border: 1px solid var(--b3-border-color);
            background-color: color-mix(
                in srgb,
                var(--b3-theme-surface) 50%,
                transparent
            );
            user-select: text;
            -webkit-user-select: text;
            pointer-events: auto;

            &::before,
            &::after {
                content: '"';
                font-family: Georgia, serif;
                font-size: 3em;
                color: var(--b3-theme-primary);
                opacity: 0.6;
                position: absolute;
            }

            &::before {
                top: 0.5rem;
                left: 1rem;
            }

            &::after {
                bottom: 0.5rem;
                right: 1rem;
                transform: rotate(180deg);
            }

            &:hover {
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                transition: all 0.3s ease;
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
            z-index: 2;
        }
    }
</style>
