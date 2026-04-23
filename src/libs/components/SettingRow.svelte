<!--
  SettingRow - 设置行组件
  左边是文字说明（标题+可选描述），右边是操作控件
  桌面端左右布局，窄屏可自动换成上下结构
-->
<script lang="ts">
    interface Props {
        title: string;
        description?: string;
        children?: import('svelte').Snippet;
    }

    let {
        title,
        description = "",
        children
    }: Props = $props();
</script>

<div class="setting-row">
    <div class="setting-row__info">
        <div class="setting-row__title">{title}</div>
        {#if description}
            <div class="setting-row__description">{@html description}</div>
        {/if}
    </div>
    <div class="setting-row__control">
        {@render children?.()}
    </div>
</div>

<style>
    .setting-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem 0;
        min-height: 48px;
    }

    .setting-row:not(:last-child) {
        border-bottom: 1px solid var(--b3-border-color);
    }

    .setting-row__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .setting-row__title {
        font-size: 14px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
        line-height: 1.5;
    }

    .setting-row__description {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
    }

    .setting-row__control {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
        min-width: 80px;
    }

    /* 控件宽度类 */
    .setting-row__control :global(.control-xs) {
        width: 60px;
        min-width: 60px;
    }

    .setting-row__control :global(.control-sm) {
        width: 100px;
        min-width: 100px;
    }

    .setting-row__control :global(.control-md) {
        width: 160px;
        min-width: 160px;
    }

    .setting-row__control :global(.control-lg) {
        width: 240px;
        min-width: 240px;
    }

    .setting-row__control :global(.control-full) {
        width: 100%;
        min-width: 200px;
    }

    .setting-row__control :global(.control-auto) {
        width: auto;
    }

    /* 思源原生 switch 样式支持 */
    .setting-row__control :global(.b3-switch) {
        margin: 0;
        flex-shrink: 0;
    }

    /* 颜色选择器样式 */
    .setting-row__control :global(input[type="color"]) {
        width: 48px;
        height: 32px;
        min-width: 48px;
        padding: 2px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        cursor: pointer;
        box-sizing: border-box;
    }

    .setting-row__control :global(input[type="color"]::-webkit-color-swatch-wrapper) {
        padding: 0;
    }

    .setting-row__control :global(input[type="color"]::-webkit-color-swatch) {
        border: none;
        border-radius: 4px;
    }

    /* emoji 选择按钮紧凑样式 */
    .setting-row__control :global(.emoji-btn) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 48px;
        width: 48px;
        height: 32px;
        padding: 0;
        font-size: 16px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .setting-row__control :global(.emoji-btn:hover) {
        background: var(--b3-theme-hover);
        border-color: var(--b3-theme-primary);
    }

    /* 文件/文件夹选择按钮样式 */
    .setting-row__control :global(.file-action-btn) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 48px;
        width: 48px;
        height: 32px;
        padding: 0;
        font-size: 16px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        cursor: pointer;
        transition: all 0.2s ease;
        flex-shrink: 0;
    }

    .setting-row__control :global(.file-action-btn:hover) {
        background: var(--b3-theme-hover);
        border-color: var(--b3-theme-primary);
    }

    /* 文件选择控件组 - 路径显示 + 按钮 */
    .setting-row__control :global(.file-path-group) {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
    }

    .setting-row__control :global(.file-path-group input) {
        flex: 1;
        min-width: 0;
    }

    /* 窄屏适配：上下结构 */
    @media (max-width: 480px) {
        .setting-row {
            flex-direction: column;
            gap: 0.5rem;
        }

        .setting-row__control {
            width: 100%;
        }

        .setting-row__control :global(.control-xs),
        .setting-row__control :global(.control-sm),
        .setting-row__control :global(.control-md),
        .setting-row__control :global(.control-lg) {
            width: 100%;
        }
    }
</style>
