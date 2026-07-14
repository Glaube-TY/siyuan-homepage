import { normalizeWorkspaceTaskTag, type WorkspaceTaskViewModel } from "./enhancedDiaryWorkspaceTaskModel";
import { isValidLocalDateString } from "./enhancedDiaryWorkspaceDate";

export type WorkspaceTaskAnalyticsProjectMode = "direct" | "root";

export interface WorkspaceTaskMetric { key: string; label: string; value: number; }
export interface WorkspaceTaskLoadMetric extends WorkspaceTaskMetric { active: number; completed: number; overdue: number; }
export interface WorkspaceTaskAnalyticsSnapshot {
    kpis: WorkspaceTaskMetric[];
    status: WorkspaceTaskMetric[];
    deadlines: WorkspaceTaskMetric[];
    priorities: WorkspaceTaskMetric[];
    schedules: WorkspaceTaskMetric[];
    projects: WorkspaceTaskLoadMetric[];
    tags: WorkspaceTaskLoadMetric[];
    ages: WorkspaceTaskMetric[];
}

export interface WorkspaceTaskAnalyticsSelection {
    kind: "kpi" | "status" | "deadline" | "priority" | "schedule" | "project" | "tag" | "age";
    key: string;
    label?: string;
    projectMode?: WorkspaceTaskAnalyticsProjectMode;
}

function metric(key: string, label: string, value: number): WorkspaceTaskMetric { return { key, label, value }; }

function getProjectKey(model: WorkspaceTaskViewModel, mode: WorkspaceTaskAnalyticsProjectMode): string {
    return mode === "root"
        ? model.task.rootProjectId || "__none__"
        : model.task.projectTargetId || "__none__";
}

export function matchesWorkspaceTaskAnalyticsSelection(
    model: WorkspaceTaskViewModel,
    selection: WorkspaceTaskAnalyticsSelection,
): boolean {
    const { kind, key } = selection;
    const active = !model.task.completed;
    if (kind === "status") {
        if (key === "completed") return model.task.completed;
        if (key === "active") return active && !model.isOverdue;
        if (key === "overdue") return active && model.isOverdue;
        return false;
    }
    if (kind === "deadline") {
        if (!active) return false;
        if (key === "overdue") return model.isOverdue;
        if (key === "today") return model.deadlineDistanceDays === 0;
        if (key === "week") return model.deadlineDistanceDays != null && model.deadlineDistanceDays >= 1 && model.deadlineDistanceDays <= 7;
        if (key === "month") return model.deadlineDistanceDays != null && model.deadlineDistanceDays >= 8 && model.deadlineDistanceDays <= 30;
        if (key === "later") return model.deadlineDistanceDays != null && model.deadlineDistanceDays > 30;
        if (key === "none") return !model.validDeadline && !model.hasInvalidDeadline;
        if (key === "invalid") return model.hasInvalidDeadline;
        return false;
    }
    if (kind === "kpi") {
        if (key === "active") return active;
        if (key === "completed") return model.task.completed;
        if (key === "overdue") return active && model.isOverdue;
        if (key === "week") return active && model.deadlineDistanceDays != null && model.deadlineDistanceDays >= 0 && model.deadlineDistanceDays <= 7;
        if (key === "unscheduled") return active && model.isUnscheduled;
        if (key === "linked") return !!model.task.projectTargetId;
        if (key === "unlinked") return !model.task.projectTargetId;
        if (key === "relation") return model.relationNeedsAttention;
        return false;
    }
    if (kind === "priority") return model.priorityLevel === Number(key);
    if (kind === "schedule") {
        if (key === "range") return !model.hasInvalidRange && (model.scheduleKind === "range" || model.scheduleKind === "same_day");
        if (key === "start_only") return model.scheduleKind === "start_only";
        if (key === "deadline_only") return model.scheduleKind === "deadline_only";
        if (key === "none") return model.scheduleKind === "none" && !model.hasInvalidStartDate && !model.hasInvalidDeadline;
        if (key === "invalid") return model.hasInvalidStartDate || model.hasInvalidDeadline || model.hasInvalidRange;
        return false;
    }
    if (kind === "project") return getProjectKey(model, selection.projectMode || "direct") === key;
    if (kind === "tag") {
        const normalizedKey = normalizeWorkspaceTaskTag(key).toLocaleLowerCase();
        return !!normalizedKey && model.task.tags.some((tag) => normalizeWorkspaceTaskTag(tag).toLocaleLowerCase() === normalizedKey);
    }
    if (kind === "age") {
        const hasSourceDate = isValidLocalDateString(model.task.sourceDate);
        if (key === "0-7") return hasSourceDate && model.stagnantDays <= 7;
        if (key === "8-14") return hasSourceDate && model.stagnantDays >= 8 && model.stagnantDays <= 14;
        if (key === "15-30") return hasSourceDate && model.stagnantDays >= 15 && model.stagnantDays <= 30;
        if (key === "31-90") return hasSourceDate && model.stagnantDays >= 31 && model.stagnantDays <= 90;
        if (key === "90+") return hasSourceDate && model.stagnantDays > 90;
        if (key === "unknown") return !hasSourceDate;
    }
    return false;
}

export function buildWorkspaceTaskAnalytics(
    models: WorkspaceTaskViewModel[],
    projectMode: WorkspaceTaskAnalyticsProjectMode = "direct",
): WorkspaceTaskAnalyticsSnapshot {
    const count = (selection: WorkspaceTaskAnalyticsSelection): number =>
        models.filter((model) => matchesWorkspaceTaskAnalyticsSelection(model, selection)).length;

    const status = [
        metric("completed", "已完成", count({ kind: "status", key: "completed" })),
        metric("active", "正常待办", count({ kind: "status", key: "active" })),
        metric("overdue", "逾期", count({ kind: "status", key: "overdue" })),
    ];
    const deadlines = [
        metric("overdue", "已逾期", count({ kind: "deadline", key: "overdue" })),
        metric("today", "今天", count({ kind: "deadline", key: "today" })),
        metric("week", "未来 7 天", count({ kind: "deadline", key: "week" })),
        metric("month", "未来 30 天", count({ kind: "deadline", key: "month" })),
        metric("later", "30 天以后", count({ kind: "deadline", key: "later" })),
        metric("none", "无截止", count({ kind: "deadline", key: "none" })),
        metric("invalid", "截止异常", count({ kind: "deadline", key: "invalid" })),
    ];
    const priorities = [0, 1, 2, 3, 4].map((level) => metric(String(level), ["无", "低", "中", "高", "紧急"][level], count({ kind: "priority", key: String(level) })));
    const schedules = [
        metric("range", "开始 + 截止", count({ kind: "schedule", key: "range" })),
        metric("start_only", "只有开始", count({ kind: "schedule", key: "start_only" })),
        metric("deadline_only", "只有截止", count({ kind: "schedule", key: "deadline_only" })),
        metric("none", "无日期", count({ kind: "schedule", key: "none" })),
        metric("invalid", "日期异常", count({ kind: "schedule", key: "invalid" })),
    ];

    const projectMap = new Map<string, WorkspaceTaskLoadMetric>();
    models.forEach((model) => {
        const key = getProjectKey(model, projectMode);
        const label = key === "__none__" ? "未关联项目" : projectMode === "root" ? model.task.projectPath?.[0] || key : model.projectPathLabel;
        const item = projectMap.get(key) || { key, label, value: 0, active: 0, completed: 0, overdue: 0 };
        item.value += 1;
        if (model.task.completed) item.completed += 1; else item.active += 1;
        if (model.isOverdue) item.overdue += 1;
        projectMap.set(key, item);
    });
    const projects = Array.from(projectMap.values()).sort((a, b) => b.active - a.active || b.value - a.value).slice(0, 10);

    const tagMap = new Map<string, WorkspaceTaskLoadMetric>();
    models.forEach((model) => new Map(model.task.tags.map((tag) => {
        const normalized = normalizeWorkspaceTaskTag(tag);
        return [normalized.toLocaleLowerCase(), normalized] as const;
    }).filter(([key]) => !!key)).forEach((tag, key) => {
        const item = tagMap.get(key) || { key, label: tag, value: 0, active: 0, completed: 0, overdue: 0 };
        item.value += 1;
        if (model.task.completed) item.completed += 1; else item.active += 1;
        if (model.isOverdue) item.overdue += 1;
        tagMap.set(key, item);
    }));
    const tags = Array.from(tagMap.values()).sort((a, b) => b.active - a.active || b.value - a.value).slice(0, 12);

    const ages = [
        metric("0-7", "0–7 天", count({ kind: "age", key: "0-7" })),
        metric("8-14", "8–14 天", count({ kind: "age", key: "8-14" })),
        metric("15-30", "15–30 天", count({ kind: "age", key: "15-30" })),
        metric("31-90", "31–90 天", count({ kind: "age", key: "31-90" })),
        metric("90+", "90 天以上", count({ kind: "age", key: "90+" })),
        metric("unknown", "来源未知", count({ kind: "age", key: "unknown" })),
    ];

    return {
        kpis: [
            metric("active", "待完成", count({ kind: "kpi", key: "active" })), metric("completed", "已完成", count({ kind: "kpi", key: "completed" })),
            metric("overdue", "已逾期", count({ kind: "kpi", key: "overdue" })), metric("week", "7 天内截止", count({ kind: "kpi", key: "week" })),
            metric("unscheduled", "未排期", count({ kind: "kpi", key: "unscheduled" })), metric("linked", "已关联项目", count({ kind: "kpi", key: "linked" })),
            metric("unlinked", "未关联项目", count({ kind: "kpi", key: "unlinked" })), metric("relation", "关系需维护", count({ kind: "kpi", key: "relation" })),
        ],
        status, deadlines, priorities, schedules, projects, tags, ages,
    };
}
