import type { FocusSessionRecord, FocusStatistics } from "./focusData";

export interface FocusSessionSummary extends FocusStatistics {
    completedSessions: number;
    cancelledSessions: number;
}

export function summarizeFocusSessions(sessions: readonly FocusSessionRecord[]): FocusSessionSummary {
    let totalFocusTime = 0;
    let completedSessions = 0;
    let cancelledSessions = 0;
    for (const session of sessions) {
        if (session.segmentType !== "focus") continue;
        if (session.status === "completed") {
            completedSessions += 1;
            totalFocusTime += session.actualSeconds;
        } else {
            cancelledSessions += 1;
        }
    }
    return { totalFocusTime, totalFocusTimes: completedSessions, completedSessions, cancelledSessions };
}
