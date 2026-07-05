import { z } from "zod";
import { maxItemsSchema, stringArraySchema } from "./siyuan-common.contract";

function requireString(value: unknown, field: string, ctx: z.RefinementCtx) {
  if (typeof value !== "string" || value.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} 不能为空。`, path: [field] });
  }
}

function requireStringArray(value: unknown, field: string, ctx: z.RefinementCtx) {
  if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== "string" || v.trim().length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} 必须是非空字符串数组。`, path: [field] });
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isFullSiyuanId(value: string): boolean {
  return /^\d{14}-[a-z0-9]{7}$/i.test(value.trim());
}

export function normalizeRiffDue(due: string): string | undefined {
  const t = due.trim();
  if (/^\d{14}$/.test(t)) {
    return t;
  }
  if (/^\d{8}$/.test(t)) {
    return `${t}000000`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (iso) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = iso;
    return `${y}${mo}${d}${h}${mi}${s}`;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) {
    return undefined;
  }
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

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
    "get_card_info",
    "move_cards",
    "review",
    "skip",
    "reset",
    "set_due_time",
  ]),
  deckID: z.string().trim().max(256).optional(),
  fromDeckID: z.string().trim().max(256).optional(),
  toDeckID: z.string().trim().max(256).optional(),
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
}).strict().superRefine((value, ctx) => {
  switch (value.action) {
    case "tree_due_cards":
    case "tree_cards":
      requireString(value.rootID, "rootID", ctx);
      break;
    case "notebook_due_cards":
    case "notebook_cards":
      requireString(value.notebook, "notebook", ctx);
      break;
    case "cards_by_block_ids":
    case "remove_cards":
      requireStringArray(value.blockIDs, "blockIDs", ctx);
      break;
    case "add_cards":
      requireStringArray(value.blockIDs, "blockIDs", ctx);
      requireString(value.deckID, "deckID", ctx);
      break;
    case "review":
      requireString(value.deckID, "deckID", ctx);
      requireString(value.cardID, "cardID", ctx);
      if (typeof value.rating !== "number") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "review 需要 rating（1-4 整数）。", path: ["rating"] });
      }
      break;
    case "skip":
      requireString(value.deckID, "deckID", ctx);
      requireString(value.cardID, "cardID", ctx);
      break;
    case "reset":
      requireString(value.resetType, "resetType", ctx);
      requireString(value.id, "id", ctx);
      break;
    case "set_due_time":
      if (!Array.isArray(value.cardDues) || value.cardDues.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set_due_time 需要非空 cardDues 数组。", path: ["cardDues"] });
      } else {
        for (let i = 0; i < value.cardDues.length; i++) {
          const cd = value.cardDues[i];
          if (!cd || typeof cd.id !== "string" || !isFullSiyuanId(cd.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `cardDues[${i}].id 必须是完整 riffCardID（例如 20260703221339-at4oz7a），不要传短后缀或 blockID。`,
              path: ["cardDues", i, "id"],
            });
          }
          if (!cd || typeof cd.due !== "string" || cd.due.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `cardDues[${i}] 需要 due。`, path: ["cardDues", i, "due"] });
          } else if (normalizeRiffDue(cd.due) === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `cardDues[${i}].due 需要 YYYYMMDD、YYYYMMDDHHmmss 或 ISO 时间。`,
              path: ["cardDues", i, "due"],
            });
          }
        }
      }
      break;
    case "get_card_info":
      requireString(value.cardID, "cardID", ctx);
      break;
    case "move_cards":
      requireString(value.fromDeckID, "fromDeckID", ctx);
      requireString(value.toDeckID, "toDeckID", ctx);
      requireStringArray(value.blockIDs, "blockIDs", ctx);
      break;
  }
});

export type SiyuanRiffCardInput = z.infer<typeof siyuanRiffCardInputSchema>;
