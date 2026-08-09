import { createRuntimeUuid } from "@/libs/runtime-id";

/** 生成机器人 ID（环境无关，Kernel Goja、Docker HTTP 和桌面端均可用）。 */
export function createRobotId(): string {
  return createRuntimeUuid();
}
