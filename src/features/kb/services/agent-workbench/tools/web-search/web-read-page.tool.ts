/**
 * web_read_page Tool — reads a web page and returns cleaned Markdown by chunk.
 * Pure factory function. No side effects at module level.
 */

import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  webReadPageInputSchema,
  webReadPageOutputSchema,
  webReadPageInputJsonSchemaOverride,
} from "./contracts/web-read-page.contract";
import type { WebReadPageInput, WebReadPageOutput, WebChunkMeta } from "./contracts/web-read-page.contract";
import { requestViaSiyuanProxy } from "./impl/siyuan-proxy-request";
import { cleanHtmlToMarkdown } from "./impl/html-to-markdown";
import { buildReadProxyUrl } from "./impl/proxy-url-utils";
import { validatePublicHttpUrl } from "./impl/url-safety";

export interface WebReadPageDeps {
  readProxyEndpoint?: string;
  readPageMaxChars: number;
  timeoutMs: number;
}

const DEFAULT_CHUNK_CHARS = 12000;
const MAX_LINKS = 30;

interface PageCacheEntry {
  markdown: string;
  title?: string;
  description?: string;
  links: Array<{ text: string; url: string; source: "anchor" }>;
}

function splitIntoChunks(text: string, chunkSize: number): { chunks: string[]; metas: WebChunkMeta[] } {
  const chunks: string[] = [];
  const metas: WebChunkMeta[] = [];
  let start = 0;
  let index = 1;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      // Look for nearest paragraph boundary within last 20% of chunk
      const searchStart = Math.max(start, Math.floor(end - chunkSize * 0.2));
      const searchWindow = text.slice(searchStart, end);
      const lastBreak = Math.max(
        searchWindow.lastIndexOf("\n\n"),
        searchWindow.lastIndexOf("\n"),
      );
      if (lastBreak > 0) {
        end = searchStart + lastBreak;
      }
    }
    const chunkText = text.slice(start, end);
    chunks.push(chunkText);
    metas.push({
      index,
      start,
      end,
      charCount: chunkText.length,
    });
    start = end;
    index++;
  }

  return { chunks, metas };
}

function splitIntoExactChunkCount(text: string, chunkCount: number): { chunks: string[]; metas: WebChunkMeta[] } {
  const chunks: string[] = [];
  const metas: WebChunkMeta[] = [];
  const total = text.length;
  let start = 0;

  for (let i = 0; i < chunkCount; i++) {
    const isLast = i === chunkCount - 1;
    const idealEnd = isLast ? total : Math.round(((i + 1) / chunkCount) * total);
    let end = idealEnd;

    if (!isLast && end < total) {
      // Look for nearest paragraph boundary within ±20% of idealEnd
      const chunkSize = idealEnd - start;
      const searchRadius = Math.max(1, Math.floor(chunkSize * 0.2));
      const searchStart = Math.max(start, end - searchRadius);
      const searchEnd = Math.min(total, end + searchRadius);
      const window = text.slice(searchStart, searchEnd);
      let bestBreak = -1;
      let bestDist = Infinity;
      for (let pos = 0; pos < window.length; pos++) {
        if (window[pos] === "\n") {
          const absPos = searchStart + pos;
          const dist = Math.abs(absPos - idealEnd);
          if (dist < bestDist) {
            bestDist = dist;
            bestBreak = absPos;
          }
        }
      }
      if (bestBreak >= 0) {
        end = bestBreak;
      }
    }

    const chunkText = text.slice(start, end);
    chunks.push(chunkText);
    metas.push({
      index: i + 1,
      start,
      end,
      charCount: chunkText.length,
    });
    start = end;
  }

  return { chunks, metas };
}

export function createWebReadPageTool(deps: WebReadPageDeps): ToolContract<WebReadPageInput, WebReadPageOutput> {
  // Per-turn cache: avoids re-fetching the same URL when reading subsequent chunks.
  const pageCache = new Map<string, PageCacheEntry>();
  // Per-turn failure cache: avoids re-requesting the same failed URL within one turn.
  const failedPageCache = new Map<string, { code: string; message: string; hint?: string }>();

  return {
    name: "web_read_page",
    title: "读取网页",
    description: "读取指定 URL 的网页正文并转换为 Markdown。成功返回的正文可作为 grounding evidence。",
    inputSchema: webReadPageInputSchema,
    outputSchema: webReadPageOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "url（必填，真实明确的 http/https URL）。长网页继续读取时使用 chunkIndex（可选，默认1）/ chunkChars（可选，默认12000）/ chunkCount。",
    boundary: "只读取公开 http/https 网页 URL；拒绝本机、内网、链路本地和云元数据地址。不能把自然语言问题、网站名、书名、标题猜成 URL；不自动搜索 URL；不自动跟随链接、不递归抓取、不整站抓取、不执行 JS、不绕过登录。",  
    providerVisible: true,
    inputJsonSchemaOverride: webReadPageInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: WebReadPageInput): Promise<ToolResult<WebReadPageOutput>> {
      // 1. URL safety validation — must pass before any network request
      const safety = validatePublicHttpUrl(args.url);
      if (safety.ok === false) {
        return {
          ok: false,
          data: null,
          error: {
            code: "unsafe_url",
            message: `该 URL 不允许读取：${safety.reason}只支持公开网页地址，不能读取本机、内网或元数据地址。`,
            recoverable: true,
            hint: "请提供公开 http/https 网页 URL。",
          },
        };
      }
      const targetUrl = safety.normalizedUrl;

      // Check per-turn failure cache to avoid re-requesting a known bad URL.
      const cachedFailure = failedPageCache.get(targetUrl);
      if (cachedFailure) {
        return {
          ok: false,
          data: null,
          error: {
            code: cachedFailure.code,
            message: cachedFailure.message,
            recoverable: true,
            hint: "该 URL 本轮已读取失败，可换用明确的 http/https URL；若仍无可靠正文来源，应说明限制。", 
          },
        };
      }

      const chunkIndex = Math.max(1, Math.floor(args.chunkIndex ?? 1));

      // Resolve chunk size: chunkCount > chunkChars > maxChars > default
      let chunkSize: number;
      let effectiveChunkCount: number | undefined;
      if (args.chunkCount != null && args.chunkCount > 0) {
        effectiveChunkCount = args.chunkCount;
        // chunkSize will be computed after we know full length
      } else {
        chunkSize = args.chunkChars ?? args.maxChars ?? deps.readPageMaxChars ?? DEFAULT_CHUNK_CHARS;
        chunkSize = Math.max(2000, Math.min(30000, chunkSize));
      }

      try {
        // Fetch full HTML (use cache if same URL was already read this turn)
        let cached = pageCache.get(targetUrl);
        if (!cached) {
          let html: string;
          if (deps.readProxyEndpoint) {
            const proxyUrl = buildReadProxyUrl(deps.readProxyEndpoint, targetUrl);
            const resp = await requestViaSiyuanProxy(proxyUrl, {
              method: "GET",
              headers: [],
              contentType: "text/html",
              timeout: deps.timeoutMs,
            });
            html = typeof resp === "string" ? resp : JSON.stringify(resp);
          } else {
            const resp = await requestViaSiyuanProxy(targetUrl, {
              method: "GET",
              headers: [],
              contentType: "text/html",
              timeout: deps.timeoutMs,
            });
            html = typeof resp === "string" ? resp : JSON.stringify(resp);
          }

          const converted = cleanHtmlToMarkdown(html, targetUrl);
          cached = {
            markdown: converted.markdown,
            title: converted.title,
            description: converted.description,
            links: converted.links.slice(0, MAX_LINKS),
          };
          pageCache.set(targetUrl, cached);
        }

        const fullMarkdown = cached.markdown;
        const fullChars = fullMarkdown.length;

        if (fullChars === 0) {
          return {
            ok: false,
            data: null,
            error: {
              code: "empty_content",
              message: "网页正文为空。",
              recoverable: true,
              hint: "该网页未能提取到正文内容，可能是一个目录页、登录页或纯媒体页。",
            },
          };
        }

        let chunks: string[];
        let metas: WebChunkMeta[];
        let totalChunks: number;
        if (effectiveChunkCount != null) {
          const safeChunkCount = Math.min(effectiveChunkCount, Math.max(1, fullChars));
          ({ chunks, metas } = splitIntoExactChunkCount(fullMarkdown, safeChunkCount));
        } else {
          ({ chunks, metas } = splitIntoChunks(fullMarkdown, chunkSize));
        }
        totalChunks = chunks.length;

        if (chunkIndex > totalChunks) {
          return {
            ok: false,
            data: null,
            error: {
              code: "chunk_index_out_of_range",
              message: `chunkIndex ${chunkIndex} 超出范围，当前全文共 ${totalChunks} 块。`,
              recoverable: true,
              hint: `请使用 1-${totalChunks} 之间的 chunkIndex。`,
            },
          };
        }

        const currentChunkText = chunks[chunkIndex - 1];
        const currentMeta = metas[chunkIndex - 1];

        return {
          ok: true,
          data: {
            url: targetUrl,
            title: cached.title,
            description: cached.description,
            text: currentChunkText,
            markdownChars: currentChunkText.length,
            textChars: currentChunkText.length,
            truncated: totalChunks > 1,
            fetchedAt: new Date().toISOString(),
            sourceName: new URL(targetUrl).hostname,
            links: cached.links,
            fullMarkdownChars: fullChars,
            returnedMarkdownChars: currentChunkText.length,
            chunkIndex,
            chunkCount: totalChunks,
            chunkStart: currentMeta.start,
            chunkEnd: currentMeta.end,
            hasPrevChunk: chunkIndex > 1,
            hasNextChunk: chunkIndex < totalChunks,
            chunks: metas,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: string }).code ?? "tool_execution_error";
        // Cache the failure so the same URL is not re-requested within this turn.
        failedPageCache.set(targetUrl, { code, message: msg });
        return {
          ok: false,
          data: null,
          error: {
            code,
            message: msg,
            recoverable: true,
            hint: "网页读取失败，请检查 URL 是否有效，或稍后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<WebReadPageOutput>): string {
      if (!result.ok || !result.data) {
        const code = result.error?.code;
        const msg = result.error?.message ?? "网页读取失败。";
        if (code === "http_403") {
          return "网页读取失败：HTTP 403，站点拒绝访问。";
        }
        if (code === "http_404") {
          return "网页读取失败：HTTP 404，页面不存在。";
        }
        if (code === "proxy_empty_response") {
          return "网页读取失败：代理返回空响应。";
        }
        return `网页读取失败：${msg}`;
      }
      const data = result.data;
      const parts: string[] = [
        `已读取 ${data.url} 第 ${data.chunkIndex}/${data.chunkCount} 块`,
        `当前块 ${data.returnedMarkdownChars} 字符`,
        `全文 ${data.fullMarkdownChars} 字符`,
      ];
      if (data.title) {
        parts.push(`标题：${data.title}`);
      }
      if (data.hasNextChunk) {
        parts.push("后续块存在，返回值中包含继续读取所需的分页信息");
      }
      return parts.join("，") + "。";
    },
  };
}
