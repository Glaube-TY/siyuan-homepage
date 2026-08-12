export interface BackgroundScanTask {
  id: string;
  signals?: readonly string[];
  resolve(): Promise<{ enabled: boolean; intervalMs: number; run(): Promise<void> }>;
}

interface RegisteredTask { definition: BackgroundScanTask; nextAt: number; running: boolean }

const tasks = new Map<string, RegisteredTask>();
let timer: number | undefined;
let listening = false;

function schedule(): void {
  if (timer !== undefined) window.clearTimeout(timer);
  if (tasks.size === 0) { timer = undefined; return; }
  const next = Math.min(...[...tasks.values()].map((task) => task.nextAt));
  timer = window.setTimeout(() => void pump(), Math.max(0, Math.min(60_000, next - Date.now())));
}

async function runTask(task: RegisteredTask): Promise<void> {
  if (task.running) return;
  task.running = true;
  try {
    const resolved = await task.definition.resolve();
    task.nextAt = resolved.enabled ? Date.now() + Math.max(1_000, resolved.intervalMs) : Number.POSITIVE_INFINITY;
    if (resolved.enabled) await resolved.run();
  } catch (error) {
    task.nextAt = Date.now() + 60_000;
    console.error(`[automation-scheduler] ${task.definition.id} failed`, error);
  } finally {
    task.running = false;
  }
}

async function pump(): Promise<void> {
  timer = undefined;
  const now = Date.now();
  await Promise.all([...tasks.values()].filter((task) => task.nextAt <= now).map(runTask));
  schedule();
}

function onWindowSignal(): void {
  for (const task of tasks.values()) task.nextAt = Date.now();
  schedule();
}

function ensureListeners(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("online", onWindowSignal);
  window.addEventListener("visibilitychange", onWindowSignal);
}

function cleanupListeners(): void {
  if (!listening || tasks.size > 0) return;
  listening = false;
  window.removeEventListener("online", onWindowSignal);
  window.removeEventListener("visibilitychange", onWindowSignal);
}

export function registerBackgroundScanTask(definition: BackgroundScanTask): () => void {
  if (tasks.has(definition.id)) signalBackgroundScanTask(definition.id);
  else tasks.set(definition.id, { definition, nextAt: Date.now(), running: false });
  ensureListeners();
  const signalHandler = () => signalBackgroundScanTask(definition.id);
  for (const signal of definition.signals ?? []) window.addEventListener(signal, signalHandler);
  schedule();
  return () => {
    for (const signal of definition.signals ?? []) window.removeEventListener(signal, signalHandler);
    tasks.delete(definition.id);
    cleanupListeners();
    schedule();
  };
}

export function signalBackgroundScanTask(id: string): void {
  const task = tasks.get(id);
  if (!task) return;
  task.nextAt = Date.now();
  schedule();
}

export function stopBackgroundScanTask(id: string): void {
  const task = tasks.get(id);
  if (task) task.nextAt = Number.POSITIVE_INFINITY;
  schedule();
}
