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
  import {
    loadExternalSkillIndex,
    rebuildExternalSkillIndex,
    saveExternalSkillIndex,
    deleteInstalledExternalSkill,
  } from "../../../services/agent-workbench/skills/external/external-skill-index";
  import type { ExternalSkillIndexEntry } from "../../../services/agent-workbench/skills/external/external-skill-types";
  import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";

  export let settings: KbSettings;

  // 用户 Skill 列表
  let userSkills: UserSkillIndexEntry[] = [];
  let loadingUserSkills = false;
  let installedExternalSkills: ExternalSkillIndexEntry[] = [];
  let loadingExternalSkills = false;
  let externalSkillMessage = "";
  let externalSkillError = "";

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
  $: sortedInstalledExternalSkills = [...installedExternalSkills].sort((a, b) => {
    if (Number(b.enabled !== false) !== Number(a.enabled !== false)) {
      return Number(b.enabled !== false) - Number(a.enabled !== false);
    }
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

  async function refreshExternalSkillList() {
    loadingExternalSkills = true;
    externalSkillError = "";
    try {
      const index = await loadExternalSkillIndex();
      installedExternalSkills = index.skills;
    } catch (e) {
      console.error("[SkillsSettingsTab] Failed to load external skills", e);
      installedExternalSkills = [];
      externalSkillError = e instanceof Error ? e.message : "读取外部 Skill 索引失败。";
    } finally {
      loadingExternalSkills = false;
    }
  }

  onMount(() => {
    void refreshUserSkillList();
    void refreshExternalSkillList();
  });

  function patchExternalSkillSettings(patch: Partial<KbSettings["externalSkills"]>) {
    settings = {
      ...settings,
      externalSkills: {
        ...settings.externalSkills,
        ...patch,
      },
    };
  }

  function isExternalSkillVisible(entry: ExternalSkillIndexEntry): boolean {
    return entry.enabled !== false && !(settings.externalSkills?.disabledSkillIds ?? []).includes(entry.id);
  }

  function toggleExternalSkillVisible(entry: ExternalSkillIndexEntry) {
    const disabled = new Set(settings.externalSkills?.disabledSkillIds ?? []);
    if (disabled.has(entry.id)) {
      disabled.delete(entry.id);
    } else {
      disabled.add(entry.id);
    }
    patchExternalSkillSettings({ disabledSkillIds: [...disabled].sort() });
  }

  async function setInstalledSkillEnabled(entry: ExternalSkillIndexEntry, enabled: boolean) {
    const index = await loadExternalSkillIndex();
    const next = {
      ...index,
      updatedAt: Date.now(),
      skills: index.skills.map((item) =>
        item.id === entry.id ? { ...item, enabled, updatedAt: Date.now() } : item
      ),
    };
    await saveExternalSkillIndex(next);
    externalSkillMessage = enabled ? "外部 Skill 已恢复到索引。" : "外部 Skill 已在索引中停用。";
    await refreshExternalSkillList();
  }

  async function deleteInstalledSkill(entry: ExternalSkillIndexEntry) {
    // Only allow deleting non-user installed skills
    if (entry.sourceType === "user") {
      externalSkillError = "用户自定义 Skill 不能通过此操作删除，请在「自定义 Skill」区域管理。";
      return;
    }
    const confirmed = await confirmDialogBoolean({
      title: "删除外部 Skill",
      content: safeConfirmContent("确定要删除外部 Skill「", entry.title || entry.id, "」吗？会删除该 Skill 在 notebrain/skills/installed 下的本地文件夹，并从 skills/index.json 移除索引；不会删除用户自定义 Skill，不会影响其他 Skill。"),
    });
    if (!confirmed) return;
    loadingExternalSkills = true;
    externalSkillMessage = "";
    externalSkillError = "";
    try {
      const result = await deleteInstalledExternalSkill(entry);
      // Also remove from settings.disabledSkillIds if present
      const disabled = new Set(settings.externalSkills?.disabledSkillIds ?? []);
      if (disabled.has(entry.id)) {
        disabled.delete(entry.id);
        patchExternalSkillSettings({ disabledSkillIds: [...disabled].sort() });
      }
      externalSkillMessage = `已删除本地文件夹 ${result.deletedRootDir}，并从索引移除 ${result.removedCount} 条记录；启用/停用设置清理请保存设置后持久化。`;
      await refreshExternalSkillList();
    } catch (e) {
      externalSkillError = e instanceof Error ? e.message : "删除外部 Skill 失败。";
    } finally {
      loadingExternalSkills = false;
    }
  }

  async function rebuildInstalledSkillIndex() {
    const confirmed = await confirmDialogBoolean({
      title: "重建外部 Skill 索引",
      content: "将扫描 notebrain/skills/installed 下的 SKILL.md 并重写 skills/index.json。继续吗？",
    });
    if (!confirmed) return;
    loadingExternalSkills = true;
    externalSkillMessage = "";
    externalSkillError = "";
    try {
      const index = await rebuildExternalSkillIndex("settings");
      installedExternalSkills = index.skills;
      externalSkillMessage = `已重建索引，发现 ${index.skills.length} 个外部 Skill。`;
    } catch (e) {
      externalSkillError = e instanceof Error ? e.message : "重建外部 Skill 索引失败。";
    } finally {
      loadingExternalSkills = false;
    }
  }

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
    const confirmed = await confirmDialogBoolean({
      title: "删除自定义 Skill",
      content: safeConfirmContent("确定要删除自定义 Skill「", entry.title, "」吗？"),
    });
    if (!confirmed) return;
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

  <!-- 外部 Skill -->
  <div class="section">
    <div class="section-header with-actions">
      <div>
        <h2 class="section-title">外部 Skill</h2>
        <p class="section-description">第三方、AI 安装和旧自定义 Skill 都以索引方式暴露；需要使用时由 Agent 按需读取。</p>
      </div>
      <button type="button" class="add-skill-btn" on:click={rebuildInstalledSkillIndex} disabled={loadingExternalSkills}>
        重建索引
      </button>
    </div>

    <div class="settings-grid">
      <label class="setting-card">
        <span class="setting-main">
          <span class="setting-title">启用外部 Skill</span>
          <span class="setting-desc">关闭后 `skill_list` / `skill_read` 等工具不可用，外部 Skill 索引也不会注入。</span>
        </span>
        <span class="switch">
          <input
            type="checkbox"
            checked={settings.externalSkills?.enabled}
            on:change={(event) => patchExternalSkillSettings({ enabled: event.currentTarget.checked })}
          />
          <span class="slider"></span>
        </span>
      </label>

      <label class="setting-card">
        <span class="setting-main">
          <span class="setting-title">允许安装外部 Skill</span>
          <span class="setting-desc">安装仍会走写操作确认，目标限制在 notebrain/skills/installed。</span>
        </span>
        <span class="switch">
          <input
            type="checkbox"
            checked={settings.externalSkills?.autoInstallEnabled}
            on:change={(event) => patchExternalSkillSettings({ autoInstallEnabled: event.currentTarget.checked })}
          />
          <span class="slider"></span>
        </span>
      </label>

      <label class="setting-card">
        <span class="setting-main">
          <span class="setting-title">兼容旧全文注入</span>
          <span class="setting-desc">默认关闭。仅当旧自定义 Skill 依赖每轮全文上下文时临时启用。</span>
        </span>
        <span class="switch">
          <input
            type="checkbox"
            checked={settings.externalSkills?.legacyUserSkillDirectInject === true}
            on:change={(event) => patchExternalSkillSettings({ legacyUserSkillDirectInject: event.currentTarget.checked })}
          />
          <span class="slider"></span>
        </span>
      </label>

      <label class="setting-card vertical">
        <span class="setting-title">单次读取上限</span>
        <input
          type="number"
          min="2000"
          max="100000"
          step="1000"
          value={settings.externalSkills?.maxSkillReadChars ?? 20000}
          on:input={(event) => patchExternalSkillSettings({ maxSkillReadChars: Number(event.currentTarget.value) || 20000 })}
        />
        <span class="setting-desc">`skill_read` 和 `skill_read_file` 的最大读取字符数。</span>
      </label>
    </div>

    {#if externalSkillMessage}
      <p class="status-message">{externalSkillMessage}</p>
    {/if}
    {#if externalSkillError}
      <p class="error-message">{externalSkillError}</p>
    {/if}

    {#if loadingExternalSkills}
      <p class="empty-state">加载中...</p>
    {:else if installedExternalSkills.length === 0}
      <p class="empty-state">暂无已安装第三方 Skill。可让 Agent 通过 `skill_install` 安装，或将 Skill 包放入 notebrain/skills/installed 后重建索引。</p>
    {:else}
      <div class="skills-list">
        {#each sortedInstalledExternalSkills as entry (entry.id)}
          <div class="skill-card">
            <div class="skill-main">
              <div class="skill-info">
                <div class="skill-title-row">
                  <span class="skill-title">{entry.title || entry.id}</span>
                  <span class="skill-badge external">{entry.sourceType}</span>
                  {#if entry.enabled === false}
                    <span class="skill-badge disabled">索引停用</span>
                  {/if}
                  {#if entry.trusted}
                    <span class="skill-badge trusted">trusted</span>
                  {/if}
                </div>
                <span class="skill-description">{entry.description}</span>
                <div class="skill-meta-row">
                  <span class="skill-meta">{entry.rootDir}/{entry.entry}</span>
                  {#if entry.requiredEnvVars?.length}
                    <span class="skill-meta">需要环境变量：{entry.requiredEnvVars.join(", ")}</span>
                  {/if}
                </div>
              </div>
              <div class="skill-actions">
                <div class="toggle-wrap">
                  <span class="toggle-label">{isExternalSkillVisible(entry) ? "已启用" : "已停用"}</span>
                  <label class="switch">
                    <input
                      type="checkbox"
                      checked={isExternalSkillVisible(entry)}
                      disabled={entry.enabled === false}
                      on:change={() => toggleExternalSkillVisible(entry)}
                    />
                    <span class="slider"></span>
                  </label>
                </div>
                {#if entry.enabled === false}
                  <button type="button" class="action-btn edit" on:click={() => setInstalledSkillEnabled(entry, true)}>
                    恢复
                  </button>
                {:else}
                  <button type="button" class="action-btn danger" on:click={() => deleteInstalledSkill(entry)}>
                    删除
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 用户自定义 Skill -->
  <div class="section">
    <div class="section-header with-actions">
      <div>
        <h2 class="section-title">自定义 Skill</h2>
        <p class="section-description">由你编写的能力说明会作为外部 Skill 索引暴露；默认不再每轮全文注入上下文。</p>
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
  @use '../_kb-tokens' as *;

  .skills-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: $kb-space-md;
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;

    &.with-actions {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: $kb-space-md;
    }
  }

  .section-title {
    margin: 0;
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: $kb-space-sm;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .section-description {
    margin: 0;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .add-skill-btn {
    padding: 6px 14px;
    border: none;
    border-radius: $kb-radius-md;
    background: var(--b3-theme-primary);
    color: #ffffff;
    cursor: pointer;
    font-size: $kb-fs-md;
    line-height: 1.4;
    font-family: inherit;
    transition:
      background $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;
    flex-shrink: 0;
    box-shadow: $kb-shadow-none;

    &:hover {
      box-shadow: $kb-shadow-raised;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: $kb-space-sm;
  }

  .setting-card {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $kb-space-md;
    padding: $kb-space-md;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    background: var(--b3-theme-surface);
    box-shadow: $kb-shadow-card;
    transition:
      box-shadow $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out;

    &:hover {
      box-shadow: $kb-shadow-raised;
      border-color: color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-border-color));
    }

    &.vertical {
      align-items: stretch;
      flex-direction: column;
    }
  }

  .setting-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
  }

  .setting-title {
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .setting-desc {
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
    line-height: 1.5;
  }

  .setting-card input[type="number"] {
    width: 140px;
    padding: 6px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: $kb-fs-md;
    font-family: inherit;
    transition:
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;

    &:focus {
      border-color: var(--b3-theme-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
      outline: none;
    }
  }

  .status-message,
  .error-message {
    margin: 0;
    font-size: $kb-fs-md;
    line-height: 1.5;
  }

  .status-message {
    color: var(--b3-theme-success, #2e7d32);
  }

  .error-message {
    color: var(--b3-theme-error, #c62828);
  }

  .skills-list {
    display: flex;
    flex-direction: column;
    gap: $kb-space-sm;
  }

  .skill-card {
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    padding: $kb-space-md;
    display: flex;
    flex-direction: column;
    gap: $kb-space-sm;
    box-shadow: $kb-shadow-card;
    transition:
      box-shadow $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out;

    &:hover {
      box-shadow: $kb-shadow-raised;
      border-color: color-mix(in srgb, var(--b3-theme-primary) 18%, var(--b3-border-color));
    }
  }

  .skill-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $kb-space-md;
  }

  .skill-info {
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
    min-width: 0;
    flex: 1;
  }

  .skill-title-row {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    flex-wrap: wrap;
  }

  .skill-title {
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .skill-badge {
    font-size: $kb-fs-xs;
    padding: 1px 6px;
    border-radius: $kb-radius-sm;
    font-weight: 500;

    &.builtin {
      color: var(--b3-theme-on-surface);
      background: var(--b3-theme-surface-light);
    }

    &.user {
      color: #ffffff;
      background: var(--b3-theme-primary);
    }

    &.external {
      color: var(--b3-theme-primary);
      background: var(--b3-theme-primary-lightest);
    }

    &.trusted {
      color: var(--b3-theme-success, #2e7d32);
      background: var(--b3-theme-success-lightest, #e8f5e9);
    }

    &.disabled {
      color: var(--b3-theme-on-surface);
      background: var(--b3-theme-surface-lighter);
      opacity: 0.75;
    }
  }

  .skill-description {
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    line-height: 1.4;
  }

  .skill-meta-row {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    flex-wrap: wrap;
  }

  .skill-meta {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .toggle-wrap {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .toggle-label {
    font-size: $kb-fs-md;
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
    transition: background $kb-dur-normal $kb-ease-out;
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
    transition: transform $kb-dur-normal $kb-ease-out;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
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
    gap: $kb-space-sm;
    flex-shrink: 0;
  }

  .action-btn {
    padding: $kb-space-xs 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    font-size: $kb-fs-sm;
    line-height: 1.4;
    font-family: inherit;
    transition:
      background $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;

    &:hover {
      background: var(--b3-theme-surface-light);
      box-shadow: $kb-shadow-card;
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
        box-shadow: $kb-shadow-raised;
      }
    }

    &.secondary {
      background: var(--b3-theme-background);
    }
  }

  .skill-details {
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;

    &[open] {
      padding-bottom: $kb-space-sm;
    }
  }

  .details-summary {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    padding: $kb-space-xs $kb-space-sm;
    user-select: none;
    opacity: 0.8;
  }

  .details-body {
    padding: 0 $kb-space-sm;
    display: flex;
    flex-direction: column;
    gap: $kb-space-sm;
  }

  .detail-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detail-label {
    font-size: $kb-fs-sm;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    opacity: 0.9;
  }

  .detail-content {
    margin: 0;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
    opacity: 0.85;
  }

  .empty-state {
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
    padding: $kb-space-lg 0;
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
    padding: $kb-space-2xl;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .skill-editor-panel {
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-xl;
    width: 100%;
    max-width: 720px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow:
      $kb-shadow-modal,
      inset 0 1px 0 rgba(255, 255, 255, 0.5);
  }

  .editor-header {
    padding: $kb-space-lg $kb-space-xl;
    border-bottom: 1px solid var(--b3-border-color);

    h3 {
      margin: 0;
      font-size: $kb-fs-xl;
      font-weight: 600;
      color: var(--b3-theme-on-surface);
    }
  }

  .editor-body {
    padding: $kb-space-lg $kb-space-xl;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: $kb-space-lg;
  }

  .editor-fields {
    display: flex;
    flex-direction: column;
    gap: $kb-space-sm;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;

    &.vertical {
      flex-direction: column;
      align-items: stretch;
      gap: $kb-space-xs;
    }

    &.inline {
      flex-wrap: wrap;
      gap: $kb-space-lg;
    }
  }

  .field-label {
    font-size: $kb-fs-md;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    min-width: 48px;
    flex-shrink: 0;
  }

  .inline-field {
    display: flex;
    align-items: center;
    gap: $kb-space-xs;
  }

  .inline-field.priority-field {
    flex-direction: column;
    align-items: flex-start;
    gap: $kb-space-xs;
  }

  .field-hint {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .form-input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: $kb-fs-md;
    font-family: inherit;
    line-height: 1.4;
    min-width: 0;
    transition:
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;

    &:focus {
      border-color: var(--b3-theme-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
      outline: none;
    }

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
    padding: $kb-space-sm 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: $kb-fs-md;
    font-family: inherit;
    line-height: 1.6;
    resize: vertical;
    min-height: 120px;
    transition:
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;

    &:focus {
      border-color: var(--b3-theme-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
      outline: none;
    }
  }

  .editor-guidance {
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
  }

  .guidance-meta {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    flex-wrap: wrap;
  }

  .char-count {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .char-hint {
    font-size: $kb-fs-sm;
    color: var(--b3-theme-error);
    opacity: 0.85;
  }

  .detail-content.preview {
    white-space: pre-wrap;
  }

  .editor-error {
    padding: $kb-space-sm $kb-space-md;
    border-radius: $kb-radius-md;
    background: rgba(244, 67, 54, 0.1);
    border: 1px solid #f44336;
    color: #c62828;
    font-size: $kb-fs-md;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: $kb-space-sm;
    padding: $kb-space-md $kb-space-xl;
    border-top: 1px solid var(--b3-border-color);
  }

  // Dark mode: dim the inner highlight
  @media (prefers-color-scheme: dark) {
    .skill-editor-panel {
      box-shadow:
        $kb-shadow-modal,
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
  }
</style>
