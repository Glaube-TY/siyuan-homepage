export interface AppendOnlyLogEntry<T> {
  id: number;
  timestamp: number;
  value: T;
}

export class AppendOnlyLog<T> {
  private nextId = 1;
  private readonly entries: AppendOnlyLogEntry<T>[] = [];

  append(value: T): AppendOnlyLogEntry<T> {
    const entry = {
      id: this.nextId++,
      timestamp: Date.now(),
      value,
    };
    this.entries.push(entry);
    return entry;
  }

  all(): T[] {
    return this.entries.map((entry) => entry.value);
  }

  entriesSnapshot(): AppendOnlyLogEntry<T>[] {
    return this.entries.slice();
  }

  size(): number {
    return this.entries.length;
  }
}

