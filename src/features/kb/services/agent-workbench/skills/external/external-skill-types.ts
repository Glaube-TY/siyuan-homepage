export type ExternalSkillSourceType = "github" | "zip" | "notebrain" | "user" | "unknown";
export type ExternalSkillRiskLevel = "low" | "medium" | "high";

export interface ExternalSkillIndexEntry {
  id: string;
  title: string;
  description: string;
  sourceType: ExternalSkillSourceType;
  source: string;
  rootDir: string;
  entry: string;
  enabled: boolean;
  trusted: boolean;
  riskLevel: ExternalSkillRiskLevel;
  tags: string[];
  triggers: string[];
  installedAt: number;
  updatedAt: number;
  requiredEnvVars?: string[];
}

export interface ExternalSkillIndex {
  version: 1;
  updatedAt: number;
  skills: ExternalSkillIndexEntry[];
}

export interface ExternalSkillReadResult {
  id: string;
  title: string;
  content: string;
  truncated: boolean;
  chars: number;
  relativePath: string;
}

export interface ExternalSkillInstallInput {
  source: string;
  targetSkillId?: string;
}

export interface ExternalSkillInstallResult {
  installed: ExternalSkillIndexEntry[];
  indexUpdatedAt: number;
  requiredEnvVars: string[];
  logPath?: string;
}

