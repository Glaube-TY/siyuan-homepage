import { mapWithConcurrency } from "@/utils/async/mapWithConcurrency";

export interface BackgroundScanTask {
  id: string;
  signals?: readonly string[];
  resolve(): Promise<{ enabled: boolean; intervalMs: number; run(): Promise<void> }>;
}

interface RegisteredTask {
  definition: BackgroundScanTask;
  nextAt: number;
  running: boolean;
  rerunRequested: boolean;
  stopped: boolean;
  cancelled: boolean;
}
const tasks = new Map<string, RegisteredTask>();
let timer: number | undefined;
let listening = false;
let pumpInFlight: Promise<void> | null = null;
const BACKGROUND_SCAN_CONCURRENCY = 2;

function schedule(): void {
  if (pumpInFlight) return;
  if (timer !== undefined) window.clearTimeout(timer);
  const dueTimes = [...tasks.values()]
    .filter((task) => !task.cancelled && !task.stopped && !task.running)
    .map((task) => task.nextAt)
    .filter(Number.isFinite);
  if (dueTimes.length === 0) { timer = undefined; return; }
  const next = Math.min(...dueTimes);
  timer = window.setTimeout(() => {
    timer = undefined;
    startPump();
  }, Math.max(0, Math.min(60_000, next - Date.now())));
}

function isRegisteredTask(task: RegisteredTask): boolean {
  return !task.cancelled && tasks.get(task.definition.id) === task;
}

function requestTaskWake(task: RegisteredTask): void {
  task.stopped = false;
  if (task.running) {
    task.rerunRequested = true;
    return;
  }
  task.rerunRequested = false;
  task.nextAt = Date.now();
}

async function runTask(task: RegisteredTask): Promise<void> {
  if (!isRegisteredTask(task) || task.stopped || task.running) return;
  task.running = true;
  let nextAt = Date.now() + 60_000;
  try {
    const resolved = await task.definition.resolve();
    if (!isRegisteredTask(task) || task.stopped) return;
    nextAt = resolved.enabled ? Date.now() + Math.max(1_000, resolved.intervalMs) : Number.POSITIVE_INFINITY;
    if (resolved.enabled) await resolved.run();
  } catch (error) {
    nextAt = Date.now() + 60_000;
    console.error(`[background-scheduler] ${task.definition.id} failed`, error);
  } finally {
    task.running = false;
    if (isRegisteredTask(task)) {
      if (task.stopped) {
        task.rerunRequested = false;
        task.nextAt = Number.POSITIVE_INFINITY;
      } else if (task.rerunRequested) {
        task.rerunRequested = false;
        task.nextAt = Date.now();
      } else {
        task.nextAt = nextAt;
      }
    }
  }
}

async function pump(): Promise<void> {
  const now = Date.now();
  await mapWithConcurrency(
    [...tasks.values()].filter((task) =>
      isRegisteredTask(task)
      && !task.stopped
      && !task.running
      && task.nextAt <= now,
    ),
    BACKGROUND_SCAN_CONCURRENCY,
    runTask,
  );
}

function finishPump(inFlight: Promise<void>): void {
  if (pumpInFlight !== inFlight) return;
  pumpInFlight = null;
  schedule();
}

function startPump(): void {
  if (pumpInFlight) return;
  const inFlight = Promise.resolve().then(() => pump());
  pumpInFlight = inFlight;
  void inFlight.then(
    () => finishPump(inFlight),
    (error) => {
      console.error("[background-scheduler] pump failed", error);
      finishPump(inFlight);
    },
  );
}

function wake(): void { for (const task of tasks.values()) requestTaskWake(task); schedule(); }
function wakeWhenVisible(): void { if (document.visibilityState === "visible") wake(); }
function ensureListeners(): void { if (!listening) { listening = true; window.addEventListener("online", wake); document.addEventListener("visibilitychange", wakeWhenVisible); } }
function cleanupListeners(): void { if (listening && tasks.size === 0) { listening = false; window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wakeWhenVisible); } }

export function registerBackgroundScanTask(definition: BackgroundScanTask): () => void {
  const task = tasks.get(definition.id) ?? {
    definition,
    nextAt: Date.now(),
    running: false,
    rerunRequested: false,
    stopped: false,
    cancelled: false,
  };
  if (tasks.has(definition.id)) requestTaskWake(task);
  else tasks.set(definition.id, task);
  ensureListeners();
  const signalHandler = () => signalBackgroundScanTask(definition.id);
  for (const signal of definition.signals ?? []) window.addEventListener(signal, signalHandler);
  schedule();
  return () => {
    for (const signal of definition.signals ?? []) window.removeEventListener(signal, signalHandler);
    task.cancelled = true;
    task.stopped = true;
    task.rerunRequested = false;
    task.nextAt = Number.POSITIVE_INFINITY;
    if (tasks.get(definition.id) === task) tasks.delete(definition.id);
    cleanupListeners(); schedule();
  };
}

export function signalBackgroundScanTask(id: string): void {
  const task = tasks.get(id);
  if (task) requestTaskWake(task);
  schedule();
}

export function stopBackgroundScanTask(id: string): void {
  const task = tasks.get(id);
  if (task) {
    task.stopped = true;
    task.rerunRequested = false;
    task.nextAt = Number.POSITIVE_INFINITY;
  }
  schedule();
}
