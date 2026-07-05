import { z } from "zod";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
import type { NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../../types/settings";
import {
  buildNotebrainCommandPermissionPreview,
  executeNotebrainCommand,
} from "../../../agent-core/tools/local/notebrain-command-runtime";
import {
  deleteNotebrainPath,
  listNotebrainDir,
  readNotebrainTextFile,
  writeNotebrainTextFile,
} from "../../workspace/notebrain-workspace-fs";
import { ensureNotebrainWorkspace } from "../../workspace/notebrain-workspace-service";

const listInputSchema = z.object({
  path: z.string().optional().describe("notebrain 内相对目录，默认根目录。"),
}).strict();
const readInputSchema = z.object({
  path: z.string().min(1).describe("notebrain 内相对文件路径。"),
  maxChars: z.number().int().positive().optional().describe("最大读取字符数。"),
}).strict();
const writeInputSchema = z.object({
  path: z.string().min(1).describe("notebrain 内相对文件路径。"),
  content: z.string().describe("要写入的 UTF-8 文本内容。"),
}).strict();
const deleteInputSchema = z.object({
  path: z.string().min(1).describe("notebrain 内相对路径。"),
}).strict();
const runCommandInputSchema = z.object({
  command: z.string({ message: "run_command 需要 command。" })
    .min(1, { message: "run_command 需要 command。" })
    .describe("要在 notebrain/projects/default 内执行的命令。"),
  cwd: z.string().optional().describe("相对 notebrain/projects/default 的子目录，默认 ."),
  timeoutMs: z.number().int().positive().optional().describe("超时时间毫秒，不超过设置上限。"),
  maxOutputChars: z.number().int().positive().optional().describe("stdout/stderr 预览最大字符数，不超过设置上限。"),
}).strict().superRefine((data, ctx) => {
  if (data.cwd !== undefined && data.cwd !== null) {
    const cwd = String(data.cwd);
    if (cwd.includes("..")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cwd 不得包含父级路径 (..)，必须位于允许工作区内。",
        path: ["cwd"],
      });
    }
    if (/^[a-zA-Z]:[\\/]|^\/|^\\\\/.test(cwd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cwd 必须是 Notebrain 工作区内的相对路径，不得使用系统绝对路径。",
        path: ["cwd"],
      });
    }
  }
});

export function createListDirActionTool(): ToolContract<z.infer<typeof listInputSchema>> {
  return {
    name: "list_dir_action",
    title: "列出 Notebrain 目录（action）",
    description: "notebrain_file.list_dir 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: listInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "local",
    providerVisible: false,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      await ensureNotebrainWorkspace();
      const entries = await listNotebrainDir(args.path ?? "");
      return { ok: true, data: { entries, total: entries.length } };
    },
  };
}

export function createReadFileActionTool(): ToolContract<z.infer<typeof readInputSchema>> {
  return {
    name: "read_file_action",
    title: "读取 Notebrain 文件（action）",
    description: "notebrain_file.read_file 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: readInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "local",
    providerVisible: false,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      const read = await readNotebrainTextFile(args.path, args.maxChars ?? 20000);
      return { ok: true, data: { path: args.path, ...read } };
    },
  };
}

export function createWriteFileActionTool(): ToolContract<z.infer<typeof writeInputSchema>> {
  return {
    name: "write_file_action",
    title: "写入 Notebrain 文件（action）",
    description: "notebrain_file.write_file 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: writeInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.workspace" },
    source: "local",
    providerVisible: false,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      await writeNotebrainTextFile(args.path, args.content);
      return { ok: true, data: { path: args.path, chars: args.content.length } };
    },
  };
}

export function createDeletePathActionTool(): ToolContract<z.infer<typeof deleteInputSchema>> {
  return {
    name: "delete_path_action",
    title: "删除 Notebrain 路径（action）",
    description: "notebrain_file.delete_path 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: deleteInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.workspace" },
    source: "local",
    providerVisible: false,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      await deleteNotebrainPath(args.path);
      return { ok: true, data: { path: args.path, deleted: true } };
    },
  };
}

export function createRunCommandActionTool(
  settings: NotebrainAgentWorkspaceSettings,
  runtimeToolsSettings?: RuntimeToolsSettings,
): ToolContract<z.infer<typeof runCommandInputSchema>> {
  return {
    name: "run_command_action",
    title: "执行本地命令（action）",
    description: "notebrain_file.run_command 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: runCommandInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.command" },
    source: "local",
    providerVisible: false,
    availability() {
      return settings.commandExecutionEnabled === true
        ? { available: true }
        : { available: false, reasonCode: "prerequisite_missing", hint: "notebrain 本地命令执行未启用。" };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      return executeNotebrainCommand(args, settings, runtimeToolsSettings);
    },
  };
}

export { buildNotebrainCommandPermissionPreview };
