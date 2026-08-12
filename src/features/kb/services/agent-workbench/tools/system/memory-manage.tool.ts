import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import { createAggregateTool } from "../aggregate/aggregate-tool-factory";
import {
  GLOBAL_MEMORY_TYPES,
  deleteGlobalMemory,
  getGlobalMemory,
  getGlobalMemoryProfile,
  rememberGlobalMemory,
  searchGlobalMemories,
  updateGlobalMemory,
  type GlobalMemorySource,
} from "../../memory/global-memory-store";

export interface MemoryManageToolOptions {
  read: boolean;
  write: boolean;
  source: Omit<GlobalMemorySource, "kind">;
  writeRequiresConfirmation?: boolean;
}

const searchSchema = z.object({
  query: z.string().max(500).default("").describe("要查找的用户记忆；留空时列出最重要的记忆。"),
  type: z.enum(GLOBAL_MEMORY_TYPES).optional(),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();

const rememberSchema = z.object({
  type: z.enum(GLOBAL_MEMORY_TYPES),
  content: z.string().trim().min(1).max(1000).describe("一条可独立理解、长期有效的用户事实。"),
  importance: z.number().int().min(1).max(5).default(3),
  confidence: z.number().min(0).max(1).default(0.9),
  pinned: z.boolean().default(false),
  reason: z.enum(["explicit", "learned"]).default("learned").describe("用户明确要求记住时传 explicit；AI 主动学习时传 learned。"),
}).strict();

const updateSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(GLOBAL_MEMORY_TYPES).optional(),
  content: z.string().trim().min(1).max(1000).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1).optional(),
  pinned: z.boolean().optional(),
}).strict().refine(
  ({ id: _id, ...patch }) => Object.values(patch).some((value) => value !== undefined),
  "至少提供一个要更新的字段。",
);

const forgetSchema = z.object({
  id: z.string().min(1).max(100),
}).strict();

function result(ok: boolean, data: unknown, message?: string): ToolResult {
  return ok
    ? { ok: true, data }
    : { ok: false, data: null, error: { code: "memory_operation_failed", message: message ?? "记忆操作失败。", recoverable: true } };
}

function action<T>(contract: Omit<ToolContract<T>, "availability">, allowed: boolean): ToolContract<T> {
  return {
    ...contract,
    availability: () => allowed
      ? { available: true }
      : { available: false, reasonCode: "permission_denied", hint: "当前 Agent 入口没有这项记忆权限。" },
  };
}

export function createMemoryManageTool(options: MemoryManageToolOptions): ToolContract {
  const search = action({
    name: "global_memory_search",
    title: "检索记忆",
    description: "检索用户的长期记忆。",
    inputSchema: searchSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    providerVisible: false,
    inputHint: "query 可留空；不知道记忆 ID 时先检索。",
    boundary: "只返回记忆内容和语义 ID，不暴露底层文件、路径或存储实现。",
    async execute(_ctx: ToolRuntimeContext, args: z.infer<typeof searchSchema>) {
      const profile = await getGlobalMemoryProfile();
      if (!profile.enabled) return result(false, null, "用户已关闭记忆中枢。");
      const items = await searchGlobalMemories(args.query, {
        type: args.type,
        limit: args.limit,
      });
      return result(true, { items, total: items.length });
    },
  }, options.read);

  const remember = action({
    name: "global_memory_remember",
    title: "形成记忆",
    description: "保存一条长期有效的用户事实，重复事实会强化而不会重复创建。",
    inputSchema: rememberSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: options.writeRequiresConfirmation === true, riskLevel: "low" },
    source: "builtin",
    providerVisible: false,
    inputHint: "只记用户明确表达、长期稳定且今后有用的事实；一条调用只保存一条原子事实。用户明确说“记住”时 reason=explicit，否则 reason=learned。",
    boundary: "禁止保存密码、令牌、验证码、银行卡号等秘密；禁止把临时请求、工具结果、助手猜测或第三方资料当成用户记忆。",
    async execute(_ctx: ToolRuntimeContext, args: z.infer<typeof rememberSchema>) {
      const profile = await getGlobalMemoryProfile();
      if (!profile.enabled || (!profile.autoLearn && args.reason !== "explicit")) return result(false, null, "用户已关闭自动学习；只有明确要求记住的内容仍可保存。");
      const { reason, ...memoryInput } = args;
      const memory = await rememberGlobalMemory({
        ...memoryInput,
        source: { ...options.source, kind: reason === "explicit" ? "explicit" : "agent" },
      });
      return result(true, { memory });
    },
  }, options.write);

  const update = action({
    name: "global_memory_update",
    title: "更新记忆",
    description: "修正一条已经存在的用户记忆。",
    inputSchema: updateSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: options.writeRequiresConfirmation === true, riskLevel: "low" },
    source: "builtin",
    providerVisible: false,
    inputHint: "先 search 获得真实 ID；只在用户明确更正或事实已经变化时更新。",
    boundary: "不能猜测记忆 ID，不能依据助手或工具内容改写用户事实。",
    async execute(_ctx: ToolRuntimeContext, args: z.infer<typeof updateSchema>) {
      const { id, ...patch } = args;
      if (!await getGlobalMemory(id)) return result(false, null, "没有找到要更新的记忆。");
      return result(true, { memory: await updateGlobalMemory(id, patch) });
    },
  }, options.write);

  const forget = action({
    name: "global_memory_forget",
    title: "遗忘记忆",
    description: "永久删除一条用户记忆。",
    inputSchema: forgetSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: options.writeRequiresConfirmation === true, riskLevel: "low" },
    source: "builtin",
    providerVisible: false,
    inputHint: "先 search 获得真实 ID；用户明确要求忘记时再调用。",
    boundary: "会永久删除该条记忆；不能批量清空，不能猜测 ID。",
    async execute(_ctx: ToolRuntimeContext, args: z.infer<typeof forgetSchema>) {
      const memory = await getGlobalMemory(args.id);
      if (!memory) return result(false, null, "没有找到要遗忘的记忆。");
      await deleteGlobalMemory(args.id);
      return result(true, { deleted: true, id: args.id, content: memory.content });
    },
  }, options.write);

  return createAggregateTool({
    name: "memory_manage",
    title: "全局记忆中枢",
    description: "检索并维护跨 Agent 入口共享、会随用户使用而进化的长期记忆。",
    boundary: "只处理用户长期记忆；不暴露存储位置；不保存秘密、临时请求、工具结果或未经用户确认的推断。",
    actions: [
      { action: "search", tool: search },
      { action: "remember", tool: remember },
      { action: "update", tool: update },
      { action: "forget", tool: forget },
    ],
  });
}
