<script lang="ts">
  import type { KbSettings, KbGlobalToolName } from "../../../types/settings";
  import { globalToolCatalog } from "../../../services/agent-workbench/tools/global-tool-catalog";
  import { skillToolCatalog } from "../../../services/agent-workbench/tools/skill-tool-catalog";
  import { BUILTIN_KB_SKILL_NAME } from "../../../services/agent-workbench/skills/builtin/knowledge-base-qa.skill";
  import { BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME } from "../../../services/agent-workbench/skills/builtin/schedule-task-diary.skill";
  import { BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME } from "../../../services/agent-workbench/skills/builtin/doc-content-editing.skill";
  import type { BuiltinSkillToolCategoryId } from "../../../services/agent-workbench/tools/skill-tool-catalog";

  const CATEGORY_TO_SKILL: Record<BuiltinSkillToolCategoryId, string> = {
    knowledge_base: BUILTIN_KB_SKILL_NAME,
    schedule_task_diary: BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME,
    doc_content_editing: BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME,
  };

  function isSkillCategoryEnabled(categoryId: BuiltinSkillToolCategoryId): boolean {
    const skillName = CATEGORY_TO_SKILL[categoryId];
    if (!skillName) return true;
    return !(settings.skillSettings?.disabledBuiltinSkillNames ?? []).includes(skillName);
  }

  export let settings: KbSettings;

  function isToolEnabled(name: KbGlobalToolName): boolean {
    return !(settings.toolSettings?.disabledGlobalToolNames ?? []).includes(name);
  }

  function toggleTool(name: KbGlobalToolName) {
    const disabled = new Set(settings.toolSettings?.disabledGlobalToolNames ?? []);
    if (disabled.has(name)) {
      disabled.delete(name);
    } else {
      disabled.add(name);
    }
    settings = {
      ...settings,
      toolSettings: {
        ...(settings.toolSettings ?? { disabledGlobalToolNames: [] }),
        disabledGlobalToolNames: [...disabled],
      },
    };
  }
</script>

<div class="tools-settings-tab">
  <div class="section">
    <div class="section-header">
      <h2 class="section-title">全局工具</h2>
      <p class="section-description">控制全局工具是否对 AI 可用。</p>
    </div>
    <div class="tools-list">
      {#each globalToolCatalog as tool}
        <div class="tool-card">
          <div class="tool-main">
            <div class="tool-info">
              <div class="tool-title-row">
                <span class="tool-title">{tool.title}</span>
              </div>
              <span class="tool-description">{tool.description}</span>
            </div>
            <div class="toggle-wrap">
              <span class="toggle-label">{isToolEnabled(tool.name) ? "已启用" : "已停用"}</span>
              <label class="switch">
                <input
                  type="checkbox"
                  checked={isToolEnabled(tool.name)}
                  on:change={() => toggleTool(tool.name)}
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2 class="section-title">Skill 专属工具</h2>
      <p class="section-description">
        这些工具随对应内置 Skill 启用或隐藏；关闭 Skill 后不会注册给 Agent，也不会在这里显示。
      </p>
    </div>

    {#each skillToolCatalog.filter(c => isSkillCategoryEnabled(c.id)) as category}
      <div class="skill-category">
        <div class="skill-category-header">
          <span class="skill-category-title">{category.title}</span>
          <span class="skill-category-desc">{category.description}</span>
        </div>
        <div class="tools-list">
          {#each category.tools as tool}
            <div class="tool-card">
              <div class="tool-main">
                <div class="tool-info">
                  <div class="tool-title-row">
                    <span class="tool-title">{tool.title}</span>
                    {#if tool.readOnly}
                      <span class="tag tag-readonly">只读</span>
                    {:else if tool.requiresConfirmation}
                      <span class="tag tag-confirm">需要确认</span>
                    {:else if tool.canWrite}
                      <span class="tag tag-write">会写入</span>
                    {/if}
                  </div>
                  <span class="tool-description">{tool.description}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .tools-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .section-description {
    margin: 0;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tool-card {
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tool-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .tool-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .tool-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tool-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .tool-description {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    line-height: 1.4;
  }

  .toggle-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .toggle-label {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;

    input {
      opacity: 0;
      width: 0;
      height: 0;
    }
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--b3-theme-surface-lighter);
    transition: 0.2s;
    border-radius: 20px;

    &:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.2s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: var(--b3-theme-primary);
  }

  input:checked + .slider:before {
    transform: translateX(16px);
  }

  input:disabled + .slider {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .skill-category {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skill-category-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 4px;
  }

  .skill-category-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-primary);
  }

  .skill-category-desc {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
  }

  .tag {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    line-height: 1.3;
  }

  .tag-readonly {
    background: var(--b3-theme-surface-lighter);
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .tag-write {
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
  }

  .tag-confirm {
    background: color-mix(in srgb, var(--b3-theme-warning) 12%, transparent, var(--b3-card-warning-background));
    color: var(--b3-card-warning-color, var(--b3-theme-on-surface));
  }
</style>
