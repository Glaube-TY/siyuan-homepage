export interface LatestWinsAsyncQueue<T> {
    enqueue: (value: T) => Promise<void>;
}

export interface LatestWinsAsyncQueueOptions {
    scheduleDrain?: (drain: () => void) => void;
}

export function createLatestWinsAsyncQueue<T>(
    persist: (value: T) => Promise<void>,
    merge: (current: T, next: T) => T,
    options: LatestWinsAsyncQueueOptions = {},
): LatestWinsAsyncQueue<T> {
    let running = false;
    let scheduled = false;
    let pending: T | undefined;
    let waiters: Array<{
        resolve: () => void;
        reject: (reason: unknown) => void;
    }> = [];
    const scheduleDrain = options.scheduleDrain ?? ((drain: () => void) => drain());

    const drain = async (): Promise<void> => {
        if (running || pending === undefined) return;
        running = true;
        const next = pending;
        pending = undefined;
        const batchWaiters = waiters;
        waiters = [];
        try {
            await persist(next);
            batchWaiters.forEach(({ resolve }) => resolve());
        } catch (error) {
            batchWaiters.forEach(({ reject }) => reject(error));
        } finally {
            running = false;
            requestDrain();
        }
    };

    function requestDrain(): void {
        if (running || scheduled || pending === undefined) return;
        scheduled = true;
        try {
            scheduleDrain(() => {
                scheduled = false;
                void drain();
            });
        } catch {
            scheduled = false;
            void drain();
        }
    }

    return {
        enqueue(value: T): Promise<void> {
            pending = pending === undefined ? value : merge(pending, value);
            const result = new Promise<void>((resolve, reject) => {
                waiters.push({ resolve, reject });
            });
            requestDrain();
            return result;
        },
    };
}
