const queues = new Map<string, Promise<unknown>>();

function hashLockName(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function notificationLockName(scope: string, key: string): string {
  return `siyuan-homepage:notification-center:${scope}:${hashLockName(key)}`;
}

export async function withNotificationLock<T>(name: string, callback: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) {
    return locks.request(name, { mode: "exclusive" }, callback);
  }

  const previous = queues.get(name) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => gate);
  queues.set(name, queued);
  await previous.catch(() => undefined);
  try {
    return await callback();
  } finally {
    release?.();
    if (queues.get(name) === queued) queues.delete(name);
  }
}

