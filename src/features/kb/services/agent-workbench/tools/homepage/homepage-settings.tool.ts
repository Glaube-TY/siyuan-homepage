import { z } from "zod";
import type { ToolAvailability, ToolContract, ToolResult } from "../../contracts/tool-contract";
import {
  HomepageSettingsService,
  type HomepageButtonsSnapshot,
  type HomepageButtonsUpdateResult,
  type HomepageSettingsSnapshot,
  type HomepageSettingsUpdateResult,
} from "./homepage-settings-service";
import { buildButtonsOpsJsonSchema, buildSettingsPatchJsonSchema } from "./homepage-settings-whitelist";

const getSettingsInputSchema = z.object({}).strict();
const updateSettingsInputSchema = z.object({
  expectedViewRevision: z.number().int().positive(),
  patch: z.record(z.string(), z.unknown()),
}).strict().superRefine((input, context) => {
  if (Object.keys(input.patch).length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "patch 至少包含一个设置字段" });
  }
});
const updateButtonsInputSchema = z.object({
  expectedViewRevision: z.number().int().positive(),
  ops: z.array(z.record(z.string(), z.unknown())).min(1),
}).strict();

function failure<T>(error: unknown): ToolResult<T> {
  const errCode = (error as Record<string, unknown>)?.code;
  if (typeof errCode === "string" && errCode) {
    const recoverable = (error as Record<string, unknown>)?.recoverable !== false;
    return {
      ok: false,
      data: null,
      error: {
        code: errCode,
        message: error instanceof Error ? error.message : "主页设置操作失败。",
        recoverable,
        hint: errCode.includes("conflict") ? "请重新读取当前主页设置后再操作。" : undefined,
      },
    };
  }
  return {
    ok: false,
    data: null,
    error: { code: "homepage_settings_failed", message: error instanceof Error ? error.message : "主页设置操作失败。", recoverable: true },
  };
}

function availabilityOf(service: HomepageSettingsService): ToolAvailability {
  if (service.isAvailable()) return { available: true };
  return { available: false, reasonCode: "prerequisite_missing", hint: "插件尚未完成初始化。" };
}

function createGetSettingsTool(service: HomepageSettingsService): ToolContract<Record<string, unknown>, HomepageSettingsSnapshot> {
  return {
    name: "homepage_get_settings",
    title: "get_settings",
    description: "homepage_manage.get_settings",
    inputSchema: getSettingsInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    providerVisible: false,
    availability: () => availabilityOf(service),
    async execute(): Promise<ToolResult<HomepageSettingsSnapshot>> {
      try {
        return { ok: true, data: await service.getSettings() };
      } catch (error) {
        return failure<HomepageSettingsSnapshot>(error);
      }
    },
    summarizeResult(result) {
      return result.ok ? "主页设置读取完成。" : result.error?.message ?? "主页设置读取失败。";
    },
  };
}

function createUpdateSettingsTool(service: HomepageSettingsService): ToolContract<z.infer<typeof updateSettingsInputSchema>, HomepageSettingsUpdateResult> {
  return {
    name: "homepage_update_settings",
    title: "update_settings",
    description: "homepage_manage.update_settings",
    inputSchema: updateSettingsInputSchema,
    inputJsonSchemaOverride: {
      type: "object",
      additionalProperties: false,
      properties: {
        expectedViewRevision: { type: "integer", minimum: 1, description: "从 get_settings 读取的 viewRevision。" },
        patch: buildSettingsPatchJsonSchema(),
      },
      required: ["expectedViewRevision", "patch"],
    },
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" },
    source: "builtin",
    providerVisible: false,
    availability: () => availabilityOf(service),
    async execute(_ctx, args): Promise<ToolResult<HomepageSettingsUpdateResult>> {
      try {
        return { ok: true, data: await service.updateSettings(args.patch, args.expectedViewRevision) };
      } catch (error) {
        return failure<HomepageSettingsUpdateResult>(error);
      }
    },
    summarizeResult(result) {
      return result.ok ? "主页设置已更新。" : result.error?.message ?? "主页设置更新失败。";
    },
  };
}

function createListButtonsTool(service: HomepageSettingsService): ToolContract<Record<string, unknown>, HomepageButtonsSnapshot> {
  return {
    name: "homepage_list_buttons",
    title: "list_buttons",
    description: "homepage_manage.list_buttons",
    inputSchema: getSettingsInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    providerVisible: false,
    availability: () => availabilityOf(service),
    async execute(): Promise<ToolResult<HomepageButtonsSnapshot>> {
      try {
        return { ok: true, data: await service.listButtons() };
      } catch (error) {
        return failure<HomepageButtonsSnapshot>(error);
      }
    },
    summarizeResult(result) {
      return result.ok ? "快捷按钮读取完成。" : result.error?.message ?? "快捷按钮读取失败。";
    },
  };
}

function createUpdateButtonsTool(service: HomepageSettingsService): ToolContract<z.infer<typeof updateButtonsInputSchema>, HomepageButtonsUpdateResult> {
  return {
    name: "homepage_update_buttons",
    title: "update_buttons",
    description: "homepage_manage.update_buttons",
    inputSchema: updateButtonsInputSchema,
    inputJsonSchemaOverride: {
      type: "object",
      additionalProperties: false,
      properties: {
        expectedViewRevision: { type: "integer", minimum: 1, description: "从 get_settings 或 list_buttons 读取的 viewRevision。" },
        ops: buildButtonsOpsJsonSchema(),
      },
      required: ["expectedViewRevision", "ops"],
    },
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" },
    source: "builtin",
    providerVisible: false,
    availability: () => availabilityOf(service),
    async execute(_ctx, args): Promise<ToolResult<HomepageButtonsUpdateResult>> {
      try {
        return { ok: true, data: await service.updateButtons(args.ops, args.expectedViewRevision) };
      } catch (error) {
        return failure<HomepageButtonsUpdateResult>(error);
      }
    },
    summarizeResult(result) {
      return result.ok ? "快捷按钮已更新。" : result.error?.message ?? "快捷按钮更新失败。";
    },
  };
}

export function createHomepageSettingsActionTools(service: HomepageSettingsService) {
  return [
    { action: "get_settings", tool: createGetSettingsTool(service) },
    { action: "update_settings", tool: createUpdateSettingsTool(service) },
    { action: "list_buttons", tool: createListButtonsTool(service) },
    { action: "update_buttons", tool: createUpdateButtonsTool(service) },
  ];
}
