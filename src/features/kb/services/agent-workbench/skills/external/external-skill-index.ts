import {
  listNotebrainDir,
  readNotebrainJson,
  readNotebrainTextFile,
  writeNotebrainJson,
  deleteNotebrainPathChecked,
} from "../../workspace/notebrain-workspace-fs";
import {
  joinNotebrainRelativePath,
  normalizeNotebrainRelativePath,
  slugifyNotebrainId,
} from "../../workspace/notebrain-workspace-paths";
import {
  loadUserSkillIndex,
  loadUserSkillMarkdownByFilename,
} from "../../storage/user-skill-store";
import type { ExternalSkillIndex, ExternalSkillIndexEntry } from "./external-skill-types";
import { parseExternalSkillMarkdown } from "./external-skill-parser";
import { pushAgentDebugEvent } from "@/features/kb/services/agent-workbench/debug/workbench-debug";

export const EXTERNAL_SKILL_INDEX_PATH = "skills/index.json";

export function createEmptyExternalSkillIndex(): ExternalSkillIndex {
  return { version: 1, updatedAt: 0, skills: [] };
}

export async function loadExternalSkillIndex(): Promise<ExternalSkillIndex> {
  const index = await readNotebrainJson<ExternalSkillIndex>(
    EXTERNAL_SKILL_INDEX_PATH,
    createEmptyExternalSkillIndex(),
  );
  return index?.version === 1 && Array.isArray(index.skills)
    ? { version: 1, updatedAt: Number(index.updatedAt) || 0, skills: index.skills }
    : createEmptyExternalSkillIndex();
}

export async function saveExternalSkillIndex(index: ExternalSkillIndex): Promise<void> {
  await writeNotebrainJson(EXTERNAL_SKILL_INDEX_PATH, {
    version: 1,
    updatedAt: index.updatedAt || Date.now(),
    skills: index.skills,
  });
}

export async function loadUserSkillsAsExternalEntries(): Promise<ExternalSkillIndexEntry[]> {
  const index = await loadUserSkillIndex();
  if (!index?.skills?.length) return [];
  const now = Date.now();
  return index.skills.map((entry) => ({
    id: `user_${entry.id}`,
    title: entry.title || entry.id,
    description: "用户自定义 Skill。需要使用时先通过 skill_manage.read 读取完整说明。",
    sourceType: "user",
    source: `notebrain/skills/user/${entry.filename}`,
    rootDir: "skills/user",
    entry: entry.filename,
    enabled: entry.enabled,
    trusted: true,
    riskLevel: "low",
    tags: ["user"],
    triggers: [entry.title, entry.id].filter(Boolean),
    installedAt: entry.updatedAt || now,
    updatedAt: entry.updatedAt || now,
  }));
}

export async function listAllExternalSkillEntries(params?: {
  disabledSkillIds?: readonly string[];
}): Promise<ExternalSkillIndexEntry[]> {
  const disabled = new Set(params?.disabledSkillIds ?? []);
  const [installed, userSkills] = await Promise.all([
    loadExternalSkillIndex(),
    loadUserSkillsAsExternalEntries(),
  ]);
  const entries = [...installed.skills, ...userSkills];
  return entries.filter((entry) => entry.enabled !== false && !disabled.has(entry.id));
}

async function walkInstalledSkillFiles(base = "skills/installed", depth = 0): Promise<string[]> {
  if (depth > 5) return [];
  let entries = [];
  try {
    entries = await listNotebrainDir(base);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDir) {
      files.push(...await walkInstalledSkillFiles(entry.relativePath, depth + 1));
    } else if (/^skill\.md$/i.test(entry.name)) {
      files.push(entry.relativePath);
    }
  }
  return files;
}

export async function rebuildExternalSkillIndex(source = "reindex"): Promise<ExternalSkillIndex> {
  const now = Date.now();
  const previous = await loadExternalSkillIndex();
  const previousByRoot = new Map(previous.skills.map((entry) => [entry.rootDir, entry]));
  const skillFiles = await walkInstalledSkillFiles();
  const skills: ExternalSkillIndexEntry[] = [];

  for (const file of skillFiles) {
    const rootDir = file.split("/").slice(0, -1).join("/");
    const entryName = file.split("/").pop() || "SKILL.md";
    const text = await readNotebrainTextFile(file, 200000);
    const fallbackId = slugifyNotebrainId(rootDir.split("/").pop(), "skill");
    const parsed = parseExternalSkillMarkdown({
      markdown: text.content,
      fallbackId,
      source: previousByRoot.get(rootDir)?.source ?? source,
      rootDir,
      entry: entryName,
      now,
    });
    const previousEntry = previousByRoot.get(rootDir);
    skills.push({
      ...parsed,
      id: previousEntry?.id ?? parsed.id,
      sourceType: previousEntry?.sourceType ?? parsed.sourceType,
      source: previousEntry?.source ?? parsed.source,
      trusted: previousEntry?.trusted ?? parsed.trusted,
      enabled: previousEntry?.enabled ?? parsed.enabled,
      installedAt: previousEntry?.installedAt ?? parsed.installedAt,
    });
  }

  const index: ExternalSkillIndex = { version: 1, updatedAt: now, skills };
  await saveExternalSkillIndex(index);
  return index;
}

export async function readExternalSkillEntryFile(params: {
  entry: ExternalSkillIndexEntry;
  relativeFile: string;
  maxChars: number;
}) {
  if (params.entry.sourceType === "user") {
    const id = params.entry.id.replace(/^user_/, "");
    const userIndex = await loadUserSkillIndex();
    const userEntry = userIndex?.skills.find((item) => item.id === id || `user_${item.id}` === params.entry.id);
    const markdown = userEntry
      ? await loadUserSkillMarkdownByFilename(userEntry.filename)
      : null;
    const content = markdown ?? "";
    const limit = Math.max(1, params.maxChars);
    return {
      content: content.length > limit ? content.slice(0, limit) : content,
      truncated: content.length > limit,
      chars: content.length,
      relativePath: userEntry?.filename ?? params.entry.entry,
    };
  }
  const path = joinNotebrainRelativePath(params.entry.rootDir, params.relativeFile);
  const result = await readNotebrainTextFile(path, params.maxChars);
  return { ...result, relativePath: path };
}

export function renderExternalSkillIndexPrompt(entries: readonly ExternalSkillIndexEntry[]): string {
  if (entries.length === 0) return "";
  const lines = [
    "# 可按需读取的外部 Skill",
    "",
    "以下 Skill 不会默认全文注入。需要使用时，请调用 skill_manage，action=read 读取入口说明；需要子文档时使用 action=read_file。",
    "",
    "如果 Skill 需要调用 HTTP API，优先使用 web_fetch 的 http_get/http_post action；不要默认用 notebrain_file.run_command 写 Python/node 脚本发 HTTP 请求。",
    "",
  ];
  for (const entry of entries.slice(0, 40)) {
    const hints = [...entry.triggers, ...entry.tags].filter(Boolean).slice(0, 8).join("、");
    lines.push(`- ${entry.id}：${entry.title}。${entry.description}${hints ? ` 触发线索：${hints}。` : ""} source=${entry.sourceType}, trusted=${entry.trusted}`);
  }
  if (entries.length > 40) {
    lines.push(`- 其余 ${entries.length - 40} 个 Skill 可通过 skill_manage.list 查看。`);
  }
  return lines.join("\n");
}

/**
 * Safely delete an installed external Skill.
 * Only allows deleting non-user Skills whose normalized rootDir is under skills/installed/.
 * Never allows deleting the skills/ or skills/installed/ root directories.
 * Never allows path traversal (.., absolute paths, backslash escape).
 * Uses normalizeNotebrainRelativePath to normalize rootDir before all safety checks.
 */
export async function deleteInstalledExternalSkill(entry: ExternalSkillIndexEntry): Promise<{
  removedCount: number;
  deletedRootDir: string;
  directoryAlreadyMissing: boolean;
}> {
  // ── Safety: only non-user installed skills ──
  if (entry.sourceType === "user") {
    throw new Error("不能通过此接口删除用户自定义 Skill，请使用用户 Skill 管理功能。");
  }

  const rawRootDir = entry.rootDir;
  if (!rawRootDir) {
    throw new Error("Skill rootDir 为空，无法删除。");
  }

  // ── Normalize first, then validate ──
  // normalizeNotebrainRelativePath converts \\ to /, removes . segments, rejects ..
  let normalizedRootDir: string;
  try {
    normalizedRootDir = normalizeNotebrainRelativePath(rawRootDir);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`不能删除该 Skill：rootDir "${rawRootDir}" 路径格式无效（${msg}）。`);
  }

  if (!normalizedRootDir) {
    throw new Error("不能删除该 Skill：rootDir 归一化后为空。");
  }

  // Must be under skills/installed/ (after normalization)
  if (!normalizedRootDir.startsWith("skills/installed/")) {
    throw new Error(`不能删除该 Skill：归一化路径 "${normalizedRootDir}" 不在 skills/installed/ 下。`);
  }
  // Must not be the root itself (after normalization)
  if (normalizedRootDir === "skills/installed") {
    throw new Error("不能删除 skills/installed 根目录。");
  }
  // Additional safety: no absolute path escape (already handled by normalize, but defense in depth)
  if (normalizedRootDir.startsWith("/") || /^[a-zA-Z]:\//.test(normalizedRootDir)) {
    throw new Error(`不能删除该 Skill：归一化路径 "${normalizedRootDir}" 是绝对路径。`);
  }

  // ── Delete local directory using normalized path (may already be missing) ──
  let directoryAlreadyMissing = false;
  try {
    await deleteNotebrainPathChecked(normalizedRootDir);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("不存在") || msg.includes("not found") || msg.includes("no such")) {
      directoryAlreadyMissing = true;
    } else {
      throw new Error(`删除本地文件夹失败：${msg}`);
    }
  }

  // ── Remove from index using normalized rootDir comparison ──
  const index = await loadExternalSkillIndex();
  const beforeCount = index.skills.length;
  index.skills = index.skills.filter((item) => {
    // Always remove by ID match
    if (item.id === entry.id) return false;
    // Also remove by normalized rootDir match (handles historical path variants)
    try {
      const normalizedItemRootDir = normalizeNotebrainRelativePath(item.rootDir);
      if (normalizedItemRootDir === normalizedRootDir) return false;
    } catch {
      // Cannot normalize abnormal rootDir, keep it (don't interrupt deletion)
      pushAgentDebugEvent("EXTERNAL_SKILL_INDEX_SKIP", {
        id: item.id,
        rootDir: item.rootDir,
        reason: "无法归一化",
      }, "warn");
    }
    return true;
  });
  index.updatedAt = Date.now();
  await saveExternalSkillIndex(index);
  const removedCount = beforeCount - index.skills.length;

  // ── Debug event (safe, no file content, only normalized path) ──
  pushAgentDebugEvent("EXTERNAL_SKILL_DELETED", {
    id: entry.id,
    rootDir: normalizedRootDir,
    removedCount,
    directoryAlreadyMissing,
  }, "info");

  return { removedCount, deletedRootDir: normalizedRootDir, directoryAlreadyMissing };
}
