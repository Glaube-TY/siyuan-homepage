/**
 * Register user markdown skills: 加载并注册用户 markdown skill。
 */

import type { SkillRegistry } from "../../workbench/registries/skill-registry";
import type { SkillLoadContext } from "../../workbench/contracts/skill-source";
import { MarkdownSkillLoader } from "./markdown-skill-loader";
import type { UserSkillStorageAdapter, UserSkillLoadDiagnostic } from "../../shared/user-skill/user-skill-loader-types";

export interface RegisterUserSkillsResult {
  registered: number;
  diagnostics: UserSkillLoadDiagnostic[];
}

export async function registerUserMarkdownSkills(
  skillRegistry: SkillRegistry,
  adapter: UserSkillStorageAdapter,
  ctx: SkillLoadContext = {},
): Promise<RegisterUserSkillsResult> {
  const loader = new MarkdownSkillLoader(adapter);
  const { skills, diagnostics } = await loader.loadSkillsWithDiagnostics(ctx);

  const result = skillRegistry.replaceSkillsBySource("user", skills);
  if (result.ok === false) {
    diagnostics.push({
      entryId: "",
      filename: "",
      level: "error",
      code: "REPLACE_FAILED",
      message: "Failed to replace user skills.",
    });
    return { registered: 0, diagnostics };
  }

  return { registered: result.replaced, diagnostics };
}
