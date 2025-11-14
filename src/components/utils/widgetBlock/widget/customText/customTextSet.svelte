<script lang="ts">
    import { onMount } from "svelte";

    export let customTextInputValue: string = "";

    onMount(async () => {
        // 组件挂载时的初始化逻辑
        if (!customTextInputValue) {
            customTextInputValue = "";
        }
    });
</script>

<div class="content-display">
    <div class="content-panel custom-text">
        <h4>自定义文字内容</h4>
        <textarea
            placeholder="在这里输入你想要显示的自定义文字内容，以 Markdown
            格式编写..."
            bind:value={customTextInputValue}
        ></textarea>

        <hr />
        <div>
            组件说明：<a
                href="https://ttl8ygt82u.feishu.cn/wiki/DkJnwuWzuipxpgkcTKZcEyaMnHf?from=from_copylink"
                target="_blank">自定义文字</a
            >
        </div>
    </div>
</div>

<style lang="scss">
    textarea {
        width: 100%;
        max-width: 100%;
        min-height: 150px;
        padding: 0.6rem 0.8rem;
        border: 1px solid var(--b3-theme-border-color);
        border-radius: 6px;
        background-color: var(--b3-theme-background);
        font-size: 0.95rem;
        transition: all 0.2s ease-in-out;
        resize: vertical;
        font-family: inherit;
        box-sizing: border-box;
        transition: all 0.2s ease-in-out;

        &:focus {
            outline: none;
            border-color: var(--b3-theme-border-color);
            box-shadow: 0 1px 3px var(--b3-theme-primary);
        }

        &:hover {
            border-color: var(--b3-theme-border-color);
            box-shadow: 0 1px 3px var(--b3-theme-primary);
        }
    }
</style>
