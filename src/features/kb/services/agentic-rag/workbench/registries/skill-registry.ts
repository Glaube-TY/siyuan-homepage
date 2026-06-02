/**
 * SkillRegistry: 集中注册 Skill contract。
 */

import type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
} from "../contracts/skill-contract";
import { assertNoFlowControlFields } from "../guards/flow-control-guard";

export type SkillSource = "builtin" | "user" | "mcp";

interface RegisteredSkill {
  skill: SkillContract;
  source: SkillSource;
  registeredAt: number;
}

export class SkillRegistry {
  private readonly skills = new Map<string, RegisteredSkill>();

  /**
   * 注册一个 Skill。
   */
  registerSkill(skill: SkillContract, source: SkillSource = "builtin"): void {
    if (!skill?.name) {
      throw new Error("[SkillRegistry] Skill must have a name.");
    }
    assertNoFlowControlFields(skill, `Skill "${skill.name}"`);
    if (this.skills.has(skill.name)) {
      throw new Error(
        `[SkillRegistry] Skill "${skill.name}" is already registered. ` +
          `Call unregisterSkill first if you want to replace it.`,
      );
    }
    this.skills.set(skill.name, { skill, source, registeredAt: Date.now() });
  }

  /**
   * 注销一个 Skill。
   */
  unregisterSkill(name: string): boolean {
    return this.skills.delete(name);
  }

  /**
   * 注销指定来源的所有 Skill。
   * 返回实际注销数量。
   */
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

  /**
   * 原子替换指定来源的所有 Skill。
   * 失败时不修改现有状态。
   */
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

    for (const s of newSkills) {
      try {
        assertNoFlowControlFields(s, `Skill "${s.name}"`);
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }

    const otherSourceConflicts: string[] = [];
    for (const name of nameSet) {
      const existing = this.skills.get(name);
      if (existing && existing.source !== source) {
        otherSourceConflicts.push(name);
      }
    }
    if (otherSourceConflicts.length > 0) {
      return { ok: false, error: `Skill name conflict with other source: ${otherSourceConflicts.join(", ")}` };
    }

    this.unregisterSkillsBySource(source);
    for (const s of newSkills) {
      this.skills.set(s.name, { skill: s, source, registeredAt: Date.now() });
    }

    return { ok: true, replaced: newSkills.length };
  }

  /**
   * 返回当前注册的所有 Skill（按 priority 倒序）。
   * 不做 enabled 过滤；如需 enabled 子集，调 getEnabledSkills(ctx)。
   */
  listSkills(): SkillContract[] {
    return Array.from(this.skills.values())
      .map((e) => e.skill)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * 返回当前 ctx 下可用的 Skill。
   */
  getEnabledSkills(ctx: SkillRuntimeContext): SkillContract[] {
    const enabled = ctx.userEnabledSkillNames
      ? new Set<string>(ctx.userEnabledSkillNames)
      : null;
    const disabled = ctx.userDisabledSkillNames
      ? new Set<string>(ctx.userDisabledSkillNames)
      : null;
    return Array.from(this.skills.values())
      .filter((entry) => isEnabledFromCtx(entry, enabled, disabled))
      .map((e) => e.skill)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * 渲染所有可用 Skill 的 prompt section。
   */
  buildSkillPromptSections(ctx: SkillRuntimeContext): SkillPromptSection[] {
    const enabled = this.getEnabledSkills(ctx);
    return enabled.map((skill) => skill.buildPromptSection(ctx));
  }

  /**
   * 渲染单个 Skill 的 prompt。
   */
  renderSkillPrompt(name: string, ctx: SkillRuntimeContext): SkillPromptSection | undefined {
    const entry = this.skills.get(name);
    if (!entry) return undefined;
    const enabled = ctx.userEnabledSkillNames
      ? new Set<string>(ctx.userEnabledSkillNames)
      : null;
    const disabled = ctx.userDisabledSkillNames
      ? new Set<string>(ctx.userDisabledSkillNames)
      : null;
    if (!isEnabledFromCtx(entry, enabled, disabled)) return undefined;
    return entry.skill.buildPromptSection(ctx);
  }

  /**
   * 批量注册 builtin skills。
   */
  registerBuiltinSkills(skills: readonly SkillContract[]): void {
    for (const s of skills) this.registerSkill(s, "builtin");
  }

  /**
   * 批量注册 user skills。
   */
  registerUserSkills(skills: readonly SkillContract[]): void {
    for (const s of skills) this.registerSkill(s, "user");
  }

  /**
   * 批量注册 mcp skills。
   */
  registerMcpSkills(skills: readonly SkillContract[]): void {
    for (const s of skills) this.registerSkill(s, "mcp");
  }
}

function isEnabledFromCtx(
  entry: RegisteredSkill,
  userEnabled: Set<string> | null,
  userDisabled: Set<string> | null,
): boolean {
  if (userDisabled?.has(entry.skill.name)) return false;
  if (userEnabled?.has(entry.skill.name)) return true;
  return entry.skill.enabledByDefault;
}

let globalRegistry: SkillRegistry | null = null;

export function getGlobalSkillRegistry(): SkillRegistry {
  if (!globalRegistry) globalRegistry = new SkillRegistry();
  return globalRegistry;
}

export function resetGlobalSkillRegistry(): void {
  globalRegistry = null;
}
