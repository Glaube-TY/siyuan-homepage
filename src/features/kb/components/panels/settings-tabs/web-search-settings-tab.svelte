<script lang="ts">
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import type { KbSettings } from "../../../types/settings";
  import type { WebSearchResult } from "../../../services/agent-workbench/tools/web-search/web-search-provider";
  import { createAnySearchProvider } from "../../../services/agent-workbench/tools/web-search/providers/anysearch.provider";
  import { createCustomJsonProvider } from "../../../services/agent-workbench/tools/web-search/providers/custom-json.provider";
  import { createTavilyProvider } from "../../../services/agent-workbench/tools/web-search/providers/tavily.provider";
  import { cleanHtmlToMarkdown } from "../../../services/agent-workbench/tools/web-search/impl/html-to-markdown";
  import { requestViaSiyuanProxy } from "../../../services/agent-workbench/tools/web-search/impl/siyuan-proxy-request";
  import { buildReadProxyUrl } from "../../../services/agent-workbench/tools/web-search/impl/proxy-url-utils";

  export let settings: KbSettings;

  // ── Local editable copy of webSearch settings ──
  $: ws = settings.webSearch;

  let testSearchQuery = "";
  let testSearchLoading = false;
  let testSearchResult = "";
  let testSearchError = "";
  let showAnySearchApiKey = false;
  let showTavilyApiKey = false;

  let testReadUrl = "";
  let testReadLoading = false;
  let testReadResult = "";
  let testReadError = "";

  // ── Provider options ──
  const providerOptions = [
    { value: "anysearch", label: "AnySearch（推荐）" },
    { value: "custom_json", label: "自定义接口" },
    { value: "tavily", label: "Tavily" },
  ] as const;

  // ── Test: search ──
  async function handleTestSearch() {
    if (!testSearchQuery.trim()) return;
    testSearchLoading = true;
    testSearchResult = "";
    testSearchError = "";
    try {
      const provider = createProvider();
      const results = await provider.search({ query: testSearchQuery.trim(), maxResults: ws.maxResults, timeoutMs: ws.timeoutMs });
      if (results.length === 0) {
        testSearchResult = "搜索未返回结果。";
      } else {
        testSearchResult = results
          .map((r: WebSearchResult, i: number) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   摘要: ${r.snippet ?? "(无)"}`)
          .join("\n\n");
      }
    } catch (e: unknown) {
      testSearchError = e instanceof Error ? e.message : String(e);
    } finally {
      testSearchLoading = false;
    }
  }

  // ── Test: read page ──
  async function handleTestRead() {
    if (!testReadUrl.trim()) return;
    testReadLoading = true;
    testReadResult = "";
    testReadError = "";
    try {
      let html: string;
      if (ws.readProxyEndpoint) {
        const proxyUrl = buildReadProxyUrl(ws.readProxyEndpoint, testReadUrl.trim());
        const resp = await requestViaSiyuanProxy(proxyUrl, { method: "GET", headers: [], contentType: "text/html", timeout: ws.timeoutMs });
        html = typeof resp === "string" ? resp : JSON.stringify(resp);
      } else {
        const resp = await requestViaSiyuanProxy(testReadUrl.trim(), { method: "GET", headers: [], contentType: "text/html", timeout: ws.timeoutMs });
        html = typeof resp === "string" ? resp : JSON.stringify(resp);
      }
      const converted = cleanHtmlToMarkdown(html, testReadUrl.trim(), ws.readPageMaxChars);
      testReadResult = [
        `标题: ${converted.title ?? "(无)"}`,
        `Markdown 长度: ${converted.markdownChars} 字符`,
        `截断: ${converted.truncated ? "是" : "否"}`,
        `链接数: ${converted.links.length}`,
        "",
        "--- 前 2000 字 ---",
        converted.markdown.slice(0, 2000),
      ].join("\n");
    } catch (e: unknown) {
      testReadError = e instanceof Error ? e.message : String(e);
    } finally {
      testReadLoading = false;
    }
  }

  function createProvider() {
    switch (ws.provider) {
      case "anysearch":
        return createAnySearchProvider({ apiKey: ws.apiKey, anySearchZone: ws.anySearchZone, anySearchLanguage: ws.anySearchLanguage, timeoutMs: ws.timeoutMs });
      case "custom_json":
        return createCustomJsonProvider({ searchEndpoint: ws.searchEndpoint, timeoutMs: ws.timeoutMs });
      case "tavily":
        return createTavilyProvider({ apiKey: ws.apiKey, timeoutMs: ws.timeoutMs });
    }
  }
</script>

<div class="web-search-settings-tab">
  <!-- 基础配置 -->
  <section class="settings-group">
    <h3 class="group-title">基础配置</h3>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">启用联网搜索</div>
        <div class="setting-desc">开启后输入框显示联网搜索按钮</div>
      </div>
      <div class="setting-control setting-control--switch">
        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={ws.enabled} />
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">搜索提供商</div>
        <div class="setting-desc">选择搜索服务提供商</div>
      </div>
      <div class="setting-control">
        <select class="b3-select fn__block" bind:value={ws.provider}>
          {#each providerOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </section>

  <!-- Provider 配置 -->
  <section class="settings-group">
    <h3 class="group-title">Provider 配置</h3>

    {#if ws.provider === "anysearch"}
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">API Key（可选）</div>
          <div class="setting-desc">填写后使用 Bearer 认证，留空允许匿名搜索</div>
        </div>
        <div class="setting-control">
          <div class="api-key-field">
            <input
              type={showAnySearchApiKey ? "text" : "password"}
              class="b3-text-field fn__block api-key-input"
              bind:value={ws.apiKey}
              placeholder="留空允许匿名搜索"
            />
            <button
              type="button"
              class="api-key-visibility-button"
              title={showAnySearchApiKey ? "隐藏 API Key" : "显示 API Key"}
              aria-label={showAnySearchApiKey ? "隐藏 API Key" : "显示 API Key"}
              on:click={() => (showAnySearchApiKey = !showAnySearchApiKey)}
            >
              <SiyuanIcon name={showAnySearchApiKey ? "iconEye" : "iconEyeoff"} size={16} />
            </button>
          </div>
          <div class="secret-storage-hint">联网搜索 API Key 会在本地加密保存。</div>
          <a href="https://anysearch.com" target="_blank" rel="noopener noreferrer" class="link">打开 AnySearch / 申请 API Key</a>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">搜索区域</div>
        </div>
        <div class="setting-control">
          <select class="b3-select fn__block" bind:value={ws.anySearchZone}>
            <option value="cn">cn</option>
            <option value="intl">intl</option>
          </select>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">搜索语言</div>
        </div>
        <div class="setting-control">
          <input type="text" class="b3-text-field fn__block" bind:value={ws.anySearchLanguage} placeholder="zh-CN" />
        </div>
      </div>
    {:else if ws.provider === "custom_json"}
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">搜索端点</div>
          <div class="setting-desc">自定义搜索接口地址，需返回标准格式数据</div>
        </div>
        <div class="setting-control">
          <input type="text" class="b3-text-field fn__block" bind:value={ws.searchEndpoint} placeholder="https://your-proxy.com/search" />
        </div>
      </div>
    {:else if ws.provider === "tavily"}
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">API Key</div>
          <div class="setting-desc">必填</div>
        </div>
        <div class="setting-control">
          <div class="api-key-field">
            <input
              type={showTavilyApiKey ? "text" : "password"}
              class="b3-text-field fn__block api-key-input"
              bind:value={ws.apiKey}
              placeholder="必填"
            />
            <button
              type="button"
              class="api-key-visibility-button"
              title={showTavilyApiKey ? "隐藏 API Key" : "显示 API Key"}
              aria-label={showTavilyApiKey ? "隐藏 API Key" : "显示 API Key"}
              on:click={() => (showTavilyApiKey = !showTavilyApiKey)}
            >
              <SiyuanIcon name={showTavilyApiKey ? "iconEye" : "iconEyeoff"} size={16} />
            </button>
          </div>
          <div class="secret-storage-hint">联网搜索 API Key 会在本地加密保存。</div>
          <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" class="link">申请 Tavily API Key</a>
        </div>
      </div>
    {/if}
  </section>

  <!-- 网页读取配置 -->
  <section class="settings-group">
    <h3 class="group-title">网页读取配置</h3>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">网页读取代理</div>
        <div class="setting-desc">通过自建代理读取网页内容（可选），留空则直接请求</div>
      </div>
      <div class="setting-control">
        <input type="text" class="b3-text-field fn__block" bind:value={ws.readProxyEndpoint} placeholder="https://your-read-proxy.com?url=" />
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">最大搜索结果数</div>
        <div class="setting-desc">每次搜索返回的结果数量上限 (1‑10)</div>
      </div>
      <div class="setting-control">
        <input type="number" class="b3-text-field fn__block" bind:value={ws.maxResults} min="1" max="10" />
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">网页最大字符数</div>
        <div class="setting-desc">读取网页时截取的字符数 (2000‑30000)</div>
      </div>
      <div class="setting-control">
        <input type="number" class="b3-text-field fn__block" bind:value={ws.readPageMaxChars} min="2000" max="30000" step="1000" />
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">超时时间</div>
        <div class="setting-desc">搜索/读取的超时毫秒数 (5000‑60000)</div>
      </div>
      <div class="setting-control">
        <input type="number" class="b3-text-field fn__block" bind:value={ws.timeoutMs} min="5000" max="60000" step="1000" />
      </div>
    </div>
  </section>

  <!-- 测试搜索 -->
  <section class="settings-group">
    <h3 class="group-title">测试搜索</h3>
    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">搜索查询</div>
      </div>
      <div class="setting-control">
        <input type="text" class="b3-text-field fn__block" bind:value={testSearchQuery} placeholder="输入搜索关键词..." />
        <button class="b3-button b3-button--outline" on:click={handleTestSearch} disabled={testSearchLoading}>
          {testSearchLoading ? "搜索中..." : "测试搜索"}
        </button>
      </div>
    </div>
    {#if testSearchResult}
      <div class="test-card">
        <pre class="test-result">{testSearchResult}</pre>
      </div>
    {/if}
    {#if testSearchError}
      <p class="test-error">错误: {testSearchError}</p>
    {/if}
  </section>

  <!-- 测试网页读取 -->
  <section class="settings-group">
    <h3 class="group-title">测试网页读取</h3>
    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">网页 URL</div>
      </div>
      <div class="setting-control">
        <input type="text" class="b3-text-field fn__block" bind:value={testReadUrl} placeholder="输入网页 URL..." />
        <button class="b3-button b3-button--outline" on:click={handleTestRead} disabled={testReadLoading}>
          {testReadLoading ? "读取中..." : "测试读取"}
        </button>
      </div>
    </div>
    {#if testReadResult}
      <div class="test-card">
        <pre class="test-result">{testReadResult}</pre>
      </div>
    {/if}
    {#if testReadError}
      <p class="test-error">错误: {testReadError}</p>
    {/if}
  </section>
</div>

<style lang="scss">
  .web-search-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
  }

  .group-title {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid var(--b3-border-color);

    &:last-child {
      border-bottom: none;
    }
  }

  .setting-copy {
    min-width: 0;
    flex: 1;
  }

  .setting-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-primary);
    line-height: 1.5;
  }

  .setting-desc {
    margin-top: 4px;
    font-size: 13px;
    color: var(--b3-theme-on-surface-light);
    line-height: 1.5;
  }

  .setting-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    width: 420px;
    align-items: stretch;

    input[type="text"],
    input[type="number"],
    input[type="password"],
    select {
      width: 100%;
      box-sizing: border-box;
    }

    .link {
      font-size: 12px;
      color: var(--b3-theme-primary);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .setting-control--switch {
    width: 420px;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
  }

  .api-key-field {
    position: relative;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .api-key-input {
    padding-right: 40px;
    box-sizing: border-box;
  }

  .api-key-visibility-button {
    position: absolute;
    top: 50%;
    right: 6px;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--b3-theme-on-surface-light);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      background: var(--b3-list-hover);
      color: var(--b3-theme-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--b3-theme-primary);
      outline-offset: 1px;
    }
  }

  .secret-storage-hint {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    line-height: 1.4;
  }

  .test-card {
    margin-top: 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    padding: 12px;
    background: var(--b3-theme-surface);
  }

  .test-result {
    max-height: 420px;
    white-space: pre-wrap;
    overflow: auto;
    font-size: 13px;
    margin: 0;
    box-sizing: border-box;
    padding: 12px;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
  }

  .test-error {
    color: var(--b3-theme-error, #f44336);
    font-size: 13px;
    margin: 4px 0 0 0;
  }
</style>
