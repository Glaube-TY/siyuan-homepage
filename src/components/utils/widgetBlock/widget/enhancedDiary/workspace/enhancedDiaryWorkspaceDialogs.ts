import { mount } from "svelte";
import { svelteDialog } from "@/libs/dialog";
import TaskEditorDialog from "./components/TaskEditorDialog.svelte";
import QuickRecordDialog from "./components/QuickRecordDialog.svelte";
import DeleteTaskDialog from "./components/DeleteTaskDialog.svelte";
import DeleteRecordDialog from "./components/DeleteRecordDialog.svelte";
import MigrateTaskDialog from "./components/MigrateTaskDialog.svelte";
import type { GenerateTasksPlusTaskInput } from "../../tasksPlus/tasksPlusParser";
import type { EnhancedDiaryWorkspaceTask } from "./enhancedDiaryWorkspaceTaskService";
import type { EnhancedDiaryWorkspaceRecord } from "./enhancedDiaryWorkspaceRecordService";

interface OpenTaskEditorOptions {
    mode?: "create" | "edit";
    initialInput?: Partial<GenerateTasksPlusTaskInput>;
    task?: any;
    onSubmit: (input: GenerateTasksPlusTaskInput) => void | Promise<void> | boolean | Promise<boolean>;
    onClose?: () => void;
}

interface OpenQuickRecordOptions {
    mode?: "create" | "edit";
    initialCategoryTitle?: string;
    initialContent?: string;
    suggestedCategories?: string[];
    onSubmit: (categoryTitle: string, content: string) => boolean | Promise<boolean> | void | Promise<void>;
    onClose?: () => void;
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

function makeCloseGuard(onClose?: () => void) {
    let closeNotified = false;
    function notifyClose() {
        if (closeNotified) return;
        closeNotified = true;
        onClose?.();
    }
    return { notifyClose };
}

export function openTaskEditorSvelteDialog(options: OpenTaskEditorOptions): void {
    const { mode = "create", initialInput = {}, task = null, onSubmit, onClose } = options;
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
            container.style.display = "block";
            container.style.width = "100%";
            container.style.minWidth = "0";

            const component = mount(TaskEditorDialog, {
                target: container,
                props: {
                    mode,
                    initialInput,
                    task,
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
            container.style.display = "block";
            container.style.width = "100%";
            container.style.minWidth = "0";

            const component = mount(QuickRecordDialog, {
                target: container,
                props: {
                    mode,
                    initialCategoryTitle,
                    initialContent,
                    suggestedCategories,
                    onSubmit: async (categoryTitle: string, content: string) => {
                        const result = await onSubmit(categoryTitle, content);
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
            container.style.display = "block";
            container.style.width = "100%";
            container.style.minWidth = "0";

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
            container.style.display = "block";
            container.style.width = "100%";
            container.style.minWidth = "0";

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
            container.style.display = "block";
            container.style.width = "100%";
            container.style.minWidth = "0";

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
