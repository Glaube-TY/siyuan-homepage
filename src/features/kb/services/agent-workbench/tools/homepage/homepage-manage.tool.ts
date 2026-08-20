import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import type { HomepageAgentReadResult, HomepageAgentSurface } from "./homepage-manage-types";
import { HomepageAgentService, HomepageAgentServiceError } from "./homepage-agent-service";

const surfaceSchema = z.enum(["desktop-homepage", "mobile-homepage"]).optional();
const surfaceInputSchema = z.object({ surface: surfaceSchema }).strict();
const widgetTypeListInputSchema = z.object({
  surface: surfaceSchema,
  categoryId: z.string().trim().min(1).optional(),
}).strict();
const widgetTypeInputSchema = z.object({
  surface: surfaceSchema,
  widgetType: z.string().trim().min(1),
}).strict();
const widgetInputSchema = z.object({
  surface: surfaceSchema,
  widgetId: z.string().trim().min(1),
  expectedType: z.string().trim().min(1).optional(),
}).strict();
const addWidgetInputSchema = z.object({ surface: surfaceSchema, widgetType: z.string().trim().min(1), expectedLabel: z.string().trim().min(1), sectionId: z.string().trim().min(1).optional(), position: z.number().int().nonnegative().optional(), initialConfig: z.record(z.string(), z.unknown()).optional(), expectedLayoutRevision: z.number().int().positive() }).strict();
const updateWidgetInputSchema = z.object({ surface: surfaceSchema, widgetId: z.string().trim().min(1), expectedType: z.string().trim().min(1), expectedWidgetRevision: z.number().int().positive(), expectedLayoutRevision: z.number().int().positive().optional(), expectedValues: z.record(z.string(), z.unknown()), patch: z.record(z.string(), z.unknown()) }).strict();
const widgetStylePatchSchema = z.object({
  rowSize: z.number().int().min(1).max(12).optional(),
  colSize: z.number().int().min(1).max(12).optional(),
  appearanceMode: z.enum(["inherit", "custom"]).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i, "背景颜色必须是 #RRGGBB 格式").optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
  borderColor: z.string().regex(/^#[0-9a-f]{6}$/i, "边框颜色必须是 #RRGGBB 格式").optional(),
  borderWidth: z.number().min(0).max(10).optional(),
  targetSectionId: z.string().trim().min(1).optional(),
}).strict().superRefine((patch, context) => {
  if (Object.keys(patch).length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "patch 至少包含一个样式字段" });
  if (patch.appearanceMode === "inherit" && (
    patch.backgroundColor !== undefined || patch.backgroundOpacity !== undefined
    || patch.borderColor !== undefined || patch.borderWidth !== undefined
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "继承主题时不能同时设置自定义背景或边框" });
  if (patch.appearanceMode === "custom" && (
    patch.backgroundColor === undefined && patch.backgroundOpacity === undefined
    && patch.borderColor === undefined && patch.borderWidth === undefined
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "自定义外观至少需要一个背景或边框字段" });
});
const updateWidgetStyleInputSchema = z.object({
  surface: z.literal("desktop-homepage"),
  widgetId: z.string().trim().min(1),
  expectedType: z.string().trim().min(1),
  expectedWidgetRevision: z.number().int().positive(),
  expectedLayoutRevision: z.number().int().positive(),
  expectedSectionId: z.string().trim().min(1).nullable(),
  patch: widgetStylePatchSchema,
}).strict();
const moveWidgetInputSchema = z.object({ surface: surfaceSchema, widgetId: z.string().trim().min(1), expectedType: z.string().trim().min(1), expectedIndex: z.number().int().nonnegative(), expectedSectionId: z.string().trim().min(1).nullable(), targetIndex: z.number().int().nonnegative(), targetSectionId: z.string().trim().min(1).optional(), expectedLayoutRevision: z.number().int().positive() }).strict();
const removeWidgetInputSchema = z.object({ surface: surfaceSchema, widgetId: z.string().trim().min(1), expectedType: z.string().trim().min(1), expectedWidgetRevision: z.number().int().positive(), expectedLayoutRevision: z.number().int().positive(), expectedIndex: z.number().int().nonnegative(), expectedSectionId: z.string().trim().min(1).nullable(), expectedLabel: z.string().trim().min(1) }).strict();
const updateLayoutInputSchema = z.object({ surface: surfaceSchema, widgetLayoutNumber: z.number().int().min(1).max(12), widgetGap: z.number().min(0).max(200), expectedWidgetLayoutNumber: z.number().int().min(1).max(12), expectedWidgetGap: z.number().min(0).max(200), sectionId: z.string().trim().min(1).optional(), expectedLayoutRevision: z.number().int().positive() }).strict();
const sectionBase = { surface: z.literal("desktop-homepage").optional(), expectedLayoutRevision: z.number().int().positive() };
const createSectionInputSchema = z.object({ ...sectionBase, name: z.string().trim().min(1).max(60), sectionId: z.string().trim().min(1).optional(), position: z.number().int().nonnegative().optional() }).strict();
const renameSectionInputSchema = z.object({ ...sectionBase, sectionId: z.string().trim().min(1), name: z.string().trim().min(1).max(60), expectedSectionName: z.string() }).strict();
const reorderSectionsInputSchema = z.object({ ...sectionBase, orderedSectionIds: z.array(z.string().trim().min(1)).min(1) }).strict();
const removeSectionInputSchema = z.object({ ...sectionBase, sectionId: z.string().trim().min(1), expectedSectionName: z.string(), expectedWidgetCount: z.number().int().nonnegative(), expectedReceivingSectionId: z.string().trim().min(1).nullable().optional() }).strict();
const setSectionModeInputSchema = z.object({ ...sectionBase, enabled: z.boolean() }).strict();
const setActiveSectionInputSchema = z.object({ surface: z.literal("desktop-homepage").optional(), sectionId: z.string().trim().min(1), expectedLayoutRevision: z.number().int().positive() }).strict();

/** homepage_manage 的只读 action（主页级）。 */
type GlobalReadAction = "overview" | "get_layout" | "list_sections";
/** homepage_components 的只读 action（组件级，dotted 前缀）。 */
type ComponentReadAction = "catalog.list_types" | "catalog.get_type" | "instance.list" | "instance.get";
type ReadAction = GlobalReadAction | ComponentReadAction;

function failure(error: unknown): ToolResult<HomepageAgentReadResult> {
  if (error instanceof HomepageAgentServiceError) {
    return {
      ok: false,
      data: null,
      error: {
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
        details: error.details,
        hint: error.code.includes("conflict") ? "请重新读取当前主页状态后再操作。" : undefined,
      },
    };
  }
  return {
    ok: false,
    data: null,
    error: { code: "homepage_tool_failed", message: "主页操作失败，请刷新页面后重试。", recoverable: true },
  };
}

function createReadActionTool(
  action: ReadAction,
  service: HomepageAgentService,
): ToolContract<Record<string, unknown>, HomepageAgentReadResult> {
  const inputSchema = action === "catalog.list_types"
    ? widgetTypeListInputSchema
    : action === "catalog.get_type"
      ? widgetTypeInputSchema
      : action === "instance.get"
        ? widgetInputSchema
        : surfaceInputSchema;
  return {
    name: `homepage_${action}`,
    title: action,
    description: `homepage_components.${action}`,
    inputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    providerVisible: false,
    availability() {
      try {
        service.resolveSurface();
        return { available: true };
      } catch {
        return { available: false, reasonCode: "prerequisite_missing", hint: "插件尚未完成初始化。" };
      }
    },
    async execute(_ctx: ToolRuntimeContext, rawArgs: Record<string, unknown>): Promise<ToolResult<HomepageAgentReadResult>> {
      try {
        const args = rawArgs as {
          surface?: HomepageAgentSurface;
          widgetId?: string;
          expectedType?: string;
          widgetType?: string;
          categoryId?: string;
        };
        if (action === "overview") return { ok: true, data: await service.overview(args.surface) };
        if (action === "get_layout") return { ok: true, data: await service.getLayout(args.surface) };
        if (action === "list_sections") return { ok: true, data: await service.listSections(args.surface) };
        if (action === "catalog.list_types") return { ok: true, data: await service.listWidgetTypes(args.surface, args.categoryId) };
        if (action === "catalog.get_type") return { ok: true, data: await service.getWidgetType(args.surface, args.widgetType!) };
        if (action === "instance.list") return { ok: true, data: await service.listWidgets(args.surface) };
        return { ok: true, data: await service.getWidget(args.surface, args.widgetId!, args.expectedType) };
      } catch (error) {
        return failure(error);
      }
    },
    summarizeResult(result) {
      return result.ok ? "主页信息读取完成。" : result.error?.message ?? "主页信息读取失败。";
    },
  };
}

export function createHomepageGlobalReadActionTools(service: HomepageAgentService) {
  return (["overview", "get_layout", "list_sections"] as const)
    .map((action) => ({ action, tool: createReadActionTool(action, service) }));
}

export function createHomepageComponentReadActionTools(service: HomepageAgentService) {
  return (["catalog.list_types", "catalog.get_type", "instance.list", "instance.get"] as const)
    .map((action) => ({ action, tool: createReadActionTool(action, service) }));
}

/** homepage_manage 的写 action（布局/分栏）。 */
type GlobalWriteAction = "update_layout" | "create_section" | "rename_section" | "reorder_sections" | "remove_section" | "set_section_mode" | "set_active_section";
/** homepage_components 的写 action（组件实例，dotted 前缀）。 */
type ComponentWriteAction = "instance.add" | "instance.update" | "instance.update_style" | "instance.move" | "instance.remove";
type WriteAction = GlobalWriteAction | ComponentWriteAction;

function createWriteActionTool(action: WriteAction, service: HomepageAgentService): ToolContract<Record<string, unknown>, HomepageAgentReadResult> {
  const schema = action === "instance.add" ? addWidgetInputSchema
    : action === "instance.update" ? updateWidgetInputSchema
      : action === "instance.update_style" ? updateWidgetStyleInputSchema
        : action === "instance.move" ? moveWidgetInputSchema
          : action === "instance.remove" ? removeWidgetInputSchema
            : action === "update_layout" ? updateLayoutInputSchema
              : action === "create_section" ? createSectionInputSchema
                : action === "rename_section" ? renameSectionInputSchema
                  : action === "reorder_sections" ? reorderSectionsInputSchema
                    : action === "remove_section" ? removeSectionInputSchema
                      : action === "set_section_mode" ? setSectionModeInputSchema
                        : setActiveSectionInputSchema;
  return {
    name: `homepage_${action}`,
    title: action,
    description: `homepage_components.${action}`,
    inputSchema: schema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: action === "instance.remove" || action === "remove_section" ? "high" : "medium" },
    source: "builtin",
    providerVisible: false,
    availability() {
      try {
        const currentSurface = service.resolveSurface();
        if (action === "instance.update_style" && currentSurface !== "desktop-homepage") {
          return { available: false, reasonCode: "permission_denied", hint: "移动端组件样式请由用户在界面中手动设置。" };
        }
        return { available: true };
      }
      catch { return { available: false, reasonCode: "prerequisite_missing", hint: "插件尚未完成初始化。" }; }
    },
    async execute(_ctx, rawArgs): Promise<ToolResult<HomepageAgentReadResult>> {
      try {
        if (action === "instance.add") return { ok: true, data: await service.addWidget(rawArgs as Parameters<HomepageAgentService["addWidget"]>[0]) };
        if (action === "instance.update") return { ok: true, data: await service.updateWidget(rawArgs as Parameters<HomepageAgentService["updateWidget"]>[0]) };
        if (action === "instance.update_style") return { ok: true, data: await service.updateWidgetStyle(rawArgs as Parameters<HomepageAgentService["updateWidgetStyle"]>[0]) };
        if (action === "instance.move") return { ok: true, data: await service.moveWidget(rawArgs as Parameters<HomepageAgentService["moveWidget"]>[0]) };
        if (action === "instance.remove") return { ok: true, data: await service.removeWidget(rawArgs as Parameters<HomepageAgentService["removeWidget"]>[0]) };
        if (action === "update_layout") return { ok: true, data: await service.updateLayout(rawArgs as Parameters<HomepageAgentService["updateLayout"]>[0]) };
        if (action === "create_section") return { ok: true, data: await service.createSection(rawArgs as Parameters<HomepageAgentService["createSection"]>[0]) };
        if (action === "rename_section") return { ok: true, data: await service.renameSection(rawArgs as Parameters<HomepageAgentService["renameSection"]>[0]) };
        if (action === "reorder_sections") return { ok: true, data: await service.reorderSections(rawArgs as Parameters<HomepageAgentService["reorderSections"]>[0]) };
        if (action === "remove_section") return { ok: true, data: await service.removeSection(rawArgs as Parameters<HomepageAgentService["removeSection"]>[0]) };
        if (action === "set_section_mode") return { ok: true, data: await service.setSectionMode(rawArgs as Parameters<HomepageAgentService["setSectionMode"]>[0]) };
        return { ok: true, data: await service.setActiveSection(rawArgs as Parameters<HomepageAgentService["setActiveSection"]>[0]) };
      } catch (error) { return failure(error); }
    },
    summarizeResult(result) { return result.ok ? "主页写入完成。" : result.error?.message ?? "主页写入失败。"; },
  };
}

export function createHomepageGlobalWriteActionTools(service: HomepageAgentService) {
  return (["update_layout", "create_section", "rename_section", "reorder_sections", "remove_section", "set_section_mode", "set_active_section"] as const)
    .map((action) => ({ action, tool: createWriteActionTool(action, service) }));
}

export function createHomepageComponentWriteActionTools(service: HomepageAgentService) {
  return (["instance.add", "instance.update", "instance.update_style", "instance.move", "instance.remove"] as const)
    .map((action) => ({ action, tool: createWriteActionTool(action, service) }));
}
