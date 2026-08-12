import { registerBackgroundScanTask, signalBackgroundScanTask, stopBackgroundScanTask } from "@/features/background-runtime/background-scheduler";

export interface NotificationScanSchedulerOptions<T> {
  id: string;
  signals: readonly string[];
  load(): Promise<T>;
  resolve(settings: T): Promise<{ enabled: boolean; intervalMs: number }>;
  scan(settings: T): Promise<void>;
}

export function createNotificationScanScheduler<T>(options: NotificationScanSchedulerOptions<T>) {
  let unregister: (() => void) | undefined;
  return {
    start(): void {
      if (unregister) { signalBackgroundScanTask(options.id); return; }
      unregister = registerBackgroundScanTask({
        id: options.id,
        signals: options.signals,
        async resolve() {
          const settings = await options.load();
          const state = await options.resolve(settings);
          return { ...state, run: () => options.scan(settings) };
        },
      });
    },
    stop(): void { stopBackgroundScanTask(options.id); },
    destroy(): void { unregister?.(); unregister = undefined; },
  };
}
