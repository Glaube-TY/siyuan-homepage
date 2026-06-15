/**
 * 文档内容编辑确认策略
 *
 * 轻量 helper — 只决定是否需要弹出 UI 确认弹窗。
 * 不影响参数校验、目标存在性校验、执行器二次安全校验。
 * Agent 不感知此策略，Tool schema 不包含相关字段。
 *
 * 所有危险写工具始终需要确认。旧设置字段 disabledDangerousSkillToolConfirmationNames
 * 保留迁移兼容，但不再影响确认行为。
 */

import type { KbDangerousSkillToolName, KbSettings } from "../../types/settings";

/**
 * 判断指定危险工具是否需要执行前确认。
 * 始终返回 true — 所有危险写工具必须走 ToolPermissionGate 确认。
 */
export function shouldRequireDocContentEditConfirmation(
  _settings: Partial<KbSettings> | undefined,
  _toolName: KbDangerousSkillToolName,
): boolean {
  return true;
}
