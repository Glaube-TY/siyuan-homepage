import { z } from "zod";

export const siyuanDocPathInputSchema = z.object({
  action: z.enum(["hpath_by_path", "hpaths_by_paths", "hpath_by_id", "path_by_id", "full_hpath_by_id", "ids_by_hpath"]),
  notebook: z.string().trim().min(1).max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  paths: z.array(z.string().trim().min(1).max(1024)).max(100).optional(),
  id: z.string().trim().min(1).max(256).optional(),
  hpath: z.string().trim().max(1024).optional(),
}).strict();

export type SiyuanDocPathInput = z.infer<typeof siyuanDocPathInputSchema>;
