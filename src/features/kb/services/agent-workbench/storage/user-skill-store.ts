/**
 * User skill store: 用户自定义 skill 存储实现。
 */

import {
  NOTEBRAIN_USER_SKILLS_INDEX_KEY,
  toUserSkillKey,
} from "./notebrain-storage-keys";
import { saveData, loadData, removeData } from "./notebrain-plugin-storage";
import type { UserSkillIndex } from "../skills/user/user-skill-storage-types";
import { isValidUserSkillId, isValidUserSkillFilename } from "../skills/user/user-skill-rules";

const SKILL_MD_EXTENSION = ".md";

export type { UserSkillIndex, UserSkillIndexEntry } from "../skills/user/user-skill-storage-types";

function internalToSafeFilename(id: string, extension: string): string {
  const safe = id
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${safe}${extension}`;
}

function toSafeSkillFilename(skillId: string): string {
  return internalToSafeFilename(skillId, SKILL_MD_EXTENSION);
}

export async function loadUserSkillIndex(): Promise<UserSkillIndex | null> {
  const data = await loadData<UserSkillIndex>(NOTEBRAIN_USER_SKILLS_INDEX_KEY);
  if (data && data.version === 1) {
    return data;
  }
  return null;
}

export async function saveUserSkillIndex(index: UserSkillIndex): Promise<void> {
  await saveData(NOTEBRAIN_USER_SKILLS_INDEX_KEY, index);
}

export async function loadUserSkillMarkdown(skillId: string): Promise<string | null> {
  if (!isValidUserSkillId(skillId)) return null;
  const filename = toSafeSkillFilename(skillId);
  const key = toUserSkillKey(filename);
  const data = await loadData<string>(key);
  return typeof data === "string" ? data : null;
}

export async function loadUserSkillMarkdownByFilename(filename: string): Promise<string | null> {
  if (!isValidUserSkillFilename(filename)) return null;
  const key = toUserSkillKey(filename);
  const data = await loadData<string>(key);
  return typeof data === "string" ? data : null;
}

export async function saveUserSkillMarkdown(skillId: string, markdown: string): Promise<void> {
  if (!isValidUserSkillId(skillId)) {
    throw new Error("[UserSkillStore] Invalid skill id.");
  }
  const filename = toSafeSkillFilename(skillId);
  const key = toUserSkillKey(filename);
  await saveData(key, markdown);
}

export async function deleteUserSkill(skillId: string): Promise<void> {
  if (!isValidUserSkillId(skillId)) return;
  const filename = toSafeSkillFilename(skillId);
  const key = toUserSkillKey(filename);
  await removeData(key);
}

export async function deleteUserSkillByFilename(filename: string): Promise<void> {
  if (!isValidUserSkillFilename(filename)) return;
  const key = toUserSkillKey(filename);
  await removeData(key);
}
