import type { SkillPromptSection } from "../../agent-workbench/contracts/skill-contract";

export function renderSkillInstructions(sections: readonly SkillPromptSection[]): string {
  if (sections.length === 0) return "";

  const blocks: string[] = ["# 技能说明", "以下 Skill 仅提供能力边界和证据原则。"];
  for (const section of [...sections].sort((a, b) => b.priority - a.priority)) {
    blocks.push(`## ${section.title}`);
    blocks.push(section.body);
  }

  return blocks.join("\n");
}
