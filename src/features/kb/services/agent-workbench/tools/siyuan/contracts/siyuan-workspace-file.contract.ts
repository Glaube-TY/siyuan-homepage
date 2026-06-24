import { z } from "zod";
import { maxCharsSchema } from "./siyuan-common.contract";

export const siyuanWorkspaceFileInputSchema = z.object({
  action: z.enum(["read_dir", "get_file", "put_file", "copy_file", "rename_file", "remove_file", "unique_filename"]),
  path: z.string().trim().max(1024).optional(),
  targetPath: z.string().trim().max(1024).optional(),
  isDir: z.boolean().optional(),
  content: z.string().max(100000).optional(),
  encoding: z.enum(["text", "base64"]).optional(),
  maxChars: maxCharsSchema,
}).strict();

export type SiyuanWorkspaceFileInput = z.infer<typeof siyuanWorkspaceFileInputSchema>;
