/**
 * TurnTraceStore — bounded ring buffer for turn traces.
 * Pure data store. No window writes (__kbAgentDebug handles that).
 * Not visible to the planner.
 */

export interface TurnTrace {
  turnId: string;
  finishedAt: number;
  status: string;
  steps: number;
  events: Array<{
    type: string;
    stepIndex?: number;
    toolName?: string;
    ok?: boolean;
    durationMs?: number;
    argsPreview?: Record<string, unknown>;
    outputSummary?: string;
    message?: string;
    status?: string;
    errorCode?: string;
  }>;
}

const MAX_RECENT_TRACES = 3;

let lastTrace: TurnTrace | null = null;
const recentTraces: TurnTrace[] = [];

export function saveTurnTrace(trace: TurnTrace): void {
  lastTrace = trace;
  recentTraces.push(trace);
  while (recentTraces.length > MAX_RECENT_TRACES) {
    recentTraces.shift();
  }
}

export function getLastTurnTrace(): TurnTrace | null {
  return lastTrace;
}

export function getRecentTurnTraces(): TurnTrace[] {
  return recentTraces.slice();
}

export function clearTurnTraces(): void {
  lastTrace = null;
  recentTraces.length = 0;
}
