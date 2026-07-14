import type { WorkspaceTaskViewModel } from "./enhancedDiaryWorkspaceTaskModel";
import {
    addDays,
    daysBetweenLocalDates,
    formatLocalDate,
    isValidLocalDateString,
    parseLocalDate,
} from "./enhancedDiaryWorkspaceDate";

export type WorkspaceTaskCalendarEventKind = "range" | "single" | "start" | "deadline";
export interface WorkspaceTaskCalendarEvent {
    id: string;
    kind: WorkspaceTaskCalendarEventKind;
    startDate: string;
    endDate: string;
    model: WorkspaceTaskViewModel;
}

export type WorkspaceTaskTimelineEventKind = "source" | "start" | "deadline";
export interface WorkspaceTaskTimelineEvent {
    id: string;
    date: string;
    kind: WorkspaceTaskTimelineEventKind;
    label: string;
    model: WorkspaceTaskViewModel;
}

export interface WorkspaceTaskGanttRow {
    id: string;
    projectKey: string;
    projectLabel: string;
    taskLabel: string;
    kind: "range" | "start" | "deadline";
    startDate: string;
    endDate: string;
    model: WorkspaceTaskViewModel;
}

export interface WorkspaceTaskGanttData {
    rows: WorkspaceTaskGanttRow[];
    unscheduled: WorkspaceTaskViewModel[];
    invalid: WorkspaceTaskViewModel[];
    minDate?: string;
    maxDate?: string;
}

export function buildWorkspaceTaskCalendarEvents(
    models: WorkspaceTaskViewModel[],
    visibleStart: string,
    visibleEnd: string,
): WorkspaceTaskCalendarEvent[] {
    return models.flatMap((model): WorkspaceTaskCalendarEvent[] => {
        if (model.hasInvalidRange || model.hasInvalidStartDate || model.hasInvalidDeadline) return [];
        const id = model.task.blockId;
        if (model.validStartDate && model.validDeadline) {
            if (model.validDeadline < visibleStart || model.validStartDate > visibleEnd) return [];
            return [{ id, kind: model.validStartDate === model.validDeadline ? "single" : "range", startDate: model.validStartDate, endDate: model.validDeadline, model }];
        }
        if (model.validStartDate && model.validStartDate >= visibleStart && model.validStartDate <= visibleEnd) {
            return [{ id, kind: "start", startDate: model.validStartDate, endDate: model.validStartDate, model }];
        }
        if (model.validDeadline && model.validDeadline >= visibleStart && model.validDeadline <= visibleEnd) {
            return [{ id, kind: "deadline", startDate: model.validDeadline, endDate: model.validDeadline, model }];
        }
        return [];
    });
}

export function buildWorkspaceTaskTimelineEvents(
    models: WorkspaceTaskViewModel[],
    range: "30" | "90" | "365" | "all" = "90",
    today: Date | string = new Date(),
): WorkspaceTaskTimelineEvent[] {
    const todayText = typeof today === "string" && isValidLocalDateString(today) ? today : formatLocalDate(today as Date);
    const days = range === "all" ? null : Number(range);
    const minDate = days == null ? "" : formatLocalDate(addDays(parseLocalDate(todayText), -(days - 1)));
    const maxDate = days == null ? "" : formatLocalDate(addDays(parseLocalDate(todayText), days - 1));
    const inRange = (date: string) => isValidLocalDateString(date) && (!minDate || (date >= minDate && date <= maxDate));
    const events: WorkspaceTaskTimelineEvent[] = [];
    models.forEach((model) => {
        const task = model.task;
        if (task.sourceDate && inRange(task.sourceDate)) events.push({ id: `${task.blockId}:source`, date: task.sourceDate, kind: "source", label: "记录任务", model });
        if (model.validStartDate && inRange(model.validStartDate)) events.push({ id: `${task.blockId}:start`, date: model.validStartDate, kind: "start", label: "开始", model });
        if (model.validDeadline && inRange(model.validDeadline)) events.push({ id: `${task.blockId}:deadline`, date: model.validDeadline, kind: "deadline", label: "截止", model });
    });
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.model.stableOrder - b.model.stableOrder);
}

export function buildWorkspaceTaskGanttData(models: WorkspaceTaskViewModel[]): WorkspaceTaskGanttData {
    const rows: WorkspaceTaskGanttRow[] = [];
    const unscheduled: WorkspaceTaskViewModel[] = [];
    const invalid: WorkspaceTaskViewModel[] = [];
    models.forEach((model) => {
        if (model.hasInvalidStartDate || model.hasInvalidDeadline || model.hasInvalidRange) { invalid.push(model); return; }
        if (!model.validStartDate && !model.validDeadline) { unscheduled.push(model); return; }
        const projectKey = model.task.projectTargetId || "__none__";
        const common = { id: model.task.blockId, projectKey, projectLabel: model.projectPathLabel, taskLabel: model.task.taskname, model };
        if (model.validStartDate && model.validDeadline) rows.push({ ...common, kind: "range", startDate: model.validStartDate, endDate: model.validDeadline });
        else if (model.validStartDate) rows.push({ ...common, kind: "start", startDate: model.validStartDate, endDate: model.validStartDate });
        else if (model.validDeadline) rows.push({ ...common, kind: "deadline", startDate: model.validDeadline, endDate: model.validDeadline });
    });
    const dates = rows.flatMap((row) => [row.startDate, row.endDate]);
    return { rows, unscheduled, invalid, minDate: dates.sort()[0], maxDate: dates.sort().reverse()[0] };
}

export function clampGanttRowsToRange(rows: WorkspaceTaskGanttRow[], center: string, days: number): WorkspaceTaskGanttRow[] {
    const half = Math.floor(days / 2);
    const start = formatLocalDate(addDays(parseLocalDate(center), -half));
    const end = formatLocalDate(addDays(parseLocalDate(center), days - half));
    return rows.filter((row) => row.endDate >= start && row.startDate <= end);
}

export function taskRangeProgress(model: WorkspaceTaskViewModel): number | null {
    if (!model.validStartDate || !model.validDeadline || model.hasInvalidRange) return null;
    const total = daysBetweenLocalDates(model.validStartDate, model.validDeadline);
    if (total <= 0) return model.task.completed ? 1 : 0;
    return Math.max(0, Math.min(1, -Number(model.startDistanceDays || 0) / total));
}
