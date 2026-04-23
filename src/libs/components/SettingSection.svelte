<!--
  SettingSection - 设置块容器
  表示一个设置块，可带标题，内部纵向排列多个 SettingRow
-->
<script lang="ts">
    interface Props {
        title?: string;
        children?: import('svelte').Snippet;
    }

    let {
        title = "",
        children
    }: Props = $props();
</script>

<div class="setting-section">
    {#if title}
        <div class="setting-section__title">{title}</div>
    {/if}
    <div class="setting-section__content">
        {@render children?.()}
    </div>
</div>

<style>
    .setting-section {
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
    }

    .setting-section__title {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        padding-bottom: 0.75rem;
        margin-bottom: 0.75rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .setting-section__content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
</style>
