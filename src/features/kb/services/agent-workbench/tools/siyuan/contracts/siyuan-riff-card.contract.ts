import { z } from "zod";
import { maxItemsSchema, stringArraySchema } from "./siyuan-common.contract";

export const siyuanRiffCardInputSchema = z.object({
  action: z.enum([
    "due_cards",
    "tree_due_cards",
    "notebook_due_cards",
    "list_cards",
    "tree_cards",
    "notebook_cards",
    "cards_by_block_ids",
    "add_cards",
    "remove_cards",
    "review",
    "skip",
    "reset",
    "set_due_time",
  ]),
  deckID: z.string().trim().max(256).optional(),
  rootID: z.string().trim().min(1).max(256).optional(),
  notebook: z.string().trim().min(1).max(256).optional(),
  blockIDs: stringArraySchema.max(50).optional(),
  cardID: z.string().trim().min(1).max(256).optional(),
  rating: z.number().int().min(1).max(4).optional(),
  id: z.string().trim().min(1).max(256).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  reviewedCardIDs: stringArraySchema.max(200).optional(),
  resetType: z.enum(["notebook", "tree", "deck"]).optional(),
  cardDues: z.array(z.object({
    id: z.string().trim().min(1).max(256),
    due: z.string().trim().min(1).max(40),
  })).max(50).optional(),
  maxItems: maxItemsSchema,
}).strict();

export type SiyuanRiffCardInput = z.infer<typeof siyuanRiffCardInputSchema>;
