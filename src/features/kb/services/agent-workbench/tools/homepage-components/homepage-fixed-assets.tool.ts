import { z } from "zod";
import type { ToolContract } from "../../contracts/tool-contract";
import {
  archiveFixedAsset,
  getAssetDailyCost,
  getAssetPeriodCost,
  getAssetTotalCost,
  loadFixedAssets,
  saveFixedAsset,
  type FixedAssetCostMode,
  type FixedAssetCostPeriod,
  type FixedAssetRecord,
} from "@/components/utils/widgetBlock/widget/fixedAssets/fixedAssetsData";
import { alwaysAvailable, homepageComponentFailure } from "./homepage-component-tool-utils";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const costModeSchema = z.enum(["elapsed", "expectedLife", "retireDate"]);
const periodSchema = z.enum(["day", "week", "month", "quarter", "year"]);
const assetFields = {
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).default(""),
  icon: z.string().trim().max(20).optional(),
  purchasePrice: z.number().finite().nonnegative(),
  extraCost: z.number().finite().nonnegative().default(0),
  purchaseDate: dateSchema,
  retireDate: dateSchema.optional(),
  warrantyDate: dateSchema.optional(),
  expectedDays: z.number().int().min(1).max(365250).optional(),
  costMode: costModeSchema.default("elapsed"),
  note: z.string().max(2000).optional(),
};
const addSchema = z.object(assetFields).strict();
const updateSchema = z.object({
  assetId: z.string().trim().min(1),
  expectedUpdatedAt: z.string().min(1),
  patch: z.object(assetFields).partial().strict(),
}).strict();
const idSchema = z.object({ assetId: z.string().trim().min(1) }).strict();
const archiveSchema = idSchema.extend({ expectedUpdatedAt: z.string().min(1) }).strict();
const listSchema = z.object({
  category: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
  includeArchived: z.boolean().default(false),
  costMode: costModeSchema.optional(),
  limit: z.number().int().min(1).max(200).default(100),
}).strict();
const summarySchema = z.object({
  period: periodSchema.default("day"),
  category: z.string().trim().optional(),
  includeArchived: z.boolean().default(false),
}).strict();

function validDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function validateAsset(input: z.infer<typeof addSchema>): void {
  if (!validDate(input.purchaseDate)) throw new Error("购买日期无效。");
  if (input.retireDate && (!validDate(input.retireDate) || input.retireDate < input.purchaseDate)) {
    throw new Error("退役日期无效或早于购买日期。");
  }
  if (input.warrantyDate && !validDate(input.warrantyDate)) throw new Error("保修日期无效。");
  if (input.costMode === "expectedLife" && !input.expectedDays) throw new Error("按预计寿命计算时必须填写 expectedDays。");
  if (input.costMode === "retireDate" && !input.retireDate) throw new Error("按退役日计算时必须填写 retireDate。");
}

function safeAsset(asset: FixedAssetRecord) {
  return {
    assetId: asset.id,
    name: asset.name,
    category: asset.category,
    icon: asset.icon,
    purchasePrice: asset.purchasePrice,
    extraCost: asset.extraCost,
    totalCost: getAssetTotalCost(asset),
    purchaseDate: asset.purchaseDate,
    retireDate: asset.retireDate,
    warrantyDate: asset.warrantyDate,
    expectedDays: asset.expectedDays,
    costMode: asset.costMode,
    note: asset.note,
    archived: asset.archived === true,
    updatedAt: asset.updatedAt,
  };
}

function editableAssetInput(asset: FixedAssetRecord): z.infer<typeof addSchema> {
  return {
    name: asset.name,
    category: asset.category,
    icon: asset.icon,
    purchasePrice: asset.purchasePrice,
    extraCost: asset.extraCost,
    purchaseDate: asset.purchaseDate,
    retireDate: asset.retireDate,
    warrantyDate: asset.warrantyDate,
    expectedDays: asset.expectedDays,
    costMode: asset.costMode,
    note: asset.note,
  };
}

function actionTool<T>(name: string, schema: z.ZodType<T>, readOnly: boolean, execute: (input: T) => Promise<unknown>): ToolContract {
  return {
    name: `homepage_fixed_assets_${name}`,
    title: name,
    description: `homepage_fixed_assets.${name}`,
    inputSchema: schema,
    readOnly,
    safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: name === "archive" ? "high" : "medium" },
    source: "builtin",
    providerVisible: false,
    availability: alwaysAvailable,
    async execute(_ctx, raw) {
      try { return { ok: true, data: await execute(schema.parse(raw)) }; }
      catch (error) { return homepageComponentFailure(error, `fixed_assets_${name}_failed`, `固定资产操作 ${name} 失败。`); }
    },
    summarizeResult: (result) => result.ok ? `固定资产 ${name} 完成。` : result.error?.message ?? "固定资产操作失败。",
  };
}

export function createHomepageFixedAssetsActionTools(): Array<{ action: string; tool: ToolContract }> {
  return [
    { action: "list", tool: actionTool("list", listSchema, true, async (input) => {
      const result = await loadFixedAssets({ includeArchived: input.includeArchived });
      if (!result.status.ok) throw new Error(result.status.message);
      const keyword = input.keyword?.toLowerCase();
      return { assets: result.assets.filter((asset) => (!input.category || asset.category === input.category) && (!input.costMode || asset.costMode === input.costMode) && (!keyword || [asset.name, asset.category, asset.note].some((value) => String(value ?? "").toLowerCase().includes(keyword)))).slice(0, input.limit).map(safeAsset) };
    }) },
    { action: "get", tool: actionTool("get", idSchema, true, async ({ assetId }) => {
      const result = await loadFixedAssets({ includeArchived: true });
      if (!result.status.ok) throw new Error(result.status.message);
      const asset = result.assets.find((item) => item.id === assetId);
      if (!asset) throw new Error("固定资产不存在。");
      return safeAsset(asset);
    }) },
    { action: "add", tool: actionTool("add", addSchema, false, async (input) => {
      validateAsset(input);
      const saved = await saveFixedAsset(input);
      const result = await loadFixedAssets({ includeArchived: true });
      if (!result.status.ok) throw new Error(result.status.message);
      const verified = result.assets.find((item) => item.id === saved.id);
      if (!verified || verified.name !== input.name || verified.purchasePrice !== input.purchasePrice) throw new Error("固定资产写后验证失败。");
      return safeAsset(verified);
    }) },
    { action: "update", tool: actionTool("update", updateSchema, false, async ({ assetId, expectedUpdatedAt, patch }) => {
      const loaded = await loadFixedAssets({ includeArchived: true });
      if (!loaded.status.ok) throw new Error(loaded.status.message);
      const current = loaded.assets.find((item) => item.id === assetId);
      if (!current) throw new Error("固定资产不存在。");
      if (current.updatedAt !== expectedUpdatedAt) throw new Error("固定资产已变化，请重新读取。");
      const candidate = addSchema.parse({ ...editableAssetInput(current), ...patch });
      validateAsset(candidate);
      await saveFixedAsset({ ...current, ...candidate, id: current.id }, { expectedUpdatedAt });
      const after = await loadFixedAssets({ includeArchived: true });
      if (!after.status.ok) throw new Error(after.status.message);
      const verified = after.assets.find((item) => item.id === assetId);
      if (!verified || verified.updatedAt === expectedUpdatedAt || Object.entries(patch).some(([key, value]) => verified[key as keyof FixedAssetRecord] !== value)) throw new Error("固定资产更新后验证失败。");
      return safeAsset(verified);
    }) },
    { action: "archive", tool: actionTool("archive", archiveSchema, false, async ({ assetId, expectedUpdatedAt }) => {
      await archiveFixedAsset(assetId, { expectedUpdatedAt });
      const loaded = await loadFixedAssets({ includeArchived: true });
      if (!loaded.status.ok) throw new Error(loaded.status.message);
      const verified = loaded.assets.find((item) => item.id === assetId);
      if (!verified?.archived) throw new Error("固定资产归档后验证失败。");
      return { assetId, archived: true };
    }) },
    { action: "cost_summary", tool: actionTool("cost_summary", summarySchema, true, async ({ period, category, includeArchived }) => {
      const result = await loadFixedAssets({ includeArchived });
      if (!result.status.ok) throw new Error(result.status.message);
      const assets = result.assets.filter((asset) => !category || asset.category === category);
      return {
        period,
        category: category ?? null,
        assetCount: assets.length,
        totalPurchaseCost: assets.reduce((sum, asset) => sum + getAssetTotalCost(asset), 0),
        periodCost: assets.reduce((sum, asset) => sum + getAssetPeriodCost(asset, period as FixedAssetCostPeriod), 0),
        dailyCost: assets.reduce((sum, asset) => sum + getAssetDailyCost(asset), 0),
        assets: assets.map((asset) => ({ assetId: asset.id, name: asset.name, costMode: asset.costMode as FixedAssetCostMode, periodCost: getAssetPeriodCost(asset, period as FixedAssetCostPeriod) })),
      };
    }) },
  ];
}
