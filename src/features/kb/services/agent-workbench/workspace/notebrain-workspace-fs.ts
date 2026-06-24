import { getFile, putFile, readDir, removeFile } from "@/api";
import { removeFileChecked } from "@/api";
import {
  getNotebrainBasename,
  joinNotebrainRelativePath,
  normalizeNotebrainRelativePath,
  toNotebrainLogicalPath,
} from "./notebrain-workspace-paths";
import type {
  NotebrainRelativePath,
  NotebrainWorkspaceFileEntry,
  NotebrainWorkspaceReadTextResult,
} from "./notebrain-workspace-types";

function makeBlob(content: string | Blob | ArrayBuffer | Uint8Array, type = "text/plain;charset=utf-8"): Blob {
  if (content instanceof Blob) return content;
  if (content instanceof Uint8Array) {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    return new Blob([copy.buffer], { type });
  }
  return new Blob([content], { type });
}

function normalizeReadDirEntry(base: string, entry: any): NotebrainWorkspaceFileEntry | null {
  const name = typeof entry?.name === "string" ? entry.name : "";
  if (!name) return null;
  const isDir = Boolean(entry?.isDir ?? entry?.isdir ?? entry?.isDir);
  return {
    name,
    relativePath: joinNotebrainRelativePath(base, name),
    isDir,
    size: typeof entry?.size === "number" ? entry.size : undefined,
    updatedAt: typeof entry?.updated === "number"
      ? entry.updated
      : typeof entry?.modTime === "number"
        ? entry.modTime
        : undefined,
  };
}

export async function ensureNotebrainDir(relativePath: unknown): Promise<void> {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  await putFile(toNotebrainLogicalPath(normalized), true, makeBlob(""));
}

export async function listNotebrainDir(relativePath: unknown = ""): Promise<NotebrainWorkspaceFileEntry[]> {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  const data = await readDir(toNotebrainLogicalPath(normalized));
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => normalizeReadDirEntry(normalized, entry))
    .filter((entry): entry is NotebrainWorkspaceFileEntry => entry !== null);
}

export async function readNotebrainTextFile(
  relativePath: unknown,
  maxChars = 20000,
): Promise<NotebrainWorkspaceReadTextResult> {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  const raw = await getFile(toNotebrainLogicalPath(normalized));
  const content = typeof raw === "string"
    ? raw
    : raw instanceof Blob
      ? await raw.text()
      : raw == null
        ? ""
        : typeof raw === "object"
          ? JSON.stringify(raw, null, 2)
          : String(raw);
  const limit = Math.max(1, Math.floor(maxChars));
  return {
    content: content.length > limit ? content.slice(0, limit) : content,
    truncated: content.length > limit,
    chars: content.length,
  };
}

export async function writeNotebrainTextFile(relativePath: unknown, content: string): Promise<void> {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  const parent = normalized.split("/").slice(0, -1).join("/");
  if (parent) await ensureNotebrainDir(parent);
  await putFile(
    toNotebrainLogicalPath(normalized),
    false,
    makeBlob(content, "text/plain;charset=utf-8"),
  );
}

export async function writeNotebrainBinaryFile(
  relativePath: unknown,
  content: Blob | ArrayBuffer | Uint8Array,
  type = "application/octet-stream",
): Promise<void> {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  const parent = normalized.split("/").slice(0, -1).join("/");
  if (parent) await ensureNotebrainDir(parent);
  await putFile(toNotebrainLogicalPath(normalized), false, makeBlob(content, type));
}

export async function deleteNotebrainPath(relativePath: unknown): Promise<void> {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  if (!normalized) {
    throw new Error("Refusing to delete Notebrain workspace root.");
  }
  await removeFile(toNotebrainLogicalPath(normalized));
}

/**
 * Delete a file/directory under the Notebrain workspace using the checked API.
 * Unlike deleteNotebrainPath, this throws on API failure (code !== 0)
 * and ensures errors are not silently swallowed.
 * Only used where failure must be explicit (e.g. external Skill deletion).
 */
export async function deleteNotebrainPathChecked(relativePath: unknown): Promise<void> {
  const normalized = normalizeNotebrainRelativePath(relativePath);
  if (!normalized) {
    throw new Error("Refusing to delete Notebrain workspace root.");
  }
  await removeFileChecked(toNotebrainLogicalPath(normalized));
}

export async function readNotebrainJson<T>(relativePath: unknown, fallback: T): Promise<T> {
  try {
    const text = await readNotebrainTextFile(relativePath, 2_000_000);
    if (!text.content.trim()) return fallback;
    return JSON.parse(text.content) as T;
  } catch {
    return fallback;
  }
}

export async function writeNotebrainJson<T>(relativePath: unknown, data: T): Promise<void> {
  await writeNotebrainTextFile(relativePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function buildChildPath(parent: NotebrainRelativePath, childName: string): NotebrainRelativePath {
  return joinNotebrainRelativePath(parent, getNotebrainBasename(childName));
}
