export type SharedWidgetStore = "focus" | "cybmok" | "countdown" | "fixed-assets" | "review-docs";

export const FOCUS_STATISTICS_FILE = "focus/focus-statistics.json";
export const FOCUS_LEGACY_BASELINE_FILE = "focus/focus-legacy-baseline.json";
export const CYBMOK_RECORDS_FILE = "cybmok/cybmok-records.json";
export const FOCUS_INDEX_FILE = "focus/focus-index.json";
export const CYBMOK_INDEX_FILE = "cybmok/cybmok-index.json";
export const COUNTDOWN_EVENTS_FILE = "countdown/countdown-events.json";
export const FIXED_ASSETS_FILE = "fixed-assets/fixed-assets.json";
export const REVIEW_LOG_INDEX_FILE = "review-docs/review-log-index.json";

export const FOCUS_STATISTICS_SCHEMA = "siyuan-homepage-focus-statistics";
export const FOCUS_LEGACY_BASELINE_SCHEMA = "siyuan-homepage-focus-legacy-baseline";
export const CYBMOK_RECORDS_SCHEMA = "siyuan-homepage-cybmok-records";
export const FOCUS_INDEX_SCHEMA = "siyuan-homepage-focus-index";
export const FOCUS_SESSIONS_SCHEMA = "siyuan-homepage-focus-sessions";
export const CYBMOK_INDEX_SCHEMA = "siyuan-homepage-cybmok-index";
export const CYBMOK_BATCHES_SCHEMA = "siyuan-homepage-cybmok-batches";
export const COUNTDOWN_EVENTS_SCHEMA = "siyuan-homepage-countdown-events";
export const FIXED_ASSETS_SCHEMA = "siyuan-homepage-fixed-assets";
export const REVIEW_LOG_INDEX_SCHEMA = "siyuan-homepage-review-log-index";
export const REVIEW_LOGS_SCHEMA = "siyuan-homepage-review-logs";

export const SHARED_WIDGET_DATA_VERSION = 1;
export const FOCUS_INDEX_VERSION = 1;
export const FOCUS_SESSION_VERSION = 1;
export const FOCUS_LEGACY_BASELINE_VERSION = 1;
export const CYBMOK_INDEX_VERSION = 1;
export const CYBMOK_BATCH_VERSION = 1;

export function getFocusSessionsFile(year: number): string {
    return `focus/focus-sessions-${year}.json`;
}

export function getCYBMOKBatchesFile(year: number): string {
    return `cybmok/cybmok-batches-${year}.json`;
}

export function getReviewLogsFile(year: number): string {
    return `review-docs/review-logs-${year}.json`;
}
