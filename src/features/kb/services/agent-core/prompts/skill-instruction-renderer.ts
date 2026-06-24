import type { SkillPromptSection } from "../../agent-workbench/contracts/skill-contract";

export function renderSkillInstructions(sections: readonly SkillPromptSection[]): string {
  if (sections.length === 0) return "";

  const primarySections = sections.filter((s) => s.meta?.isPrimary);
  const otherSections = sections.filter((s) => !s.meta?.isPrimary);

  const blocks: string[] = [];

  if (primarySections.length > 0) {
    const primary = primarySections[0];
    const isTest = primary.meta?.isTestSkillMode;
    blocks.push("# 技能路由");
    if (isTest) {
      blocks.push(
        `【当前主 Skill：${primary.title}】`,
        "",
        "⚠️ 测试模式：当前任务是测试该 Skill。请只使用该 Skill 的优先工具和辅助工具。",
        "不要调用知识库全文检索、文档编辑、SQL 或其他跨域工具来凑报告。",
        "",
      );
    } else {
      blocks.push(
        `【当前主 Skill：${primary.title}】`,
        "",
        "优先使用该 Skill 的优先工具和辅助工具。除非用户明确要求跨域，不要调用其他 Skill 的工具。",
        "",
      );
    }
    blocks.push(`## ${primary.title}`);
    blocks.push(primary.body);
  }

  if (otherSections.length > 0) {
    if (primarySections.length > 0) {
      blocks.push("", "# 其他可用技能（摘要）", "");
    } else {
      blocks.push("# 技能说明", "以下技能仅提供能力边界和证据原则。");
    }
    for (const section of otherSections) {
      blocks.push(`## ${section.title}`);
      blocks.push(section.body);
    }
  }

  return blocks.join("\n");
}

