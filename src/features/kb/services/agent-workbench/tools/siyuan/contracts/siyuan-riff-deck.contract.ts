import { z } from "zod";

export const siyuanRiffDeckInputSchema = z.object({
  action: z.enum(["create", "list", "rename", "remove"]),
  deckID: z.string().trim().min(1).max(256).optional(),
  name: z.string().trim().min(1).max(200).optional(),
}).strict();

export type SiyuanRiffDeckInput = z.infer<typeof siyuanRiffDeckInputSchema>;
