<script lang="ts">
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        onAddWidget: () => void | Promise<void>;
        onEdit: () => void | Promise<void>;
        onManageSections: () => void | Promise<void>;
        onClose: () => void;
    }

    let { onAddWidget, onEdit, onManageSections, onClose }: Props = $props();
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="关闭主页菜单" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-homepage-menu-sheet" role="dialog" aria-modal="true" aria-label="主页操作">
    <div class="mobile-homepage-menu-list">
        <button type="button" onclick={onAddWidget}>
            <span class="mobile-homepage-menu-icon"><SiyuanIcon name="create" size={18} /></span>
            <span><strong>添加组件</strong><small>选择并配置一个主页组件</small></span>
        </button>
        <button type="button" onclick={onEdit}>
            <span class="mobile-homepage-menu-icon"><SiyuanIcon name="edit" size={18} /></span>
            <span><strong>调整主页</strong><small>移动、设置或删除组件</small></span>
        </button>
        <button type="button" onclick={onManageSections}>
            <span class="mobile-homepage-menu-icon"><SiyuanIcon name="settings" size={18} /></span>
            <span><strong>管理分区</strong><small>新建、命名和调整顺序</small></span>
        </button>
    </div>
</div>
