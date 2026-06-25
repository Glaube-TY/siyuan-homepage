<script lang="ts">
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        title: string;
        canDrag: boolean;
        onEditContent: () => void;
        onEditStyle: () => void;
        onRefresh: () => void | Promise<void>;
        onDelete: () => void | Promise<void>;
        onClose: () => void;
    }

    let {
        title,
        canDrag,
        onEditContent,
        onEditStyle,
        onRefresh,
        onDelete,
        onClose,
    }: Props = $props();
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="关闭操作菜单" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-widget-action-sheet" role="dialog" aria-modal="true" aria-label="组件操作">
    <header class="mobile-widget-sheet-header">
        <div>
            <div class="mobile-widget-sheet-eyebrow">组件操作</div>
            <h3>{title}</h3>
        </div>
        <button class="mobile-widget-sheet-close" type="button" aria-label="关闭" onclick={onClose}>
            <SiyuanIcon name="cancel" size={16} />
        </button>
    </header>

    <div class="mobile-widget-action-list">
        <button type="button" onclick={onEditContent}>
            <SiyuanIcon name="settings" size={18} />
            <span>编辑内容</span>
        </button>
        <button type="button" onclick={onEditStyle}>
            <SiyuanIcon name="style" size={18} />
            <span>调整样式</span>
        </button>
        <button type="button" onclick={onRefresh}>
            <SiyuanIcon name="refresh" size={18} />
            <span>刷新组件</span>
        </button>
        <button type="button" class="danger" onclick={onDelete}>
            <SiyuanIcon name="delete" size={18} />
            <span>删除组件</span>
        </button>
    </div>

    {#if canDrag}
        <p class="mobile-widget-action-tip">拖住组件右上角手柄可以调整排序。</p>
    {:else}
        <p class="mobile-widget-action-tip">分类视图仅用于浏览和编辑，排序请切回“全部”。</p>
    {/if}
</div>
