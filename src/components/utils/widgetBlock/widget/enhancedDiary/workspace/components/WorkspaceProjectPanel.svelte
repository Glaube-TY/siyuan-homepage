<script lang="ts">
    import type { EnhancedDiaryConfig } from "../../enhancedDiaryTypes";
    import type { EnhancedDiaryProjectRecordIndexItem } from "../../enhancedDiaryProjectRecordIndex";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import WorkspaceFormalProjectPanel from "./WorkspaceFormalProjectPanel.svelte";

    interface Props {
        config: EnhancedDiaryConfig;
        tasks?: EnhancedDiaryWorkspaceTask[];
        initialTargetId?: string;
        selectVersion?: number;
        onOpenDoc?: (docId: string) => void;
        onOpenBlock?: (blockId: string) => void;
        workspaceMutationVersion?: number;
        taskManagementEnabled?: boolean;
        onCreateTask?: (targetId: string) => void;
        onEditTask?: (task: EnhancedDiaryWorkspaceTask) => void;
        onToggleTask?: (task: EnhancedDiaryWorkspaceTask) => void | Promise<void>;
        onDeleteTask?: (task: EnhancedDiaryWorkspaceTask) => void;
        onCreateRecord?: (targetId: string) => void;
        onEditRecord?: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onDeleteRecord?: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onConvertRecordToTask?: (record: EnhancedDiaryProjectRecordIndexItem) => void | Promise<void>;
        onArchiveProject?: (targetId: string) => void;
        onRestoreProject?: (targetId: string) => void;
    }

    let {
        config, tasks = [], initialTargetId = "", selectVersion = 0, onOpenDoc, onOpenBlock,
        workspaceMutationVersion = 0, taskManagementEnabled = true,
        onCreateTask, onEditTask, onToggleTask, onDeleteTask,
        onCreateRecord, onEditRecord, onDeleteRecord, onConvertRecordToTask,
        onArchiveProject, onRestoreProject,
    }: Props = $props();
</script>

<WorkspaceFormalProjectPanel
    {config} {tasks} {initialTargetId} {selectVersion} {onOpenDoc} {onOpenBlock}
    {workspaceMutationVersion} {taskManagementEnabled}
    {onCreateTask} {onEditTask} {onToggleTask} {onDeleteTask}
    {onCreateRecord} {onEditRecord} {onDeleteRecord} {onConvertRecordToTask}
    {onArchiveProject} {onRestoreProject}
/>
