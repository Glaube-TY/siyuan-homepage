/**
 * Storage module stable API.
 */

export { setNotebrainPlugin } from "./notebrain-plugin-storage";
export type { ChatSessionIndex, ChatSessionIndexEntry } from "./chat-session-types";
export {
  loadChatSessionIndex,
  saveChatSessionIndex,
  loadChatSession,
  saveChatSession,
  deleteChatSession,
  createSessionIndexEntry,
} from "./chat-session-store";
export type { UserSkillIndex, UserSkillIndexEntry } from "./user-skill-store";
export {
  loadUserSkillIndex,
  saveUserSkillIndex,
  loadUserSkillMarkdown,
  loadUserSkillMarkdownByFilename,
  saveUserSkillMarkdown,
  deleteUserSkill,
  deleteUserSkillByFilename,
} from "./user-skill-store";
export { loadMigrationState, saveMigrationState, needsMigration } from "./storage-migration";
