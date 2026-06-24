import { z } from "zod";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
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

export function createListNotebrainDirTool(): ToolContract<z.infer<typeof listInputSchema>> {
  return {
    name: "list_notebrain_dir",
    title: "列出 Notebrain 目录",
    description: "列出 notebrain 工作区内的目录内容。路径必须是 notebrain 内相对路径。",
    inputSchema: listInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "local",
    providerVisible: true,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      await ensureNotebrainWorkspace();
      const entries = await listNotebrainDir(args.path ?? "");
      return { ok: true, data: { entries, total: entries.length } };
    },
  };
}

export function createReadNotebrainFileTool(): ToolContract<z.infer<typeof readInputSchema>> {
  return {
    name: "read_notebrain_file",
    title: "读取 Notebrain 文件",
    description: "读取 notebrain 工作区内 UTF-8 文本文件，自动截断大文件。",
    inputSchema: readInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "local",
    providerVisible: true,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      const read = await readNotebrainTextFile(args.path, args.maxChars ?? 20000);
      return { ok: true, data: { path: args.path, ...read } };
    },
  };
}

export function createWriteNotebrainFileTool(): ToolContract<z.infer<typeof writeInputSchema>> {
  return {
    name: "write_notebrain_file",
    title: "写入 Notebrain 文件",
    description: "写入 notebrain 工作区内 UTF-8 文本文件。路径必须限制在 notebrain 内，写入前需要用户确认。",
    inputSchema: writeInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.workspace" },
    source: "local",
    providerVisible: true,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      await writeNotebrainTextFile(args.path, args.content);
      return { ok: true, data: { path: args.path, chars: args.content.length } };
    },
  };
}

export function createDeleteNotebrainPathTool(): ToolContract<z.infer<typeof deleteInputSchema>> {
  return {
    name: "delete_notebrain_path",
    title: "删除 Notebrain 路径",
    description: "删除 notebrain 工作区内路径。不能删除工作区根目录，删除前需要用户确认。",
    inputSchema: deleteInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.workspace" },
    source: "local",
    providerVisible: true,
    availability() { return { available: true }; },
    async execute(_ctx, args): Promise<ToolResult> {
      await deleteNotebrainPath(args.path);
      return { ok: true, data: { path: args.path, deleted: true } };
    },
  };
}

