<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { getRuntimeKind } from "@/components/tools/runtimeEnv";

    interface Props {
        contentTypeJson?: string;
    }

    let { contentTypeJson = "{}" }: Props = $props();

    // 运行环境
    let runtimeKind: "electron" | "mobile" | "browser" = $state("browser");

    // URL 相关
    let rawUrl: string = $state("");
    let normalizedUrl: string = $state("about:blank");

    // iframe 状态
    let iframeStatus: "idle" | "loading" | "loaded" | "timeout" | "error" = $state("idle");
    let iframeTimeoutId: ReturnType<typeof setTimeout> | null = $state(null);

    // 移动端允许 iframe
    let allowMobileIframe: boolean = $state(false);

    // URL 规范化
    function normalizeWebviewUrl(input: string): string {
        if (!input || input.trim() === "") return "about:blank";

        const trimmed = input.trim();

        // 已经是完整协议或 about:blank
        if (/^(https?:\/\/|about:blank)/i.test(trimmed)) {
            return trimmed;
        }

        // 协议相对地址
        if (trimmed.startsWith("//")) {
            return `${location.protocol}${trimmed}`;
        }

        // 本地/局域网地址：localhost、127.x.x.x、192.168.x.x、10.x.x.x、172.16-31.x.x
        // 这些地址默认补 http://
        const localIpPattern = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.local)(:\d{1,5})?([/?#].*)?$/;
        if (localIpPattern.test(trimmed)) {
            return `http://${trimmed}`;
        }

        // 普通公网域名（必须包含至少一个点，且不是纯单词）
        // 支持可选端口、路径、query、hash
        const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(:\d{1,5})?([/?#].*)?$/;
        if (domainPattern.test(trimmed)) {
            return `https://${trimmed}`;
        }

        // 无效
        return "about:blank";
    }

    // 有效 URL 判断
    function isValidNormalizedWebUrl(url: string): boolean {
        return !!url && url !== "about:blank";
    }
    let isValidWebUrl = $derived(isValidNormalizedWebUrl(normalizedUrl));

    onMount(() => {
        runtimeKind = getRuntimeKind();

        try {
            const config = JSON.parse(contentTypeJson);
            if (config.type === "custom-web" && config.data?.[0]?.url) {
                rawUrl = config.data[0].url;
            }
        } catch (e) {
            console.error("无法解析 contentTypeJson", e);
        }

        const nextUrl = normalizeWebviewUrl(rawUrl);
        normalizedUrl = nextUrl;

        // Web/Docker 模式下，有效 URL 时启动 loading 状态
        if (runtimeKind === "browser" && isValidNormalizedWebUrl(nextUrl)) {
            startIframeLoading();
        }
    });

    onDestroy(() => {
        if (iframeTimeoutId) {
            clearTimeout(iframeTimeoutId);
        }
    });

    function onIframeLoad() {
        if (iframeTimeoutId) {
            clearTimeout(iframeTimeoutId);
            iframeTimeoutId = null;
        }
        iframeStatus = "loaded";
    }

    function onIframeError() {
        if (iframeTimeoutId) {
            clearTimeout(iframeTimeoutId);
            iframeTimeoutId = null;
        }
        iframeStatus = "error";
    }

    function startIframeLoading() {
        iframeStatus = "loading";
        if (iframeTimeoutId) {
            clearTimeout(iframeTimeoutId);
        }
        iframeTimeoutId = setTimeout(() => {
            if (iframeStatus !== "loaded") {
                iframeStatus = "timeout";
            }
        }, 5000);
    }

    function openInNewTab() {
        if (normalizedUrl && normalizedUrl !== "about:blank") {
            window.open(normalizedUrl, "_blank", "noopener,noreferrer");
        }
    }
</script>

<div class="web-container">
    {#if runtimeKind === "electron"}
        {#if isValidWebUrl}
            <webview class="web-view" src={normalizedUrl}></webview>
        {:else}
            <div class="web-placeholder">
                <p>请在设置中配置有效的网页地址</p>
            </div>
        {/if}
    {:else if runtimeKind === "mobile"}
        {#if !isValidWebUrl}
            <div class="web-placeholder">
                <p>请在设置中配置有效的网页地址</p>
            </div>
        {:else if !allowMobileIframe}
            <div class="web-compat-card">
                <div class="web-compat-title">移动端建议外部打开</div>
                <div class="web-compat-desc">移动端内嵌网页体验不稳定，部分站点可能无法加载或操作。</div>
                <div class="web-compat-actions">
                    <button class="web-open-link" onclick={openInNewTab}>新标签页打开</button>
                    <button class="web-try-iframe" onclick={() => { allowMobileIframe = true; startIframeLoading(); }}>尝试内嵌预览</button>
                </div>
            </div>
        {:else}
            <div class="web-iframe-fallback">
                {#if iframeStatus === "timeout" || iframeStatus === "error"}
                    <div class="web-status-tip">
                        如果下方没有内容，可能是该网站禁止被嵌入，请使用
                        <button class="web-inline-link" onclick={openInNewTab}>新标签页打开</button>
                    </div>
                {/if}
                <iframe
                    class="web-view"
                    src={normalizedUrl}
                    title="自定义网页内容"
                    onload={onIframeLoad}
                    onerror={onIframeError}
                ></iframe>
            </div>
        {/if}
    {:else}
        {#if !isValidWebUrl}
            <div class="web-placeholder">
                <p>请在设置中配置有效的网页地址</p>
            </div>
        {:else}
            <div class="web-compat-card">
                <div class="web-compat-title">网页端/Docker 兼容模式</div>
                <div class="web-compat-desc">使用 iframe 兼容模式，部分网站可能因安全策略拒绝嵌入。</div>
                <div class="web-compat-actions">
                    <button class="web-open-link" onclick={openInNewTab}>新标签页打开</button>
                </div>
            </div>
            <div class="web-iframe-fallback">
                {#if iframeStatus === "timeout" || iframeStatus === "error"}
                    <div class="web-status-tip">
                        如果下方没有内容，可能是该网站禁止被嵌入，请使用
                        <button class="web-inline-link" onclick={openInNewTab}>新标签页打开</button>
                    </div>
                {/if}
                <iframe
                    class="web-view"
                    src={normalizedUrl}
                    title="自定义网页内容"
                    onload={onIframeLoad}
                    onerror={onIframeError}
                ></iframe>
            </div>
        {/if}
    {/if}
</div>

<style>
    .web-container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        position: relative;
    }

    .web-view {
        flex: 1;
        width: 100%;
        height: 100%;
        border: none;
        margin: 0;
        padding: 0;
    }

    .web-placeholder {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.9rem;
    }

    .web-compat-card {
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin: 0.5rem;
    }

    .web-compat-title {
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin-bottom: 0.25rem;
    }

    .web-compat-desc {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
    }

    .web-compat-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .web-open-link {
        background: var(--b3-theme-primary);
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 0.4rem 0.75rem;
        cursor: pointer;
        font-size: 0.85rem;
    }

    .web-open-link:hover {
        opacity: 0.9;
    }

    .web-try-iframe {
        background: transparent;
        color: var(--b3-theme-on-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 0.4rem 0.75rem;
        cursor: pointer;
        font-size: 0.85rem;
    }

    .web-try-iframe:hover {
        background: var(--b3-theme-surface);
    }

    .web-iframe-fallback {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .web-status-tip {
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        margin: 0.5rem;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.85rem;
    }

    .web-inline-link {
        background: none;
        border: none;
        color: var(--b3-theme-primary);
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
        font-size: inherit;
    }
</style>
