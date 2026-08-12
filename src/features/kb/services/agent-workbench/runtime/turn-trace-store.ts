/**
 * TurnTraceStore — bounded ring buffer for turn traces.
 * Pure data store. No window writes (__kbAgentDebug handles that).
 * Not visible to the agent prompt.
 */

import type { AgentTokenUsage } from "../../../../agent-platform/agent-run-protocol";
import type { AgentContextManifest } from "./agent-context-ledger";

export interface TurnTrace {
  sessionId: string;
  runId: string;
  correlationId: string;
  turnId: string;
  providerId?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  status: string;
  steps: number;
  providerRequestCount?: number;
  usage?: AgentTokenUsage;
  /** 来源级估算；实际模型 token 以 usage 为准。 */
  contextManifest?: AgentContextManifest;
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
    providerFinishReason?: string;
    outputChars?: number;
    eventId?: string;
    modelStepIndex?: number;
    usage?: AgentTokenUsage;
    errorCategory?: string;
    retryable?: boolean;
    retryAfterMs?: number;
    safeToReplay?: boolean;
    sideEffectState?: string;
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
