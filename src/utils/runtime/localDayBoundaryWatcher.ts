import { formatLocalDate } from "@/components/tools/date-utils";

export function createLocalDayBoundaryWatcher(
  callback: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastDate = formatLocalDate(new Date());
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
    );
    timer = setTimeout(
      () => {
        lastDate = formatLocalDate(new Date());
        callback();
        schedule();
      },
      Math.max(1000, next.getTime() - now.getTime()),
    );
  };
  const visible = () => {
    if (document.visibilityState !== "visible") return;
    const current = formatLocalDate(new Date());
    if (current !== lastDate) {
      lastDate = current;
      callback();
    }
    schedule();
  };
  document.addEventListener("visibilitychange", visible);
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", visible);
  };
}
