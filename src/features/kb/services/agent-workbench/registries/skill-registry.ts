/**
 * SkillRegistry — registers and provides enabled skill prompt sections.
 */

import type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
} from "../contracts/skill-contract";

export type SkillSource = "builtin" | "user" | "mcp";

interface RegisteredSkill {
  skill: SkillContract;
  source: SkillSource;
  registeredAt: number;
}

export class SkillRegistry {
  private readonly skills = new Map<string, RegisteredSkill>();

  registerSkill(skill: SkillContract, source: SkillSource = "builtin"): void {
    if (!skill?.name) {
      throw new Error("[SkillRegistry] Skill must have a name.");
    }
    if (this.skills.has(skill.name)) {
      throw new Error(
        `[SkillRegistry] Skill "${skill.name}" is already registered. ` +
          `Call unregisterSkill first to replace it.`,
      );
    }
    this.skills.set(skill.name, { skill, source, registeredAt: Date.now() });
  }

  /** Idempotent: register if not exists, replace if already present. */
  ensureSkill(skill: SkillContract, source: SkillSource = "builtin"): void {
    this.skills.set(skill.name, { skill, source, registeredAt: Date.now() });
  }

  unregisterSkill(name: string): boolean {
    return this.skills.delete(name);
  }

  unregisterSkillsBySource(source: SkillSource): number {
    let count = 0;
    for (const [name, entry] of this.skills) {
      if (entry.source === source) {
        this.skills.delete(name);
        count++;
      }
    }
    return count;
  }

  replaceSkillsBySource(
    source: SkillSource,
    newSkills: readonly SkillContract[],
  ): { ok: true; replaced: number } | { ok: false; error: string } {
    const nameSet = new Set<string>();
    for (const s of newSkills) {
      if (!s?.name) return { ok: false, error: "Skill must have a name." };
      if (nameSet.has(s.name)) return { ok: false, error: `Duplicate skill name: ${s.name}` };
      nameSet.add(s.name);
    }
    for (const name of nameSet) {
      const existing = this.skills.get(name);
      if (existing && existing.source !== source) {
        return { ok: false, error: `Skill name conflict with other source: ${name}` };
      }
    }
    this.unregisterSkillsBySource(source);
    for (const s of newSkills) {
      this.skills.set(s.name, { skill: s, source, registeredAt: Date.now() });
    }
    return { ok: true, replaced: newSkills.length };
  }

  listSkills(): SkillContract[] {
    return Array.from(this.skills.values())
      .map((e) => e.skill)
      .sort((a, b) => b.priority - a.priority);
  }

  getEnabledSkills(ctx: SkillRuntimeContext): SkillContract[] {
    const disabled = ctx.userDisabledSkillNames
      ? new Set(ctx.userDisabledSkillNames)
      : null;
    const enabled = ctx.userEnabledSkillNames && ctx.userEnabledSkillNames.length > 0
      ? new Set(ctx.userEnabledSkillNames)
      : null;
    return Array.from(this.skills.values())
      .filter((entry) => {
        if (disabled?.has(entry.skill.name)) return false;
        // If explicit enabled list is provided, use it as whitelist.
        // If no explicit list, all registered skills are considered enabled.
        if (enabled) return enabled.has(entry.skill.name);
        return true;
      })
      .map((e) => e.skill)
      .sort((a, b) => b.priority - a.priority);
  }

  /** Get a registered skill by name, regardless of enabled state. */
  getRegisteredSkill(name: string): SkillContract | undefined {
    return this.skills.get(name)?.skill;
  }

  buildSkillPromptSections(ctx: SkillRuntimeContext): SkillPromptSection[] {
    const enabledSkills = this.getEnabledSkills(ctx);

    return enabledSkills
      .map((skill) => {
        const section = skill.buildPromptSection(ctx);
        return {
          ...section,
          meta: {
            ...section.meta,
            skillName: section.meta?.skillName ?? skill.name,
          },
        };
      })
      .sort((a, b) => b.priority - a.priority);
  }

  getSkillPromptSection(name: string, ctx: SkillRuntimeContext): SkillPromptSection | undefined {
    const entry = this.skills.get(name);
    if (!entry) return undefined;
    const disabled = ctx.userDisabledSkillNames
      ? new Set(ctx.userDisabledSkillNames)
      : null;
    const enabled = ctx.userEnabledSkillNames && ctx.userEnabledSkillNames.length > 0
      ? new Set(ctx.userEnabledSkillNames)
      : null;
    if (disabled?.has(entry.skill.name)) return undefined;
    if (enabled && !enabled.has(entry.skill.name)) return undefined;
    return entry.skill.buildPromptSection(ctx);
  }

}
