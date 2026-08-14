<script lang="ts">
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import type { MobileHomepageSection, MobileSectionOperation } from "./mobileSectionLayout";

    interface Props {
        sections: MobileHomepageSection[];
        onOperation: (operation: MobileSectionOperation) => void | Promise<void>;
        onCreate: () => void | Promise<void>;
        onClose: () => void;
    }

    let { sections, onOperation, onCreate, onClose }: Props = $props();
    let busySectionId = $state("");
    let pendingDeleteId = $state("");

    async function run(sectionId: string, operation: MobileSectionOperation): Promise<void> {
        busySectionId = sectionId;
        try {
            await onOperation(operation);
        } finally {
            if (busySectionId === sectionId) busySectionId = "";
        }
    }

    function rename(section: MobileHomepageSection, event: Event): void {
        const input = event.currentTarget as HTMLInputElement;
        const name = input.value.trim();
        if (!name) {
            input.value = section.name;
            return;
        }
        if (name === section.name) return;
        void run(section.id, { type: "rename", sectionId: section.id, name });
    }
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="关闭分区管理" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-section-manager-sheet" role="dialog" aria-modal="true" aria-label="主页分区管理">
    <header class="mobile-widget-sheet-header">
        <div>
            <div class="mobile-widget-sheet-eyebrow">主页结构</div>
            <h3>管理分区</h3>
        </div>
        <button class="mobile-widget-sheet-close" type="button" aria-label="关闭" onclick={onClose}>
            <SiyuanIcon name="cancel" size={16} />
        </button>
    </header>

    <div class="mobile-widget-sheet-body mobile-section-manager-body">
        <p class="mobile-section-manager-help">分区名称、顺序和内容都由你决定。组件分类只用于添加组件时筛选。</p>
        <div class="mobile-section-list">
            {#each sections as section, index (section.id)}
                <article class="mobile-section-row">
                    <label>
                        <span class="sr-only">分区名称</span>
                        <input
                            type="text"
                            value={section.name}
                            maxlength="30"
                            disabled={busySectionId === section.id}
                            onblur={(event) => rename(section, event)}
                            onkeydown={(event) => {
                                if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                            }}
                        />
                        <small>{section.widgetIds.length} 个组件</small>
                    </label>
                    <div class="mobile-section-row-actions">
                        <button
                            type="button"
                            class="mobile-section-move-up"
                            aria-label={`上移 ${section.name}`}
                            disabled={index === 0 || busySectionId === section.id}
                            onclick={() => void run(section.id, { type: "move", sectionId: section.id, direction: -1 })}
                        ><SiyuanIcon name="previous" size={15} /></button>
                        <button
                            type="button"
                            class="mobile-section-move-down"
                            aria-label={`下移 ${section.name}`}
                            disabled={index === sections.length - 1 || busySectionId === section.id}
                            onclick={() => void run(section.id, { type: "move", sectionId: section.id, direction: 1 })}
                        ><SiyuanIcon name="next" size={15} /></button>
                        <button
                            type="button"
                            class="mobile-section-delete"
                            aria-label={`删除 ${section.name}`}
                            disabled={sections.length === 1 || busySectionId === section.id}
                            onclick={() => (pendingDeleteId = section.id)}
                        ><SiyuanIcon name="delete" size={15} /></button>
                    </div>
                    {#if pendingDeleteId === section.id}
                        <div class="mobile-section-delete-confirm" role="alert">
                            <span>删除后，组件会移动到相邻分区。</span>
                            <button type="button" onclick={() => (pendingDeleteId = "")}>取消</button>
                            <button type="button" class="danger" onclick={() => {
                                pendingDeleteId = "";
                                void run(section.id, { type: "delete", sectionId: section.id });
                            }}>删除</button>
                        </div>
                    {/if}
                </article>
            {/each}
        </div>
        <button class="mobile-section-add" type="button" onclick={onCreate}>
            <SiyuanIcon name="create" size={17} />
            <span>新建分区</span>
        </button>
    </div>
</div>
