/**
 * 在限制并发数的前提下执行异步映射，并保持返回结果顺序。
 *
 * 这里不吞掉单项错误：调用方仍能用一次失败中止整批事务，适合主页这类
 * “全部读取稳定后再切换 UI”的场景。
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const safeLimit = Math.max(1, Math.floor(limit || 1));
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index], index);
        }
    }

    await Promise.all(Array.from(
        { length: Math.min(safeLimit, items.length) },
        () => worker(),
    ));
    return results;
}
