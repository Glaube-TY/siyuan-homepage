/** 同一 key 严格串行、失败后仍可继续的轻量写入队列。 */
const tails = new Map<string, Promise<void>>();

export function enqueueStorageWrite<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.then(() => undefined, () => undefined);
  tails.set(key, tail);
  void tail.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

export async function flushStorageWrites(): Promise<void> {
  await Promise.all([...tails.values()]);
}
