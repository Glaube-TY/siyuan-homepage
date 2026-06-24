import { isRelativePathInside, normalizeNotebrainRelativePath } from "../../workspace/notebrain-workspace-paths";

const ALLOWED_READ_ROOTS = ["docs", "examples", "resources"];

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

