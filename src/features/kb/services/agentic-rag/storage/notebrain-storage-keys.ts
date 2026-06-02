/**
 * Notebrain storage keys: 相对 key 定义。
 */

export const NOTEBRAIN_SETTINGS_KEY = "notebrain/settings.json";
export const NOTEBRAIN_CHAT_INDEX_KEY = "notebrain/chat/index.json";
export const NOTEBRAIN_USER_SKILLS_INDEX_KEY = "notebrain/skills/user/index.json";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SKILL_FILENAME_PATTERN = /^[a-z0-9_-]+\.md$/;

export function toSessionKey(sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("[StorageKeys] Invalid session id.");
  }
  return `notebrain/chat/sessions/${sessionId}.json`;
}

export function toUserSkillKey(skillFilename: string): string {
  if (!SKILL_FILENAME_PATTERN.test(skillFilename)) {
    throw new Error("[StorageKeys] Invalid skill filename.");
  }
  return `notebrain/skills/user/${skillFilename}`;
}

export function isValidStorageId(id: string): boolean {
  if (!id || id.length > 100) return false;
  if (id.includes("..") || id.includes("/") || id.includes("\\")) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}
