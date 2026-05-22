import type { EnhancedDiaryPeriod } from "../enhancedDiaryTypes";
import type { EnhancedDiaryWorkspaceTask } from "./enhancedDiaryWorkspaceTaskService";
import type { EnhancedDiaryWorkspaceReviewCard } from "./enhancedDiaryWorkspaceViewModel";

export interface EnhancedDiaryWorkspaceNotification {
    id: string;
    type: "overdue_task" | "migration_suggestion" | "review_due" | "template_missing";
    level: "info" | "warning" | "danger";
    title: string;
    description: string;
    relatedTaskId?: string;
    relatedDocId?: string;
    /** 仅复盘类通知携带，用于在面板中精确查找对应 ReviewCard */
    reviewPeriod?: EnhancedDiaryPeriod;
    action?:
        | "open_doc"
        | "migrate_task"
        | "append_template"
        | "append_review_template"
        | "create_or_open_review"
        | "complete_review"
        | "skip_review";
}

export function buildWorkspaceNotifications(params: {
    tasks: EnhancedDiaryWorkspaceTask[];
    templateValid: boolean;
    missingSections: string[];
    todayDocId?: string;
    reviewCards: EnhancedDiaryWorkspaceReviewCard[];
}): EnhancedDiaryWorkspaceNotification[] {
    const notifications: EnhancedDiaryWorkspaceNotification[] = [];

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
