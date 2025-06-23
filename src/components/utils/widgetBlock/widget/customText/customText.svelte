<script lang="ts">
    import { onMount } from "svelte";
    import DOMPurify from "dompurify";

    export let contentTypeJson: string = "{}";

    let customTextContent: string = "";
    let htmlContent: string = "";

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

    function updateHtmlContent() {
        if (customTextContent) {
            const lute = window.Lute.New();
            const rawHtml = lute.Md2HTML(customTextContent);
            console.log("Raw HTML:", rawHtml);
            htmlContent = DOMPurify.sanitize(rawHtml);
        } else {
            htmlContent = "";
        }
    }
</script>

<div class="content-display">
    <div class="custom-text">{@html htmlContent}</div>
</div>

<style lang="scss">
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

        :global(*) {
            box-sizing: border-box;
        }

        // 段落
        :global(p) {
            margin-bottom: 1rem;
        }

        // 标题
        :global(h1),
        :global(h2),
        :global(h3),
        :global(h4),
        :global(h5),
        :global(h6) {
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            font-weight: bold;
        }

        // 无序列表
        :global(ul) {
            list-style-type: disc;
            padding-left: 1.5rem;
            margin-bottom: 1rem;
        }

        // 有序列表
        :global(ol) {
            list-style-type: decimal;
            padding-left: 1.5rem;
            margin-bottom: 1rem;
        }

        // 列表项
        :global(li) {
            margin-bottom: 0.5rem;
        }

        // 强调
        :global(strong),
        :global(b) {
            font-weight: bold;
        }

        :global(em),
        :global(i) {
            font-style: italic;
        }

        // 行内代码
        :global(code) {
            background-color: #f1f1f1;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: monospace;
            white-space: pre-wrap;
        }

        // 代码块
        :global(pre) {
            background-color: #f8f8f8;
            padding: 1rem;
            overflow-x: auto;
            border-radius: 6px;
            margin-bottom: 1rem;
            font-family: monospace;
            white-space: pre-wrap;
            word-break: break-word;
        }

        // 引用块
        :global(blockquote) {
            border-left: 4px solid var(--b3-theme-primary);
            padding-left: 1rem;
            color: rgb(62, 59, 59);
            margin-bottom: 1rem;
            font-style: italic;
        }

        // 表格
        :global(table) {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1rem;
        }

        :global(th),
        :global(td) {
            border: 1px solid #ddd;
            padding: 0.5rem;
        }

        :global(th) {
            background-color: #f5f5f5;
        }

        // 链接
        :global(a) {
            color: var(--b3-theme-primary);
            text-decoration: underline;
        }

        // 图片
        :global(img) {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto 1rem;
        }

        // 水平线
        :global(hr) {
            border: none;
            border-top: 1px solid #eee;
            margin: 1.5rem 0;
        }

        // 加粗字体颜色
        :global(mark) {
            background-color: yellow;
            color: black;
        }
    }
</style>
