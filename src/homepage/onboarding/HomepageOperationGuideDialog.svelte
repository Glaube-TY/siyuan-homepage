<script lang="ts">
    import { onMount } from "svelte";
    import { suppressHomepageOperationGuide } from "./homepageOperationGuide";

    let { onClose, readFailed = false }: { onClose: () => void; readFailed?: boolean } = $props();
    let errorMessage = $state("");
    let saving = $state(false);
    let closeButton: HTMLButtonElement;

    onMount(() => closeButton?.focus({ preventScroll: true }));

    function suppress() {
        if (saving) return;
        saving = true;
        try {
            suppressHomepageOperationGuide();
        } catch {
            errorMessage = "保存失败，请重试，或点击关闭。";
            saving = false;
            return;
        }
        onClose();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
    }
</script>

<div class="operation-guide">
    <p class="instruction">在主页空白处<strong>点击鼠标右键</strong></p>
    <div class="menu-items" role="group" aria-label="右键菜单中的功能">
        <span><svg aria-hidden="true"><use href="#iconAdd"></use></svg>添加组件</span>
        <span><svg aria-hidden="true"><use href="#iconSettings"></use></svg>主页设置</span>
    </div>
    <p class="description">在标题、横幅等区域右键，还可以直接打开对应设置。</p>
    {#if errorMessage || readFailed}<p class="error" role="alert">{errorMessage || "提示偏好读取失败，仍可关闭或重试保存。"}</p>{/if}
    <div class="actions">
        <button type="button" class="b3-button b3-button--cancel" disabled={saving} onclick={suppress} onkeydown={handleKeydown}>不再显示</button>
        <button type="button" class="b3-button" bind:this={closeButton} onclick={onClose} onkeydown={handleKeydown}>关闭</button>
    </div>
</div>

<style>
    .operation-guide {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        padding: 24px;
        color: var(--b3-theme-on-background, #222);
    }
    p { margin: 0; }
    .instruction { font-size: 20px; font-weight: 600; line-height: 1.6; }
    strong { color: var(--b3-theme-primary, #3578cc); }
    .menu-items { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 20px 0; }
    .menu-items span { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; }
    svg { width: 18px; height: 18px; fill: currentColor; color: var(--b3-theme-on-surface, #666); }
    .description { color: var(--b3-theme-on-surface, #666); font-size: 14px; line-height: 1.6; }
    .error { color: var(--b3-theme-error, #b3261e); font-size: 14px; line-height: 1.6; margin-top: 12px; }
    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
    .actions button { min-height: 36px; min-width: 88px; }
    .actions button:hover { filter: brightness(0.94); }
    .actions button:focus-visible { outline: 2px solid var(--b3-theme-primary, #3578cc); outline-offset: 2px; }
</style>
