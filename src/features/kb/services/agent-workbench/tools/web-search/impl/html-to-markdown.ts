/**
 * HTML-to-Markdown converter — converts web page HTML to readable Markdown.
 * - Tries SiYuan Lute (window.Lute) first, falls back to basic conversion.
 * - Strips noise: script, style, nav, footer, etc.
 * - Extracts title, description, and links.
 * - Pure function. No side effects at module level. DOMParser/Lute accessed at call time.
 */

export interface HtmlToMarkdownResult {
  title?: string;
  description?: string;
  markdown: string;
  markdownChars: number;
  truncated: boolean;
  links: WebPageLink[];
}

export interface WebPageLink {
  text: string;
  url: string;
  source: "anchor";
}

const MAX_LINKS = 30;
const MAX_LINK_TEXT_LENGTH = 120;

// Non-semantic / noise elements to remove
const NOISE_TAG_SELECTOR = [
  "script", "style", "noscript", "nav", "footer", "aside",
  "form", "header", "menu", "iframe", "canvas", "svg", "template",
  "video", "audio", "source", "track", "picture", "object", "embed",
  "button", "input", "select", "textarea",
].join(",");

export function cleanHtmlToMarkdown(
  html: string,
  baseUrl: string,
  maxChars?: number,
): HtmlToMarkdownResult {
  const result: HtmlToMarkdownResult = {
    markdown: "",
    markdownChars: 0,
    truncated: false,
    links: [],
  };

  try {
    // Parse and clean
    const { title, description, root, links } = parseAndClean(html, baseUrl);
    result.title = title;
    result.description = description;
    result.links = links;

    if (!root) {
      result.markdown = "(网页内容为空)";
      result.markdownChars = result.markdown.length;
      return result;
    }

    // Try Lute first
    const luteResult = tryLuteConvert(root, maxChars);
    if (luteResult) {
      result.markdown = luteResult.markdown;
      result.markdownChars = luteResult.chars;
      result.truncated = luteResult.truncated;
      return result;
    }

    // Fallback: basic HTML to Markdown
    const fallbackResult = basicHtmlToMarkdown(root, maxChars);
    result.markdown = fallbackResult.markdown;
    result.markdownChars = fallbackResult.chars;
    result.truncated = fallbackResult.truncated;
    return result;
  } catch {
    // Absolute last resort: strip tags
    const stripped = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const shouldTruncate = Number.isFinite(maxChars) && (maxChars ?? 0) > 0 && stripped.length > (maxChars ?? 0);
    const truncated = shouldTruncate;
    result.markdown = truncated ? stripped.slice(0, maxChars) + "\n\n[... truncated]" : stripped;
    result.markdownChars = result.markdown.length;
    result.truncated = truncated;
    return result;
  }
}

// ── Parse and Clean ──

function parseAndClean(html: string, baseUrl: string): {
  title?: string;
  description?: string;
  root: HTMLElement | null;
  links: WebPageLink[];
} {
  let title: string | undefined;
  let description: string | undefined;
  let root: HTMLElement | null = null;
  const links: WebPageLink[] = [];

  try {
    // If DOMParser is unavailable (e.g. Node SSR), immediately fallback
    if (typeof DOMParser === "undefined") {
      return { title: undefined, description: undefined, root: null, links: [] };
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    title = doc.querySelector("title")?.textContent?.trim() || undefined;
    const metaDesc = doc.querySelector("meta[name='description']");
    description = metaDesc?.getAttribute("content")?.trim() || undefined;

    // Remove noise elements
    doc.querySelectorAll(NOISE_TAG_SELECTOR).forEach((el) => el.remove());

    // Extract links (before choosing root, to capture all anchors)
    const anchorLinks = extractLinks(doc, baseUrl);
    links.push(...anchorLinks);

    // Choose content root: prefer article > main > [role=main] > body
    root = doc.querySelector("article, main, [role='main'], body");
  } catch {
    // DOMParser failed
  }

  return { title, description, root, links };
}

// ── Link extraction ──

function extractLinks(doc: Document, baseUrl: string): WebPageLink[] {
  const links: WebPageLink[] = [];
  const seen = new Set<string>();
  const anchors = doc.querySelectorAll("a[href]");
  for (const a of anchors) {
    const rawHref = a.getAttribute("href") ?? "";
    if (!rawHref) continue;
    const href = resolveUrl(rawHref, baseUrl);
    if (!href || !/^https?:\/\//.test(href)) continue;
    if (/^(javascript|file|data|mailto|tel):/.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const text = (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LINK_TEXT_LENGTH);
    links.push({ text: text || href, url: href, source: "anchor" });
    if (links.length >= MAX_LINKS) break;
  }
  return links;
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

// ── Lute conversion (SiYuan built-in) ──

/**
 * Clean residual HTML artifacts from Lute output.
 * Lute may leave behind DOCTYPE, media tags, or excessive blank lines.
 */
function postProcessLuteOutput(md: string): string {
  return md
    // Strip residual DOCTYPE/HTML/BODY wrappers
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?\s*html[^>]*>/gi, "")
    .replace(/<\/?\s*body[^>]*>/gi, "")
    // Strip media tags that survived
    .replace(/<\/?\s*(video|audio|source|track|picture|object|embed)[^>]*>/gi, "")
    .replace(/<\/?\s*(button|input|select|textarea)[^>]*>/gi, "")
    .replace(/<\/?\s*script[^>]*>/gi, "")
    .replace(/<\/?\s*style[^>]*>/gi, "")
    // Collapse excessive blank lines (3+ → 2)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tryLuteConvert(root: HTMLElement, maxChars?: number): { markdown: string; chars: number; truncated: boolean } | null {
  try {
    const lute = (window as unknown as Record<string, unknown>).Lute as { New(): Record<string, unknown> } | undefined;
    if (!lute?.New) return null;

    const instance = lute.New() as Record<string, unknown>;
    if (!instance) return null;

    // Try both common method names
    const html2md = typeof instance.HTML2Md === "function"
      ? instance.HTML2Md as (html: string) => string
      : typeof instance.HTML2Markdown === "function"
        ? instance.HTML2Markdown as (html: string) => string
        : null;
    if (!html2md) return null;

    const rawMarkdown = html2md(root.outerHTML);
    if (!rawMarkdown || typeof rawMarkdown !== "string") return null;

    // Post-process: remove residual HTML tags that Lute may leave behind
    const markdown = postProcessLuteOutput(rawMarkdown);
    if (!markdown || markdown.trim().length < 10) return null;

    const chars = markdown.length;
    const shouldTruncate = Number.isFinite(maxChars) && (maxChars ?? 0) > 0 && chars > (maxChars ?? 0);
    const truncated = shouldTruncate;
    const result = truncated ? trimToParagraphBoundary(markdown, maxChars!) + "\n\n[... truncated]" : markdown;
    return { markdown: result, chars: result.length, truncated };
  } catch {
    return null;
  }
}

// ── Basic HTML to Markdown fallback ──

function basicHtmlToMarkdown(root: HTMLElement, maxChars?: number): { markdown: string; chars: number; truncated: boolean } {
  const lines: string[] = [];
  collectMarkdownLines(root, lines);
  const markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const chars = markdown.length;
  const shouldTruncate = Number.isFinite(maxChars) && (maxChars ?? 0) > 0 && chars > (maxChars ?? 0);
  const truncated = shouldTruncate;
  return {
    markdown: truncated ? trimToParagraphBoundary(markdown, maxChars!) + "\n\n[... truncated]" : markdown,
    chars: truncated ? (maxChars ?? 0) : chars,
    truncated,
  };
}

/** Walk DOM tree and collect Markdown-like lines */
function collectMarkdownLines(el: Element, lines: string[]): void {
  const tag = el.tagName?.toLowerCase() ?? "";

  // Block elements
  if (tag === "br") { lines.push(""); return; }
  if (tag === "hr") { lines.push("---"); return; }

  const text = getCleanText(el);

  switch (tag) {
    case "h1": lines.push(`# ${text}`, ""); return;
    case "h2": lines.push(`## ${text}`, ""); return;
    case "h3": lines.push(`### ${text}`, ""); return;
    case "h4": lines.push(`#### ${text}`, ""); return;
    case "h5": lines.push(`##### ${text}`, ""); return;
    case "h6": lines.push(`###### ${text}`, ""); return;
    case "p": lines.push(text, ""); return;
    case "blockquote": lines.push(`> ${text.replace(/\n/g, "\n> ")}`, ""); return;
    case "pre": {
      const code = el.querySelector("code")?.textContent ?? el.textContent ?? "";
      lines.push("```", code.trim(), "```", "");
      return;
    }
    case "code": {
      if (el.parentElement?.tagName?.toLowerCase() !== "pre") {
        lines.push(`\`${text}\``);
      }
      return;
    }
    case "ul":
    case "ol": {
      let idx = 1;
      for (const child of Array.from(el.children)) {
        const childTag = child.tagName?.toLowerCase() ?? "";
        if (childTag === "li") {
          const prefix = tag === "ol" ? `${idx}. ` : "- ";
          lines.push(`${prefix}${getCleanText(child)}`);
          idx++;
        }
      }
      lines.push("");
      return;
    }
    case "a": {
      const href = el.getAttribute("href") ?? "";
      if (href && !/^(javascript|file|data|mailto|tel):/.test(href)) {
        lines.push(`[${text}](${href})`);
      }
      return;
    }
    case "img": {
      const alt = el.getAttribute("alt") ?? "";
      const src = el.getAttribute("src") ?? "";
      if (src) lines.push(`![${alt}](${src})`);
      return;
    }
    case "table": {
      lines.push(`[table: ${text.slice(0, 80)}]`, "");
      return;
    }
    case "strong":
    case "b":
      lines.push(`**${text}**`);
      return;
    case "em":
    case "i":
      lines.push(`*${text}*`);
      return;
  }

  // Recurse into children for unhandled elements
  for (const child of Array.from(el.children)) {
    collectMarkdownLines(child, lines);
  }

  // Non-empty text nodes in unhandled elements
  const directText = getDirectText(el);
  if (directText && el.children.length === 0) {
    lines.push(directText);
  }
}

function getCleanText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function getDirectText(el: Element): string {
  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) text += node.textContent ?? "";
  }
  return text.replace(/\s+/g, " ").trim();
}

// ── Utils ──

/** Trim to nearest paragraph boundary to avoid mid-sentence cuts */
function trimToParagraphBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars);
  const lastBreak = Math.max(
    head.lastIndexOf("\n\n"),
    head.lastIndexOf("\n"),
  );
  if (lastBreak > maxChars * 0.6) {
    return head.slice(0, lastBreak);
  }
  return head;
}
