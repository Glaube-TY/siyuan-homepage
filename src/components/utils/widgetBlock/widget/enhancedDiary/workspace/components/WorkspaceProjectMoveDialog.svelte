<script lang="ts">
    import {
        isEnhancedDiaryProjectEffectivelyActive,
        resolveEnhancedDiaryProjectTarget,
    } from "../../enhancedDiaryProjectIndex";
    import type { EnhancedDiaryProjectIndexPayload } from "../../enhancedDiaryProjectTypes";
    import WorkspaceProjectPicker from "./WorkspaceProjectPicker.svelte";

    interface Props {
        index: EnhancedDiaryProjectIndexPayload;
        sourceTargetId: string;
        onConfirm: (destinationParentTargetId: string) => boolean | Promise<boolean>;
        onClose: () => void;
    }

    let { index, sourceTargetId, onConfirm, onClose }: Props = $props();
    let destinationParentTargetId = $state("");
    let busy = $state(false);

    const sourceTarget = $derived(resolveEnhancedDiaryProjectTarget(index, sourceTargetId));
    const sourceNode = $derived(index.nodes[sourceTargetId]);
    const moveIndex = $derived.by((): EnhancedDiaryProjectIndexPayload => {
        if (!sourceNode) return { ...index, roots: {}, nodes: {} };
        const root = index.roots[sourceNode.rootProjectId];
        const nodes = Object.fromEntries(Object.entries(index.nodes).filter(([id, node]) =>
            node.rootProjectId === sourceNode.rootProjectId &&
            id !== sourceTargetId &&
            !node.ancestorTargetIds.includes(sourceTargetId)));
        return {
            ...index,
            roots: root ? { [root.id]: root } : {},
            nodes,
        };
    });
    const selectableTargetIds = $derived.by(() => {
        if (!sourceNode) return [];
        return [sourceNode.rootProjectId, ...Object.keys(moveIndex.nodes)].filter((id) =>
            id !== sourceNode.parentTargetId && isEnhancedDiaryProjectEffectivelyActive(moveIndex, id));
    });
    const destinationTarget = $derived(resolveEnhancedDiaryProjectTarget(moveIndex, destinationParentTargetId));
    const previewPath = $derived(destinationTarget && sourceTarget
        ? [...destinationTarget.pathTitles, sourceTarget.title]
        : []);

    async function confirm(): Promise<void> {
        if (busy || !destinationParentTargetId || !selectableTargetIds.includes(destinationParentTargetId)) return;
        busy = true;
        try {
            await onConfirm(destinationParentTargetId);
        } finally {
            busy = false;
        }
    }
</script>

<div class="project-move-content">
    <section class="path-card">
        <span>当前项目完整路径</span>
        <strong>{sourceTarget?.pathTitles.join(" / ") || "项目已失效"}</strong>
    </section>

    <label class="parent-picker">
        <span>新的上级项目</span>
        <WorkspaceProjectPicker
            index={moveIndex}
            value={destinationParentTargetId}
            allowClear={false}
            statusFilter="active"
            preserveSelected={false}
            {selectableTargetIds}
            onChange={(id) => (destinationParentTargetId = id)}
        />
    </label>

    <section class="path-card preview">
        <span>调整后的路径预览</span>
        <strong>{previewPath.length ? previewPath.join(" / ") : "请选择新的上级项目"}</strong>
    </section>

    <p class="move-warning">当前项目、全部子项目和项目范围内正文会一起移动；任务和记录关联保持不变。</p>
    {#if selectableTargetIds.length === 0}
        <p class="empty-tip">当前顶级项目中没有可用的新上级项目。</p>
    {/if}

    <footer>
        <button type="button" class="wk-btn wk-btn-secondary" onclick={onClose} disabled={busy}>取消</button>
        <button type="button" class="wk-btn wk-btn-primary" onclick={() => void confirm()} disabled={busy || !destinationParentTargetId || !selectableTargetIds.includes(destinationParentTargetId)}>
            {busy ? "正在调整…" : "确认调整"}
        </button>
    </footer>
</div>

<style>
    .project-move-content { width: 100%; box-sizing: border-box; padding: 18px 20px 0; display: grid; gap: 14px; }
    .path-card, .parent-picker { display: grid; gap: 6px; min-width: 0; }
    .path-card { border: 1px solid var(--wk-border); border-radius: 9px; padding: 10px 12px; background: var(--wk-background); }
    .path-card span, .parent-picker > span { color: var(--wk-ink-muted); font-size: 12px; }
    .path-card strong { color: var(--wk-ink-secondary); overflow-wrap: anywhere; line-height: 1.55; }
    .preview { border-color: color-mix(in srgb, var(--wk-primary) 35%, var(--wk-border)); }
    .move-warning, .empty-tip { margin: 0; border-radius: 8px; padding: 10px 12px; color: var(--wk-ink-secondary); line-height: 1.6; font-size: 13px; }
    .move-warning { background: color-mix(in srgb, var(--wk-primary) 8%, transparent); }
    .empty-tip { background: var(--wk-background); color: var(--wk-ink-muted); }
    footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin: 2px -20px 0; padding: 14px 20px 16px; border-top: 1px solid var(--wk-border); background: var(--wk-surface); }
    footer .wk-btn { min-height: 32px; }
</style>
