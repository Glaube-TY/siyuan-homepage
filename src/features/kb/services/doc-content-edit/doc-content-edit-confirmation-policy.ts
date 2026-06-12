/**
 * 文档内容编辑确认策略
 *
 * 轻量 helper — 只决定是否需要弹出 UI 确认弹窗。
 * 不影响参数校验、目标存在性校验、执行器二次安全校验。
 * Agent 不感知此策略，Tool schema 不包含相关字段。
 */

import type { KbDangerousSkillToolName, KbSettings } from "../../types/settings";

/**
 * 判断指定危险工具是否需要执行前确认。
 * 默认所有危险工具都需要确认（disabledDangerousSkillToolConfirmationNames 为 undefined 或空数组时返回 true）。
 * 只有用户显式在该列表中关闭的工具才会跳过确认。
 */
export function shouldRequireDocContentEditConfirmation(
  settings: Partial<KbSettings> | undefined,
  toolName: KbDangerousSkillToolName,
): boolean {
  const disabled = settings?.toolSettings?.disabledDangerousSkillToolConfirmationNames ?? [];
  return !disabled.includes(toolName);
}
