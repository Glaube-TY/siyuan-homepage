/**
 * User markdown skills module: 加载、解析、注册用户 markdown skill。
 */

export type {
  UserSkillFrontmatter,
  ParsedUserSkill,
  UserSkillIndex,
  UserSkillIndexEntry,
  UserSkillLoadDiagnostic,
  UserSkillLoadResult,
  UserSkillStorageAdapter,
} from "../../shared/user-skill";

export { parseUserSkillMarkdown } from "./user-skill-parser";

export {
  isValidUserSkillId,
  isValidUserSkillFilename,
  isValidUserSkillToolName,
  isForbiddenToolName,
  isFlowControlKeyword,
  detectForbiddenTextTokens,
  validateUserSkillTitle,
} from "../../shared/user-skill";

export { MarkdownSkillLoader } from "./markdown-skill-loader";

export { registerUserMarkdownSkills } from "./register-user-markdown-skills";
export type { RegisterUserSkillsResult } from "./register-user-markdown-skills";
