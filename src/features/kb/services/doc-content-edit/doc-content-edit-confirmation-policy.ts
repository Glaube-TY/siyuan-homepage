/**
 * 文档内容编辑确认策略
 *
 * 轻量 helper — 只决定是否需要弹出 UI 确认弹窗。
 * 不影响参数校验、目标存在性校验、执行器二次安全校验。
 * Agent 不感知此策略，Tool schema 不包含相关字段。
 *
 * 写工具默认需要用户确认；用户可通过 disabledWriteToolConfirmationNames 显式设为可信免确认。
 * 即使免确认，也必须保留 preview、安全校验和真实工具结果回填。
 * 旧设置字段 disabledDangerousSkillToolConfirmationNames 保留迁移兼容。
 */

import type { KbDangerousSkillToolName, KbSettings } from "../../types/settings";

/**
 * 判断指定危险工具是否需要执行前确认。
 * 该旧 helper 保持兼容，始终返回 true。
 * 真实确认/免确认策略由 Native ToolPermissionGate 和 disabledWriteToolConfirmationNames 控制。
 */
export function shouldRequireDocContentEditConfirmation(
  _settings: Partial<KbSettings> | undefined,
  _toolName: KbDangerousSkillToolName,
): boolean {
  return true;
}
