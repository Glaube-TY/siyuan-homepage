export interface AgentTargetIndexEntry {
  docId?: string;
  blockId?: string;
  title?: string;
  lastToolName?: string;
  at: number;
}

export class AgentTargetIndex {
  private readonly entries: AgentTargetIndexEntry[] = [];

  add(entry: AgentTargetIndexEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 100) {
      this.entries.splice(0, this.entries.length - 100);
    }
  }

  list(): AgentTargetIndexEntry[] {
    return this.entries.slice();
  }
}

