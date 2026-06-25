<script lang="ts">
  import { onMount } from "svelte";
  import type { KbSettings, McpSettings } from "../../../types/settings";
  import type { McpServerConfig, McpToolIndexEntry, McpTransportType } from "../../../services/agent-workbench/mcp/mcp-types";
  import {
    loadMcpServers,
    normalizeMcpServerConfig,
    saveMcpServers,
  } from "../../../services/agent-workbench/mcp/mcp-config-store";
  import { loadMcpToolIndex, removeMcpToolsForServer, getMcpToolNamesForServer } from "../../../services/agent-workbench/mcp/mcp-tool-index";
  import { syncMcpServerTools, diagnoseStdioCommand, getStdioCommandResolvedInfo } from "../../../services/agent-workbench/mcp/mcp-client-manager";
  import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
  import { pushAgentDebugEvent } from "../../../services/agent-workbench/debug/workbench-debug";
  import { getNotebrainRuntimeEnvironment } from "../../../services/agent-workbench/workspace/notebrain-runtime-env";

  export let settings: KbSettings;

  let servers: McpServerConfig[] = [];
  let tools: McpToolIndexEntry[] = [];
  let loading = false;
  let syncingServerId = "";
  let statusMessage = "";
  let errorMessage = "";
  let toolQuery = "";

  let showEditor = false;
  let editorError = "";
  let editingServer: McpServerConfig = createEmptyServer();
  let argsText = "";
  let envText = "";

  $: mcp = settings.mcp;
  $: activeServerIds = new Set(servers.map((s) => s.id));
  $: filteredTools = tools
    .filter((tool) => activeServerIds.has(tool.serverId))
    .filter((tool) => {
      const query = toolQuery.trim().toLowerCase();
      if (!query) return true;
      return [
        tool.internalName,
        tool.originalName,
        tool.title ?? "",
        tool.description ?? "",
        tool.serverId,
      ].join(" ").toLowerCase().includes(query);
    });
  $: staleToolsCount = tools.filter((tool) => !activeServerIds.has(tool.serverId)).length;
  $: visibleToolsTotal = filteredTools.length;
  $: visibleReadOnlyCount = filteredTools.filter((t) => t.readOnly === true).length;
  $: visibleWritableCount = filteredTools.filter((t) => t.canWrite === true).length;
  $: isPcElectron = getNotebrainRuntimeEnvironment().isPcElectron;

  onMount(() => {
    if (mcp.enabled) {
      void refreshMcpState();
    }
  });

  function createEmptyServer(): McpServerConfig {
    return {
      id: "",
      title: "",
      enabled: true,
      transport: "http",
      url: "",
      timeoutMs: 60000,
      trusted: false,
    };
  }

  async function refreshMcpState() {
    loading = true;
    errorMessage = "";
    try {
      const [serverFile, toolIndex] = await Promise.all([
        loadMcpServers(),
        loadMcpToolIndex(),
      ]);
      servers = serverFile.servers;
      tools = toolIndex.tools;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "读取 MCP 配置失败。";
    } finally {
      loading = false;
    }
  }

  function patchMcp(patch: Partial<McpSettings>) {
    settings = {
      ...settings,
      mcp: {
        ...settings.mcp,
        ...patch,
      },
    };
  }

  function handleMcpEnabledChange(enabled: boolean) {
    if (enabled) {
      patchMcp({ enabled: true });
      void refreshMcpState();
    } else {
      patchMcp({ enabled: false });
      showEditor = false;
      syncingServerId = "";
      loading = false;
    }
  }

  function uniqueToggle(values: readonly string[] | undefined, value: string, enabled: boolean): string[] {
    const set = new Set(values ?? []);
    if (enabled) {
      set.delete(value);
    } else {
      set.add(value);
    }
    return [...set].filter(Boolean).sort();
  }

  function isServerVisible(serverId: string): boolean {
    return !(mcp.disabledServerIds ?? []).includes(serverId);
  }

  function toggleServerVisible(serverId: string) {
    patchMcp({
      disabledServerIds: uniqueToggle(mcp.disabledServerIds, serverId, !isServerVisible(serverId)),
    });
  }

  function isToolEnabled(tool: McpToolIndexEntry): boolean {
    const disabled = new Set(mcp.disabledToolNames ?? []);
    return !disabled.has(tool.internalName) && !disabled.has(tool.originalName);
  }

  function toggleToolEnabled(tool: McpToolIndexEntry) {
    patchMcp({
      disabledToolNames: uniqueToggle(mcp.disabledToolNames, tool.internalName, !isToolEnabled(tool)),
    });
  }

  function isToolTrusted(tool: McpToolIndexEntry): boolean {
    const trusted = new Set(mcp.trustedToolNames ?? []);
    return tool.trusted || trusted.has(tool.internalName) || trusted.has(tool.originalName);
  }

  function toggleToolTrusted(tool: McpToolIndexEntry) {
    const trusted = new Set(mcp.trustedToolNames ?? []);
    if (isToolTrusted(tool) && !tool.trusted) {
      trusted.delete(tool.internalName);
      trusted.delete(tool.originalName);
    } else {
      trusted.add(tool.internalName);
    }
    patchMcp({ trustedToolNames: [...trusted].filter(Boolean).sort() });
  }

  function parseArgs(value: string): string[] | undefined {
    const args = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return args.length > 0 ? args : undefined;
  }

  function parseEnv(value: string): Record<string, string> | undefined {
    const env: Record<string, string> = {};
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      const val = trimmed.slice(index + 1);
      if (key) env[key] = val;
    }
    return Object.keys(env).length > 0 ? env : undefined;
  }

  function openNewServerEditor() {
    editingServer = createEmptyServer();
    argsText = "";
    envText = "";
    editorError = "";
    showEditor = true;
  }

  function openEditServerEditor(server: McpServerConfig) {
    editingServer = { ...server, args: server.args ? [...server.args] : undefined, env: server.env ? { ...server.env } : undefined };
    argsText = (server.args ?? []).join("\n");
    envText = Object.entries(server.env ?? {}).map(([key, value]) => `${key}=${value}`).join("\n");
    editorError = "";
    showEditor = true;
  }

  function closeEditor() {
    showEditor = false;
    editorError = "";
  }

  async function saveServerFromEditor() {
    editorError = "";
    const server = normalizeMcpServerConfig({
      ...editingServer,
      args: parseArgs(argsText),
      env: parseEnv(envText),
    });
    if (!server) {
      editorError = "配置不完整：stdio 需要 command，http/sse 需要 URL。";
      return;
    }
    const next = [
      ...servers.filter((item) => item.id !== server.id),
      server,
    ].sort((a, b) => a.id.localeCompare(b.id));
    try {
      await saveMcpServers(next);
      showEditor = false;
      statusMessage = "MCP Server 已保存。";
      await refreshMcpState();
    } catch (err) {
      editorError = err instanceof Error ? err.message : "保存失败。";
    }
  }

  async function toggleServerEnabled(server: McpServerConfig) {
    await saveMcpServers(servers.map((item) =>
      item.id === server.id ? { ...item, enabled: !item.enabled } : item
    ));
    await refreshMcpState();
  }

  async function deleteServer(server: McpServerConfig) {
    const confirmed = await confirmDialogBoolean({
      title: "删除 MCP Server",
      content: safeConfirmContent("确定要删除 MCP Server「", server.title || server.id, "」吗？将删除 Server，并同步清理该 Server 的工具索引缓存。不会删除 notebrain 工作区文件。"),
    });
    if (!confirmed) return;

    // 1. Save servers without this one
    await saveMcpServers(servers.filter((item) => item.id !== server.id));

    // 2. Get tool names before removal (for settings cleanup)
    const { internalNames, originalNames } = await getMcpToolNamesForServer(server.id);

    // 3. Remove tools from tool-index.json
    const { removedCount } = await removeMcpToolsForServer(server.id);

    // 4. Clean up settings.mcp.disabledServerIds
    const nextDisabledServerIds = (mcp.disabledServerIds ?? []).filter((id) => id !== server.id);

    // 5. Clean up settings.mcp.disabledToolNames / trustedToolNames
    const allToolNames = [...new Set([...internalNames, ...originalNames])];
    const toolNameSet = new Set(allToolNames);
    const nextDisabledToolNames = (mcp.disabledToolNames ?? []).filter((name) => !toolNameSet.has(name));
    const nextTrustedToolNames = (mcp.trustedToolNames ?? []).filter((name) => !toolNameSet.has(name));

    patchMcp({
      disabledServerIds: nextDisabledServerIds,
      disabledToolNames: nextDisabledToolNames,
      trustedToolNames: nextTrustedToolNames,
    });

    // 6. Debug event
    pushAgentDebugEvent("MCP_SERVER_DELETED", {
      serverId: server.id,
      removedToolCount: removedCount,
      cleanedSettings: {
        disabledServerIds: nextDisabledServerIds.length,
        disabledToolNames: nextDisabledToolNames.length,
        trustedToolNames: nextTrustedToolNames.length,
      },
    }, "info");

    // 7. Refresh and show status
    statusMessage = `已删除 Server「${server.title || server.id}」，并清理 ${removedCount} 个工具索引。工具启用/信任列表的清理需通过页面底部"保存设置"持久化。`;
    await refreshMcpState();
  }

  async function syncServer(server: McpServerConfig) {
    const confirmed = await confirmDialogBoolean({
      title: "同步 MCP 工具",
      content: safeConfirmContent("将连接 MCP Server「", server.title || server.id, "」并调用 tools/list。继续吗？"),
    });
    if (!confirmed) return;
    syncingServerId = server.id;
    statusMessage = "";
    errorMessage = "";
    try {
      const result = await syncMcpServerTools(server, settings.runtimeTools);
      let cwdMsg = "";
      if (result.cwdInfo) {
        cwdMsg = ` · cwd=${result.cwdInfo.allowedDirHint}`;
      }
      statusMessage = `已同步 ${result.synced} 个工具。${cwdMsg}`;
      await refreshMcpState();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "同步 MCP 工具失败。";
      let display = raw;
      // Distinguish common error types
      if (raw.includes("ECONNREFUSED") || raw.includes("connection refused")) {
        display = "本地 SSE/HTTP 服务未启动，请确认目标服务已在运行。";
      }
      errorMessage = `同步「${server.title || server.id}」失败：${truncateError(display)}`;
    } finally {
      syncingServerId = "";
    }
  }

  async function syncAllEnabledServers() {
    const enabledServers = servers.filter((server) => server.enabled !== false);
    if (enabledServers.length === 0) {
      errorMessage = "没有已启用的 MCP Server。";
      return;
    }
    // On non-PC environments, stdio servers cannot be started.
    // Only sync HTTP/SSE servers; if all are stdio, give a clear structured hint.
    const syncableServers = isPcElectron
      ? enabledServers
      : enabledServers.filter((server) => server.transport !== "stdio");
    const skippedStdioCount = enabledServers.length - syncableServers.length;

    // Record debug event when stdio servers are skipped on non-PC environments.
    // No env/token/key is logged — only counts and platform metadata.
    if (!isPcElectron && skippedStdioCount > 0) {
      const env = getNotebrainRuntimeEnvironment();
      pushAgentDebugEvent("MCP_SYNC_ALL_STDIO_SKIPPED", {
        skippedStdioCount,
        syncableServerCount: syncableServers.length,
        platformLabel: env.platformLabel,
        reasonCode: env.reasonCode,
        unsupportedCapabilities: env.unsupportedCapabilities,
      }, "info");
    }

    if (syncableServers.length === 0) {
      const env = getNotebrainRuntimeEnvironment();
      errorMessage = `当前环境不支持 stdio MCP，同步已跳过（共 ${skippedStdioCount} 个 stdio Server）。${env.userHint}`;
      return;
    }

    const confirmed = await confirmDialogBoolean({
      title: "同步全部 MCP 工具",
      content: `将依次连接 ${syncableServers.length} 个可同步 MCP Server 并调用 tools/list。${skippedStdioCount > 0 ? `已跳过 ${skippedStdioCount} 个 stdio Server（当前环境不支持）。` : ""}继续吗？`,
    });
    if (!confirmed) return;
    statusMessage = "";
    errorMessage = "";
    for (const server of syncableServers) {
      syncingServerId = server.id;
      try {
        await syncMcpServerTools(server, settings.runtimeTools);
      } catch (err) {
        const raw = err instanceof Error ? err.message : "同步失败";
        let display = raw;
        if (raw.includes("ECONNREFUSED") || raw.includes("connection refused")) {
          display = "本地 SSE/HTTP 服务未启动。";
        }
        errorMessage = `同步「${server.title || server.id}」失败：${truncateError(display)}`;
        break;
      }
    }
    syncingServerId = "";
    await refreshMcpState();
    if (!errorMessage) {
      statusMessage = `已同步 ${syncableServers.length} 个 MCP Server。${skippedStdioCount > 0 ? `已跳过 ${skippedStdioCount} 个 stdio Server（当前环境不支持）。` : ""}`;
    }
  }

  function formatTime(ts: number): string {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString("zh-CN");
    } catch {
      return "";
    }
  }

  function updateTransport(value: string) {
    editingServer = {
      ...editingServer,
      transport: (value === "stdio" || value === "sse" ? value : "http") as McpTransportType,
    };
  }

  function getServerDiagHint(server: McpServerConfig): string | null {
    if (server.transport !== "stdio" || !server.command) return null;
    return diagnoseStdioCommand(server.command, settings.runtimeTools);
  }

  function getServerResolvedDisplay(server: McpServerConfig): string | null {
    if (server.transport !== "stdio" || !server.command) return null;
    const info = getStdioCommandResolvedInfo(server.command, settings.runtimeTools);
    if (!info) return null;
    let display = `resolved: ${info.resolvedPath}`;
    if (info.usesCmdExe) display += " (via cmd.exe)";
    // Show cwd = notebrain root for filesystem preset with "." arg
    if (server.id === "filesystem" && server.args?.includes(".")) {
      display += " · cwd=notebrain root · allowedDir=.";
    } else if (server.args?.some((a) => /^[a-zA-Z]:\\/.test(a) || /^\//.test(a))) {
      // User configured absolute paths — warn about potential issues
      display += " · ⚠ Windows 中文/空格路径可能需要 cross-spawn/execa";
    }
    return display;
  }

  function truncateError(err: string, maxLen = 200): string {
    return err.length <= maxLen ? err : `${err.slice(0, maxLen - 3)}...`;
  }

  function getServerToolStats(serverId: string): { total: number; readOnly: number; writable: number } {
    const serverTools = tools.filter((tool) => tool.serverId === serverId);
    const readOnly = serverTools.filter((tool) => tool.readOnly === true).length;
    return {
      total: serverTools.length,
      readOnly,
      writable: serverTools.length - readOnly,
    };
  }
</script>

<div class="mcp-settings-tab">
  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">MCP Client</h2>
      <p class="section-description">连接外部 MCP Server 后，工具会以 `mcp__server__tool` 形式进入 Agent 工具索引。</p>
    </div>

    <div class="setting-row master-row">
      <div class="setting-text">
        <span class="setting-title">启用 MCP Client</span>
        <span class="setting-desc">关闭后不会暴露 MCP 管理工具和动态 MCP 工具。</span>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={mcp.enabled}
          on:change={(event) => handleMcpEnabledChange(event.currentTarget.checked)}
        />
        <span class="slider"></span>
      </label>
    </div>
  </section>

  {#if mcp.enabled}
  <section class="settings-section">
    <div class="section-header with-actions">
      <div class="header-actions">
        <button type="button" class="secondary-btn" on:click={refreshMcpState} disabled={loading}>刷新</button>
        <button type="button" class="primary-btn" on:click={openNewServerEditor}>添加 Server</button>
      </div>
    </div>

    <label class="field-row compact">
      <span class="field-label">每轮最多暴露工具数</span>
      <input
        type="number"
        min="1"
        max="80"
        value={mcp.maxVisibleToolsPerTurn}
        on:input={(event) => patchMcp({ maxVisibleToolsPerTurn: Number(event.currentTarget.value) || 40 })}
      />
      {#if mcp.maxVisibleToolsPerTurn < 40}
        <span class="field-hint warning-hint">建议值 40；当前值 ({mcp.maxVisibleToolsPerTurn}) 可能限制工具注册数量。</span>
      {:else}
        <span class="field-hint">建议值 40</span>
      {/if}
    </label>

    {#if statusMessage}
      <p class="status-message">{statusMessage}</p>
    {/if}
    {#if errorMessage}
      <p class="error-message">{errorMessage}</p>
    {/if}
  </section>

  <section class="settings-section">
    <div class="section-header with-actions">
      <div>
        <h2 class="section-title">Server 列表</h2>
        <p class="section-description">stdio 仅支持 PC/Electron；HTTP/SSE 需要可访问 URL。</p>
        {#if !isPcElectron}
          <p class="diag-hint">当前环境不支持 stdio，stdio Server 的同步按钮已禁用。</p>
        {/if}
      </div>
      <button type="button" class="secondary-btn" on:click={syncAllEnabledServers} disabled={syncingServerId !== "" || loading}>
        同步全部
      </button>
    </div>

    {#if loading}
      <p class="empty-state">加载中...</p>
    {:else if servers.length === 0}
      <p class="empty-state">暂无 MCP Server，点击右上角添加。</p>
    {:else}
      <div class="server-list">
        {#each servers as server (server.id)}
          <div class="server-card">
            <div class="server-main">
              <div class="server-info">
                <div class="title-row">
                  <span class="server-title">{server.title || server.id}</span>
                  <span class="badge">{server.transport}</span>
                  {#if server.trusted}
                    <span class="badge trusted">server trusted</span>
                  {/if}
                  {#if server.transport === "stdio" && !isPcElectron}
                    <span class="badge env-blocked">当前端不可同步/不可调用</span>
                  {/if}
                </div>
                <code class="server-source">{server.transport === "stdio" ? server.command : server.url}</code>
                <span class="meta-line">ID: {server.id} · timeout {server.timeoutMs ?? 60000}ms</span>
                {#if getServerToolStats(server.id).total > 0}
                  <span class="meta-line">工具: {getServerToolStats(server.id).total} 个（只读 {getServerToolStats(server.id).readOnly} · 写 {getServerToolStats(server.id).writable}）</span>
                {/if}
                {#if server.transport === "stdio" && !isPcElectron}
                  <span class="env-hint">该 Server 为 stdio 传输，仅 PC 桌面端可用。当前环境不能同步或调用，请改用 HTTP/SSE MCP Server 或在 PC/Electron 端操作。</span>
                {/if}
                {#if getServerDiagHint(server)}
                  <span class="diag-hint">{getServerDiagHint(server)}</span>
                {/if}
                {#if !getServerDiagHint(server) && getServerResolvedDisplay(server)}
                  <span class="resolved-info">{getServerResolvedDisplay(server)}</span>
                {/if}
              </div>
              <div class="server-actions">
                <label class="mini-toggle">
                  <span>连接</span>
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    on:change={() => toggleServerEnabled(server)}
                  />
                </label>
                <label class="mini-toggle">
                  <span>暴露</span>
                  <input
                    type="checkbox"
                    checked={isServerVisible(server.id)}
                    on:change={() => toggleServerVisible(server.id)}
                  />
                </label>
                <button type="button" class="secondary-btn" on:click={() => syncServer(server)} disabled={syncingServerId !== "" || (server.transport === "stdio" && !isPcElectron)}>
                  {syncingServerId === server.id ? "同步中" : (server.transport === "stdio" && !isPcElectron ? "不可用" : "同步")}
                </button>
                <button type="button" class="secondary-btn" on:click={() => openEditServerEditor(server)}>编辑</button>
                <button type="button" class="danger-btn" on:click={() => deleteServer(server)}>删除</button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="settings-section">
    <div class="section-header with-actions">
      <div>
        <h2 class="section-title">MCP 工具索引</h2>
        <p class="section-description">
          同步后的工具可单独停用或设为 trusted。trusted 仍会记录日志和校验参数。
          {#if visibleToolsTotal > 0}
            当前可见 {visibleToolsTotal} 个工具（只读 {visibleReadOnlyCount}，写 {visibleWritableCount}）。
          {/if}
          {#if staleToolsCount > 0}
            已自动过滤 {staleToolsCount} 个无效工具索引。
          {/if}
        </p>
      </div>
      <input class="search-input" type="search" bind:value={toolQuery} placeholder="搜索工具或 server" />
    </div>

    {#if filteredTools.length === 0}
      <p class="empty-state">暂无匹配工具。同步 MCP Server 后会出现在这里。</p>
    {:else}
      <div class="tool-list">
        {#each filteredTools as tool (tool.internalName)}
          <div class="tool-card">
            <div class="tool-info">
              <div class="title-row">
                <span class="tool-title">{tool.title || tool.originalName}</span>
                <span class="badge">{tool.serverId}</span>
                <span class="badge risk">{tool.riskLevel}</span>
                {#if isToolTrusted(tool)}
                  <span class="badge trusted">trusted</span>
                {/if}
              </div>
              <code class="tool-name">{tool.internalName}</code>
              {#if tool.description}
                <span class="tool-desc">{tool.description}</span>
              {/if}
              {#if tool.lastSyncedAt}
                <span class="meta-line">同步于 {formatTime(tool.lastSyncedAt)}</span>
              {/if}
            </div>
            <div class="tool-actions">
              <label class="mini-toggle">
                <span>启用</span>
                <input
                  type="checkbox"
                  checked={isToolEnabled(tool)}
                  on:change={() => toggleToolEnabled(tool)}
                />
              </label>
              <label class="mini-toggle">
                <span>信任</span>
                <input
                  type="checkbox"
                  checked={isToolTrusted(tool)}
                  disabled={tool.trusted}
                  on:change={() => toggleToolTrusted(tool)}
                />
              </label>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
  {:else}
    <p class="section-description">MCP Client 已关闭。启用后可添加 MCP Server、同步工具索引并管理工具权限。</p>
  {/if}
</div>

{#if showEditor}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="mcp-editor-overlay" on:click|self={closeEditor}>
    <div class="mcp-editor-panel">
      <div class="editor-header">
        <h3>{editingServer.id ? "编辑 MCP Server" : "添加 MCP Server"}</h3>
      </div>
      <div class="editor-body">
        <div class="form-grid">
          <label class="field-row">
            <span class="field-label">ID</span>
            <input type="text" bind:value={editingServer.id} placeholder="filesystem" />
          </label>
          <label class="field-row">
            <span class="field-label">名称</span>
            <input type="text" bind:value={editingServer.title} placeholder="Filesystem" />
          </label>
          <label class="field-row">
            <span class="field-label">传输</span>
            <select value={editingServer.transport} on:change={(event) => updateTransport(event.currentTarget.value)}>
              <option value="http">Streamable HTTP</option>
              <option value="sse">SSE</option>
              <option value="stdio">stdio</option>
            </select>
          </label>
          <label class="field-row">
            <span class="field-label">超时</span>
            <input
              type="number"
              min="5000"
              max="600000"
              step="1000"
              value={editingServer.timeoutMs ?? 60000}
              on:input={(event) => editingServer = { ...editingServer, timeoutMs: Number(event.currentTarget.value) || 60000 }}
            />
          </label>
        </div>

        {#if editingServer.transport === "stdio"}
          <label class="field-row">
            <span class="field-label">命令</span>
            <input type="text" bind:value={editingServer.command} placeholder="npx" />
          </label>
          <label class="field-row">
            <span class="field-label">参数（每行一个）</span>
            <textarea rows="4" bind:value={argsText} spellcheck="false" placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;E:\\workspace"></textarea>
          </label>
          <label class="field-row">
            <span class="field-label">环境变量（KEY=value，每行一个）</span>
            <textarea rows="4" bind:value={envText} spellcheck="false" placeholder="API_KEY=..."></textarea>
          </label>
        {:else}
          <label class="field-row">
            <span class="field-label">URL</span>
            <input type="url" bind:value={editingServer.url} placeholder="http://127.0.0.1:3000/mcp" />
          </label>
        {/if}

        <div class="checkbox-row">
          <label>
            <input type="checkbox" bind:checked={editingServer.enabled} />
            启用连接
          </label>
          <label>
            <input type="checkbox" bind:checked={editingServer.trusted} />
            将该 Server 同步出的工具默认标记为 trusted
          </label>
        </div>

        {#if editorError}
          <p class="error-message">{editorError}</p>
        {/if}
      </div>
      <div class="editor-footer">
        <button type="button" class="secondary-btn" on:click={closeEditor}>取消</button>
        <button type="button" class="primary-btn" on:click={saveServerFromEditor}>保存</button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../_kb-tokens' as *;

  .mcp-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: $kb-space-md;
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
  }

  .section-header.with-actions {
    flex-direction: row;
    justify-content: space-between;
    gap: $kb-space-md;
    align-items: flex-start;
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
  .meta-line,
  .tool-desc,
  .empty-state {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .header-actions,
  .server-actions,
  .tool-actions,
  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .setting-row,
  .server-card,
  .tool-card {
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px;
  }

  .setting-row.master-row {
    border-left: 3px solid var(--b3-theme-primary);
  }

  .setting-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-title,
  .server-title,
  .tool-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .server-list,
  .tool-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .server-card,
  .tool-card {
    padding: 12px;
  }

  .server-main,
  .tool-card {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .server-info,
  .tool-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .server-source,
  .tool-name {
    display: block;
    max-width: 100%;
    overflow-wrap: anywhere;
    font-family: var(--b3-font-family-code);
    font-size: 12px;
    line-height: 1.5;
    color: var(--b3-theme-on-surface);
  }

  .badge {
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--b3-theme-surface-lighter);
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    line-height: 1.3;
  }

  .badge.trusted {
    background: var(--b3-theme-success-lightest, #e8f5e9);
    color: var(--b3-theme-success, #2e7d32);
  }

  .badge.risk {
    background: var(--b3-theme-primary-lightest);
    color: var(--b3-theme-primary);
  }

  .badge.env-blocked {
    background: var(--b3-theme-error-lightest, #fce4ec);
    color: var(--b3-theme-error, #c62828);
  }

  .env-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--b3-theme-error, #c62828);
    opacity: 0.9;
    padding: 4px 8px;
    background: var(--b3-theme-error-lightest, #fce4ec);
    border-radius: 4px;
    border-left: 3px solid var(--b3-theme-error, #c62828);
  }

  .mini-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    white-space: nowrap;
  }

  .primary-btn,
  .secondary-btn,
  .danger-btn {
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.4;
    font-family: inherit;
    padding: 6px 12px;
    transition: all 0.15s ease;
  }

  .primary-btn {
    border: 1px solid var(--b3-theme-primary);
    background: var(--b3-theme-primary);
    color: #fff;
  }

  .secondary-btn {
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
  }

  .danger-btn {
    border: 1px solid var(--b3-theme-error);
    background: var(--b3-theme-background);
    color: var(--b3-theme-error);
  }

  .primary-btn:hover,
  .secondary-btn:hover,
  .danger-btn:hover {
    filter: brightness(1.05);
  }

  .primary-btn:disabled,
  .secondary-btn:disabled,
  .danger-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-row.compact {
    max-width: 260px;
  }

  .field-hint {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.65;
  }

  .field-hint.warning-hint {
    color: var(--b3-theme-error, #c62828);
    opacity: 0.9;
  }

  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .field-row input,
  .field-row select,
  .field-row textarea,
  .search-input {
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
  }

  .field-row textarea {
    resize: vertical;
    font-family: var(--b3-font-family-code);
  }

  .search-input {
    max-width: 260px;
  }

  .status-message,
  .error-message {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }

  .status-message {
    color: var(--b3-theme-success, #2e7d32);
  }

  .error-message {
    color: var(--b3-theme-error, #c62828);
  }

  .diag-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--b3-theme-error, #c62828);
    opacity: 0.9;
    padding: 4px 8px;
    background: var(--b3-theme-error-lightest, #fce4ec);
    border-radius: 4px;
    border-left: 3px solid var(--b3-theme-error, #c62828);
  }

  .resolved-info {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--b3-theme-on-surface);
    opacity: 0.5;
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

  .mcp-editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .mcp-editor-panel {
    width: 100%;
    max-width: 720px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .editor-header,
  .editor-footer {
    padding: 14px 18px;
    border-color: var(--b3-border-color);
  }

  .editor-header {
    border-bottom: 1px solid var(--b3-border-color);
  }

  .editor-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .editor-body {
    padding: 16px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .editor-footer {
    border-top: 1px solid var(--b3-border-color);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  .checkbox-row label {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
  }
</style>
