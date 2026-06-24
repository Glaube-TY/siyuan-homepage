import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "资产管理";

const BODY = `【资产管理】

适用任务：查看/管理思源 assets（资源、OCR、标注、缺失/未使用检测）和受限工作区文件读写。

优先工具（只使用这些工具完成主任务）：
- siyuan_asset_read: 查看资源信息/内容/OCR/标注、缺失资源、未使用资源（全部只读）
- siyuan_asset_manage: 重命名资源、设置 OCR/标注、删除未使用资源、重建索引（写 action 需确认）
- siyuan_workspace_file: 受限工作区文件读写（路径限定 /data/assets、/data/templates、/data/widgets、/data/public、/data/storage/petal/siyuan-homepage）

环境限制：
- workspace file 的 put/remove/copy/rename 写操作在非 PC/Electron 环境不可用
- 如果工具返回"运行环境不支持"，这不是参数错误，是当前环境限制

避免工具（非本 Skill 职责）：
- 正文编辑工具 family: 不属于资产管理
- siyuan_sql_select: 不要默认用 SQL 查资产

使用规则：
1. 删除资源、重命名资源、OCR 写入、标注写入、workspace 文件写入/删除都必须确认
2. 路径越界时尊重错误提示，不要绕过
3. 不操作其他插件 storage、系统绝对路径、.. 路径
4. 工具返回失败时如实说明，不得声称成功

测试说明：测试本 Skill 时只测试资源查看、标注读取等只读主工具。写操作测试需要用户明确确认。`;

export const BUILTIN_ASSET_MANAGEMENT_SKILL_NAME = "builtin_asset_management";

export function createAssetManagementSkill(): SkillContract {
  return {
    name: BUILTIN_ASSET_MANAGEMENT_SKILL_NAME,
    title: TITLE,
    description: "管理思源 assets 和受限工作区文件。",
    priority: 80,
    enabledByDefault: false,
    intentKeywords: ["资产", "资源", "asset", "文件", "图片", "附件", "OCR", "标注", "workspace"],
    primaryToolNames: ["siyuan_asset_read", "siyuan_asset_manage", "siyuan_workspace_file"],
    helperToolNames: [],
    avoidToolNames: ["create_doc", "update_block", "insert_block", "delete_blocks", "replace_doc_content", "siyuan_sql_select"],
    usageRules: [
      "删除/重命名/写入资源必须确认",
      "workspace file 路径受限，越界时尊重错误",
      "非 PC/Electron 环境下写操作不可用，不是参数错误",
      "不操作其他插件 storage 或系统路径",
    ],
    examples: [
      "查看 data/assets 下的资源文件列表",
      "检查是否有未使用的资源",
      "给图片添加 OCR 文字",
      "统计某个资源文件的信息",
    ],
    testInstructions: ["测试本 Skill 时只测试资源查看、标注读取等只读主工具。写操作需要用户确认。"],

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 80,
        meta: {
          skillName: BUILTIN_ASSET_MANAGEMENT_SKILL_NAME,
          bytesEstimate: BODY.length,
          primaryToolNames: ["siyuan_asset_read", "siyuan_asset_manage", "siyuan_workspace_file"],
          helperToolNames: [],
          isPrimary: ctx.primarySkillName === BUILTIN_ASSET_MANAGEMENT_SKILL_NAME,
          isTestSkillMode: ctx.isTestSkillMode,
        },
      };
    },
  };
}
