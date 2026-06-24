import JSZip from "jszip";
import {
  writeNotebrainBinaryFile,
  writeNotebrainJson,
  writeNotebrainTextFile,
} from "../../workspace/notebrain-workspace-fs";
import {
  joinNotebrainRelativePath,
  slugifyNotebrainId,
} from "../../workspace/notebrain-workspace-paths";
import {
  appendNotebrainLog,
  createNotebrainLogId,
} from "../../workspace/notebrain-log-service";
import type {
  ExternalSkillIndex,
  ExternalSkillIndexEntry,
  ExternalSkillInstallInput,
  ExternalSkillInstallResult,
} from "./external-skill-types";
import { loadExternalSkillIndex, saveExternalSkillIndex } from "./external-skill-index";
import { parseExternalSkillMarkdown } from "./external-skill-parser";
import { resolveExternalSkillSource } from "./external-skill-source-resolver";
import { isSafeZipEntryPath } from "./external-skill-security";

const MAX_ZIP_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024;

function stripZipTopFolder(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return path;
  return parts.slice(1).join("/");
}

function dirname(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "";
}

async function fetchZipArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

async function fetchGithubZipWithFallback(params: {
  zipUrl: string;
  owner?: string;
  repo?: string;
  ref?: string;
}): Promise<ArrayBuffer> {
  try {
    return await fetchZipArrayBuffer(params.zipUrl);
  } catch (err) {
    if (params.ref === "main" && params.owner && params.repo) {
      return fetchZipArrayBuffer(`https://codeload.github.com/${params.owner}/${params.repo}/zip/refs/heads/master`);
    }
    throw err;
  }
}

function findSkillRoots(zip: JSZip): string[] {
  const roots = new Set<string>();
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue;
    if (!isSafeZipEntryPath(file.name)) continue;
    const normalized = stripZipTopFolder(file.name);
    if (/^skill\.md$/i.test(basename(normalized))) {
      roots.add(dirname(normalized));
    }
  }
  return [...roots].sort((a, b) => a.localeCompare(b));
}

async function readZipText(zip: JSZip, strippedPath: string): Promise<string> {
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue;
    if (stripZipTopFolder(file.name) === strippedPath) {
      return file.async("string");
    }
  }
  return "";
}

function zipFilesUnderRoot(zip: JSZip, root: string) {
  const prefix = root ? `${root}/` : "";
  return Object.values(zip.files)
    .filter((file) => !file.dir && isSafeZipEntryPath(file.name))
    .map((file) => ({ file, stripped: stripZipTopFolder(file.name) }))
    .filter(({ stripped }) => stripped.startsWith(prefix))
    .map(({ file, stripped }) => ({
      file,
      relativeWithinRoot: stripped.slice(prefix.length),
    }))
    .filter((item) => item.relativeWithinRoot && isSafeZipEntryPath(item.relativeWithinRoot));
}

export async function installExternalSkill(
  input: ExternalSkillInstallInput,
): Promise<ExternalSkillInstallResult> {
  const startedAt = Date.now();
  const logId = createNotebrainLogId("skill-install");
  const resolved = resolveExternalSkillSource(input.source);
  if (!resolved.zipUrl) {
    const logPath = await appendNotebrainLog({
      id: logId,
      type: "skill_install",
      startedAt,
      finishedAt: Date.now(),
      ok: false,
      source: resolved.canonicalSource,
      summary: "Skill 安装失败：当前仅支持 GitHub URL、owner/repo 和 zip URL。",
      errorCode: "unsupported_source",
    });
    throw new Error(`当前仅支持 GitHub URL、owner/repo 和 zip URL。日志：${logPath}`);
  }

  const zipBuffer = resolved.sourceType === "github"
    ? await fetchGithubZipWithFallback({
        zipUrl: resolved.zipUrl,
        owner: resolved.owner,
        repo: resolved.repo,
        ref: resolved.ref,
      })
    : await fetchZipArrayBuffer(resolved.zipUrl);

  if (zipBuffer.byteLength > MAX_ZIP_TOTAL_BYTES) {
    throw new Error("Skill 压缩包过大，已拒绝安装。");
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  const roots = findSkillRoots(zip);
  if (roots.length === 0) {
    throw new Error("压缩包中未找到 SKILL.md。");
  }

  const targetBase = slugifyNotebrainId(input.targetSkillId || resolved.defaultTargetId, "external-skill");
  const now = Date.now();
  const installed: ExternalSkillIndexEntry[] = [];

  for (const root of roots) {
    const rootSlug = slugifyNotebrainId(basename(root) || targetBase, "skill");
    const installRoot = roots.length === 1
      ? joinNotebrainRelativePath("skills/installed", targetBase)
      : joinNotebrainRelativePath("skills/installed", targetBase, rootSlug);
    const skillFile = root ? `${root}/SKILL.md` : "SKILL.md";
    const skillMarkdown = await readZipText(zip, skillFile) || await readZipText(zip, root ? `${root}/skill.md` : "skill.md");
    if (!skillMarkdown.trim()) continue;

    let copiedBytes = 0;
    for (const item of zipFilesUnderRoot(zip, root)) {
      const content = await item.file.async("uint8array");
      if (content.byteLength > MAX_SINGLE_FILE_BYTES) continue;
      copiedBytes += content.byteLength;
      if (copiedBytes > MAX_ZIP_TOTAL_BYTES) {
        throw new Error("Skill 解压内容过大，已拒绝安装。");
      }
      await writeNotebrainBinaryFile(
        joinNotebrainRelativePath(installRoot, item.relativeWithinRoot),
        content,
        "application/octet-stream",
      );
    }
    await writeNotebrainTextFile(joinNotebrainRelativePath(installRoot, "SKILL.md"), skillMarkdown);

    const parsed = parseExternalSkillMarkdown({
      markdown: skillMarkdown,
      fallbackId: rootSlug,
      source: resolved.canonicalSource,
      rootDir: installRoot,
      entry: "SKILL.md",
      now,
    });
    const entry: ExternalSkillIndexEntry = {
      ...parsed,
      sourceType: resolved.sourceType,
      source: resolved.canonicalSource,
      rootDir: installRoot,
      id: roots.length === 1 ? parsed.id : slugifyNotebrainId(`${targetBase}-${parsed.id}`),
    };
    await writeNotebrainJson(joinNotebrainRelativePath(installRoot, "skill.json"), entry);
    installed.push(entry);
  }

  if (installed.length === 0) {
    throw new Error("压缩包中未找到可安装的 Skill。");
  }

  const previous = await loadExternalSkillIndex();
  const installedRootSet = new Set(installed.map((entry) => entry.rootDir));
  const installedIdSet = new Set(installed.map((entry) => entry.id));
  const nextIndex: ExternalSkillIndex = {
    version: 1,
    updatedAt: now,
    skills: [
      ...previous.skills.filter((entry) => !installedRootSet.has(entry.rootDir) && !installedIdSet.has(entry.id)),
      ...installed,
    ].sort((a, b) => a.id.localeCompare(b.id)),
  };
  await saveExternalSkillIndex(nextIndex);

  const requiredEnvVars = [...new Set(installed.flatMap((entry) => entry.requiredEnvVars ?? []))];
  const logPath = await appendNotebrainLog({
    id: logId,
    type: "skill_install",
    startedAt,
    finishedAt: Date.now(),
    ok: true,
    source: resolved.canonicalSource,
    durationMs: Date.now() - startedAt,
    summary: `已安装 ${installed.length} 个 Skill：${installed.map((entry) => entry.id).join(", ")}`,
  });

  return {
    installed,
    indexUpdatedAt: nextIndex.updatedAt,
    requiredEnvVars,
    logPath,
  };
}
