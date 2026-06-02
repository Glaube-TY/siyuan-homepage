/**
 * User skill storage types: 纯存储类型，不依赖 SkillContract。
 */

export interface UserSkillFrontmatter {
  id?: string;
  title?: string;
  enabled?: boolean;
  priority?: number;
  toolNames?: string[];
}

export interface ParsedUserSkill {
  frontmatter: UserSkillFrontmatter;
  guidance: string;
}

export interface UserSkillIndexEntry {
  id: string;
  title: string;
  filename: string;
  enabled: boolean;
  priority: number;
  updatedAt: number;
}

export interface UserSkillIndex {
  version: 1;
  skills: UserSkillIndexEntry[];
}
