import { mount } from "svelte";
import { svelteDialog } from "@/libs/dialog";
import TaskEditorDialog from "./components/TaskEditorDialog.svelte";
import QuickRecordDialog from "./components/QuickRecordDialog.svelte";
import DeleteTaskDialog from "./components/DeleteTaskDialog.svelte";
import DeleteRecordDialog from "./components/DeleteRecordDialog.svelte";
import MigrateTaskDialog from "./components/MigrateTaskDialog.svelte";
import ProjectRelationRepairDialog from "./components/ProjectRelationRepairDialog.svelte";
import ArchiveProjectDialog from "./components/ArchiveProjectDialog.svelte";
import WorkspaceProjectMoveDialog from "./components/WorkspaceProjectMoveDialog.svelte";
import type { GenerateTasksPlusTaskInput } from "../../tasksPlus/tasksPlusParser";
import type { EnhancedDiaryWorkspaceTask } from "./enhancedDiaryWorkspaceTaskService";
import type { EnhancedDiaryWorkspaceRecord } from "./enhancedDiaryWorkspaceRecordService";
import type { QuickRecordDialogSubmitInput } from "./enhancedDiaryWorkspaceRecordService";
import type { EnhancedDiaryProjectStorageConfig } from "../enhancedDiaryTypes";
import type { EnhancedDiaryProjectIndexPayload } from "../enhancedDiaryProjectTypes";
import type { ProjectRelationRepairMode } from "./enhancedDiaryWorkspaceProjectRelation";

interface OpenTaskEditorOptions {
    mode?: "create" | "edit";
    initialInput?: Partial<GenerateTasksPlusTaskInput>;
    task?: any;
    onSubmit: (input: GenerateTasksPlusTaskInput) => void | Promise<void> | boolean | Promise<boolean>;
    onClose?: () => void;
    projectStorage?: EnhancedDiaryProjectStorageConfig;
    tagSuggestions?: string[];
}

interface OpenQuickRecordOptions {
    mode?: "create" | "edit";
    initialCategoryTitle?: string;
    initialContent?: string;
    suggestedCategories?: string[];
    onSubmit: (input: QuickRecordDialogSubmitInput) => boolean | Promise<boolean> | void | Promise<void>;
    onClose?: () => void;
    initialTags?: string[];
    initialProjectTargetId?: string;
    initialIsKeyRecord?: boolean;
    projectStorage?: EnhancedDiaryProjectStorageConfig;
}

interface OpenDeleteTaskOptions {
    task: EnhancedDiaryWorkspaceTask;
    onSelect: (mode: "log" | "delete") => Promise<boolean>;
    onClose?: () => void;
}

interface OpenDeleteRecordOptions {
    record: EnhancedDiaryWorkspaceRecord;
    onConfirm: () => Promise<boolean>;
    onClose?: () => void;
    title?: string;
    message?: string;
}

interface OpenMigrateTaskOptions {
    task: EnhancedDiaryWorkspaceTask;
    today: string;
    onConfirm: () => Promise<boolean>;
    onClose?: () => void;
}

interface OpenProjectRelationRepairOptions {
    index: EnhancedDiaryProjectIndexPayload;
    status: string;
    contentLabel: string;
    hiddenProjectTargetId?: string;
    visibleProjectTargetId?: string;
    projectTargetId?: string;
    onSelect: (mode: ProjectRelationRepairMode, replacementTargetId?: string) => Promise<boolean>;
    onClose?: () => void;
}

export type ArchiveProjectActionMode = "verify_and_archive" | "complete_and_archive" | "archive";

export interface ArchiveProjectActionResult {
    accepted: boolean;
    pendingTaskCount?: number;
    message?: string;
}

interface OpenArchiveProjectOptions {
    projectName: string;
    projectPath: string[];
    descendantCount: number;
    pendingTaskCount: number;
    onSelect: (mode: ArchiveProjectActionMode) => ArchiveProjectActionResult | Promise<ArchiveProjectActionResult>;
    onClose?: () => void;
}

interface OpenProjectMoveOptions {
    index: EnhancedDiaryProjectIndexPayload;
    sourceTargetId: string;
    onConfirm: (destinationParentTargetId: string) => boolean | Promise<boolean>;
    onClose?: () => void;
}

function makeCloseGuard(onClose?: () => void) {
    let closeNotified = false;
    function notifyClose() {
        if (closeNotified) return;
        closeNotified = true;
        onClose?.();
    }
    return { notifyClose };
}

function prepareWorkspaceDialogContainer(container: HTMLElement): void {
    container.classList.add("workspace-page", "enhanced-diary-workspace-dialog");
    container.style.display = "block";
    container.style.width = "100%";
    container.style.minWidth = "0";
    container.style.background = "var(--b3-theme-surface)";
    container.style.color = "var(--b3-theme-on-surface)";
}

export function openTaskEditorSvelteDialog(options: OpenTaskEditorOptions): void {
    const { mode = "create", initialInput = {}, task = null, onSubmit, onClose, projectStorage, tagSuggestions = [] } = options;
    const { notifyClose } = makeCloseGuard(onClose);

    let dialogRef: ReturnType<typeof svelteDialog> | null = null;

    function closeDialog() {
        dialogRef?.close();
    }

    dialogRef = svelteDialog({
        title: mode === "create" ? "新建任务" : "编辑任务",
        width: "620px",
        callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);

            const component = mount(TaskEditorDialog, {
                target: container,
                props: {
                    mode,
                    initialInput,
                    task,
                    projectStorage,
                    tagSuggestions,
                    onSubmit: async (input: GenerateTasksPlusTaskInput) => {
                        const result = await onSubmit(input);
                        if (result !== false) {
                            closeDialog();
                        }
                    },
                    onClose: closeDialog,
                },
            });
            return component;
        },
    });
}

export function openQuickRecordSvelteDialog(options: OpenQuickRecordOptions): void {
    const {
        mode = "create",
        initialCategoryTitle = "",
        initialContent = "",
        suggestedCategories = ["未分类", "想法", "问题", "决策", "日志"],
        onSubmit,
        onClose,
        initialTags = [], initialProjectTargetId = "", initialIsKeyRecord = false, projectStorage,
    } = options;
    const { notifyClose } = makeCloseGuard(onClose);

    let dialogRef: ReturnType<typeof svelteDialog> | null = null;

    function closeDialog() {
        dialogRef?.close();
    }

    dialogRef = svelteDialog({
        title: mode === "edit" ? "编辑记录" : "快速记录",
        width: "560px",
        callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);

            const component = mount(QuickRecordDialog, {
                target: container,
                props: {
                    mode,
                    initialCategoryTitle,
                    initialContent,
                    suggestedCategories,
                    initialTags, initialProjectTargetId, initialIsKeyRecord, projectStorage,
                    onSubmit: async (input: QuickRecordDialogSubmitInput) => {
                        const result = await onSubmit(input);
                        if (result !== false) {
                            closeDialog();
                        }
                    },
                    onClose: closeDialog,
                },
            });
            return component;
        },
    });
}

export function openProjectRelationRepairDialog(options: OpenProjectRelationRepairOptions): void {
    const {
        index, status, contentLabel,
        hiddenProjectTargetId, visibleProjectTargetId, projectTargetId,
        onSelect, onClose,
    } = options;
    const { notifyClose } = makeCloseGuard(onClose);
    let dialogRef: ReturnType<typeof svelteDialog> | null = null;
    const closeDialog = () => dialogRef?.close();
    dialogRef = svelteDialog({
        title: "修复项目关系", width: "600px", callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);
            return mount(ProjectRelationRepairDialog, {
                target: container,
                props: {
                    index, status, contentLabel,
                    hiddenProjectTargetId, visibleProjectTargetId, projectTargetId,
                    onSelect: async (mode: ProjectRelationRepairMode, replacementTargetId?: string) => {
                        if (await onSelect(mode, replacementTargetId)) closeDialog();
                    },
                    onClose: closeDialog,
                },
            });
        },
    });
}

export function openArchiveProjectDialog(options: OpenArchiveProjectOptions): void {
    const { projectName, projectPath, descendantCount, pendingTaskCount, onSelect, onClose } = options;
    const { notifyClose } = makeCloseGuard(onClose);
    let dialogRef: ReturnType<typeof svelteDialog> | null = null;
    const closeDialog = () => dialogRef?.close();
    dialogRef = svelteDialog({
        title: "归档项目",
        width: "560px",
        callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);
            return mount(ArchiveProjectDialog, {
                target: container,
                props: {
                    projectName,
                    projectPath,
                    descendantCount,
                    pendingTaskCount,
                    onSelect: async (mode: ArchiveProjectActionMode) => {
                        const result = await onSelect(mode);
                        if (result.accepted) closeDialog();
                        return result;
                    },
                    onClose: closeDialog,
                },
            });
        },
    });
}

export function openProjectMoveDialog(options: OpenProjectMoveOptions): void {
    const { index, sourceTargetId, onConfirm, onClose } = options;
    const { notifyClose } = makeCloseGuard(onClose);
    let dialogRef: ReturnType<typeof svelteDialog> | null = null;
    const closeDialog = () => dialogRef?.close();
    dialogRef = svelteDialog({
        title: "调整项目归属",
        width: "620px",
        callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);
            return mount(WorkspaceProjectMoveDialog, {
                target: container,
                props: {
                    index,
                    sourceTargetId,
                    onConfirm: async (destinationParentTargetId: string) => {
                        const accepted = await onConfirm(destinationParentTargetId);
                        if (accepted) closeDialog();
                        return accepted;
                    },
                    onClose: closeDialog,
                },
            });
        },
    });
}

export function openDeleteTaskSvelteDialog(options: OpenDeleteTaskOptions): void {
    const { task, onSelect, onClose } = options;
    const { notifyClose } = makeCloseGuard(onClose);

    let dialogRef: ReturnType<typeof svelteDialog> | null = null;

    function closeDialog() {
        dialogRef?.close();
    }

    dialogRef = svelteDialog({
        title: "删除任务",
        width: "520px",
        callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);

            const component = mount(DeleteTaskDialog, {
                target: container,
                props: {
                    task,
                    onSelect: async (mode: "log" | "delete") => {
                        const ok = await onSelect(mode);
                        if (ok) {
                            closeDialog();
                        }
                    },
                    onClose: closeDialog,
                },
            });
            return component;
        },
    });
}

export function openDeleteRecordSvelteDialog(options: OpenDeleteRecordOptions): void {
    const { record, onConfirm, onClose, title = "删除记录", message } = options;
    const { notifyClose } = makeCloseGuard(onClose);

    let dialogRef: ReturnType<typeof svelteDialog> | null = null;

    function closeDialog() {
        dialogRef?.close();
    }

    dialogRef = svelteDialog({
        title,
        width: "520px",
        callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);

            const component = mount(DeleteRecordDialog, {
                target: container,
                props: {
                    record,
                    message,
                    onConfirm: async () => {
                        const ok = await onConfirm();
                        if (ok) {
                            closeDialog();
                        }
                    },
                    onClose: closeDialog,
                },
            });
            return component;
        },
    });
}

export function openMigrateTaskSvelteDialog(options: OpenMigrateTaskOptions): void {
    const { task, today, onConfirm, onClose } = options;
    const { notifyClose } = makeCloseGuard(onClose);

    let dialogRef: ReturnType<typeof svelteDialog> | null = null;

    function closeDialog() {
        dialogRef?.close();
    }

    dialogRef = svelteDialog({
        title: "迁移到今日日记",
        width: "520px",
        callback: notifyClose,
        constructor: (container: HTMLElement) => {
            prepareWorkspaceDialogContainer(container);

            const component = mount(MigrateTaskDialog, {
                target: container,
                props: {
                    task,
                    today,
                    onConfirm: async () => {
                        const ok = await onConfirm();
                        if (ok) {
                            closeDialog();
                        }
                    },
                    onClose: closeDialog,
                },
            });
            return component;
        },
    });
}
