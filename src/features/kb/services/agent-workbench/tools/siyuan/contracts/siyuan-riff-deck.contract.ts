import { z } from "zod";

export const siyuanRiffDeckInputSchema = z.object({
  action: z.enum(["create", "list", "rename", "remove"]),
  deckID: z.string().trim().min(1).max(256).optional(),
  name: z.string().trim().min(1).max(200).optional(),
}).strict().superRefine((value, ctx) => {
  switch (value.action) {
    case "create":
      if (typeof value.name !== "string" || value.name.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "create 需要 name。", path: ["name"] });
      }
      break;
    case "rename":
      if (typeof value.deckID !== "string" || value.deckID.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rename 需要 deckID。", path: ["deckID"] });
      }
      if (typeof value.name !== "string" || value.name.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rename 需要 name。", path: ["name"] });
      }
      break;
    case "remove":
      if (typeof value.deckID !== "string" || value.deckID.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "remove 需要 deckID。", path: ["deckID"] });
      }
      break;
    case "list":
      break;
  }
});

export type SiyuanRiffDeckInput = z.infer<typeof siyuanRiffDeckInputSchema>;
