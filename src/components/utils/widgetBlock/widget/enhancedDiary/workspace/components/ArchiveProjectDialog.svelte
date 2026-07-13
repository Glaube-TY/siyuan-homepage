<script lang="ts">
    import WorkspaceProjectIcon from "./WorkspaceProjectIcon.svelte";
    import type { ArchiveProjectActionMode, ArchiveProjectActionResult } from "../enhancedDiaryWorkspaceDialogs";

    interface Props {
        projectName: string;
        projectPath: string[];
        descendantCount: number;
        pendingTaskCount: number;
        onSelect: (mode: ArchiveProjectActionMode) => ArchiveProjectActionResult | Promise<ArchiveProjectActionResult>;
        onClose: () => void;
    }

    let { projectName, projectPath, descendantCount, pendingTaskCount, onSelect, onClose }: Props = $props();
    let busy = $state(false);
    let currentPendingTaskCount = $state(0);
    let notice = $state("");

    $effect(() => {
        currentPendingTaskCount = pendingTaskCount;
    });

    async function select(mode: ArchiveProjectActionMode): Promise<void> {
        if (busy) return;
        busy = true;
        try {
            const result = await onSelect(mode);
            if (result.pendingTaskCount !== undefined) currentPendingTaskCount = result.pendingTaskCount;
            notice = result.message || "";
        } finally {
            busy = false;
        }
    }
</script>

<div class="archive-project-content">
    <div class="project-summary">
        <strong>{projectName}</strong>
        <span>{projectPath.join(" / ")}</span>
    </div>
    <dl>
        <div><dt>一并归档的后代项目</dt><dd>{descendantCount}</dd></div>
        <div><dt>范围内未完成任务</dt><dd>{currentPendingTaskCount}</dd></div>
    </dl>
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    <p>归档只写入项目状态，不会删除或移动项目文档，也不会改动日记中的任务与记录。归档后仍可查看内容和处理已有任务。</p>
    <footer>
        <button type="button" class="wk-btn wk-btn-secondary" onclick={onClose} disabled={busy}>取消</button>
        {#if currentPendingTaskCount > 0}
            <button type="button" class="wk-btn wk-btn-secondary" onclick={() => void select("archive")} disabled={busy}><WorkspaceProjectIcon name="archive" />归档但保留任务</button>
            <button type="button" class="wk-btn wk-btn-primary" onclick={() => void select("complete_and_archive")} disabled={busy}><WorkspaceProjectIcon name="completed" />完成全部任务并归档</button>
        {:else}
            <button type="button" class="wk-btn wk-btn-primary" onclick={() => void select("verify_and_archive")} disabled={busy}><WorkspaceProjectIcon name="archive" />归档项目</button>
        {/if}
    </footer>
</div>

<style>
    .archive-project-content { width: 100%; box-sizing: border-box; padding: 18px 20px 0; display: grid; gap: 14px; }
    .project-summary { display: grid; gap: 4px; min-width: 0; }
    .project-summary strong { font-size: 16px; color: var(--wk-ink); }
    .project-summary span, p { color: var(--wk-ink-muted); overflow-wrap: anywhere; }
    dl { display: grid; gap: 8px; margin: 0; }
    dl > div { display: flex; justify-content: space-between; gap: 16px; border: 1px solid var(--wk-border); border-radius: 8px; padding: 9px 11px; }
    dt { color: var(--wk-ink-secondary); }
    dd { margin: 0; font-weight: 600; color: var(--wk-ink); }
    p { margin: 0; line-height: 1.65; font-size: 13px; }
    .notice { border-radius: 8px; padding: 9px 11px; background: color-mix(in srgb, var(--wk-primary) 8%, transparent); color: var(--wk-ink-secondary); }
    footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin: 4px -20px 0; padding: 14px 20px 16px; border-top: 1px solid var(--wk-border); background: var(--wk-surface); }
    footer .wk-btn { min-height: 32px; }
</style>
