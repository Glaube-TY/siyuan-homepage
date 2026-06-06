/**
 * User skill loader types. Loader output is the new agent-workbench SkillContract.
 */

import type { SkillContract } from "../../contracts/skill-contract";
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
