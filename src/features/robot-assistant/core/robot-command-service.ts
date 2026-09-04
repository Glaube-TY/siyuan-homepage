/**
 * 机器人内部命令识别（平台无关，纯函数）。
 * 普通文本默认交给 Agent；仅少数机器人自身命令在此处理。
 */

export type RobotInternalCommand =
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "new_session" }
  | { kind: "cancel" }
  | { kind: "confirm" };

const COMMAND_MAP: Array<{ kind: RobotInternalCommand["kind"]; aliases: string[] }> = [
  { kind: "help", aliases: ["帮助", "#help", "帮助菜单"] },
  { kind: "status", aliases: ["状态", "#status"] },
  { kind: "new_session", aliases: ["新会话", "#new"] },
  { kind: "cancel", aliases: ["取消", "#cancel"] },
  { kind: "confirm", aliases: ["确认", "#confirm"] },
];

export function parseRobotCommand(text: string): RobotInternalCommand | null {
  const normalized = typeof text === "string" ? text.trim().toLowerCase() : "";
  if (!normalized) return null;
  for (const entry of COMMAND_MAP) {
    if (entry.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return { kind: entry.kind };
    }
  }
  return null;
}

export type RobotConfirmationReply = "confirm" | "cancel";

export function parseRobotConfirmationReply(text: string): RobotConfirmationReply | null {
  const normalized = typeof text === "string" ? text.trim().toLowerCase() : "";
  if (normalized === "确认" || normalized === "1" || normalized === "y") return "confirm";
  if (normalized === "取消" || normalized === "0" || normalized === "f") return "cancel";
  return null;
}
