<script lang="ts">
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { MOBILE_ALL_SECTION_ID, type MobileHomepageSection } from "./mobileSectionLayout";

    interface Props {
        sections: MobileHomepageSection[];
        activeSectionId: string;
        onSelect: (sectionId: string) => void;
        onManage: () => void | Promise<void>;
        onClose: () => void;
    }

    let { sections, activeSectionId, onSelect, onManage, onClose }: Props = $props();
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="关闭分区切换" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-section-switcher-sheet" role="dialog" aria-modal="true" aria-label="切换主页分区">
    <header class="mobile-widget-sheet-header">
        <div>
            <div class="mobile-widget-sheet-eyebrow">移动主页</div>
            <h3>切换分区</h3>
        </div>
        <button class="mobile-widget-sheet-close" type="button" aria-label="关闭" onclick={onClose}>
            <SiyuanIcon name="cancel" size={16} />
        </button>
    </header>
    <div class="mobile-widget-sheet-body mobile-section-switcher-body">
        <div class="mobile-section-switcher-list" role="list">
            {#each sections as section (section.id)}
                <button
                    type="button"
                    class:active={activeSectionId === section.id}
                    aria-current={activeSectionId === section.id ? "page" : undefined}
                    onclick={() => onSelect(section.id)}
                >
                    <span><strong>{section.name}</strong><small>{section.widgetIds.length} 个组件</small></span>
                    {#if activeSectionId === section.id}<SiyuanIcon name="confirm" size={16} />{/if}
                </button>
            {/each}
            <button
                type="button"
                class="mobile-section-all-row"
                class:active={activeSectionId === MOBILE_ALL_SECTION_ID}
                aria-current={activeSectionId === MOBILE_ALL_SECTION_ID ? "page" : undefined}
                onclick={() => onSelect(MOBILE_ALL_SECTION_ID)}
            >
                <span><strong>全部组件</strong><small>仅用于总览和调整顺序</small></span>
                {#if activeSectionId === MOBILE_ALL_SECTION_ID}<SiyuanIcon name="confirm" size={16} />{/if}
            </button>
        </div>
        <button class="mobile-section-manage-link" type="button" onclick={onManage}>
            <SiyuanIcon name="settings" size={17} />
            <span>管理分区</span>
        </button>
    </div>
</div>
