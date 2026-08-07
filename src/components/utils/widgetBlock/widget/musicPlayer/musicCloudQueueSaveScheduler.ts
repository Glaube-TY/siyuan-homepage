export class MusicCloudQueueSaveScheduler {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pending: { task: () => Promise<void>; onError: () => void } | null = null;
    private running = false;
    private generation = 0;

    constructor(private readonly delayMs = 1000) {}

    schedule(task: () => Promise<void>, onError: () => void): void {
        this.pending = { task, onError };
        if (this.timer) clearTimeout(this.timer);
        const generation = this.generation;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.drain(generation);
        }, this.delayMs);
    }

    cancel(): void {
        this.generation += 1;
        this.pending = null;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private async drain(generation: number): Promise<void> {
        if (generation !== this.generation || this.running) return;
        const pending = this.pending;
        if (!pending) return;
        this.pending = null;
        this.running = true;
        try {
            await pending.task();
        } catch {
            pending.onError();
        } finally {
            this.running = false;
            if (this.pending) {
                if (this.timer) clearTimeout(this.timer);
                const nextGeneration = this.generation;
                this.timer = setTimeout(() => {
                    this.timer = null;
                    void this.drain(nextGeneration);
                }, 0);
            }
        }
    }
}
