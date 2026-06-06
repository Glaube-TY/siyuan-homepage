/**
 * ObservationLog — append-only observation accumulator.
 * Planner reads observations from here each turn.
 */

import type { SkillObservation } from "../contracts/skill-contract";

export interface ObservationEntry {
  id: number;
  timestamp: number;
  kind: SkillObservation["kind"];
  toolName?: string;
  reasonCode?: string;
  summary?: string;
  content?: unknown;
}

let globalIdCounter = 0;

export class ObservationLog {
  private readonly entries: ObservationEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 200) {
    this.maxEntries = maxEntries;
  }

  push(input: SkillObservation): ObservationEntry {
    const entry: ObservationEntry = {
      id: ++globalIdCounter,
      timestamp: Date.now(),
      kind: input.kind,
      toolName: input.toolName,
      reasonCode: input.reasonCode,
      summary: input.summary,
      content: input.content,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    return entry;
  }

  /** All entries */
  all(): readonly ObservationEntry[] {
    return this.entries.slice();
  }

  /** Recent N entries */
  tail(n: number): readonly ObservationEntry[] {
    if (n <= 0) return [];
    return this.entries.slice(-n);
  }

  /** Get observations for planner — all current-turn entries */
  getPlannerObservations(): SkillObservation[] {
    return this.entries.map((e) => ({
      kind: e.kind,
      toolName: e.toolName,
      reasonCode: e.reasonCode,
      summary: e.summary,
      content: e.content,
    }));
  }

  /** Call counts per tool name */
  callCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      if (!e.toolName) continue;
      out[e.toolName] = (out[e.toolName] ?? 0) + 1;
    }
    return out;
  }

  reset(): void {
    this.entries.length = 0;
  }
}
