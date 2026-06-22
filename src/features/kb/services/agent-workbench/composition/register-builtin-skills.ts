/**
 * Composition: register built-in skills.
 * Skills are capability strategy packages — this module only wires them into the registry.
 */

import { SkillRegistry } from "../registries/skill-registry";
import { createKnowledgeBaseQaSkill } from "../skills/builtin/knowledge-base-qa.skill";
import { createScheduleTaskDiarySkill } from "../skills/builtin/schedule-task-diary.skill";
import { createDatabaseAssistantSkill } from "../skills/builtin/database-assistant.skill";
import { createDocContentEditingSkill } from "../skills/builtin/doc-content-editing.skill";

export interface BuiltinCapabilityAccess {
  knowledgeBase: boolean;
  scheduleTaskDiary: boolean;
  databaseAssistant: boolean;
  docContentEditing: boolean;
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
}
