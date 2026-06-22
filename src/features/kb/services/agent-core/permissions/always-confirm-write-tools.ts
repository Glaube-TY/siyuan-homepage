/**
 * 写工具强制确认名单
 *
 * 已废弃：数据库写工具不再强制锁定确认，与其他写工具一样默认开启但可关闭。
 * 保留此文件以兼容现有 import，但集合为空。
 */

/** 必须始终确认的写工具名称集合（当前为空） */
export const ALWAYS_CONFIRM_WRITE_TOOL_NAMES = new Set<string>();

/** 判断指定工具是否属于强制确认写工具（当前始终返回 false） */
export function isAlwaysConfirmWriteToolName(_toolName: string): boolean {
  return false;
}
