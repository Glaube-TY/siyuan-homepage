import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import type { ExternalSkillSettings } from "../../../../types/settings";
import {
  EXTERNAL_SKILL_INDEX_PATH,
  listAllExternalSkillEntries,
  loadExternalSkillIndex,
  readExternalSkillEntryFile,
  rebuildExternalSkillIndex,
  saveExternalSkillIndex,
} from "../../skills/external/external-skill-index";
import { installExternalSkill } from "../../skills/external/external-skill-installer";
import { assertExternalSkillFileReadable } from "../../skills/external/external-skill-security";
import type { ExternalSkillIndexEntry } from "../../skills/external/external-skill-types";
import {
  appendNotebrainLog,
  createNotebrainLogId,
} from "../../workspace/notebrain-log-service";

const skillListInputSchema = z.object({}).strict();
const skillReadInputSchema = z.object({
  id: z.string().min(1).describe("Skill ID，例如 wechat-reading 或 user_xxx。"),
  maxChars: z.number().int().positive().optional().describe("最大读取字符数。"),
}).strict();
const skillReadFileInputSchema = z.object({
  id: z.string().min(1).describe("Skill ID。"),
  path: z.string().min(1).describe("Skill 内相对文件路径，仅允许 SKILL.md 或 docs/examples/resources 下文件。"),
  maxChars: z.number().int().positive().optional().describe("最大读取字符数。"),
}).strict();
const skillInstallInputSchema = z.object({
  source: z.string().min(1).describe("GitHub URL、owner/repo 或 zip URL。"),
  targetSkillId: z.string().min(1).optional().describe("可选安装目录 ID。"),
}).strict();
const skillUninstallInputSchema = z.object({
  id: z.string().min(1).describe("Skill ID。"),
}).strict();
const skillReindexInputSchema = z.object({}).strict();

function maxSkillReadChars(settings: ExternalSkillSettings): number {
  return Math.max(2000, Math.min(settings.maxSkillReadChars || 20000, 100000));
}

async function findSkillEntry(id: string, settings: ExternalSkillSettings): Promise<ExternalSkillIndexEntry | null> {
  const entries = await listAllExternalSkillEntries({ disabledSkillIds: settings.disabledSkillIds });
  const normalized = id.trim();
  return entries.find((entry) => entry.id === normalized)
    ?? entries.find((entry) => entry.id === `user_${normalized}`)
    ?? null;
}

export function createSkillListTool(settings: ExternalSkillSettings): ToolContract {
  return {
    name: "skill_list",
    title: "列出外部 Skill",
    description: "列出已安装或自定义的外部 Skill 简短索引，不返回全文。需要使用某个 Skill 时再调用 skill_read。",
    inputSchema: skillListInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "local",
    providerVisible: true,
    availability() {
      return settings.enabled ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "外部 Skill 功能未启用。",
      };
    },
    async execute(): Promise<ToolResult> {
      const skills = await listAllExternalSkillEntries({ disabledSkillIds: settings.disabledSkillIds });
      return {
        ok: true,
        data: {
          indexPath: EXTERNAL_SKILL_INDEX_PATH,
          total: skills.length,
          skills: skills.map((entry) => ({
            id: entry.id,
            title: entry.title,
            description: entry.description,
            sourceType: entry.sourceType,
            source: entry.source,
            trusted: entry.trusted,
            riskLevel: entry.riskLevel,
            tags: entry.tags,
            triggers: entry.triggers,
            requiredEnvVars: entry.requiredEnvVars ?? [],
          })),
        },
      };
    },
    summarizeResult(result) {
      const total = (result.data as any)?.total ?? 0;
      return `外部 Skill 索引包含 ${total} 项。`;
    },
  };
}

export function createSkillReadTool(settings: ExternalSkillSettings): ToolContract<z.infer<typeof skillReadInputSchema>> {
  return {
    name: "skill_read",
    title: "读取 Skill 入口说明",
    description: "按需读取指定外部 Skill 的入口文件 SKILL.md。用于理解第三方或用户 Skill 的使用说明。",
    inputSchema: skillReadInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "local",
    providerVisible: true,
    availability() {
      return settings.enabled ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "外部 Skill 功能未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const entry = await findSkillEntry(args.id, settings);
      if (!entry) {
        return {
          ok: false,
          data: null,
          error: { code: "skill_not_found", message: "未找到指定 Skill。", recoverable: true },
        };
      }
      const maxChars = Math.min(args.maxChars ?? maxSkillReadChars(settings), maxSkillReadChars(settings));
      const read = await readExternalSkillEntryFile({ entry, relativeFile: entry.entry || "SKILL.md", maxChars });
      const requiredEnvVars = entry.requiredEnvVars ?? [];
      const envVarNote = requiredEnvVars.length > 0
        ? `requiredEnvVars [${requiredEnvVars.join(", ")}] 需要用户显式配置，不要在系统环境变量中查找密钥。`
        : "";
      const apiNote = "如果 Skill 需要调用 HTTP API，优先使用 web_http_get / web_http_post。";
      return {
        ok: true,
        data: {
          id: entry.id,
          title: entry.title,
          sourceType: entry.sourceType,
          source: entry.source,
          relativePath: read.relativePath,
          content: read.content,
          truncated: read.truncated,
          chars: read.chars,
          requiredEnvVars,
          note: [
            read.truncated ? "内容已截断，可用 skill_read_file 继续读取相关子文档。" : "",
            envVarNote,
            apiNote,
          ].filter(Boolean).join(" "),
        },
      };
    },
    summarizeResult(result) {
      if (!result.ok) return result.error?.message ?? "Skill 读取失败。";
      return `已读取 Skill：${(result.data as any)?.id ?? ""}`;
    },
  };
}

export function createSkillReadFileTool(settings: ExternalSkillSettings): ToolContract<z.infer<typeof skillReadFileInputSchema>> {
  return {
    name: "skill_read_file",
    title: "读取 Skill 子文件",
    description: "读取指定外部 Skill 下 docs/examples/resources 中的相对文件，不能逃逸 Skill 根目录。",
    inputSchema: skillReadFileInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "local",
    providerVisible: true,
    availability() {
      return settings.enabled ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "外部 Skill 功能未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const entry = await findSkillEntry(args.id, settings);
      if (!entry) {
        return {
          ok: false,
          data: null,
          error: { code: "skill_not_found", message: "未找到指定 Skill。", recoverable: true },
        };
      }
      if (entry.sourceType === "user") {
        return {
          ok: false,
          data: null,
          error: { code: "unsupported_skill_file", message: "用户自定义 Skill 只有入口文件，请使用 skill_read。", recoverable: true },
        };
      }
      let safePath: string;
      try {
        safePath = assertExternalSkillFileReadable(args.path);
      } catch (err) {
        return {
          ok: false,
          data: null,
          error: {
            code: "path_not_allowed",
            message: err instanceof Error ? err.message : "Skill 文件路径不允许读取。",
            recoverable: true,
          },
        };
      }
      const maxChars = Math.min(args.maxChars ?? maxSkillReadChars(settings), maxSkillReadChars(settings));
      const read = await readExternalSkillEntryFile({ entry, relativeFile: safePath, maxChars });
      return {
        ok: true,
        data: {
          id: entry.id,
          title: entry.title,
          relativePath: read.relativePath,
          content: read.content,
          truncated: read.truncated,
          chars: read.chars,
        },
      };
    },
  };
}

export function createSkillInstallTool(settings: ExternalSkillSettings): ToolContract<z.infer<typeof skillInstallInputSchema>> {
  return {
    name: "skill_install",
    title: "安装外部 Skill",
    description: "从 GitHub URL、owner/repo 或 zip URL 安装外部 Skill 到 notebrain/skills/installed，并更新 Skill 索引。安装写入前必须用户确认。",
    inputSchema: skillInstallInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.skills" },
    source: "local",
    providerVisible: true,
    availability() {
      if (!settings.enabled || !settings.autoInstallEnabled) {
        return {
          available: false,
          reasonCode: "permission_denied",
          hint: "外部 Skill 安装未启用。",
        };
      }
      return { available: true };
    },
    async execute(_ctx: ToolRuntimeContext, args): Promise<ToolResult> {
      try {
        const result = await installExternalSkill(args);
        return {
          ok: true,
          data: {
            ...result,
            note: [
              result.requiredEnvVars.length > 0
                ? `该 Skill 可能需要配置环境变量：${result.requiredEnvVars.join(", ")}。请让用户显式配置，不要在系统中查找隐私信息。`
                : "",
              "如果 Skill 需要调用 HTTP API，优先使用 web_http_get / web_http_post。",
            ].filter(Boolean).join(" "),
          },
        };
      } catch (err) {
        return {
          ok: false,
          data: null,
          error: {
            code: "skill_install_failed",
            message: err instanceof Error ? err.message : "Skill 安装失败。",
            recoverable: true,
          },
        };
      }
    },
    summarizeResult(result) {
      if (!result.ok) return result.error?.message ?? "Skill 安装失败。";
      const installed = (result.data as any)?.installed ?? [];
      return `已安装 ${installed.length} 个外部 Skill。`;
    },
  };
}

export function createSkillUninstallTool(settings: ExternalSkillSettings): ToolContract<z.infer<typeof skillUninstallInputSchema>> {
  return {
    name: "skill_uninstall",
    title: "停用外部 Skill",
    description: "停用指定外部 Skill。默认不永久删除文件，仅从索引中标记 disabled。",
    inputSchema: skillUninstallInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.skills" },
    source: "local",
    providerVisible: true,
    availability() {
      return settings.enabled ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "外部 Skill 功能未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const startedAt = Date.now();
      const index = await loadExternalSkillIndex();
      let found = false;
      const next = {
        ...index,
        updatedAt: Date.now(),
        skills: index.skills.map((entry) => {
          if (entry.id !== args.id) return entry;
          found = true;
          return { ...entry, enabled: false, updatedAt: Date.now() };
        }),
      };
      if (!found) {
        return {
          ok: false,
          data: null,
          error: { code: "skill_not_found", message: "未找到指定外部 Skill。", recoverable: true },
        };
      }
      await saveExternalSkillIndex(next);
      const logPath = await appendNotebrainLog({
        id: createNotebrainLogId("skill-uninstall"),
        type: "skill_install",
        startedAt,
        finishedAt: Date.now(),
        ok: true,
        summary: `已停用 Skill：${args.id}`,
      });
      return { ok: true, data: { id: args.id, disabled: true, logPath } };
    },
  };
}

export function createSkillReindexTool(settings: ExternalSkillSettings): ToolContract {
  return {
    name: "skill_reindex",
    title: "重建外部 Skill 索引",
    description: "扫描 notebrain/skills/installed 下的 SKILL.md 并重建 skills/index.json。该操作会写索引，需要确认。",
    inputSchema: skillReindexInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.skills" },
    source: "local",
    providerVisible: true,
    availability() {
      return settings.enabled ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "外部 Skill 功能未启用。",
      };
    },
    async execute(): Promise<ToolResult> {
      const index = await rebuildExternalSkillIndex("reindex");
      return {
        ok: true,
        data: {
          indexPath: EXTERNAL_SKILL_INDEX_PATH,
          total: index.skills.length,
          updatedAt: index.updatedAt,
        },
      };
    },
  };
}

