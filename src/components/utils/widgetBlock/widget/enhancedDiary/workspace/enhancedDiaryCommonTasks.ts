import {
    loadSharedJson,
    mutateSharedJson,
    type SharedRevisionedFile,
} from "../../sharedLocalStorage/sharedLocalStorage";
import {
    ENHANCED_DIARY_COMMON_TASKS_FILE,
    ENHANCED_DIARY_COMMON_TASKS_SCHEMA,
    SHARED_WIDGET_DATA_VERSION,
} from "../../sharedLocalStorage/sharedWidgetStoragePaths";

interface CommonTaskFile extends SharedRevisionedFile {
    taskNames: string[];
}

function isTaskName(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value === value.trim() && !/[\r\n]/.test(value);
}

function validateFile(raw: unknown): CommonTaskFile {
    const file = raw as CommonTaskFile | null;
    if (
        file?.schema !== ENHANCED_DIARY_COMMON_TASKS_SCHEMA ||
        file.version !== SHARED_WIDGET_DATA_VERSION ||
        !Number.isSafeInteger(file.revision) || file.revision < 0 ||
        typeof file.updatedAt !== "string" || !Number.isFinite(Date.parse(file.updatedAt)) ||
        !Array.isArray(file.taskNames) || !file.taskNames.every(isTaskName) ||
        new Set(file.taskNames).size !== file.taskNames.length
    ) {
        throw new Error("常用任务数据格式异常");
    }
    return file;
}

export async function loadCommonTaskNames(): Promise<string[]> {
    const file = await loadSharedJson(ENHANCED_DIARY_COMMON_TASKS_FILE, validateFile);
    return file?.taskNames ?? [];
}

export async function updateCommonTaskName(name: string, operation: "save" | "remove"): Promise<string[]> {
    const taskName = name.trim();
    if (!isTaskName(taskName)) throw new Error("请输入单行任务名称");
    const saved = await mutateSharedJson({
        store: "enhanced-diary-common-tasks",
        path: ENHANCED_DIARY_COMMON_TASKS_FILE,
        normalize: validateFile,
        createEmpty: () => ({
            schema: ENHANCED_DIARY_COMMON_TASKS_SCHEMA,
            version: SHARED_WIDGET_DATA_VERSION,
            revision: 0,
            updatedAt: "",
            taskNames: [],
        }),
        mutate: (file) => {
            if (operation === "remove") {
                file.taskNames = file.taskNames.filter((item) => item !== taskName);
            } else if (!file.taskNames.includes(taskName)) {
                file.taskNames.push(taskName);
            }
        },
    });
    return saved.taskNames;
}
