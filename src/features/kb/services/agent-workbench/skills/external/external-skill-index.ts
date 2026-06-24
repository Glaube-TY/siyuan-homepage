import {
  listNotebrainDir,
  readNotebrainJson,
  readNotebrainTextFile,
  writeNotebrainJson,
} from "../../workspace/notebrain-workspace-fs";
import {
  joinNotebrainRelativePath,
  slugifyNotebrainId,
} from "../../workspace/notebrain-workspace-paths";
import {
  loadUserSkillIndex,
  loadUserSkillMarkdownByFilename,
} from "../../storage/user-skill-store";
import type { ExternalSkillIndex, ExternalSkillIndexEntry } from "./external-skill-types";
import { parseExternalSkillMarkdown } from "./external-skill-parser";

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
    description: "用户自定义 Skill。需要使用时先 skill_read 读取完整说明。",
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
    "以下 Skill 不会默认全文注入。需要使用时，请先调用 skill_read 读取入口说明；需要子文档时调用 skill_read_file。",
    "",
    "如果 Skill 需要调用 HTTP API，优先使用 web_http_get / web_http_post；不要默认用 run_notebrain_command 写 Python/node 脚本发 HTTP 请求。",
    "",
  ];
  for (const entry of entries.slice(0, 40)) {
    const hints = [...entry.triggers, ...entry.tags].filter(Boolean).slice(0, 8).join("、");
    lines.push(`- ${entry.id}：${entry.title}。${entry.description}${hints ? ` 触发线索：${hints}。` : ""} source=${entry.sourceType}, trusted=${entry.trusted}`);
  }
  if (entries.length > 40) {
    lines.push(`- 其余 ${entries.length - 40} 个 Skill 可通过 skill_list 查看。`);
  }
  return lines.join("\n");
}

