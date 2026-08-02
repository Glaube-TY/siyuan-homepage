export const WORKBENCH_CHECKPOINT_MIN_INTERVAL_MS = 1000;

export type WorkbenchCheckpointEventType =
  | "tool_result"
  | "permission_resolved"
  | "assistant_final";

/**
 * 工具结果可能在一个并行批次内密集返回。逐条写会话只会堆积过时快照，
 * 并让界面在模型已经结束后仍长时间等待保存队列。
 */
export function shouldEnqueueWorkbenchCheckpoint(params: {
  eventType: WorkbenchCheckpointEventType;
  lastCheckpointAt: number;
  now: number;
}): boolean {
  if (params.eventType === "permission_resolved") return true;
  return params.now - params.lastCheckpointAt >= WORKBENCH_CHECKPOINT_MIN_INTERVAL_MS;
}
