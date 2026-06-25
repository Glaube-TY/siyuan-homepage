<script lang="ts">
  import { onMount } from "svelte";
  import type {
    KbSettings,
    NotebrainAgentWorkspaceSettings,
    NotebrainPermissionAction,
    RuntimeToolsSettings,
  } from "../../../types/settings";
  import { NOTEBRAIN_WORKSPACE_LOGICAL_ROOT } from "../../../services/agent-workbench/workspace/notebrain-workspace-paths";
  import {
    getNotebrainRuntimeEnvironment,
    resolveNotebrainAbsolutePath,
  } from "../../../services/agent-workbench/workspace/notebrain-runtime-env";
  import {
    refreshRuntimeToolReport,
  } from "../../../services/agent-workbench/runtime-tools/runtime-tool-resolver";
  import type { RuntimeToolReport, RuntimeToolName } from "../../../services/agent-workbench/runtime-tools/runtime-tool-types";
  import { DEFAULT_RUNTIME_TOOLS_SETTINGS } from "../../../constants/default-settings";
  import { pushAgentDebugEvent } from "../../../services/agent-workbench/debug/workbench-debug";

  export let settings: KbSettings;

  let envStatus = getNotebrainRuntimeEnvironment();
  let resolvedRoot = "";
  let resolveMessage = "";

  // Runtime tools state
  let runtimeReport: RuntimeToolReport | null = null;
  let detecting = false;
  let newOverrideKey = "";
  let newOverrideValue = "";
  let newExtraPath = "";
  let statusMessage = "";

  $: workspace = settings.notebrainWorkspace;
  $: runtimeTools = settings.runtimeTools ?? DEFAULT_RUNTIME_TOOLS_SETTINGS;
  $: sandboxEnabled = workspace.enabled && envStatus.isPcElectron;
  $: commandEnabled = sandboxEnabled && workspace.commandExecutionEnabled;
  $: mcpEnabled = settings.mcp?.enabled === true;
  $: exposeToAgentEffective = runtimeTools.enabled && runtimeTools.exposeToAgent && (commandEnabled || mcpEnabled);
  $: canDetectRuntimeTools = runtimeTools.enabled && (commandEnabled || mcpEnabled);

  onMount(async () => {
    envStatus = getNotebrainRuntimeEnvironment();
    const resolved = await resolveNotebrainAbsolutePath("");
    if (resolved.ok) {
      resolvedRoot = resolved.rootAbsolutePath;
      resolveMessage = "";
    } else {
      resolvedRoot = "";
      resolveMessage = resolved.message;
    }
    // Run initial detection only when runtime tools is enabled AND
    // either local command tool or MCP is active.
    const initCmdOk = envStatus.isPcElectron && settings.notebrainWorkspace.enabled && settings.notebrainWorkspace.commandExecutionEnabled;
    const initMcpOk = settings.mcp?.enabled === true;
    if (envStatus.isPcElectron && runtimeTools.enabled && (initCmdOk || initMcpOk)) {
      void runDetection();
    }
  });

  async function runDetection(explicitSettings?: RuntimeToolsSettings) {
    // Defensive early return: non-PC/Electron environments cannot execute
    // local commands or detect runtime tools. Even if the button is disabled,
    // other call paths must not invoke the native detection logic.
    if (!envStatus.isPcElectron) {
      runtimeReport = null;
      statusMessage = "当前环境不支持运行时工具检测，需在 PC/Electron 桌面端执行。";
      pushAgentDebugEvent("RUNTIME_TOOLS_DETECTION_SKIPPED", {
        platformLabel: envStatus.platformLabel,
        reasonCode: envStatus.reasonCode,
        unsupportedCapabilities: envStatus.unsupportedCapabilities,
      }, "info");
      return;
    }
    // runtimeTools.enabled must be true to detect
    if (!runtimeTools.enabled) {
      runtimeReport = null;
      statusMessage = "运行时工具检测已关闭。";
      return;
    }
    // Detection only serves local command tool or MCP stdio.
    // If neither is active, detection is meaningless.
    if (!commandEnabled && !mcpEnabled) {
      runtimeReport = null;
      statusMessage = "当前未启用本地命令工具或 MCP Client，运行时工具检测暂不生效。";
      return;
    }
    detecting = true;
    const start = Date.now();
    const effectiveSettings = explicitSettings ?? runtimeTools;
    try {
      runtimeReport = refreshRuntimeToolReport(effectiveSettings);
      const availableCount = Object.entries(runtimeReport.tools).filter(([, v]) => v.available).length;
      pushAgentDebugEvent("RUNTIME_TOOLS_DETECTED", {
        available: availableCount,
        total: Object.keys(runtimeReport.tools).length,
        durationMs: Date.now() - start,
      }, "info");
    } catch {
      runtimeReport = null;
    } finally {
      detecting = false;
    }
  }

  function patchWorkspace(patch: Partial<NotebrainAgentWorkspaceSettings>) {
    settings = {
      ...settings,
      notebrainWorkspace: {
        ...settings.notebrainWorkspace,
        ...patch,
      },
    };
  }

  function patchRuntimeTools(patch: Partial<RuntimeToolsSettings>) {
    settings = {
      ...settings,
      runtimeTools: {
        ...settings.runtimeTools,
        ...patch,
      },
    };
  }

  function toNumber(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function splitRules(value: string): string[] {
    const seen = new Set<string>();
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) seen.add(trimmed);
    }
    return [...seen];
  }

  function updateDefaultAction(value: string) {
    const action: NotebrainPermissionAction =
      value === "allow" || value === "deny" ? value : "ask";
    patchWorkspace({ commandDefaultAction: action });
  }

  function addCommandOverride() {
    const key = newOverrideKey.trim().toLowerCase();
    const value = newOverrideValue.trim();
    if (!key || !value) {
      statusMessage = "命令名和完整路径不能为空。";
      return;
    }
    const nextCommandOverrides = { ...runtimeTools.commandOverrides, [key]: value };
    if (runtimeTools.commandOverrides[key]) {
      statusMessage = `已更新「${key}」的覆盖路径。`;
    } else {
      statusMessage = `已添加「${key}」的覆盖路径。`;
    }
    const nextRuntimeTools = { ...runtimeTools, commandOverrides: nextCommandOverrides };
    patchRuntimeTools({ commandOverrides: nextCommandOverrides });
    newOverrideKey = "";
    newOverrideValue = "";
    // Only run detection on PC/Electron — non-PC cannot execute or detect.
    if (envStatus.isPcElectron) {
      void runDetection(nextRuntimeTools);
    } else {
      statusMessage = `${statusMessage} 配置已保存，但当前环境不能检测和执行，需在 PC/Electron 生效。`;
    }
  }

  function removeCommandOverride(key: string) {
    const next = { ...runtimeTools.commandOverrides };
    delete next[key];
    const nextRuntimeTools = { ...runtimeTools, commandOverrides: next };
    patchRuntimeTools({ commandOverrides: next });
    statusMessage = `已移除「${key}」的覆盖路径。`;
    if (envStatus.isPcElectron) {
      void runDetection(nextRuntimeTools);
    } else {
      statusMessage = `${statusMessage} 当前环境不能检测和执行，需在 PC/Electron 生效。`;
    }
  }

  function addExtraPath() {
    const dir = newExtraPath.trim();
    if (!dir) {
      statusMessage = "目录路径不能为空。";
      return;
    }
    if (runtimeTools.extraPathDirs.includes(dir)) {
      statusMessage = "该目录已存在，未重复添加。";
      return;
    }
    const nextExtraPathDirs = [...runtimeTools.extraPathDirs, dir];
    const nextRuntimeTools = { ...runtimeTools, extraPathDirs: nextExtraPathDirs };
    statusMessage = `已添加额外 PATH 目录：${dir}`;
    patchRuntimeTools({ extraPathDirs: nextExtraPathDirs });
    newExtraPath = "";
    if (envStatus.isPcElectron) {
      void runDetection(nextRuntimeTools);
    } else {
      statusMessage = `${statusMessage} 配置已保存，但当前环境不能检测和执行，需在 PC/Electron 生效。`;
    }
  }

  function removeExtraPath(index: number) {
    const next = [...runtimeTools.extraPathDirs];
    next.splice(index, 1);
    const nextRuntimeTools = { ...runtimeTools, extraPathDirs: next };
    patchRuntimeTools({ extraPathDirs: next });
    statusMessage = "已移除额外 PATH 目录。";
    if (envStatus.isPcElectron) {
      void runDetection(nextRuntimeTools);
    } else {
      statusMessage = `${statusMessage} 当前环境不能检测和执行，需在 PC/Electron 生效。`;
    }
  }

  const IMPORTANT_TOOLS: RuntimeToolName[] = ["node", "npx", "npm", "git", "python", "python3", "uvx"];
</script>

<div class="agent-workspace-settings-tab">
  <div class="sandbox-status-bar">
    <span class="status-row">
      <span class:status-ok={envStatus.isPcElectron} class:status-warn={!envStatus.isPcElectron} class="status-dot"></span>
      {envStatus.isPcElectron ? "PC/Electron 可用" : envStatus.message || "当前环境不可执行本地命令"}
    </span>
    {#if resolvedRoot}
      <code class="path-value inline">{resolvedRoot}</code>
    {/if}
  </div>
  <p class="sandbox-short-note">限制 AI 的本地命令、文件写入和网络访问。当前不是系统级沙箱，命令仍可能读取系统信息或访问用户有权限的路径。cwd 限制在 {NOTEBRAIN_WORKSPACE_LOGICAL_ROOT}。</p>

  <section class="settings-section">
    <div class="setting-row master-row">
      <div class="setting-text">
        <span class="setting-title">启用沙箱环境</span>
        <span class="setting-desc">总开关。关闭后本页所有沙箱相关设置暂不生效，不注册沙箱工具，不进行环境检测。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={workspace.enabled}
          on:change={(event) => patchWorkspace({ enabled: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>
  </section>

  {#if !workspace.enabled}
    <p class="sandbox-short-note">沙箱环境已关闭。启用后可配置本地命令执行、文件工具和运行时工具检测。</p>
  {:else}
  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">基础开关</h2>
    </div>

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">启用本地命令工具</span>
        <span class="setting-desc">关闭后 `run_notebrain_command` 不会注册给 Agent。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={workspace.commandExecutionEnabled}
          on:change={(event) => patchWorkspace({ commandExecutionEnabled: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">启用文件写入/删除工具</span>
        <span class="setting-desc">关闭后 `write_notebrain_file` 和 `delete_notebrain_path` 不会注册。读取/列目录不受影响。skill_install 内部写入不受此开关控制。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={workspace.fileWriteToolsEnabled}
          on:change={(event) => patchWorkspace({ fileWriteToolsEnabled: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">严格工作区模式</span>
        <span class="setting-desc">拒绝系统信息、绝对路径、父级路径、PowerShell、管道/重定向和危险删除等命令（推荐开启）。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={workspace.commandStrictWorkspaceMode !== false}
          on:change={(event) => patchWorkspace({ commandStrictWorkspaceMode: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>

    <div class="form-grid">
      <label class="field-row">
        <span class="field-label">默认超时</span>
        <input
          type="number"
          min="5000"
          max="600000"
          step="1000"
          value={workspace.defaultCommandTimeoutMs}
          on:input={(event) => patchWorkspace({
            defaultCommandTimeoutMs: toNumber(event.currentTarget.value, workspace.defaultCommandTimeoutMs),
          })}
        />
        <span class="field-hint">毫秒，保存时限制在 5000-600000。{!commandEnabled ? '仅在启用本地命令工具后生效。' : ''}</span>
      </label>

      <label class="field-row">
        <span class="field-label">最大输出</span>
        <input
          type="number"
          min="2000"
          max="100000"
          step="1000"
          value={workspace.maxCommandOutputChars}
          on:input={(event) => patchWorkspace({
            maxCommandOutputChars: toNumber(event.currentTarget.value, workspace.maxCommandOutputChars),
          })}
        />
        <span class="field-hint">字符数，stdout/stderr 都会按该上限截断。{!commandEnabled ? '仅在启用本地命令工具后生效。' : ''}</span>
      </label>

      <label class="field-row">
        <span class="field-label">默认权限</span>
        <select
          value={workspace.commandDefaultAction}
          on:change={(event) => updateDefaultAction(event.currentTarget.value)}
        >
          <option value="ask">ask - 执行前确认</option>
          <option value="allow">allow - 命中规则时免确认</option>
          <option value="deny">deny - 默认拒绝</option>
        </select>
        <span class="field-hint">deny 规则优先于 allow，allow 优先于 ask。{!commandEnabled ? '仅在启用本地命令工具后生效。' : ''}</span>
      </label>
    </div>
  </section>

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">命令权限规则</h2>
      <p class="section-description">每行一个模式，支持 `*` 通配和普通子串匹配。规则只改变确认策略，不放宽工作区限制。{!commandEnabled ? '仅在启用本地命令工具后生效。' : ''}</p>
    </div>

    <div class="rules-grid">
      <label class="rules-field">
        <span class="field-label">allow</span>
        <textarea
          rows="5"
          spellcheck="false"
          value={(workspace.commandAllowRules ?? []).join("\n")}
          on:input={(event) => patchWorkspace({ commandAllowRules: splitRules(event.currentTarget.value) })}
          placeholder="pnpm *"
        ></textarea>
      </label>
      <label class="rules-field">
        <span class="field-label">ask</span>
        <textarea
          rows="5"
          spellcheck="false"
          value={(workspace.commandAskRules ?? []).join("\n")}
          on:input={(event) => patchWorkspace({ commandAskRules: splitRules(event.currentTarget.value) })}
          placeholder="*"
        ></textarea>
      </label>
      <label class="rules-field">
        <span class="field-label">deny</span>
        <textarea
          rows="5"
          spellcheck="false"
          value={(workspace.commandDenyRules ?? []).join("\n")}
          on:input={(event) => patchWorkspace({ commandDenyRules: splitRules(event.currentTarget.value) })}
          placeholder="rm -rf *"
        ></textarea>
      </label>
    </div>
  </section>

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">网络与高级权限</h2>
      <p class="section-description">控制本地命令的网络访问和高级系统能力。默认保守。注意：这不是 OS 级网络隔离，只是启发式风险标记。{!commandEnabled ? '仅在启用本地命令工具后生效。' : ''}</p>
    </div>

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">允许命令访问网络</span>
        <span class="setting-desc">开启后允许 curl/wget/iwr 等网络命令。默认关闭；严格模式关闭该权限时，网络命令会被拒绝。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={workspace.allowNetworkAccess === true}
          on:change={(event) => patchWorkspace({ allowNetworkAccess: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">允许系统信息命令</span>
        <span class="setting-desc">开启后允许 systeminfo/wmic/ipconfig/whoami 等读取系统信息的命令。默认关闭，严格模式下这些命令会被拒绝。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={workspace.allowSystemInfoCommands === true}
          on:change={(event) => patchWorkspace({ allowSystemInfoCommands: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">允许绝对路径</span>
        <span class="setting-desc">开启后允许命令中包含绝对路径（如 C:\、/home、/etc 等）。默认关闭，严格模式下绝对路径会被拒绝。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={workspace.allowAbsolutePaths === true}
          on:change={(event) => patchWorkspace({ allowAbsolutePaths: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>
  </section>

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">本机运行时工具</h2>
      <p class="section-description">MCP stdio 和本地命令执行依赖的本机命令检测。可手动指定命令完整路径或添加额外 PATH 目录。</p>
    </div>

    {#if statusMessage}
      <p class="status-message">{statusMessage}</p>
    {/if}

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">启用运行时工具检测</span>
        <span class="setting-desc">关闭后不进行命令检测，MCP stdio 和命令执行仍可运行但不会自动解析命令路径。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={runtimeTools.enabled}
          on:change={(event) => patchRuntimeTools({ enabled: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>

    <div class="setting-row">
      <div class="setting-text">
        <span class="setting-title">暴露给 AI</span>
        <span class="setting-desc">仅当本地命令工具或 MCP Client 启用时，才会进入 Agent 上下文。{!commandEnabled && !mcpEnabled ? '当前本地命令和 MCP 均关闭，该开关无实际效果。' : ''}</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={runtimeTools.exposeToAgent}
          disabled={!commandEnabled && !mcpEnabled}
          on:change={(event) => patchRuntimeTools({ exposeToAgent: event.currentTarget.checked })}
        />
        <span class="slider"></span>
      </label>
    </div>

    {#if canDetectRuntimeTools}
      {#if !envStatus.isPcElectron}
        <p class="env-warning">{envStatus.userHint}</p>
      {/if}

      <div class="rt-section">
        <div class="rt-section-header">
          <span class="rt-section-title">自动检测结果</span>
          <button type="button" class="secondary-btn" on:click={() => runDetection()} disabled={detecting || !envStatus.isPcElectron}>
            {detecting ? "检测中…" : (!envStatus.isPcElectron ? "当前环境不支持" : "重新检测")}
          </button>
        </div>
        {#if runtimeReport}
          <div class="rt-grid">
            {#each IMPORTANT_TOOLS as toolName (toolName)}
              {@const det = runtimeReport.tools[toolName]}
              {#if det}
                <div class="rt-card" class:rt-ok={det.available} class:rt-fail={!det.available}>
                  <div class="rt-card-header">
                    <span class="rt-tool-name">{toolName}</span>
                    <span class="rt-badge" class:rt-badge-ok={det.available} class:rt-badge-fail={!det.available}>
                      {det.available ? "可用" : "未找到"}
                    </span>
                  </div>
                  {#if det.resolvedPath}
                    <code class="rt-path">{det.resolvedPath}</code>
                  {/if}
                  {#if det.warning}
                    <span class="rt-warning">{det.warning}</span>
                  {/if}
                  <span class="rt-meta">来源: {det.source === "user_override" ? "手动指定" : det.source === "auto_detected" ? "自动检测" : "未找到"}</span>
                </div>
              {/if}
            {/each}
          </div>
        {:else}
          <p class="muted">点击"重新检测"扫描本机命令。</p>
        {/if}
      </div>

      <div class="rt-section">
        <span class="rt-section-title">手动命令覆盖</span>
        <p class="field-hint">指定命令的完整路径，优先级高于自动检测。例如: npx → C:\APP\nodejs\npx.cmd</p>
        {#if !envStatus.isPcElectron}
          <p class="field-hint env-warning">配置可保存，但当前环境不能检测和执行。</p>
        {/if}
        {#each Object.entries(runtimeTools.commandOverrides) as [key, value] (key)}
          <div class="rt-override-row">
            <code class="rt-override-key">{key}</code>
            <code class="rt-override-value">{value}</code>
            <button type="button" class="danger-btn-sm" on:click={() => removeCommandOverride(key)}>移除</button>
          </div>
        {/each}
        <div class="rt-add-row">
          <input type="text" bind:value={newOverrideKey} placeholder="命令名 (如 npx)" class="rt-input-sm" />
          <input type="text" bind:value={newOverrideValue} placeholder="完整路径 (如 C:\APP\nodejs\npx.cmd)" class="rt-input-lg" />
          <button type="button" class="secondary-btn" on:click={addCommandOverride}>添加</button>
        </div>
      </div>

      <div class="rt-section">
        <span class="rt-section-title">额外 PATH 目录</span>
        <p class="field-hint">这些目录会在命令查找时加入 PATH 前缀。适用于命令不在系统 PATH 中的场景。</p>
        {#if !envStatus.isPcElectron}
          <p class="field-hint env-warning">配置可保存，但当前环境不能检测和执行。</p>
        {/if}
        {#each runtimeTools.extraPathDirs as dir, i (i)}
          <div class="rt-override-row">
            <code class="rt-override-value" style="flex:1">{dir}</code>
            <button type="button" class="danger-btn-sm" on:click={() => removeExtraPath(i)}>移除</button>
          </div>
        {/each}
        <div class="rt-add-row">
          <input type="text" bind:value={newExtraPath} placeholder="目录路径 (如 C:\APP\nodejs)" class="rt-input-lg" />
          <button type="button" class="secondary-btn" on:click={addExtraPath}>添加</button>
        </div>
      </div>
    {/if}
  </section>
  {/if}
</div>

<style lang="scss">
  @use '../_kb-tokens' as *;

  .agent-workspace-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .sandbox-status-bar {
    display: flex;
    align-items: center;
    gap: $kb-space-md;
    padding: $kb-space-sm $kb-space-md;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    background: var(--b3-theme-surface);
    font-size: $kb-fs-md;
    flex-wrap: wrap;
    box-shadow: $kb-shadow-card;
  }
  .sandbox-status-bar .path-value.inline {
    font-size: $kb-fs-sm;
    opacity: 0.7;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sandbox-short-note {
    margin: 8px 0 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
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

  .section-description,
  .setting-desc,
  .field-hint,
  .muted {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
    line-height: 1.5;
  }

  .section-description {
    margin: 0;
  }


  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .path-value {
    display: block;
    max-width: 100%;
    overflow-wrap: anywhere;
    font-family: var(--b3-font-family-code);
    font-size: 12px;
    line-height: 1.5;
    color: var(--b3-theme-on-surface);
  }

  .status-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-ok {
    background: var(--b3-theme-success, #2e7d32);
  }

  .status-warn {
    background: var(--b3-theme-error, #c62828);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
  }

  .setting-row.master-row {
    border-left: 3px solid var(--b3-theme-primary);
  }

  .setting-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-row input,
  .field-row select,
  .rules-field textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 7px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.4;
  }

  .rules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .rules-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rules-field textarea {
    resize: vertical;
    font-family: var(--b3-font-family-code);
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

  /* Runtime tools section */
  .rt-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
  }

  .rt-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .rt-section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .rt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }

  .rt-card {
    padding: 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rt-card.rt-ok {
    border-left: 3px solid var(--b3-theme-success, #2e7d32);
  }

  .rt-card.rt-fail {
    border-left: 3px solid var(--b3-theme-error, #c62828);
  }

  .rt-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .rt-tool-name {
    font-size: 13px;
    font-weight: 600;
    font-family: var(--b3-font-family-code);
    color: var(--b3-theme-on-surface);
  }

  .rt-badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 1.4;
  }

  .rt-badge-ok {
    background: var(--b3-theme-success-lightest, #e8f5e9);
    color: var(--b3-theme-success, #2e7d32);
  }

  .rt-badge-fail {
    background: var(--b3-theme-error-lightest, #fce4ec);
    color: var(--b3-theme-error, #c62828);
  }

  .rt-path {
    font-family: var(--b3-font-family-code);
    font-size: 11px;
    line-height: 1.4;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    overflow-wrap: anywhere;
  }

  .rt-warning {
    font-size: 11px;
    line-height: 1.4;
    color: var(--b3-theme-error, #c62828);
    opacity: 0.9;
  }

  .rt-meta {
    font-size: 11px;
    color: var(--b3-theme-on-surface);
    opacity: 0.5;
  }

  .rt-override-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .rt-override-key {
    font-family: var(--b3-font-family-code);
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    min-width: 60px;
  }

  .rt-override-value {
    font-family: var(--b3-font-family-code);
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    flex: 1;
    overflow-wrap: anywhere;
  }

  .rt-add-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .rt-input-sm,
  .rt-input-lg {
    padding: 5px 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    font-family: inherit;
  }

  .rt-input-sm {
    width: 120px;
    min-width: 0;
  }

  .rt-input-lg {
    flex: 1;
    min-width: 0;
  }

  .env-warning {
    color: var(--b3-card-warning-color, #e6a817);
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
    padding: 6px 10px;
    background: color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 10%, transparent);
    border-radius: 6px;
    border-left: 3px solid var(--b3-card-warning-color, #e6a817);
  }

  .danger-btn-sm {
    padding: 3px 8px;
    border: 1px solid var(--b3-theme-error);
    border-radius: 4px;
    background: transparent;
    color: var(--b3-theme-error);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .danger-btn-sm:hover {
    background: var(--b3-theme-error-lightest, #fce4ec);
  }

  .danger-btn-sm:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .secondary-btn {
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.4;
    font-family: inherit;
    padding: 6px 12px;
    transition: all 0.15s ease;
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
  }

  .secondary-btn:hover {
    filter: brightness(1.05);
  }

  .secondary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .status-message {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--b3-theme-success, #2e7d32);
  }
</style>
