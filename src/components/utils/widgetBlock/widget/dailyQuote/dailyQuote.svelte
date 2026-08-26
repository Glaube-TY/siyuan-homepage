<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import RefreshCw from "@lucide/svelte/icons/refresh-cw";
    import { getImage } from "@/components/tools/getImage";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
    } from "@/features/entitlement/homepage-entitlement";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import {
        generateDailyQuoteAi,
        type GenerateDailyQuoteAiResult,
    } from "./dailyQuoteAi";
    import {
        DEFAULT_DAILY_QUOTE_AI_PROMPT,
        normalizeDailyQuoteAiPrompt,
        normalizeDailyQuoteAiUseMemory,
    } from "./dailyQuoteAiConfig";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();
    const parsed = $derived(JSON.parse(contentTypeJson));

    const dailyQuoteMode = $derived(parsed.data?.dailyQuoteMode || "custom");
    const dailyQuoteSource = $derived(parsed.data?.dailyQuoteSource || "classic");
    const customDailyQuoteContent = $derived(parsed.data?.customDailyQuoteContent || "");
    const dailyQuoteAiPrompt = $derived(normalizeDailyQuoteAiPrompt(parsed.data?.dailyQuoteAiPrompt || DEFAULT_DAILY_QUOTE_AI_PROMPT));
    const dailyQuoteAiUseMemory = $derived(normalizeDailyQuoteAiUseMemory(parsed.data?.dailyQuoteAiUseMemory));
    const instanceId = $derived(typeof parsed.instanceId === "string" ? parsed.instanceId : "");
    const dailyQuoteFontSize = $derived(parsed.data?.dailyQuoteFontSize || 1);
    let dailyQuoteRemoteBg =
        $state("https://haowallpaper.com/link/common/file/previewFileImg/17169460970507648");
    const dailyQuoteLocalBg = $derived(parsed.data?.dailyQuoteLocalBg || "");
    const dailyQuoteBgSelect = $derived(parsed.data?.dailyQuoteBgSelect || "remote");

    let dailyQuote = $state("");
    let quoteLoading = $state(false);
    let quoteError = $state("");
    let quoteRequestVersion = 0;
    let quoteAbortController: AbortController | null = null;
    let unsubscribeEntitlement: (() => void) | null = null;
    let destroyed = false;

    let advancedEnabled = $state(false);

    function isCurrentQuoteRequest(version: number, signal: AbortSignal): boolean {
        return !destroyed && version === quoteRequestVersion && !signal.aborted;
    }

    function handleAiQuoteFailure(result: Extract<GenerateDailyQuoteAiResult, { ok: false }>): void {
        if (result.reason === "aborted") return;
        if (result.reason === "not_premium") {
            advancedEnabled = false;
            quoteError = "";
            return;
        }
        console.warn("[dailyQuote] AI 每日一句生成失败", result.message);
        quoteError = result.reason === "no_model"
            ? "请先在 AI 中心配置可用模型"
            : "AI 每日一句暂时不可用";
    }

    async function loadQuote(forceRefresh = false): Promise<void> {
        quoteAbortController?.abort();
        const controller = new AbortController();
        quoteAbortController = controller;
        const version = ++quoteRequestVersion;
        quoteLoading = true;
        quoteError = "";

        try {
            if (dailyQuoteMode === "ai") {
                if (!advancedEnabled) return;
                const result = await generateDailyQuoteAi({
                    plugin,
                    instanceId,
                    prompt: dailyQuoteAiPrompt,
                    useMemory: dailyQuoteAiUseMemory,
                    abortSignal: controller.signal,
                    forceRefresh,
                });
                if (!isCurrentQuoteRequest(version, controller.signal)) return;
                if (result.ok) {
                    dailyQuote = result.text;
                } else {
                    handleAiQuoteFailure(result);
                }
                return;
            }

            if (dailyQuoteMode === "remote") {
                if (!advancedEnabled) return;
                const fetchRemoteJson = async (url: string): Promise<any | null> => {
                    const response = await fetch(url, { signal: controller.signal });
                    if (!isCurrentQuoteRequest(version, controller.signal)) return null;
                    const data = await response.json();
                    if (!isCurrentQuoteRequest(version, controller.signal)) return null;
                    return data;
                };
                const fetchRemoteText = async (url: string): Promise<string> => {
                    const response = await fetch(url, { signal: controller.signal });
                    if (!isCurrentQuoteRequest(version, controller.signal)) return "";
                    const text = await response.text();
                    return isCurrentQuoteRequest(version, controller.signal) ? text : "";
                };
                let apiUrl: string;
                let responseData: any;
                if (dailyQuoteSource === "emotion") {
                    apiUrl = "https://v.api.aa1.cn/api/api-wenan-qg/index.php?aa1=json";
                    responseData = await fetchRemoteJson(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    dailyQuote = responseData?.[0]?.qinggan || "情感语录获取失败";
                } else if (dailyQuoteSource === "classic") {
                    apiUrl = "https://v.api.aa1.cn/api/yiyan/index.php";
                    const text = await fetchRemoteText(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    const match = text.match(/<p>(.*?)<\/p>/);
                    dailyQuote = match ? match[1] : "今日语录获取失败";
                } else if (dailyQuoteSource === "pyq") {
                    apiUrl = "https://v.api.aa1.cn/api/pyq/index.php?aa1=json";
                    responseData = await fetchRemoteJson(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    dailyQuote = responseData?.pyq || "朋友圈语录获取失败";
                } else if (dailyQuoteSource === "straybirdsZH") {
                    apiUrl = "https://api.mu-jie.cc/stray-birds/range?type=json";
                    responseData = await fetchRemoteJson(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    dailyQuote = responseData?.cn || "中文语录获取失败";
                } else if (dailyQuoteSource === "straybirdsEN") {
                    apiUrl = "https://api.mu-jie.cc/stray-birds/range?type=json";
                    responseData = await fetchRemoteJson(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    dailyQuote = responseData?.en || "English quote failed";
                } else if (dailyQuoteSource === "gaoxiao") {
                    apiUrl = "https://v.api.aa1.cn/api/api-wenan-gaoxiao/index.php?aa1=json";
                    responseData = await fetchRemoteJson(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    dailyQuote = responseData?.[0]?.gaoxiao || "搞笑语录获取失败";
                } else if (dailyQuoteSource === "lovegarden") {
                    apiUrl = "https://api.kuleu.com/api/aiqinggongyu";
                    responseData = await fetchRemoteJson(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    dailyQuote = responseData?.data || "爱情公寓语录获取失败";
                } else if (dailyQuoteSource === "celebrity") {
                    apiUrl = "https://v.api.aa1.cn/api/api-wenan-mingrenmingyan/index.php?aa1=json";
                    responseData = await fetchRemoteJson(apiUrl);
                    if (!isCurrentQuoteRequest(version, controller.signal)) return;
                    dailyQuote = responseData?.[0]?.mingrenmingyan || "名人名言获取失败";
                }
                return;
            }

            const quotes = customDailyQuoteContent
                .split("\n")
                .filter((line) => line.trim() !== "");
            dailyQuote = quotes.length > 0
                ? quotes[Math.floor(Math.random() * quotes.length)]
                : "请先自定义语录";
        } catch (error) {
            if (controller.signal.aborted || !isCurrentQuoteRequest(version, controller.signal)) return;
            console.error("获取每日一言失败:", error);
            if (dailyQuoteMode === "ai") {
                quoteError = "AI 每日一句暂时不可用";
            } else {
                dailyQuote = "今日语录加载失败，请稍后再试";
            }
        } finally {
            if (isCurrentQuoteRequest(version, controller.signal)) {
                quoteLoading = false;
                quoteAbortController = null;
            }
        }
    }

    async function loadBackground(): Promise<void> {
        if (dailyQuoteBgSelect !== "remote" || !dailyQuoteRemoteBg) return;
        try {
            const image = await getImage(dailyQuoteRemoteBg);
            if (!destroyed) dailyQuoteRemoteBg = image;
        } catch (error) {
            console.warn("[dailyQuote] 背景图片加载失败", error);
        }
    }

    onMount(() => {
        advancedEnabled = getHomepageEntitlementSnapshot().advanced;
        dailyQuoteRemoteBg = parsed.data?.dailyQuoteRemoteBg || dailyQuoteRemoteBg;
        unsubscribeEntitlement = subscribeHomepageEntitlement((snapshot) => {
            const wasAdvanced = advancedEnabled;
            advancedEnabled = snapshot.advanced;
            if (wasAdvanced && !snapshot.advanced) {
                quoteAbortController?.abort();
                quoteRequestVersion += 1;
                quoteLoading = false;
                quoteAbortController = null;
                return;
            }
            if (!wasAdvanced && snapshot.advanced && (dailyQuoteMode === "ai" || dailyQuoteMode === "remote")) {
                void loadQuote();
            }
        });
        void loadQuote();
        void loadBackground();
    });

    onDestroy(() => {
        destroyed = true;
        unsubscribeEntitlement?.();
        unsubscribeEntitlement = null;
        quoteRequestVersion += 1;
        quoteAbortController?.abort();
        quoteAbortController = null;
    });
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
    {#if advancedEnabled || dailyQuoteMode === "custom"}
        <div class="daily-quote-content-container">
            <div class="daily-quote-text" aria-live="polite">
                {#if quoteLoading && !dailyQuote && dailyQuoteMode === "ai"}
                    正在生成今日一句…
                {:else if dailyQuote}
                    {dailyQuote}
                {:else if quoteError}
                    {quoteError}
                {:else}
                    每日一言加载中...
                {/if}
            </div>
            {#if dailyQuoteMode === "ai" && advancedEnabled}
                <div class="daily-quote-ai-actions">
                    {#if quoteError && dailyQuote}
                        <span class="daily-quote-ai-error" role="status">{quoteError}</span>
                    {/if}
                    <button
                        type="button"
                        class:daily-quote-refresh--loading={quoteLoading}
                        title="重新生成每日一句"
                        aria-label="重新生成每日一句"
                        disabled={quoteLoading}
                        onclick={() => void loadQuote(true)}
                    >
                        <RefreshCw size={15} />
                    </button>
                </div>
            {/if}
        </div>
    {:else if dailyQuoteMode === "ai"}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="AI 每日一句"
                subtitle="使用 AI 中心每日生成个性化内容。"
                icon="quote"
                features={["每日自动生成", "全局记忆个性化", "手动重新生成"]}
                highlights={["AI 生成", "全局记忆", "每日缓存"]}
                compact
            />
        </div>
    {:else if dailyQuoteMode === "remote"}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="每日一句"
                subtitle="每日一句自动展示，让主页更有仪式感。"
                icon="quote"
                features={[
                    "每日一句自动展示",
                    "让主页更有仪式感",
                    "适合长期阅读和写作"
                ]}
                highlights={["每日更新", "仪式感", "阅读写作"]}
                compact
            />
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
            flex-direction: column;
            overflow-y: auto;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-weight: bold;
            border-radius: 8px;
            position: relative;
            line-height: 1.8;
            color: var(--b3-theme-on-surface);
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

        .daily-quote-text {
            flex: 1;
            width: 100%;
            min-height: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .daily-quote-ai-actions {
            flex: 0 0 auto;
            display: flex;
            justify-content: center;
            width: 100%;
            margin-top: 6px;
        }

        .daily-quote-ai-actions button {
            width: 26px;
            height: 26px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 0;
            border-radius: 6px;
            padding: 0;
            background: transparent;
            color: var(--b3-theme-primary);
            cursor: pointer;
        }

        .daily-quote-ai-error {
            align-self: center;
            margin-right: 5px;
            color: var(--b3-theme-error);
            font-size: 10px;
            line-height: 1.2;
        }

        .daily-quote-ai-actions button:hover,
        .daily-quote-ai-actions button:focus-visible {
            outline: none;
            background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        }

        .daily-quote-ai-actions button:disabled {
            cursor: wait;
            opacity: 0.65;
        }

        .daily-quote-refresh--loading :global(svg) {
            animation: daily-quote-spin 0.8s linear infinite;
        }

        @keyframes daily-quote-spin {
            to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
            .daily-quote-refresh--loading :global(svg) {
                animation: none;
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
