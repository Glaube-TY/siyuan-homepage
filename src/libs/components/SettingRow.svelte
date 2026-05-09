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
        flex-wrap: wrap;
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
        flex: 1 1 220px;
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
        flex: 0 1 min(420px, 52%);
        min-width: 0;
        max-width: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
    }

    /* 控件宽度类 */
    .setting-row__control :global(.control-xs) {
        width: 60px;
        min-width: 60px;
        flex-shrink: 0;
    }

    .setting-row__control :global(.control-sm) {
        width: 100px;
        min-width: 100px;
        flex-shrink: 0;
    }

    .setting-row__control :global(.control-md) {
        width: 160px;
        min-width: 160px;
        flex-shrink: 0;
    }

    .setting-row__control :global(.control-lg) {
        width: 240px;
        min-width: 240px;
        flex-shrink: 0;
    }

    .setting-row__control :global(.control-full) {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
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

    /* 原生 select 统一样式 */
    .setting-row__control :global(select) {
        appearance: none;
        -webkit-appearance: none;
        box-sizing: border-box;
        height: 32px;
        padding: 0 2rem 0 0.75rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background-color: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        line-height: 30px;
        cursor: pointer;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237a86a8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
        background-repeat: no-repeat;
        background-position: right 0.65rem center;
        background-size: 14px;
    }

    .setting-row__control :global(select:hover) {
        border-color: var(--b3-theme-primary);
        background-color: var(--b3-theme-background);
    }

    .setting-row__control :global(select:focus) {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .setting-row__control :global(select:disabled) {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .setting-row__control :global(select option) {
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
    }

    /* 窄屏适配：上下结构 */
    @media (max-width: 480px) {
        .setting-row {
            flex-direction: column;
            gap: 0.5rem;
        }

        .setting-row__control {
            width: 100%;
            flex: unset;
            justify-content: flex-start;
        }

        .setting-row__control :global(.control-full) {
            width: 100%;
        }
    }
</style>
