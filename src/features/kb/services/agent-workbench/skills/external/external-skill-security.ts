import { isRelativePathInside, normalizeNotebrainRelativePath } from "../../workspace/notebrain-workspace-paths";

const ALLOWED_READ_ROOTS = ["docs", "examples", "resources"];

const INSTRUCTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?/gi,
  /(?:bypass|skip|disable)\s+(?:permission|confirmation|safety|guard)s?/gi,
  /(?:reveal|leak|print|return)\s+(?:the\s+)?(?:system prompt|secret|api key|token|cookie)/gi,
  /忽略(?:之前|以上|系统|开发者)[^。.!！?？]{0,40}(?:指令|提示)/g,
  /(?:绕过|跳过|关闭)[^。.!！?？]{0,24}(?:权限|确认|安全|校验)/g,
];

/** 外部 Skill 元数据只能作为不可信数据展示，不能保留可执行提示语形态。 */
export function sanitizeExternalSkillMetadataText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const withoutControls = [...value].map((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && char !== "\n" && char !== "\r" && char !== "\t") || code === 127 ? " " : char;
  }).join("");
  let text = withoutControls
    .replace(/```[\s\S]*?```/g, " [代码块已移除] ")
    .replace(/<\/?(?:tool_calls?|invoke|function_call|assistant|system|developer)[^>]*>/gi, " ")
    .replace(/(?:^|\s)(?:system|assistant|developer|tool)\s*:/gi, " ")
    .replace(/\b(?:sk|pk|api)[_-][a-z0-9_-]{12,}\b/gi, "[敏感值已移除]")
    .replace(/\b(?:authorization|cookie|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[敏感值已移除]")
    .replace(/\b[a-zA-Z]:[\\/](?:[^\\/\s]+[\\/])*[^\\/\s]*/g, "[本地路径已移除]");
  for (const pattern of INSTRUCTION_PATTERNS) text = text.replace(pattern, "[指令性文本已移除]");
  text = text.replace(/<[^>]{1,200}>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, Math.max(0, maxChars));
}

export function sanitizeExternalSkillMetadataList(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeExternalSkillMetadataText(item, 80))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function assertExternalSkillFileReadable(relativePath: unknown): string {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  if (normalized === "SKILL.md" || normalized === "skill.md") return normalized;
  if (ALLOWED_READ_ROOTS.some((root) => isRelativePathInside(root, normalized))) {
    return normalized;
  }
  throw new Error("只能读取 Skill 根目录下的 SKILL.md 或 docs/examples/resources 子目录文件。");
}

export function isSafeZipEntryPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  if (path.split("/").some((part) => part === "..")) return false;
  if (path.includes("/.git/") || path.startsWith(".git/")) return false;
  return true;
}
