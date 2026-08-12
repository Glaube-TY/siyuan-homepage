import DOMPurify from "dompurify";
import { z } from "zod";

const SIYUAN_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/i;
const ALLOWED_CLASSES = new Set([
  "wb-grid", "wb-grid-2", "wb-grid-3", "wb-card", "wb-stat", "wb-value",
  "wb-label", "wb-list", "wb-item", "wb-badge", "wb-muted", "wb-accent",
  "wb-warning", "wb-success", "wb-danger", "wb-button", "wb-compact",
]);

export const temporaryWorkbenchManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^workbench-\d+-[a-z0-9]{1,16}$/i),
  title: z.string().min(1).max(80),
  html: z.string().min(1).max(12000),
  createdAt: z.number().int().nonnegative(),
}).strict();

const referenceSchema = temporaryWorkbenchManifestSchema.pick({ id: true, title: true, createdAt: true });

export type AgentTemporaryWorkbench = z.infer<typeof temporaryWorkbenchManifestSchema>;
export type AgentTemporaryWorkbenchReference = z.infer<typeof referenceSchema>;

export interface AgentTemporaryWorkbenchSource {
  profileId: string;
  label: string;
  conversationId?: string;
  messageId?: string;
}

export function normalizeTemporaryWorkbenchClassNames(className: string): string {
  return className.split(/\s+/).filter((name) => ALLOWED_CLASSES.has(name)).join(" ");
}

export function isSafeSiyuanWorkbenchTarget(value: string): boolean {
  return SIYUAN_ID_PATTERN.test(value);
}

export function hasTemporaryWorkbenchLayout(html: string): boolean {
  const hasGrid = /\bwb-grid(?:-[23])?\b/.test(html);
  const units = html.match(/\bwb-(?:card|stat|item|button)\b/g) ?? [];
  return hasGrid && units.length >= 2;
}

export function sanitizeTemporaryWorkbenchHtml(rawHtml: string): string {
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ["section", "article", "div", "header", "h2", "h3", "p", "span", "strong", "em", "ul", "ol", "li", "button", "time"],
    ALLOWED_ATTR: ["class", "type", "title", "aria-label", "datetime", "data-siyuan-doc-id", "data-siyuan-block-id"],
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
      if (value && (element.tagName !== "BUTTON" || !isSafeSiyuanWorkbenchTarget(value))) element.removeAttribute(attribute);
    }
    if (element.tagName === "BUTTON") element.setAttribute("type", "button");
  }
  return template.innerHTML.trim();
}

export function normalizeTemporaryWorkbench(value: unknown): AgentTemporaryWorkbench | undefined {
  const parsed = temporaryWorkbenchManifestSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const html = sanitizeTemporaryWorkbenchHtml(parsed.data.html);
  return html ? { ...parsed.data, html } : undefined;
}

export function normalizeTemporaryWorkbenchReference(value: unknown): AgentTemporaryWorkbenchReference | undefined {
  const parsed = referenceSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function toTemporaryWorkbenchReference(workbench: AgentTemporaryWorkbench): AgentTemporaryWorkbenchReference {
  return referenceSchema.parse({
    id: workbench.id,
    title: workbench.title,
    createdAt: workbench.createdAt,
  });
}
