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
    const enabled = ctx.userEnabledSkillNames
      ? new Set(ctx.userEnabledSkillNames)
      : null;
    const disabled = ctx.userDisabledSkillNames
      ? new Set(ctx.userDisabledSkillNames)
      : null;
    return Array.from(this.skills.values())
      .filter((entry) => {
        if (disabled?.has(entry.skill.name)) return false;
        if (enabled?.has(entry.skill.name)) return true;
        return entry.skill.enabledByDefault;
      })
      .map((e) => e.skill)
      .sort((a, b) => b.priority - a.priority);
  }

  buildSkillPromptSections(ctx: SkillRuntimeContext): SkillPromptSection[] {
    return this.getEnabledSkills(ctx).map((s) => s.buildPromptSection(ctx));
  }

  getSkillPromptSection(name: string, ctx: SkillRuntimeContext): SkillPromptSection | undefined {
    const entry = this.skills.get(name);
    if (!entry) return undefined;
    const enabled = ctx.userEnabledSkillNames
      ? new Set(ctx.userEnabledSkillNames)
      : null;
    const disabled = ctx.userDisabledSkillNames
      ? new Set(ctx.userDisabledSkillNames)
      : null;
    if (disabled?.has(entry.skill.name)) return undefined;
    if (enabled && !enabled.has(entry.skill.name)) return undefined;
    if (!enabled && !entry.skill.enabledByDefault) return undefined;
    return entry.skill.buildPromptSection(ctx);
  }

}
