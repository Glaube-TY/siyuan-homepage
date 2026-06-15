<script lang="ts">
  import { onMount } from "svelte";
  import { builtinSkills } from "../../../services/agent-workbench/skills/builtin/skill-catalog";
  import type { KbSettings } from "../../../types/settings";
  import type { UserSkillIndex, UserSkillIndexEntry } from "../../../services/agent-workbench/storage/user-skill-store";
  import {
    loadUserSkillIndex,
    saveUserSkillIndex,
    saveUserSkillMarkdown,
    deleteUserSkill,
    loadUserSkillMarkdown,
  } from "../../../services/agent-workbench/storage/user-skill-store";
  import {
    isValidUserSkillId,
    validateUserSkillTitle,
    detectForbiddenTextTokens,
  } from "../../../services/agent-workbench/skills/user/user-skill-rules";
  import { parseUserSkillMarkdown } from "../../../services/agent-workbench/skills/user/user-skill-parser";

  export let settings: KbSettings;

  // 用户 Skill 列表
  let userSkills: UserSkillIndexEntry[] = [];
  let loadingUserSkills = false;

  // 编辑窗口状态
  let showEditor = false;
  let isNewSkill = false;
  let editingSkill: {
    id: string;
    title: string;
    enabled: boolean;
    priority: number;
    guidance: string;
  } = { id: "", title: "", enabled: true, priority: 40, guidance: "" };
  let editorError = "";

  // 用户 Skill 能力说明预览缓存
  let userSkillGuidancePreview: Record<string, string> = {};

  // 排序后的用户 Skill 列表
  $: sortedUserSkills = [...userSkills].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return (a.title || a.id).localeCompare(b.title || b.id);
  });

  function formatShortDate(ts: number): string {
    if (!ts || ts <= 0) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function deduplicateSkills(skills: UserSkillIndexEntry[]): UserSkillIndexEntry[] {
    const map = new Map<string, UserSkillIndexEntry>();
    for (const s of skills) {
      const existing = map.get(s.id);
      if (!existing || s.updatedAt > existing.updatedAt) {
        map.set(s.id, s);
      }
    }
    return Array.from(map.values());
  }

  // 加载用户 Skill
  async function refreshUserSkillList() {
    loadingUserSkills = true;
    try {
      const index = await loadUserSkillIndex();
      const rawSkills = index?.skills ?? [];
      // 防御性去重：同 id 保留 updatedAt 更新的一条，发现重复后顺手修复存储
      const deduped = deduplicateSkills(rawSkills);
      if (deduped.length !== rawSkills.length && index) {
        await saveUserSkillIndex({ ...index, skills: deduped });
      }
      userSkills = deduped;
      // 并行加载能力说明预览，捕获错误不阻塞页面
      await Promise.all(
        userSkills.map(async (entry) => {
          if (userSkillGuidancePreview[entry.id] !== undefined) return;
          try {
            const markdown = await loadUserSkillMarkdown(entry.id);
            if (markdown) {
              const parsed = parseUserSkillMarkdown(markdown);
              userSkillGuidancePreview[entry.id] = parsed.guidance;
            } else {
              userSkillGuidancePreview[entry.id] = "";
            }
          } catch {
            userSkillGuidancePreview[entry.id] = "";
          }
        }),
      );
      userSkillGuidancePreview = { ...userSkillGuidancePreview };
    } catch (e) {
      console.error("[SkillsSettingsTab] Failed to load user skills", e);
      userSkills = [];
    } finally {
      loadingUserSkills = false;
    }
  }

  onMount(() => {
    refreshUserSkillList();
  });

  // 内置 Skill 启停
  function isBuiltinEnabled(name: string): boolean {
    return !(settings.skillSettings?.disabledBuiltinSkillNames ?? []).includes(name);
  }

  function toggleBuiltinSkill(name: string) {
    const disabled = new Set(settings.skillSettings?.disabledBuiltinSkillNames ?? []);
    if (disabled.has(name)) {
      disabled.delete(name);
    } else {
      disabled.add(name);
    }
    const existing = settings.skillSettings ?? { disabledBuiltinSkillNames: [] };
    settings = {
      ...settings,
      skillSettings: {
        ...existing,
        disabledBuiltinSkillNames: [...disabled],
      },
    };
  }

  // 用户 Skill 启停
  async function toggleUserSkill(entry: UserSkillIndexEntry) {
    const index = await loadUserSkillIndex();
    if (!index) return;
    const updated = index.skills.map((s) =>
      s.id === entry.id ? { ...s, enabled: !s.enabled } : s
    );
    await saveUserSkillIndex({ ...index, skills: updated });
    await refreshUserSkillList();
  }

  // 删除用户 Skill
  async function removeUserSkill(entry: UserSkillIndexEntry) {
    if (!confirm(`确定要删除自定义 Skill「${entry.title}」吗？`)) return;
    await deleteUserSkill(entry.id);
    const index = await loadUserSkillIndex();
    if (index) {
      const updated = index.skills.filter((s) => s.id !== entry.id);
      await saveUserSkillIndex({ ...index, skills: updated });
    }
    delete userSkillGuidancePreview[entry.id];
    userSkillGuidancePreview = { ...userSkillGuidancePreview };
    await refreshUserSkillList();
  }

  // 打开新建窗口
  function openNewSkillEditor() {
    isNewSkill = true;
    editingSkill = { id: "", title: "", enabled: true, priority: 40, guidance: "" };
    editorError = "";
    showEditor = true;
  }

  // 打开编辑窗口
  async function openEditSkillEditor(entry: UserSkillIndexEntry) {
    isNewSkill = false;
    editorError = "";
    const markdown = await loadUserSkillMarkdown(entry.id);
    let guidance = "";
    if (markdown) {
      try {
        const parsed = parseUserSkillMarkdown(markdown);
        guidance = parsed.guidance;
      } catch {
        guidance = markdown;
      }
    }
    editingSkill = {
      id: entry.id,
      title: entry.title,
      enabled: entry.enabled,
      priority: entry.priority,
      guidance,
    };
    showEditor = true;
  }

  // 关闭编辑器
  function closeEditor() {
    showEditor = false;
    editorError = "";
  }

  // 生成安全文件名（与 user-skill-store 保持一致）
  function toSafeSkillFilename(skillId: string): string {
    const safe = skillId
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    return `${safe}.md`;
  }

  // 保存用户 Skill
  async function saveUserSkill() {
    editorError = "";

    let { id, title, enabled, priority, guidance } = editingSkill;

    // priority 归一化
    const normalizedPriority = Math.min(100, Math.max(0, Number.isFinite(priority) ? priority : 40));
    priority = normalizedPriority;
    editingSkill.priority = normalizedPriority;

    if (!isValidUserSkillId(id)) {
      editorError = "Skill ID 不合法，只能包含小写字母、数字、下划线和连字符。";
      return;
    }

    if (isNewSkill) {
      const index = await loadUserSkillIndex();
      if (index && index.skills.some((s) => s.id === id)) {
        editorError = "该 Skill ID 已存在。";
        return;
      }
    }

    const titleError = validateUserSkillTitle(title);
    if (titleError) {
      editorError = `标题不合法：${titleError}`;
      return;
    }

    if (!guidance.trim()) {
      editorError = "能力说明正文不能为空。";
      return;
    }

    const forbidden = detectForbiddenTextTokens(guidance);
    if (forbidden.length > 0) {
      editorError = `能力说明包含禁用词：${forbidden.join(", ")}`;
      return;
    }

    const markdown = `---
id: ${id}
title: ${title}
enabled: ${enabled}
priority: ${priority}
---
${guidance.trim()}`;

    try {
      await saveUserSkillMarkdown(id, markdown);

      const index: UserSkillIndex = (await loadUserSkillIndex()) ?? { version: 1, skills: [] };
      const filename = toSafeSkillFilename(id);
      const entry: UserSkillIndexEntry = {
        id,
        title,
        filename,
        enabled,
        priority,
        updatedAt: Date.now(),
      };

      const remaining = index.skills.filter((s) => s.id !== id);
      index.skills = [...remaining, entry];

      await saveUserSkillIndex(index);
      // 刷新预览缓存
      userSkillGuidancePreview[id] = guidance;
      userSkillGuidancePreview = { ...userSkillGuidancePreview };
      showEditor = false;
      await refreshUserSkillList();
    } catch (e) {
      editorError = e instanceof Error ? e.message : "保存失败";
    }
  }
</script>

<div class="skills-settings-tab">
  <!-- 内置 Skill -->
  <div class="section">
    <div class="section-header">
      <h2 class="section-title">内置 Skill</h2>
      <p class="section-description">系统预置的能力说明，可启用或停用。</p>
    </div>
    <div class="skills-list">
      {#each builtinSkills as skill}
        <div class="skill-card">
          <div class="skill-main">
            <div class="skill-info">
              <div class="skill-title-row">
                <span class="skill-title">{skill.title}</span>
                <span class="skill-badge builtin">内置</span>
              </div>
              <span class="skill-description">{skill.description}</span>
            </div>
            <div class="toggle-wrap">
              <span class="toggle-label">{isBuiltinEnabled(skill.name) ? "已启用" : "已停用"}</span>
              <label class="switch">
                <input
                  type="checkbox"
                  checked={isBuiltinEnabled(skill.name)}
                  on:change={() => toggleBuiltinSkill(skill.name)}
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          <details class="skill-details">
            <summary class="details-summary">详情</summary>
            <div class="details-body">
              <div class="detail-block">
                <span class="detail-label">能力边界</span>
                <p class="detail-content">{skill.boundary}</p>
              </div>
              <div class="detail-block">
                <span class="detail-label">使用策略</span>
                <p class="detail-content">{skill.guidance}</p>
              </div>
            </div>
          </details>
        </div>
      {/each}
    </div>
  </div>

  <!-- 用户自定义 Skill -->
  <div class="section">
    <div class="section-header with-actions">
      <div>
        <h2 class="section-title">自定义 Skill</h2>
        <p class="section-description">由你编写的能力说明，会注入到上下文。</p>
      </div>
      <button type="button" class="add-skill-btn" on:click={openNewSkillEditor}>
        添加 Skill
      </button>
    </div>

    {#if loadingUserSkills}
      <p class="empty-state">加载中...</p>
    {:else if userSkills.length === 0}
      <p class="empty-state">暂无自定义 Skill，点击右上角按钮添加。</p>
    {:else}
      <div class="skills-list">
        {#each sortedUserSkills as entry (entry.id)}
          <div class="skill-card">
            <div class="skill-main">
              <div class="skill-info">
                <div class="skill-title-row">
                  <span class="skill-title">{entry.title}</span>
                  <span class="skill-badge user">自定义</span>
                </div>
                <div class="skill-meta-row">
                  <span class="skill-meta">优先级 {entry.priority}</span>
                  {#if entry.updatedAt}
                    <span class="skill-meta">更新于 {formatShortDate(entry.updatedAt)}</span>
                  {/if}
                </div>
              </div>
              <div class="skill-actions">
                <div class="toggle-wrap">
                  <span class="toggle-label">{entry.enabled ? "已启用" : "已停用"}</span>
                  <label class="switch">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      on:change={() => toggleUserSkill(entry)}
                    />
                    <span class="slider"></span>
                  </label>
                </div>
                <button
                  type="button"
                  class="action-btn edit"
                  on:click={() => openEditSkillEditor(entry)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  class="action-btn danger"
                  on:click={() => removeUserSkill(entry)}
                >
                  删除
                </button>
              </div>
            </div>
            <details class="skill-details">
              <summary class="details-summary">详情</summary>
              <div class="details-body">
                <div class="detail-block">
                  <span class="detail-label">能力说明</span>
                  <p class="detail-content preview">
                    {#if userSkillGuidancePreview[entry.id] !== undefined}
                      {userSkillGuidancePreview[entry.id].slice(0, 800)}{userSkillGuidancePreview[entry.id].length > 800 ? "……" : ""}
                    {:else}
                      加载中...
                    {/if}
                  </p>
                </div>
              </div>
            </details>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showEditor}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="skill-editor-overlay" on:click|self={closeEditor}>
    <div class="skill-editor-panel">
      <div class="editor-header">
        <h3>{isNewSkill ? "新建 Skill" : "编辑 Skill"}</h3>
      </div>

      <div class="editor-body">
        <div class="editor-fields">
          <label class="field-row">
            <span class="field-label">保存标识</span>
            {#if isNewSkill}
              <input
                type="text"
                class="form-input"
                bind:value={editingSkill.id}
                placeholder="用于本地保存，建议使用英文或拼音"
              />
            {:else}
              <input type="text" class="form-input" value={editingSkill.id} disabled />
            {/if}
          </label>

          <label class="field-row">
            <span class="field-label">标题</span>
            <input
              type="text"
              class="form-input"
              bind:value={editingSkill.title}
              placeholder="Skill 显示名称"
            />
          </label>

          <div class="field-row inline">
            <div class="inline-field priority-field">
              <span class="field-label">优先级（越大越靠前）</span>
              <input
                type="number"
                class="form-input number"
                value={editingSkill.priority}
                on:input={(e) => {
                  const val = parseInt(e.currentTarget.value, 10);
                  editingSkill.priority = Number.isFinite(val) ? val : 0;
                }}
                min="0"
                max="100"
              />
              <span class="field-hint">仅影响多个 Skill 注入上下文时的排列顺序。</span>
            </div>
            <div class="inline-field">
              <span class="field-label">启用</span>
              <label class="switch">
                <input type="checkbox" bind:checked={editingSkill.enabled} />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div class="editor-guidance">
          <label class="field-row vertical">
            <span class="field-label">能力说明正文</span>
            <textarea
              class="form-textarea"
              bind:value={editingSkill.guidance}
              placeholder="在此写入能力边界、证据原则和通用使用策略..."
              rows={12}
            ></textarea>
          </label>
          <div class="guidance-meta">
            <span class="char-count">{editingSkill.guidance.length} 字符</span>
            {#if editingSkill.guidance.length > 8000}
              <span class="char-hint">建议保持简洁，过长会占用上下文</span>
            {/if}
          </div>
        </div>

        {#if editorError}
          <div class="editor-error">{editorError}</div>
        {/if}
      </div>

      <div class="editor-footer">
        <button type="button" class="action-btn secondary" on:click={closeEditor}>
          取消
        </button>
        <button type="button" class="action-btn primary" on:click={saveUserSkill}>
          保存
        </button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .skills-settings-tab {
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

    &.with-actions {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
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

  .add-skill-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    background: var(--b3-theme-primary);
    color: #ffffff;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.4;
    font-family: inherit;
    transition: all 0.15s ease;
    flex-shrink: 0;

    &:hover {
      filter: brightness(1.1);
    }
  }

  .skills-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .skill-card {
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skill-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .skill-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .skill-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .skill-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .skill-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;

    &.builtin {
      color: var(--b3-theme-on-surface);
      background: var(--b3-theme-surface-light);
    }

    &.user {
      color: #ffffff;
      background: var(--b3-theme-primary);
    }
  }

  .skill-description {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    line-height: 1.4;
  }

  .skill-meta-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .skill-meta {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
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
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: var(--b3-theme-surface-lighter);
    border-radius: 24px;
    transition: 0.2s;
  }

  .slider::before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    border-radius: 50%;
    transition: 0.2s;
  }

  .switch input:checked + .slider {
    background-color: var(--b3-theme-primary);
  }

  .switch input:checked + .slider::before {
    transform: translateX(20px);
  }

  .skill-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 4px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    font-size: 12px;
    line-height: 1.4;
    font-family: inherit;
    transition: all 0.15s;

    &:hover {
      background: var(--b3-theme-surface-light);
    }

    &.edit {
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-primary);
    }

    &.danger {
      border-color: var(--b3-theme-error);
      color: var(--b3-theme-error);
    }

    &.primary {
      background: var(--b3-theme-primary);
      color: #ffffff;
      border-color: var(--b3-theme-primary);

      &:hover {
        filter: brightness(1.1);
      }
    }

    &.secondary {
      background: var(--b3-theme-background);
    }
  }

  .skill-details {
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;

    &[open] {
      padding-bottom: 8px;
    }
  }

  .details-summary {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    padding: 6px 10px;
    user-select: none;
    opacity: 0.8;
  }

  .details-body {
    padding: 0 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detail-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    opacity: 0.9;
  }

  .detail-content {
    margin: 0;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
    opacity: 0.85;
  }

  .empty-state {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
    padding: 16px 0;
  }

  // Editor modal
  .skill-editor-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 24px;
  }

  .skill-editor-panel {
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    width: 100%;
    max-width: 720px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .editor-header {
    padding: 14px 18px;
    border-bottom: 1px solid var(--b3-border-color);

    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--b3-theme-on-surface);
    }
  }

  .editor-body {
    padding: 16px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .editor-fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 10px;

    &.vertical {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }

    &.inline {
      flex-wrap: wrap;
      gap: 16px;
    }
  }

  .field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    min-width: 48px;
    flex-shrink: 0;
  }

  .inline-field {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .inline-field.priority-field {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .field-hint {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .form-input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.4;
    min-width: 0;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.number {
      width: 72px;
      flex: none;
    }
  }

  .form-textarea {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.6;
    resize: vertical;
    min-height: 120px;
  }

  .editor-guidance {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .guidance-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .char-count {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .char-hint {
    font-size: 12px;
    color: var(--b3-theme-error);
    opacity: 0.85;
  }

  .detail-content.preview {
    white-space: pre-wrap;
  }

  .editor-error {
    padding: 8px 12px;
    border-radius: 4px;
    background: rgba(244, 67, 54, 0.1);
    border: 1px solid #f44336;
    color: #c62828;
    font-size: 13px;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 18px;
    border-top: 1px solid var(--b3-border-color);
  }
</style>
