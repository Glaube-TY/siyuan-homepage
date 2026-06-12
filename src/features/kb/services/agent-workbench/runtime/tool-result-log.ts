/**
 * ToolResultLog — append-only tool execution result accumulator.
 * The Agent reads tool results from here each turn.
 */

import type { SkillContextEvidence } from "../contracts/skill-contract";

export interface ToolResultEntry {
  id: number;
  timestamp: number;
  kind: SkillContextEvidence["kind"];
  toolName?: string;
  reasonCode?: string;
  summary?: string;
  content?: unknown;
}

let globalIdCounter = 0;

export class ToolResultLog {
  private readonly entries: ToolResultEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 200) {
    this.maxEntries = maxEntries;
  }

  push(input: SkillContextEvidence): ToolResultEntry {
    const entry: ToolResultEntry = {
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
  all(): readonly ToolResultEntry[] {
    return this.entries.slice();
  }

  /** Recent N entries */
  tail(n: number): readonly ToolResultEntry[] {
    if (n <= 0) return [];
    return this.entries.slice(-n);
  }

  /** Get evidence for the Agent context — all current-turn entries */
  getContextEvidence(): SkillContextEvidence[] {
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
