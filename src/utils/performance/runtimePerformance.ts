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
