import {
  ensureTaskIndexInitialized,
  getTaskIndexResult,
  refreshTaskIndexFromRecentDocuments,
  type ComponentDataResult,
  type ComponentTaskInfo,
} from "@/components/tools/siyuanComponentDataApi";

export interface TaskDataProvider {
  id: string;
  load(plugin: any, notebookIds: string[]): Promise<ComponentDataResult<ComponentTaskInfo>>;
}

export interface LoadTaskDataOptions {
  notebookIds?: string[];
  refresh?: boolean;
  forceRefresh?: boolean;
}

const extraProviders = new Map<string, TaskDataProvider>();
const indexProvider: TaskDataProvider = {
  id: "local-index",
  load: (plugin, notebookIds) => getTaskIndexResult(notebookIds, plugin),
};

let preparationFlight: Promise<{ ok: boolean; message?: string }> | null = null;
let preparationFlightForce = false;

export function registerTaskDataProvider(provider: TaskDataProvider): () => void {
  if (!/^[a-z][a-z0-9_-]{1,47}$/.test(provider.id)) throw new Error(`非法任务数据源 ID: ${provider.id}`);
  extraProviders.set(provider.id, provider);
  return () => extraProviders.delete(provider.id);
}

async function prepareTaskData(plugin: any, forceRefresh: boolean): Promise<{ ok: boolean; message?: string }> {
  const running = preparationFlight;
  if (running) {
    if (!forceRefresh || preparationFlightForce) return running;
    await running.catch(() => undefined);
    return prepareTaskData(plugin, true);
  }
  const flight = (async () => {
    const initialization = await ensureTaskIndexInitialized(plugin);
    if (initialization.status.lastStatus === "error") {
      return { ok: false, message: initialization.status.lastMessage || "任务索引初始化失败。" };
    }
    const refresh = await refreshTaskIndexFromRecentDocuments(plugin, { force: forceRefresh });
    return refresh.lastStatus === "error"
      ? { ok: false, message: refresh.lastMessage || "任务索引增量刷新失败。" }
      : { ok: true };
  })();
  preparationFlight = flight;
  preparationFlightForce = forceRefresh;
  try {
    return await flight;
  } finally {
    if (preparationFlight === flight) {
      preparationFlight = null;
      preparationFlightForce = false;
    }
  }
}

export async function loadTaskData(
  plugin?: any,
  options: LoadTaskDataOptions = {},
): Promise<ComponentDataResult<ComponentTaskInfo>> {
  const preparation = options.refresh === false
    ? { ok: true }
    : await prepareTaskData(plugin, options.forceRefresh === true);
  const providers = [indexProvider, ...extraProviders.values()];
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.load(plugin, options.notebookIds || [])),
  );
  const results = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  const byId = new Map<string, ComponentTaskInfo>();
  for (const task of results.flatMap((result) => result.items)) {
    const previous = byId.get(task.id);
    if (!previous || String(task.updated || "").localeCompare(String(previous.updated || "")) >= 0) byId.set(task.id, task);
  }
  const items = Array.from(byId.values()).sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
  const failed = settled.length - results.length;
  if (items.length > 0) {
    return {
      items,
      status: preparation.ok && failed === 0 ? "ok" : "limited",
      mode: extraProviders.size === 0 ? "index" : undefined,
      message: preparation.message || (failed > 0 ? `${failed} 个任务数据源读取失败。` : undefined),
    };
  }
  const fallback = results[0];
  return {
    items: [],
    status: preparation.ok && failed === 0 ? (fallback?.status || "empty") : "error",
    mode: fallback?.mode,
    message: preparation.message || fallback?.message || (failed > 0 ? "任务数据源读取失败。" : undefined),
  };
}
