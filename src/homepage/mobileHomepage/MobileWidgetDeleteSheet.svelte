<script lang="ts">
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        title: string;
        onConfirm: () => void | Promise<void>;
        onClose: () => void;
    }

    let { title, onConfirm, onClose }: Props = $props();
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="取消删除" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-widget-delete-sheet" role="dialog" aria-modal="true" aria-label="删除组件">
    <header class="mobile-widget-sheet-header">
        <div>
            <div class="mobile-widget-sheet-eyebrow">确认删除</div>
            <h3>{title}</h3>
        </div>
        <button class="mobile-widget-sheet-close" type="button" aria-label="关闭" onclick={onClose}>
            <SiyuanIcon name="cancel" size={16} />
        </button>
    </header>

    <div class="mobile-delete-body">
        <p>从移动端主页移除此组件？</p>
        <div class="mobile-delete-actions">
            <button type="button" class="mobile-delete-cancel" onclick={onClose}>取消</button>
            <button type="button" class="mobile-delete-confirm" onclick={onConfirm}>
                <SiyuanIcon name="delete" size={16} />
                <span>删除</span>
            </button>
        </div>
    </div>
</div>
