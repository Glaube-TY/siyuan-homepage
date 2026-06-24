import type {
  NotebrainAbsolutePath,
  NotebrainLogicalPath,
  NotebrainRelativePath,
} from "./notebrain-workspace-types";

export const NOTEBRAIN_PLUGIN_NAME = "siyuan-homepage";
export const NOTEBRAIN_WORKSPACE_LOGICAL_ROOT = `data/storage/petal/${NOTEBRAIN_PLUGIN_NAME}/notebrain`;
export const NOTEBRAIN_PROJECT_DEFAULT_RELATIVE = "projects/default";

const SAFE_SEGMENT_PATTERN = /^[^<>:"|?*\x00-\x1F]+$/;

export function normalizeNotebrainRelativePath(input: unknown): NotebrainRelativePath {
  const raw = String(input ?? ".").trim().replace(/\\/g, "/");
  if (!raw || raw === ".") return "";
  if (raw.startsWith("/") || /^[a-zA-Z]:\//.test(raw)) {
    throw new Error("Notebrain path must be relative.");
  }

  const parts: string[] = [];
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      throw new Error("Notebrain path cannot contain '..'.");
    }
    if (!SAFE_SEGMENT_PATTERN.test(segment)) {
      throw new Error(`Invalid Notebrain path segment: ${segment}`);
    }
    parts.push(segment);
  }
  return parts.join("/");
}

export function joinNotebrainRelativePath(...parts: unknown[]): NotebrainRelativePath {
  return normalizeNotebrainRelativePath(
    parts.map((part) => String(part ?? "")).filter(Boolean).join("/"),
  );
}

export function toNotebrainLogicalPath(relativePath: unknown = ""): NotebrainLogicalPath {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  return normalized
    ? `${NOTEBRAIN_WORKSPACE_LOGICAL_ROOT}/${normalized}`
    : NOTEBRAIN_WORKSPACE_LOGICAL_ROOT;
}

export function toProjectDefaultRelativePath(cwd: unknown = "."): NotebrainRelativePath {
  const normalized = normalizeNotebrainRelativePath(cwd);
  return normalized
    ? joinNotebrainRelativePath(NOTEBRAIN_PROJECT_DEFAULT_RELATIVE, normalized)
    : NOTEBRAIN_PROJECT_DEFAULT_RELATIVE;
}

export function isRelativePathInside(parent: string, child: string): boolean {
  const p = normalizeNotebrainRelativePath(parent);
  const c = normalizeNotebrainRelativePath(child);
  return c === p || c.startsWith(`${p}/`);
}

export function getNotebrainBasename(relativePath: unknown): string {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "notebrain-file";
}

export function slugifyNotebrainId(value: unknown, fallback = "skill"): string {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export interface ResolveAbsoluteInsideResult {
  ok: boolean;
  absolutePath?: NotebrainAbsolutePath;
  rootAbsolutePath?: NotebrainAbsolutePath;
  errorCode?: "prerequisite_missing" | "path_escape" | "invalid_path";
  message?: string;
}

