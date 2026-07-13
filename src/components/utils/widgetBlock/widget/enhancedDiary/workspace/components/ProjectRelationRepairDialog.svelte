<script lang="ts">
    import type { EnhancedDiaryProjectIndexPayload } from "../../enhancedDiaryProjectTypes";
    import { resolveEnhancedDiaryProjectTarget } from "../../enhancedDiaryProjectIndex";
    import type { ProjectRelationRepairMode } from "../enhancedDiaryWorkspaceProjectRelation";
    import WorkspaceProjectPicker from "./WorkspaceProjectPicker.svelte";

    interface Props {
        index: EnhancedDiaryProjectIndexPayload;
        status: string;
        contentLabel: string;
        hiddenProjectTargetId?: string;
        visibleProjectTargetId?: string;
        projectTargetId?: string;
        onSelect: (mode: ProjectRelationRepairMode, replacementTargetId?: string) => void | Promise<void>;
        onClose: () => void;
    }

    let {
        index, status, contentLabel,
        hiddenProjectTargetId, visibleProjectTargetId, projectTargetId,
        onSelect, onClose,
    }: Props = $props();

    const hiddenTarget = $derived(resolveEnhancedDiaryProjectTarget(index, hiddenProjectTargetId));
    const visibleTarget = $derived(resolveEnhancedDiaryProjectTarget(index, visibleProjectTargetId));
    const effectiveTarget = $derived(resolveEnhancedDiaryProjectTarget(index, projectTargetId));
    const inferredTargetId = $derived.by(() => {
        if (status === "missing_hidden_relation") return visibleTarget?.id || "";
        if (status === "missing_visible_reference") return hiddenTarget?.id || "";
        if (status === "normal") return effectiveTarget?.id || "";
        if (status === "target_mismatch") return hiddenTarget?.id || "";
        return effectiveTarget?.id || hiddenTarget?.id || visibleTarget?.id || "";
    });
    let replacementTargetId = $state("");
    let initialized = $state(false);

    $effect(() => {
        if (initialized) return;
        replacementTargetId = inferredTargetId;
        initialized = true;
    });
</script>
<div class="repair-dialog">
    <p>请选择如何处理这条项目关系。插件只修改当前任务或记录，不会删除正文或项目文档。</p>
    <dl class="relation-context">
        <div><dt>当前内容</dt><dd>{contentLabel}</dd></div>
        <div><dt>正式关系</dt><dd>{hiddenTarget?.pathTitles.join(" / ") || "未建立"}</dd></div>
        <div><dt>日记引用</dt><dd>{visibleTarget?.pathTitles.join(" / ") || "引用已丢失"}</dd></div>
    </dl>
    {#if status === "missing_visible_reference" || status === "target_mismatch"}
        <button type="button" class="wk-btn wk-btn-secondary" onclick={() => onSelect("restore_hidden")}>恢复正式关系</button>
    {/if}
    {#if status === "missing_hidden_relation" || status === "target_mismatch"}
        <button type="button" class="wk-btn wk-btn-secondary" onclick={() => onSelect("adopt_visible")}>采用日记引用</button>
    {/if}
    <div class="relink"><strong>重新关联</strong><WorkspaceProjectPicker {index} value={replacementTargetId} onChange={(id) => (replacementTargetId = id)} /><button type="button" class="wk-btn wk-btn-primary" disabled={!replacementTargetId} onclick={() => onSelect("relink", replacementTargetId)}>关联到所选项目</button></div>
    <div class="dialog-actions">
        <button type="button" class="wk-btn wk-btn-ghost danger" onclick={() => onSelect("cancel")}>取消项目关联（保留正文）</button>
        <button type="button" class="wk-btn wk-btn-secondary" onclick={onClose}>关闭</button>
    </div>
</div>
<style>
    .repair-dialog { display: grid; gap: 10px; min-width: 0; padding: 16px; color: var(--wk-ink-secondary); }
    .repair-dialog p { margin: 0 0 4px; color: var(--wk-ink-muted); }
    .repair-dialog button:disabled { opacity: .5; }
    .repair-dialog .danger { color: var(--wk-error); }
    .relink { display: grid; gap: 8px; border-top: 1px solid var(--wk-divider); padding-top: 10px; }
    .relation-context { display: grid; gap: 7px; min-width: 0; margin: 0; padding: 11px; border: 1px solid var(--wk-border); border-radius: 9px; background: var(--wk-background); }
    .relation-context div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; min-width: 0; }
    .relation-context dt { color: var(--wk-ink-muted); }
    .relation-context dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .dialog-actions { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
</style>
