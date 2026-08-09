/** 生成机器人 ID（环境无关，Kernel Goja 可用）。优先 crypto.randomUUID，否则回退随机串。 */
export function createRobotId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return `robot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
