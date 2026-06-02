/**
 * SkillSource: Skill 来源抽象。
 */

import type { SkillContract } from "./skill-contract";

export interface SkillLoadContext {}

export interface SkillSourceLoader {
  readonly name: string;
  loadSkills(ctx: SkillLoadContext): Promise<SkillContract[]>;
}
