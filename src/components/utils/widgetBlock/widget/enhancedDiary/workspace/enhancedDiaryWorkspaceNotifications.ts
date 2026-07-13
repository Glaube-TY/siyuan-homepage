import type { EnhancedDiaryPeriod } from "../enhancedDiaryTypes";
import type { EnhancedDiaryWorkspaceTask } from "./enhancedDiaryWorkspaceTaskService";
import type { EnhancedDiaryWorkspaceReviewCard } from "./enhancedDiaryWorkspaceViewModel";
import type { EnhancedDiaryWorkspaceRecord } from "./enhancedDiaryWorkspaceRecordService";

export interface EnhancedDiaryWorkspaceNotification {
    id: string;
    type: "overdue_task" | "migration_suggestion" | "review_due" | "template_missing" | "project_relation" | "project_index";
    level: "info" | "warning" | "danger";
    title: string;
    description: string;
    relatedTaskId?: string;
    relatedDocId?: string;
    relatedRecordId?: string;
    relationEntityKind?: "task" | "record";
    /** 仅复盘类通知携带，用于在面板中精确查找对应 ReviewCard */
    reviewPeriod?: EnhancedDiaryPeriod;
    action?:
        | "open_doc"
        | "migrate_task"
        | "append_template"
        | "append_review_template"
        | "create_or_open_review"
        | "complete_review"
        | "skip_review"
        | "repair_project_relation"
        | "rebuild_project_index";
}

export function buildWorkspaceNotifications(params: {
    tasks: EnhancedDiaryWorkspaceTask[];
    templateValid: boolean;
    missingSections: string[];
    todayDocId?: string;
    reviewCards: EnhancedDiaryWorkspaceReviewCard[];
    taskManagementEnabled?: boolean;
    records?: EnhancedDiaryWorkspaceRecord[];
    projectIndexComplete?: boolean;
    projectRecordIndexComplete?: boolean;
}): EnhancedDiaryWorkspaceNotification[] {
    const notifications: EnhancedDiaryWorkspaceNotification[] = [];
    const taskManagementEnabled = params.taskManagementEnabled !== false;

    function relationMessage(status: string, label: string): { title: string; description: string } | null {
        if (status === "missing_visible_reference") return { title: `${label}的项目引用已丢失`, description: "正式项目关系仍然保留，可恢复日记中的可见引用或取消关联。" };
        if (status === "missing_hidden_relation") return { title: `${label}只有可见项目引用`, description: "可采用文档中的引用建立正式关系，或删除可见标记。" };
        if (status === "target_mismatch") return { title: `${label}的项目关系不一致`, description: "日记中的引用与正式关系指向不同项目，请选择保留哪一方。" };
        if (status === "invalid_target") return { title: `${label}关联的项目已失效`, description: "项目节点可能已删除、取消属性或移出项目容器，请重新关联或取消。" };
        return null;
    }

    params.tasks.forEach((task) => {
        const message = relationMessage(task.projectRelationStatus, `任务“${task.taskname}”`);
        if (message) notifications.push({ id: `project-relation-task-${task.blockId}`, type: "project_relation", level: "warning", ...message, relatedTaskId: task.blockId, relationEntityKind: "task", action: "repair_project_relation" });
    });
    (params.records || []).forEach((record) => {
        const message = relationMessage(record.projectRelationStatus, "一条记录");
        if (message && record.headingBlockId) notifications.push({ id: `project-relation-record-${record.headingBlockId}`, type: "project_relation", level: "warning", ...message, relatedRecordId: record.headingBlockId, relatedDocId: record.docId, relationEntityKind: "record", action: "repair_project_relation" });
    });
    if (params.projectIndexComplete === false) notifications.push({ id: "project-index-incomplete", type: "project_index", level: "warning", title: "项目索引尚未完整", description: "请到检索管理手动重建项目索引。", action: "rebuild_project_index" });
    if (params.projectRecordIndexComplete === false) notifications.push({ id: "project-record-index-incomplete", type: "project_index", level: "info", title: "项目历史记录索引待补全", description: "当前可显示最近数据；可到检索管理手动完整重建。", action: "rebuild_project_index" });

    if (taskManagementEnabled) {
        params.tasks
            .filter((task) => task.isOverdue)
            .slice(0, 20)
            .forEach((task) => {
            notifications.push({
                id: `overdue-${task.blockId}`,
                type: "overdue_task",
                level: "danger",
                title: `逾期任务：${task.taskname}`,
                description: task.deadline
                    ? `截止日期 ${task.deadline}，建议尽快处理。`
                    : "该任务已逾期。",
                relatedTaskId: task.blockId,
                relatedDocId: task.sourceDocId,
                action: "open_doc",
            });
        });

    params.tasks
        .filter((task) => task.shouldMigrate)
        .slice(0, 20)
        .forEach((task) => {
            notifications.push({
                id: `migrate-${task.blockId}`,
                type: "migration_suggestion",
                level: "warning",
                title: `建议迁移：${task.taskname}`,
                description: task.sourceDate
                    ? `该任务位于 ${task.sourceDate} 日记中，建议迁移到今天继续管理。`
                    : "该任务建议迁移到今日日记继续管理。",
                relatedTaskId: task.blockId,
                relatedDocId: task.sourceDocId,
                action: "migrate_task",
            });
        });
    }

    if (params.todayDocId && !params.templateValid) {
        notifications.push({
            id: "template-missing-today",
            type: "template_missing",
            level: "warning",
            title: "今日日记模板结构缺失",
            description: `缺少 ${params.missingSections.slice(0, 4).join("、")}${
                params.missingSections.length > 4 ? " 等区块" : ""
            }，写入操作会被保护性拦截。`,
            relatedDocId: params.todayDocId,
            action: "append_template",
        });
    }

    params.reviewCards
        .filter((card) =>
            ["not_created", "missing_template", "pending", "overdue"].includes(card.status)
        )
        .forEach((card) => {
            // 用 period + dateOrRange 组合 id，避免历史/当前同周期冲突
            const notifId = `review-${card.period}-${card.dateOrRange}`;

            let action: EnhancedDiaryWorkspaceNotification["action"];
            if (card.status === "not_created") {
                action = "create_or_open_review";
            } else if (card.status === "missing_template") {
                action = "append_review_template";
            } else {
                // pending / overdue
                action = "complete_review";
            }

            notifications.push({
                id: notifId,
                type: "review_due",
                level: card.status === "overdue" ? "warning" : "info",
                title: `${card.title}：${card.statusLabel}`,
                description: `${card.dateOrRange} 需要处理。`,
                relatedDocId: card.docId,
                reviewPeriod: card.period,
                action,
            });
        });

    return notifications;
}
