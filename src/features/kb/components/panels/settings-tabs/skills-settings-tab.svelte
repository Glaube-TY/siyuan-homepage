<script lang="ts">
  import { builtinSkills } from "../../../services/agent-workbench/skills/builtin/skill-catalog";
</script>

<div class="skills-settings-tab">
  <div class="section-header">
    <h2 class="section-title">技能管理</h2>
    <p class="section-description">当前仅支持查看内置 Skill，不支持自定义或启停。</p>
  </div>

  <div class="skills-list">
    {#each builtinSkills as skill}
      <div class="skill-card">
        <div class="skill-header">
          <div class="skill-title-row">
            <h3 class="skill-title">{skill.title}</h3>
            <span class="skill-source">内置</span>
          </div>
          <span class="skill-name">{skill.name}</span>
        </div>

        <div class="skill-meta">
          <div class="meta-item">
            <span class="meta-label">默认启用</span>
            <span class="meta-value">{skill.enabledByDefault ? "是" : "否"}</span>
          </div>
        </div>

        <div class="skill-description">{skill.description}</div>

        <div class="skill-section">
          <h4 class="section-subtitle">能力边界</h4>
          <p class="section-content">{skill.boundary}</p>
        </div>

        <details class="skill-guidance-details">
          <summary class="guidance-summary">使用说明 / Guidance</summary>
          <div class="guidance-content">
            {#each skill.guidance.split("\n") as line}
              <p class="guidance-line">{line}</p>
            {/each}
          </div>
        </details>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .skills-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
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

  .skills-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .skill-card {
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skill-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .skill-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .skill-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--b3-theme-primary);
  }

  .skill-source {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    background: var(--b3-theme-surface-variant);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .skill-name {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
    font-family: monospace;
  }

  .skill-meta {
    display: flex;
    gap: 16px;
  }

  .meta-item {
    display: flex;
    gap: 4px;
    font-size: 13px;
  }

  .meta-label {
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .meta-value {
    color: var(--b3-theme-on-surface);
    font-weight: 500;
  }

  .skill-description {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
    margin: 0;
  }

  .skill-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section-subtitle {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .section-content {
    margin: 0;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
  }

  .skill-guidance-details {
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    padding: 0;
  }

  .skill-guidance-details[open] {
    padding-bottom: 8px;
  }

  .guidance-summary {
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    padding: 8px 12px;
    user-select: none;
  }

  .guidance-content {
    padding: 0 12px;
  }

  .guidance-line {
    margin: 0 0 4px 0;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
  }

</style>
