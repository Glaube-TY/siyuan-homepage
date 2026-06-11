/**
 * Markdown skill loader — loads user markdown skills,
 * outputs new agent-workbench SkillContract directly.
 * No dependency on old workbench contracts.
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";
import { parseUserSkillMarkdown } from "./user-skill-parser";
import type {
  UserSkillFrontmatter,
  UserSkillIndexEntry,
} from "./user-skill-storage-types";
import type {
  UserSkillStorageAdapter,
  UserSkillLoadDiagnostic,
  UserSkillLoadResult,
} from "./user-skill-loader-types";
import {
  isValidUserSkillId,
  isValidUserSkillFilename,
  detectForbiddenTextTokens,
  validateUserSkillTitle,
} from "./user-skill-rules";

function createUserSkillContract(
  entry: UserSkillIndexEntry,
  guidance: string,
): SkillContract {
  const title = entry.title || entry.id;
  const priority = entry.priority;
  const enabledByDefault = entry.enabled;

  return {
    name: `user_${entry.id}`,
    title,
    description: `用户技能：${title}`,
    priority,
    enabledByDefault,

    buildPromptSection(_ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title,
        body: guidance,
        priority,
        meta: {
          skillName: `user_${entry.id}`,
          bytesEstimate: guidance.length,
        },
      };
    },
  };
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

export class MarkdownSkillLoader {
  readonly name = "markdown";
  private adapter: UserSkillStorageAdapter;

  constructor(adapter: UserSkillStorageAdapter) {
    this.adapter = adapter;
  }

  async loadSkillsWithDiagnostics(): Promise<UserSkillLoadResult> {
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
          entryId: entry.id, filename: entry.filename,
          level: "error", code: "INVALID_ENTRY", message: validationError,
        });
        continue;
      }

      try {
        const markdown = await this.adapter.loadMarkdownByFilename(entry.filename);
        if (!markdown) {
          diagnostics.push({
            entryId: entry.id, filename: entry.filename,
            level: "warn", code: "FILE_NOT_FOUND", message: "Markdown file not found.",
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
            entryId: entry.id, filename: entry.filename,
            level: "error", code: "PARSE_FAILED", message: "Failed to parse user skill markdown.",
          });
          continue;
        }

        if (!guidance.trim()) {
          diagnostics.push({
            entryId: entry.id, filename: entry.filename,
            level: "warn", code: "EMPTY_GUIDANCE", message: "Skill guidance is empty.",
          });
          continue;
        }

        if (frontmatter.id && frontmatter.id !== entry.id) {
          diagnostics.push({
            entryId: entry.id, filename: entry.filename,
            level: "error", code: "ID_MISMATCH", message: "User skill id does not match index entry.",
          });
          continue;
        }

        const forbiddenTokens = detectForbiddenTextTokens(guidance);
        if (forbiddenTokens.length > 0) {
          diagnostics.push({
            entryId: entry.id, filename: entry.filename,
            level: "error", code: "FORBIDDEN_TOKEN",
            message: "Skill 包含固定流程或工具绑定表达，请改成能力边界和通用使用策略。",
          });
          continue;
        }

        skills.push(createUserSkillContract(entry, guidance));
      } catch {
        diagnostics.push({
          entryId: entry.id, filename: entry.filename,
          level: "error", code: "LOAD_FAILED", message: "Unexpected error loading skill.",
        });
      }
    }

    return { skills, diagnostics };
  }
}
