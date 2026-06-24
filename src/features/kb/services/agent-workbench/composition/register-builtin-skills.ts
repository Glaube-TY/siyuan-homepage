/**
 * Composition: register built-in skills.
 * Skills are capability strategy packages — this module only wires them into the registry.
 */

import { SkillRegistry } from "../registries/skill-registry";
import { createKnowledgeBaseQaSkill } from "../skills/builtin/knowledge-base-qa.skill";
import { createScheduleTaskDiarySkill } from "../skills/builtin/schedule-task-diary.skill";
import { createDatabaseAssistantSkill } from "../skills/builtin/database-assistant.skill";
import { createDocContentEditingSkill } from "../skills/builtin/doc-content-editing.skill";
import { createNotebookDocTreeSkill } from "../skills/builtin/notebook-doc-tree.skill";
import { createTagBookmarkOutlineSkill } from "../skills/builtin/tag-bookmark-outline.skill";
import { createAssetManagementSkill } from "../skills/builtin/asset-management.skill";
import { createRiffReviewSkill } from "../skills/builtin/riff-review.skill";

export interface BuiltinCapabilityAccess {
  knowledgeBase: boolean;
  scheduleTaskDiary: boolean;
  databaseAssistant: boolean;
  docContentEditing: boolean;
  notebookDocTree: boolean;
  tagBookmarkOutline: boolean;
  assetManagement: boolean;
  riffReview: boolean;
}

export function registerBuiltinSkills(
  skillRegistry: SkillRegistry,
  access?: BuiltinCapabilityAccess,
): void {
  if (access?.knowledgeBase !== false) {
    skillRegistry.ensureSkill(createKnowledgeBaseQaSkill(), "builtin");
  }
  if (access?.scheduleTaskDiary !== false) {
    skillRegistry.ensureSkill(createScheduleTaskDiarySkill(), "builtin");
  }
  if (access?.databaseAssistant !== false) {
    skillRegistry.ensureSkill(createDatabaseAssistantSkill(), "builtin");
  }
  if (access?.docContentEditing !== false) {
    skillRegistry.ensureSkill(createDocContentEditingSkill(), "builtin");
  }
  if (access?.notebookDocTree !== false) {
    skillRegistry.ensureSkill(createNotebookDocTreeSkill(), "builtin");
  }
  if (access?.tagBookmarkOutline !== false) {
    skillRegistry.ensureSkill(createTagBookmarkOutlineSkill(), "builtin");
  }
  if (access?.assetManagement !== false) {
    skillRegistry.ensureSkill(createAssetManagementSkill(), "builtin");
  }
  if (access?.riffReview !== false) {
    skillRegistry.ensureSkill(createRiffReviewSkill(), "builtin");
  }
}
