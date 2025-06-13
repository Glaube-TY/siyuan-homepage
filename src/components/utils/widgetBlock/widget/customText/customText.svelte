<script lang="ts">
    import { onMount } from "svelte";
    import DOMPurify from "dompurify";
    import { marked } from "marked";

    export let contentTypeJson: string = "{}";

    let customTextContent: string = "";
    let htmlContent: string = "";

    // 解析传入的 JSON 数据
    onMount(() => {
        try {
            const data = JSON.parse(contentTypeJson);
            if (
                data.type === "custom-text" &&
                Array.isArray(data.data) &&
                typeof data.data[0]?.customText === "string"
            ) {
                customTextContent = data.data[0].customText;
                updateHtmlContent();
            }
        } catch (e) {
            console.error("无法解析 contentTypeJson", e);
        }
    });

    // 当用户修改内容时调用
    async function updateHtmlContent() {
        if (customTextContent) {
            const rawHtml = await marked(customTextContent);
            htmlContent = DOMPurify.sanitize(rawHtml);
        } else {
            htmlContent = "";
        }
    }
</script>

<div class="content-display">
    <div class="custom-text">{@html htmlContent}</div>
</div>

<style>
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 10px;
        box-sizing: border-box;
    }

    .custom-text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--b3-theme-text);
        overflow-y: auto;
    }

    /* 可选：添加一些 Markdown 默认样式 */
    .custom-text h1,
    .custom-text h2,
    .custom-text h3 {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
    }

    .custom-text p {
        margin-bottom: 1rem;
    }

    .custom-text ul,
    .custom-text ol {
        margin-bottom: 1rem;
        padding-left: 1.5rem;
    }

    .custom-text code {
        background-color: #f1f1f1;
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: monospace;
    }

    .custom-text pre {
        background-color: #f8f8f8;
        padding: 1rem;
        overflow-x: auto;
        border-radius: 6px;
        margin-bottom: 1rem;
    }
</style>
