import DOMPurify from "dompurify";
import { z } from "zod";
import type { ToolContract } from "../../contracts/tool-contract";
import type { ToolResultEntry } from "../../runtime/tool-result-log";

export const HOMEPAGE_WORKBENCH_TOOL_NAME = "homepage_workbench";

const SIYUAN_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/i;
const ALLOWED_CLASSES = new Set([
  "wb-grid", "wb-grid-2", "wb-grid-3", "wb-card", "wb-stat", "wb-value",
  "wb-label", "wb-list", "wb-item", "wb-badge", "wb-muted", "wb-accent",
  "wb-warning", "wb-success", "wb-danger", "wb-button", "wb-compact",
]);

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  html: z.string().min(1).max(12000),
  createdAt: z.number().int().nonnegative(),
}).strict();

const inputSchema = z.object({
  title: z.string().trim().min(1).max(80).describe("工作台标题。"),
  html: z.string().trim().min(1).max(12000).describe(
    "受控 HTML。只用 section/article/div/header/h2/h3/p/span/strong/em/ul/ol/li/button/time，内置 wb-* 类，以及 data-siyuan-doc-id/data-siyuan-block-id 跳转属性。",
  ),
}).strict();

export type AgentTemporaryWorkbench = z.infer<typeof manifestSchema>;

export function normalizeTemporaryWorkbenchClassNames(className: string): string {
  return className.split(/\s+/).filter((name) => ALLOWED_CLASSES.has(name)).join(" ");
}

export function isSafeSiyuanWorkbenchTarget(value: string): boolean {
  return SIYUAN_ID_PATTERN.test(value);
}

export function sanitizeTemporaryWorkbenchHtml(rawHtml: string): string {
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      "section", "article", "div", "header", "h2", "h3", "p", "span",
      "strong", "em", "ul", "ol", "li", "button", "time",
    ],
    ALLOWED_ATTR: [
      "class", "type", "title", "aria-label", "datetime",
      "data-siyuan-doc-id", "data-siyuan-block-id",
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "textarea", "select"],
    FORBID_ATTR: ["style"],
  });
  const template = document.createElement("template");
  template.innerHTML = safeHtml;
  for (const element of template.content.querySelectorAll<HTMLElement>("*")) {
    const classes = normalizeTemporaryWorkbenchClassNames(element.className);
    if (classes) element.setAttribute("class", classes);
    else element.removeAttribute("class");
    for (const attribute of ["data-siyuan-doc-id", "data-siyuan-block-id"] as const) {
      const value = element.getAttribute(attribute);
      if (value && (element.tagName !== "BUTTON" || !isSafeSiyuanWorkbenchTarget(value))) {
        element.removeAttribute(attribute);
      }
    }
    if (element.tagName === "BUTTON") element.setAttribute("type", "button");
  }
  return template.innerHTML.trim();
}

/** 会话恢复时重新验证并清理，防止本地文件被篡改后直接进入 {@html}。 */
export function normalizeTemporaryWorkbench(value: unknown): AgentTemporaryWorkbench | undefined {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const html = sanitizeTemporaryWorkbenchHtml(parsed.data.html);
  return html ? { ...parsed.data, html } : undefined;
}

export function collectTemporaryWorkbenches(entries: readonly ToolResultEntry[]): AgentTemporaryWorkbench[] {
  const workbenches = new Map<string, AgentTemporaryWorkbench>();
  for (const entry of entries) {
    if (entry.toolName !== HOMEPAGE_WORKBENCH_TOOL_NAME
      || (entry.kind !== "tool_executed" && entry.kind !== "tool_observation")) continue;
    const parsed = manifestSchema.safeParse(entry.content);
    if (parsed.success) workbenches.set(parsed.data.id, parsed.data);
  }
  return [...workbenches.values()];
}

export function createHomepageWorkbenchTool(): ToolContract<z.infer<typeof inputSchema>, AgentTemporaryWorkbench> {
  return {
    name: HOMEPAGE_WORKBENCH_TOOL_NAME,
    title: "临时工作台",
    description: "把本轮已读取的真实数据排成会话内临时工作台。先完成必要读取，再自由组合受控 HTML 与内置 wb-* 视觉类；不得补造事实。",
    inputSchema,
    outputSchema: manifestSchema,
    readOnly: true,
    safety: { readOnly: true, riskLevel: "low" },
    source: "builtin",
    providerVisible: true,
    boundary: "只渲染会话内临时界面；禁止脚本、样式、外链、表单和写操作。仅 button 上的 data-siyuan-doc-id/data-siyuan-block-id 可导航到思源内容。",
    inputHint: "直接传 title 与 html，不要包 action/args。已有真实 docId 时可直接生成文档跳转按钮，不需要先读取块 ID。布局类可用 wb-grid/wb-grid-2/wb-grid-3/wb-card/wb-stat/wb-value/wb-label/wb-list/wb-item/wb-badge/wb-muted/wb-accent/wb-warning/wb-success/wb-danger/wb-button/wb-compact。",
    availability: () => ({ available: true }),
    async execute(_ctx, args) {
      const html = sanitizeTemporaryWorkbenchHtml(args.html);
      if (!html) {
        return {
          ok: false,
          data: null,
          error: { code: "workbench_html_empty", message: "工作台 HTML 清理后为空。", recoverable: true },
        };
      }
      const now = Date.now();
      return {
        ok: true,
        data: {
          schemaVersion: 1,
          id: `workbench-${now}-${Math.random().toString(36).slice(2, 9)}`,
          title: args.title,
          html,
          createdAt: now,
        },
      };
    },
    summarizeResult: (result) => result.ok ? "临时工作台已生成。" : "临时工作台生成失败。",
  };
}
