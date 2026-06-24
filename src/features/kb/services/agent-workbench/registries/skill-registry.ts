/**
 * SkillRegistry — registers and provides enabled skill prompt sections.
 */

import type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
} from "../contracts/skill-contract";

export type SkillSource = "builtin" | "user" | "mcp";

export interface SkillRouteResult {
  primarySkillName: string | null;
  primarySkillTitle: string | null;
  matchedSkillIds: string[];
  reason: "explicit_skill_name" | "intent_keyword" | "default" | "none";
  isTestSkillMode: boolean;
}

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

  /**
   * Detect the primary skill for the current turn based on the user's question.
   * Returns null if no clear primary skill is identified.
   */
  detectPrimarySkill(ctx: SkillRuntimeContext): SkillRouteResult {
    const question = ctx.question?.trim() ?? "";
    const enabledSkills = this.getEnabledSkills(ctx);
    const isTestSkill = /测试|试验|验证/.test(question) && /skill|技能|能力/.test(question);

    // Phase 1: Check for explicit skill name mention
    for (const skill of enabledSkills) {
      const titleMatch = question.includes(skill.title);
      if (titleMatch) {
        return {
          primarySkillName: skill.name,
          primarySkillTitle: skill.title,
          matchedSkillIds: [skill.name],
          reason: "explicit_skill_name",
          isTestSkillMode: isTestSkill,
        };
      }
    }

    // Phase 2: Check intentKeywords
    const questionLower = question.toLowerCase().replace(/\s+/g, "");
    const matches: Array<{ skill: SkillContract; score: number }> = [];
    for (const skill of enabledSkills) {
      const keywords = skill.intentKeywords ?? [];
      let score = 0;
      for (const kw of keywords) {
        if (questionLower.includes(kw.toLowerCase().replace(/\s+/g, ""))) {
          score += kw.length;
        }
      }
      if (score > 0) {
        matches.push({ skill, score });
      }
    }
    matches.sort((a, b) => b.score - a.score);

    // If a single clear winner, use it
    if (matches.length === 1) {
      return {
        primarySkillName: matches[0].skill.name,
        primarySkillTitle: matches[0].skill.title,
        matchedSkillIds: matches.map((m) => m.skill.name),
        reason: "intent_keyword",
        isTestSkillMode: isTestSkill,
      };
    }

    // If multiple matches, pick top 1-2
    if (matches.length >= 2) {
      const top = matches.slice(0, 2);
      return {
        primarySkillName: top[0].skill.name,
        primarySkillTitle: top[0].skill.title,
        matchedSkillIds: top.map((m) => m.skill.name),
        reason: "intent_keyword",
        isTestSkillMode: isTestSkill,
      };
    }

    // Phase 3: No match — return enabled
    return {
      primarySkillName: null,
      primarySkillTitle: null,
      matchedSkillIds: enabledSkills.map((s) => s.name),
      reason: "default",
      isTestSkillMode: false,
    };
  }

  buildSkillPromptSections(ctx: SkillRuntimeContext): SkillPromptSection[] {
    const route = this.detectPrimarySkill(ctx);
    const primaryName = route.primarySkillName;
    const enabledSkills = this.getEnabledSkills(ctx);
    const primarySkill = primaryName ? enabledSkills.find((s) => s.name === primaryName) : null;

    // Inject routing info into ctx for skill buildPromptSection access
    const routingCtx: SkillRuntimeContext = {
      ...ctx,
      primarySkillName: primaryName ?? undefined,
      isTestSkillMode: route.isTestSkillMode,
    };

    const sections: SkillPromptSection[] = [];

    // Primary skill: full injection first
    if (primarySkill) {
      const section = primarySkill.buildPromptSection(routingCtx);
      sections.push({
        ...section,
        meta: { ...section.meta, isPrimary: true, isTestSkillMode: route.isTestSkillMode },
      });
    }

    // Other enabled skills: short summary only (1-2 lines), unless test mode forces full injection for matched
    for (const skill of enabledSkills) {
      if (skill.name === primaryName) continue; // Already injected
      const isMatched = route.matchedSkillIds.includes(skill.name);

      if (isMatched && route.reason !== "default") {
        // Secondary match: short summary
        const tools = [
          ...(skill.primaryToolNames ?? []).slice(0, 3),
          ...(skill.helperToolNames ?? []).slice(0, 2),
        ];
        sections.push({
          title: skill.title,
          body: `辅助 Skill：${skill.description} 主工具：${tools.join(", ")}。`,
          priority: skill.priority - 50, // Lower priority than primary
          meta: {
            skillName: skill.name,
            bytesEstimate: 0,
            primaryToolNames: skill.primaryToolNames ? [...skill.primaryToolNames] : undefined,
            helperToolNames: skill.helperToolNames ? [...skill.helperToolNames] : undefined,
            isPrimary: false,
          },
        });
      } else {
        // Non-matched: very brief
        sections.push({
          title: skill.title,
          body: `${skill.description}`,
          priority: skill.priority - 80,
          meta: {
            skillName: skill.name,
            bytesEstimate: 0,
            isPrimary: false,
          },
        });
      }
    }

    // Store route info for debug access
    (this as any)._lastRoute = route;
    return sections;
  }

  getLastRoute(): SkillRouteResult | null {
    return (this as any)._lastRoute ?? null;
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
