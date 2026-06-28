import { getDiaryDocumentForDate } from "../enhancedDiaryDoc";
import { buildEnhancedDiaryWorkspaceSummary } from "../enhancedDiaryWorkspaceSummary";
import { formatDiaryDate, scanDiaryContentForPeriod } from "../enhancedDiaryUtils";
import { isEnhancedDiaryTaskManagementEnabled } from "../enhancedDiaryTemplateFieldMapping";
import type { EnhancedDiaryConfig, EnhancedDiaryPeriod } from "../enhancedDiaryTypes";

export interface EnhancedDiaryWorkspaceDayDetail {
    date: string;
    hasDiary: boolean;
    docId?: string;
    docTitle?: string;
    templateValid: boolean;
    missingSections: string[];
    newTaskCount: number;
    migratedTaskCount: number;
    quickRecordCount: number;
    projectCount: number;
    completedReviewCount: number;
    pendingReviewCount: number;
    reviewStatusText: string;
}

function emptyDetail(dateText: string): EnhancedDiaryWorkspaceDayDetail {
    return {
        date: dateText,
        hasDiary: false,
        templateValid: false,
        missingSections: ["# 今日日记"],
        newTaskCount: 0,
        migratedTaskCount: 0,
        quickRecordCount: 0,
        projectCount: 0,
        completedReviewCount: 0,
        pendingReviewCount: 0,
        reviewStatusText: "无日记",
    };
}

export async function loadWorkspaceDayDetail(
    date: Date,
    config?: EnhancedDiaryConfig
): Promise<EnhancedDiaryWorkspaceDayDetail> {
    const dateText = formatDiaryDate(date);

    try {
        const doc = await getDiaryDocumentForDate(date);

        if (!doc) {
            return emptyDetail(dateText);
        }

        const taskManagementEnabled = isEnhancedDiaryTaskManagementEnabled(config);
        const summary = buildEnhancedDiaryWorkspaceSummary(
            doc.content,
            config?.headingStructure,
            config?.templateFieldMapping,
            taskManagementEnabled,
        );

        const periods: EnhancedDiaryPeriod[] = ["day", "week", "month", "year"];
        let completedReviewCount = 0;
        let pendingReviewCount = 0;

        for (const period of periods) {
            const scan = scanDiaryContentForPeriod(doc.content, period, config?.templateFieldMapping);
            if (scan.completed) {
                completedReviewCount += 1;
            } else if (scan.hasCompletionMarker && !scan.skipped) {
                pendingReviewCount += 1;
            }
        }

        return {
            date: dateText,
            hasDiary: true,
            docId: doc.id,
            docTitle: doc.title,
            templateValid: summary.templateValid,
            missingSections: summary.missing,
            newTaskCount: summary.newTaskCount,
            migratedTaskCount: summary.migratedTaskCount,
            quickRecordCount: summary.quickRecordCount,
            projectCount: summary.projectCount,
            completedReviewCount,
            pendingReviewCount,
            reviewStatusText: `${completedReviewCount}/4 已完成`,
        };
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceDayDetail] loadWorkspaceDayDetail failed", err);
        return emptyDetail(dateText);
    }
}
