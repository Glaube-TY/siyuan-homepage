export type RuntimePerformanceArea =
    | "plugin-startup"
    | "layout-ready"
    | "homepage-startup"
    | "homepage-settings-open"
    | "homepage-section-switch"
    | "homepage-theme-switch";

export interface RuntimePerformanceSample {
    area: RuntimePerformanceArea;
    phase: string;
    elapsedMs: number;
    phaseDurationMs: number;
    recordedAt: string;
}

const MAX_SAMPLES = 80;
const samples: RuntimePerformanceSample[] = [];

function monotonicNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function createRuntimePerformanceTrace(area: RuntimePerformanceArea) {
    const startedAt = monotonicNow();
    let previousAt = startedAt;
    let finished = false;

    const checkpoint = (phase: string): void => {
        if (finished) return;
        const now = monotonicNow();
        samples.push({
            area,
            phase,
            elapsedMs: Math.max(0, now - startedAt),
            phaseDurationMs: Math.max(0, now - previousAt),
            recordedAt: new Date().toISOString(),
        });
        if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
        previousAt = now;
    };

    return {
        checkpoint,
        finish(phase = "ready"): void {
            if (finished) return;
            checkpoint(phase);
            finished = true;
        },
    };
}

/** 返回副本，便于设置页或问题诊断工具后续直接消费。 */
export function getRuntimePerformanceSnapshot(): RuntimePerformanceSample[] {
    return samples.map((sample) => ({ ...sample }));
}

export function clearRuntimePerformanceSnapshot(): void {
    samples.length = 0;
}

// Fixed numeric counters only; disabled diagnostics do not collect IDs or content.
const taskIndexMetrics = {
    databaseCommits: 0, rootsReceived: 0, rootsProcessed: 0,
    targetedRefreshes: 0, broadCleanups: 0, indexReads: 0,
    readParseMs: 0, mergeCompareMs: 0, indexWrites: 0,
    writeBytes: 0, writeMs: 0, noopWritesSkipped: 0,
    dataUpdatedEvents: 0, workspaceRefreshes: 0,
};
let taskIndexDiagnosticsEnabled = false;
export function recordTaskIndexMetric(key: keyof typeof taskIndexMetrics, value = 1): void {
    if (taskIndexDiagnosticsEnabled && Number.isFinite(value)) taskIndexMetrics[key] += value;
}
export function taskIndexMeasurementStart(): number | undefined {
    return taskIndexDiagnosticsEnabled ? monotonicNow() : undefined;
}
export function finishTaskIndexMeasurement(key: "readParseMs" | "mergeCompareMs" | "writeMs", start: number | undefined): void {
    if (start !== undefined) recordTaskIndexMetric(key, Math.max(0, monotonicNow() - start));
}
export const taskIndexDiagnostics = {
    enable(enabled = true): void { taskIndexDiagnosticsEnabled = enabled; },
    snapshot() { return { enabled: taskIndexDiagnosticsEnabled, ...taskIndexMetrics }; },
    reset(): void { for (const key of Object.keys(taskIndexMetrics)) taskIndexMetrics[key] = 0; },
};
