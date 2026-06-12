export interface AgentActionMemoryEntry {
  toolName: string;
  ok: boolean;
  readOnly: boolean;
  summary: string;
  errorCode?: string;
  at: number;
}

export class AgentActionMemory {
  private readonly entries: AgentActionMemoryEntry[] = [];

  push(entry: AgentActionMemoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 50) {
      this.entries.splice(0, this.entries.length - 50);
    }
  }

  snapshot(): AgentActionMemoryEntry[] {
    return this.entries.slice();
  }
}

