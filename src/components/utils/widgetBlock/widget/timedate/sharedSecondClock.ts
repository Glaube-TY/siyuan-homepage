type SecondClockSubscriber = (now: Date) => void;

const subscribers = new Set<SecondClockSubscriber>();
let timer: ReturnType<typeof setTimeout> | null = null;
let visibilityListening = false;

function clearClockTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
}

function emitNow(): void {
    const now = new Date();
    for (const subscriber of subscribers) subscriber(now);
}

function scheduleNextTick(): void {
    clearClockTimer();
    if (subscribers.size === 0 || document.visibilityState === "hidden") return;
    const delay = Math.max(50, 1000 - (Date.now() % 1000) + 8);
    timer = setTimeout(() => {
        timer = null;
        emitNow();
        scheduleNextTick();
    }, delay);
}

function handleVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
        clearClockTimer();
        return;
    }
    emitNow();
    scheduleNextTick();
}

function ensureVisibilityListener(): void {
    if (visibilityListening) return;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityListening = true;
}

function releaseVisibilityListenerIfIdle(): void {
    if (!visibilityListening || subscribers.size > 0) return;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    visibilityListening = false;
}

/**
 * 所有时钟组件共享同一个与整秒对齐的计时源；页面隐藏时自动暂停。
 */
export function subscribeSharedSecondClock(subscriber: SecondClockSubscriber): () => void {
    subscribers.add(subscriber);
    ensureVisibilityListener();
    subscriber(new Date());
    scheduleNextTick();

    return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) clearClockTimer();
        releaseVisibilityListenerIfIdle();
    };
}
