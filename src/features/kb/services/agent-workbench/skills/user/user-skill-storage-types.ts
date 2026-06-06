/**
 * User skill storage types: pure storage data, independent of SkillContract.
 */

export interface UserSkillFrontmatter {
  id?: string;
  title?: string;
  enabled?: boolean;
  priority?: number;
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
