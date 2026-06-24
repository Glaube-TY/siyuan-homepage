import { slugifyNotebrainId } from "../../workspace/notebrain-workspace-paths";

function readFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
    if (key) out[key] = value;
  }
  return out;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(/[,，]/)
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, 20);
}

function firstHeading(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function firstParagraph(markdown: string): string {
  const body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  for (const block of body.split(/\n\s*\n/)) {
    const text = block
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("#") && !line.trim().startsWith("```"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 0) return text.slice(0, 240);
  }
  return "";
}

export function detectRequiredEnvVars(markdown: string): string[] {
  const matches = markdown.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  const envs = matches.filter((item) => /(API|KEY|TOKEN|SECRET|PASSWORD|COOKIE)/.test(item));
  return [...new Set(envs)].slice(0, 20);
}

export function parseExternalSkillMarkdown(params: {
  markdown: string;
  fallbackId: string;
  source: string;
  rootDir: string;
  entry: string;
  now?: number;
}) {
  const fm = readFrontmatter(params.markdown);
  const title = fm.title || fm.name || firstHeading(params.markdown) || params.fallbackId;
  const description = fm.description || firstParagraph(params.markdown) || `外部 Skill：${title}`;
  const id = slugifyNotebrainId(fm.id || fm.name || params.fallbackId, params.fallbackId);
  const now = params.now ?? Date.now();
  return {
    id,
    title,
    description,
    sourceType: "unknown" as const,
    source: params.source,
    rootDir: params.rootDir,
    entry: params.entry,
    enabled: true,
    trusted: false,
    riskLevel: "medium" as const,
    tags: parseList(fm.tags),
    triggers: parseList(fm.triggers || fm.keywords),
    installedAt: now,
    updatedAt: now,
    requiredEnvVars: detectRequiredEnvVars(params.markdown),
  };
}

