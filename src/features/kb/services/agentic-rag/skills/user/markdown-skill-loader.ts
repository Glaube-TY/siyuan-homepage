/**
 * Markdown skill loader: 通过适配器加载用户 markdown skill。
 */

import type { SkillSourceLoader, SkillLoadContext } from "../../workbench/contracts/skill-source";
import type { SkillContract, SkillRuntimeContext, SkillPromptSection } from "../../workbench/contracts/skill-contract";
import type { ToolManifest } from "../../workbench/contracts/tool-contract";
import { assertNoFlowControlFields } from "../../workbench/guards/flow-control-guard";
import { parseUserSkillMarkdown } from "./user-skill-parser";
import type { UserSkillFrontmatter, UserSkillIndexEntry } from "../../shared/user-skill/user-skill-storage-types";
import type { UserSkillStorageAdapter, UserSkillLoadDiagnostic, UserSkillLoadResult } from "../../shared/user-skill/user-skill-loader-types";
import {
  isValidUserSkillId,
  isValidUserSkillFilename,
  isValidUserSkillToolName,
  isForbiddenToolName,
  isFlowControlKeyword,
  detectForbiddenTextTokens,
  validateUserSkillTitle,
} from "../../shared/user-skill/user-skill-rules";

function createUserSkillContract(
  entry: UserSkillIndexEntry,
  guidance: string,
  validatedToolNames: readonly string[],
): SkillContract {
  const title = entry.title || entry.id;
  const priority = entry.priority;
  const enabledByDefault = entry.enabled;

  const skill: SkillContract = {
    name: `user_${entry.id}`,
    title,
    description: `User Skill: ${title}`,
    roleInstruction: guidance,
    whenUseful: `When user needs "${title}" capability.`,
    boundary: "User skill, follows system security constraints.",
    toolNames: validatedToolNames,
    guidance,
    priority,
    enabledByDefault,

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      const manifestByName = new Map(ctx.toolManifest.map((t) => [t.name, t]));
      const visibleTools = validatedToolNames
        .filter((name) => manifestByName.has(name))
        .map((name) => manifestByName.get(name)!);

      const toolLines = visibleTools.length
        ? visibleTools
            .map((t) => {
              const tag = t.availability.available
                ? "[available]"
                : `[unavailable:${t.availability.reasonCode ?? "unknown"}]`;
              return `- ${t.name} (${t.title}) — ${t.capability} ${tag}`;
            })
            .join("\n")
        : "";

      const body = [
        `## ${title}`,
        "",
        guidance,
        "",
        toolLines ? "**Tools**:\n" + toolLines : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        title,
        body,
        priority,
        meta: {
          skillName: `user_${entry.id}`,
          bytesEstimate: body.length,
        },
      };
    },

    getTools(ctx: SkillRuntimeContext): readonly ToolManifest[] {
      if (validatedToolNames.length === 0) return [];
      const allowed = new Set(validatedToolNames);
      return ctx.toolManifest.filter((t) => allowed.has(t.name));
    },
  };

  assertNoFlowControlFields(skill, `UserSkill "${entry.id}"`);
  return skill;
}

function validateEntry(entry: UserSkillIndexEntry): string | null {
  if (!entry.id) return "Missing entry id";
  if (!isValidUserSkillId(entry.id)) return "Invalid entry id: must be lowercase slug (a-z, 0-9, _, -)";
  if (!entry.filename) return "Missing entry filename";
  if (!isValidUserSkillFilename(entry.filename)) return "Invalid filename: must match /^[a-z0-9_-]+\\.md$/";
  const titleError = validateUserSkillTitle(entry.title || entry.id);
  if (titleError) return titleError;
  return null;
}

export class MarkdownSkillLoader implements SkillSourceLoader {
  readonly name = "markdown";
  private adapter: UserSkillStorageAdapter;

  constructor(adapter: UserSkillStorageAdapter) {
    this.adapter = adapter;
  }

  async loadSkillsWithDiagnostics(_ctx: SkillLoadContext): Promise<UserSkillLoadResult> {
    const skills: SkillContract[] = [];
    const diagnostics: UserSkillLoadDiagnostic[] = [];

    const index = await this.adapter.loadIndex();
    if (!index || index.skills.length === 0) {
      return { skills, diagnostics };
    }

    for (const entry of index.skills) {
      if (!entry.enabled) continue;

      const validationError = validateEntry(entry);
      if (validationError) {
        diagnostics.push({
          entryId: entry.id,
          filename: entry.filename,
          level: "error",
          code: "INVALID_ENTRY",
          message: validationError,
        });
        continue;
      }

      try {
        const markdown = await this.adapter.loadMarkdownByFilename(entry.filename);
        if (!markdown) {
          diagnostics.push({
            entryId: entry.id,
            filename: entry.filename,
            level: "warn",
            code: "FILE_NOT_FOUND",
            message: "Markdown file not found.",
          });
          continue;
        }

        let frontmatter: UserSkillFrontmatter;
        let guidance: string;
        try {
          const parsed = parseUserSkillMarkdown(markdown);
          frontmatter = parsed.frontmatter;
          guidance = parsed.guidance;
        } catch {
          diagnostics.push({
            entryId: entry.id,
            filename: entry.filename,
            level: "error",
            code: "PARSE_FAILED",
            message: "Failed to parse user skill markdown.",
          });
          continue;
        }

        if (!guidance.trim()) {
          diagnostics.push({
            entryId: entry.id,
            filename: entry.filename,
            level: "warn",
            code: "EMPTY_GUIDANCE",
            message: "Skill guidance is empty.",
          });
          continue;
        }

        if (frontmatter.id && frontmatter.id !== entry.id) {
          diagnostics.push({
            entryId: entry.id,
            filename: entry.filename,
            level: "error",
            code: "ID_MISMATCH",
            message: "User skill id does not match index entry.",
          });
          continue;
        }

        const forbiddenTokens = detectForbiddenTextTokens(guidance);
        if (forbiddenTokens.length > 0) {
          diagnostics.push({
            entryId: entry.id,
            filename: entry.filename,
            level: "error",
            code: "FORBIDDEN_TOKEN",
            message: "Guidance contains forbidden tokens.",
          });
          continue;
        }

        const toolValidation = this.validateToolNames(frontmatter.toolNames, entry, diagnostics);
        if (!toolValidation.ok) continue;

        const skill = createUserSkillContract(entry, guidance, toolValidation.names);
        skills.push(skill);
      } catch {
        diagnostics.push({
          entryId: entry.id,
          filename: entry.filename,
          level: "error",
          code: "LOAD_FAILED",
          message: "Failed to load user skill markdown.",
        });
      }
    }

    return { skills, diagnostics };
  }

  async loadSkills(ctx: SkillLoadContext): Promise<SkillContract[]> {
    const result = await this.loadSkillsWithDiagnostics(ctx);
    return result.skills;
  }

  private validateToolNames(
    toolNames: string[] | undefined,
    entry: UserSkillIndexEntry,
    diagnostics: UserSkillLoadDiagnostic[],
  ): { ok: boolean; names: string[] } {
    if (!toolNames || toolNames.length === 0) return { ok: true, names: [] };

    const valid: string[] = [];
    for (const name of toolNames) {
      if (isForbiddenToolName(name)) {
        diagnostics.push({
          entryId: entry.id,
          filename: entry.filename,
          level: "error",
          code: "FORBIDDEN_TOOL",
          message: "Tool name is forbidden for user skills.",
        });
        return { ok: false, names: [] };
      }

      if (isFlowControlKeyword(name)) {
        diagnostics.push({
          entryId: entry.id,
          filename: entry.filename,
          level: "error",
          code: "FLOW_CONTROL_TOOL",
          message: "Tool name is a flow-control keyword.",
        });
        return { ok: false, names: [] };
      }

      if (!isValidUserSkillToolName(name)) {
        diagnostics.push({
          entryId: entry.id,
          filename: entry.filename,
          level: "error",
          code: "INVALID_TOOL_NAME",
          message: "Tool name has invalid format.",
        });
        return { ok: false, names: [] };
      }

      valid.push(name);
    }
    return { ok: true, names: valid };
  }
}
