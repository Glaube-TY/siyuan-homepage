import { z } from "zod";
import {
  ACCOUNTING_MUTATION_RPC,
  archiveAccountingAsset,
  archiveAccountingRecord,
  bulkMergeAccountingAssets,
  bulkMergeAccountingRecords,
  rebuildAccountingSummaryIndex,
  saveAccountingRecord,
  updateAccountingSummaryIndexForYears,
  writeAccountingAsset,
} from "@/components/utils/widgetBlock/widget/accounting/accountingLocalStore";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const options = z.object({ expectedUpdatedAt: z.string().optional() }).strict();
const record = z.object({
  recordId: z.string().min(1), rowId: z.string(), title: z.string(),
  direction: z.enum(["expense", "income", "transfer"]), amount: z.number().finite().nonnegative(), date,
  categoryPrimary: z.string(), categorySecondary: z.string(), account: z.string(), counterAccount: z.string().optional(),
  tags: z.string(), note: z.string(), currency: z.string(), createdAt: z.string(), updatedAt: z.string(), archived: z.boolean(),
}).strict();
const asset = z.object({
  accountId: z.string().min(1), rowId: z.string(), name: z.string(), type: z.string(), currency: z.string(),
  openingBalance: z.number().finite().nonnegative(), currentBalance: z.number().finite().nonnegative(), sortOrder: z.number().finite(),
  note: z.string(), archived: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
}).strict();
const request = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveRecord"), args: z.tuple([record, options]) }).strict(),
  z.object({ action: z.literal("archiveRecord"), args: z.tuple([z.string().min(1), date.nullable(), options]) }).strict(),
  z.object({ action: z.literal("mergeRecords"), args: z.tuple([z.array(record)]) }).strict(),
  z.object({ action: z.literal("saveAsset"), args: z.tuple([asset, options]) }).strict(),
  z.object({ action: z.literal("archiveAsset"), args: z.tuple([z.string().min(1), options]) }).strict(),
  z.object({ action: z.literal("mergeAssets"), args: z.tuple([z.array(asset)]) }).strict(),
  z.object({ action: z.literal("updateSummary"), args: z.tuple([z.array(z.number().int().min(1901).max(9999))]) }).strict(),
  z.object({ action: z.literal("rebuildSummary"), args: z.tuple([]) }).strict(),
]);

export async function registerAccountingKernelRpc(
  rpc: { bind(name: string, handler: (payload: unknown) => Promise<unknown>): Promise<void> },
  plugin: unknown,
): Promise<void> {
  await rpc.bind(ACCOUNTING_MUTATION_RPC, async (payload) => {
    const input = request.parse(payload);
    switch (input.action) {
      case "saveRecord": return saveAccountingRecord(plugin, input.args[0], input.args[1]);
      case "archiveRecord": return archiveAccountingRecord(plugin, input.args[0], input.args[1] ?? undefined, input.args[2]);
      case "mergeRecords": return bulkMergeAccountingRecords(plugin, input.args[0]);
      case "saveAsset": return writeAccountingAsset(plugin, input.args[0], input.args[1]);
      case "archiveAsset": return archiveAccountingAsset(plugin, input.args[0], input.args[1]);
      case "mergeAssets": return bulkMergeAccountingAssets(plugin, input.args[0]);
      case "updateSummary": return updateAccountingSummaryIndexForYears(plugin, input.args[0]);
      case "rebuildSummary": return rebuildAccountingSummaryIndex(plugin);
    }
  });
}
