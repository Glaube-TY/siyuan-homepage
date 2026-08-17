import type { ToolContract } from "../contracts/tool-contract";
import type { AggregateActionBinding } from "../tools/aggregate/aggregate-tool-factory";
import type { HomepageAgentService } from "../tools/homepage/homepage-agent-service";
import {
  HOMEPAGE_COMPONENT_INSTANCE_ACTIONS,
  HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS,
  type HomepageComponentRouteDefinition,
} from "../tools/homepage/homepage-agent-business-capabilities";
import { createHomepageComponentReadActionTools, createHomepageComponentWriteActionTools } from "../tools/homepage/homepage-manage.tool";
import { z } from "zod";
import { createHomepageQuickNoteActionTools } from "../tools/homepage-components/homepage-quick-note.tool";
import { createHomepageFocusActionTools } from "../tools/homepage-components/homepage-focus.tool";
import { createHomepageAccountingActionTools } from "../tools/homepage-components/homepage-accounting.tool";
import { createHomepageFixedAssetsActionTools } from "../tools/homepage-components/homepage-fixed-assets.tool";
import { createHomepageCountdownActionTools } from "../tools/homepage-components/homepage-countdown.tool";
import { createHomepageFavoritesActionTools } from "../tools/homepage-components/homepage-favorites.tool";
import { createHomepageReviewActionTools } from "../tools/homepage-components/homepage-review.tool";
import { createHomepageMusicActionTools } from "../tools/homepage-components/homepage-music.tool";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import { dispatchHomepageBusinessDataUpdated } from "@/components/utils/widgetBlock/widget/common/homepageBusinessDataEvents";

export interface HomepageComponentToolAccess {
  quickNote: boolean;
  focus: boolean;
  accounting: boolean;
  fixedAssets: boolean;
  anniversary: boolean;
  favorites: boolean;
  review: boolean;
  music: boolean;
}

/**
 * 组件业务子工具前缀 → 业务域标识（事件刷新用稳定标识，不随顶层工具改名变化）。
 */
type BusinessToolFactory = () => Array<{ action: string; tool: ToolContract }>;

const BUSINESS_FACTORIES: Readonly<Record<string, BusinessToolFactory>> = {
  homepage_quick_note: createHomepageQuickNoteActionTools,
  homepage_focus: createHomepageFocusActionTools,
  homepage_accounting: createHomepageAccountingActionTools,
  homepage_fixed_assets: createHomepageFixedAssetsActionTools,
  homepage_anniversary: createHomepageCountdownActionTools,
  homepage_favorites: createHomepageFavoritesActionTools,
  homepage_review: createHomepageReviewActionTools,
  homepage_music: createHomepageMusicActionTools,
};

function buildBusinessBindings(
  route: HomepageComponentRouteDefinition,
  factory: BusinessToolFactory,
  access: boolean,
  disabledSubtools: ReadonlySet<string>,
): AggregateActionBinding[] {
  if (!access || disabledSubtools.has(route.prefix)) return [];
  return factory().map(({ action, tool }) => {
    const domain = route.businessTool ?? route.prefix;
    const execute = tool.execute.bind(tool);
    return {
      action: route.prefix + "." + action,
      tool: {
        ...tool,
        async execute(ctx: Parameters<typeof execute>[0], args: Parameters<typeof execute>[1]) {
          const raw = args && typeof args === "object" ? args as Record<string, unknown> : {};
          const entityId = ["recordId", "accountId", "eventId", "categoryId", "assetId", "taskId", "docId", "groupId", "targetId", "trackId", "playlistId"]
            .map((key) => raw[key]).find((value) => typeof value === "string");
          const base = { toolName: "homepage_components", action: route.prefix + "." + action, domain, entityId: typeof entityId === "string" ? entityId : undefined };
          if (!tool.readOnly) pushAgentDebugEvent("HOMEPAGE_COMPONENT_TOOL_WRITE_PREPARED", { ...base, status: "prepared" });
          const result = await execute(ctx, args);
          if (result.ok) {
            if (!tool.readOnly) dispatchHomepageBusinessDataUpdated(domain, action);
            pushAgentDebugEvent(tool.readOnly ? "HOMEPAGE_COMPONENT_TOOL_READ" : "HOMEPAGE_COMPONENT_TOOL_WRITE_COMMITTED", { ...base, status: "ok" });
          } else {
            const conflict = /conflict|stale|changed|revision|lock/i.test(String(result.error?.code ?? "")) || /已变化|冲突|重新读取/.test(String(result.error?.message ?? ""));
            pushAgentDebugEvent(conflict ? "HOMEPAGE_COMPONENT_TOOL_CONFLICT" : "HOMEPAGE_COMPONENT_TOOL_FAILED", { ...base, status: result.error?.code ?? "failed" }, conflict ? "warn" : "error");
          }
          return result;
        },
      },
    };
  });
}

/**
 * 生成 homepage_components 的组件业务子工具绑定（dotted action 前缀）。
 * access 控制该业务能力是否注册；disabledSubtools 是用户设置的子工具禁用列表。
 */
export function createHomepageComponentBusinessBindings(options: {
  access: HomepageComponentToolAccess;
  disabledSubtools?: readonly string[];
}): AggregateActionBinding[] {
  const disabled = new Set(options.disabledSubtools ?? []);
  return HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS
    .filter((route) => route.kind === "business" && route.accessKey && route.businessTool)
    .flatMap((route) => buildBusinessBindings(
      route,
      BUSINESS_FACTORIES[route.businessTool!]!,
      options.access[route.accessKey!],
      disabled,
    ));
}

const routeSurface = z.enum(["desktop-homepage", "mobile-homepage"]).optional();
const instanceSchemas = {
  get: z.object({ surface: routeSurface, widgetId: z.string().trim().min(1) }).strict(),
  add: z.object({
    surface: routeSurface,
    sectionId: z.string().trim().min(1).optional(),
    position: z.number().int().nonnegative().optional(),
    initialConfig: z.record(z.string(), z.unknown()).optional(),
    expectedLayoutRevision: z.number().int().positive(),
  }).strict(),
  update: z.object({
    surface: routeSurface,
    widgetId: z.string().trim().min(1),
    expectedWidgetRevision: z.number().int().positive(),
    expectedLayoutRevision: z.number().int().positive().optional(),
    expectedValues: z.record(z.string(), z.unknown()),
    patch: z.record(z.string(), z.unknown()),
  }).strict(),
  update_style: z.object({
    surface: z.literal("desktop-homepage"),
    widgetId: z.string().trim().min(1),
    expectedWidgetRevision: z.number().int().positive(),
    expectedLayoutRevision: z.number().int().positive(),
    expectedSectionId: z.string().trim().min(1).nullable(),
    patch: z.record(z.string(), z.unknown()),
  }).strict(),
  move: z.object({
    surface: routeSurface,
    widgetId: z.string().trim().min(1),
    expectedIndex: z.number().int().nonnegative(),
    expectedSectionId: z.string().trim().min(1).nullable(),
    targetIndex: z.number().int().nonnegative(),
    targetSectionId: z.string().trim().min(1).optional(),
    expectedLayoutRevision: z.number().int().positive(),
  }).strict(),
  remove: z.object({
    surface: routeSurface,
    widgetId: z.string().trim().min(1),
    expectedWidgetRevision: z.number().int().positive(),
    expectedLayoutRevision: z.number().int().positive(),
    expectedIndex: z.number().int().nonnegative(),
    expectedSectionId: z.string().trim().min(1).nullable(),
    expectedLabel: z.string().trim().min(1),
  }).strict(),
} as const;

function instanceArgs(type: string, label: string, action: string, args: Record<string, unknown>): Record<string, unknown> {
  return action === "add"
    ? { ...args, widgetType: type, expectedLabel: label }
    : { ...args, expectedType: type };
}

function createInstanceBinding(
  route: HomepageComponentRouteDefinition,
  action: keyof typeof instanceSchemas,
  base: ToolContract,
): AggregateActionBinding {
  const inputSchema = instanceSchemas[action];
  const execute = base.execute.bind(base);
  return {
    action: `${route.prefix}.instance.${action}`,
    tool: {
      ...base,
      name: `homepage_${route.prefix}_instance_${action}`,
      title: `${route.label} · ${action}`,
      description: `${route.label}组件实例的 ${action} 操作。`,
      inputSchema,
      inputJsonSchemaOverride: z.toJSONSchema(inputSchema as z.ZodType, { io: "input" }),
      providerVisible: false,
      async execute(ctx, args) {
        const injected = instanceArgs(route.type, route.label, action, args as Record<string, unknown>);
        const parsed = base.inputSchema.safeParse(injected);
        if (!parsed.success) {
          return {
            ok: false,
            data: null,
            error: { code: "invalid_args", message: parsed.error.issues[0]?.message ?? "组件实例参数错误。", recoverable: true },
          };
        }
        return execute(ctx, parsed.data as Record<string, unknown>);
      },
      ...(base.validateInputForPreview ? {
        validateInputForPreview: (args: Record<string, unknown>) => base.validateInputForPreview!(instanceArgs(route.type, route.label, action, args)),
      } : {}),
      ...(base.resolveCallSafety ? {
        resolveCallSafety: (args: Record<string, unknown>) => base.resolveCallSafety!(instanceArgs(route.type, route.label, action, args)),
      } : {}),
    },
  };
}

/** 为全部组件生成固定 type 的实例薄路由；业务组件同时保留自己的业务 action。 */
export function createHomepageComponentInstanceBindings(
  service: HomepageAgentService,
  disabledSubtools: readonly string[] = [],
): AggregateActionBinding[] {
  const disabled = new Set(disabledSubtools);
  const reads = new Map(createHomepageComponentReadActionTools(service).map(({ action, tool }) => [action, tool]));
  const writes = new Map(createHomepageComponentWriteActionTools(service).map(({ action, tool }) => [action, tool]));
  const baseTools = new Map([
    ["get", reads.get("instance.get")!],
    ...HOMEPAGE_COMPONENT_INSTANCE_ACTIONS.filter((action) => action !== "get")
      .map((action) => [action, writes.get(`instance.${action}`)!] as const),
  ]);
  return HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS
    .filter((route) => !disabled.has(route.prefix))
    .flatMap((route) => HOMEPAGE_COMPONENT_INSTANCE_ACTIONS.map((action) => createInstanceBinding(route, action, baseTools.get(action)!)));
}

/** Robot Kernel：只注册 Kernel-safe 组件业务子工具，不注册依赖设备视图/播放器运行时的部分。 */
export function createRobotComponentBusinessBindings(): AggregateActionBinding[] {
  return createHomepageComponentBusinessBindings({
    access: { quickNote: true, focus: true, accounting: true, fixedAssets: true, anniversary: true, favorites: true, review: true, music: false },
  });
}
