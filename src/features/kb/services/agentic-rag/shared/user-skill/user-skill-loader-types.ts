/**
 * User skill loader types: 加载器类型，可依赖 SkillContract。
 */

import type { SkillContract } from "../../workbench/contracts/skill-contract";
import type { UserSkillIndex } from "./user-skill-storage-types";

export interface UserSkillLoadDiagnostic {
  entryId: string;
  filename: string;
  level: "error" | "warn";
  code: string;
  message: string;
}

export interface UserSkillLoadResult {
  skills: SkillContract[];
  diagnostics: UserSkillLoadDiagnostic[];
}

export interface UserSkillStorageAdapter {
  loadIndex(): Promise<UserSkillIndex | null>;
  loadMarkdownByFilename(filename: string): Promise<string | null>;
}
