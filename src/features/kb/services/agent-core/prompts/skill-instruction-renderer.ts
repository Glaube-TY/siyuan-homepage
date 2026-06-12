import type { SkillPromptSection } from "../../agent-workbench/contracts/skill-contract";

export function renderSkillInstructions(sections: readonly SkillPromptSection[]): string {
  if (sections.length === 0) return "";
  const blocks = ["# 技能说明",
    "以下技能仅提供能力边界和证据原则，不规定工具顺序或固定流程。"];
  for (const section of sections) {
    blocks.push(`## ${section.title}`);
    blocks.push(section.body);
  }
  return blocks.join("\n\n");
}

