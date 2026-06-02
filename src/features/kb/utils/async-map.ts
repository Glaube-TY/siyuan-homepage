/**
 * Async Map Utilities
 *
 * 职责：
 * - 提供带并发限制的异步 map 函数
 * - 保持结果顺序
 * - 所有任务都必须 await 完成
 */

/**
 * 带并发限制的异步 map
 * @param items 待处理的数组
 * @param limit 并发数限制
 * @param mapper 映射函数
 * @returns 处理后的结果数组
 *
 * 注意：
 * - 保持结果顺序
 * - 所有任务都必须 await 完成
 * - 单个任务是否 catch，由 mapper 内部决定；不要在 helper 中吞错
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.floor(limit || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(safeLimit, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}
