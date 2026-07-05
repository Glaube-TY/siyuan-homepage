import {
  getFileChecked,
  getUniqueFilenameChecked,
  putFileChecked,
  readDirChecked,
  removeFileChecked,
  renameFileChecked,
} from "../../../../../../../api";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanWorkspaceFileInput } from "../contracts/siyuan-workspace-file.contract";
import { outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";
import { guardWorkspaceFilePath } from "./workspace-file-guard.impl";

function checkedPath(value: unknown, field: string): string {
  const raw = requireString(value, field);
  const guarded = guardWorkspaceFilePath(raw);
  if (guarded.ok === false) {
    pushAgentDebugEvent("SIYUAN_WORKSPACE_FILE_BLOCKED", { field, reason: guarded.message }, "warn");
    throw new Error(`[invalid_args] ${guarded.message}`);
  }
  return guarded.path;
}

function contentToBlob(content: string, encoding: "text" | "base64" | undefined): Blob {
  if (encoding === "base64") {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes]);
  }
  return new Blob([content], { type: "text/plain;charset=utf-8" });
}

function valueToBlob(value: unknown): Blob {
  if (value instanceof Blob) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Blob([value]);
  }
  if (value instanceof Uint8Array) {
    return new Blob([value as BlobPart]);
  }
  if (typeof value === "string") {
    return new Blob([value], { type: "text/plain;charset=utf-8" });
  }
  return new Blob([String(value)]);
}

export async function executeSiyuanWorkspaceFile(args: SiyuanWorkspaceFileInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  switch (args.action) {
    case "read_dir":
      data = await readDirChecked(checkedPath(args.path, "path"));
      break;
    case "get_file":
      data = await getFileChecked(checkedPath(args.path, "path"));
      break;
    case "put_file": {
      const path = checkedPath(args.path, "path");
      const content = args.content ?? "";
      await putFileChecked(path, args.isDir ?? false, contentToBlob(content, args.encoding));
      data = null;
      break;
    }
    case "copy_file": {
      const srcPath = checkedPath(args.path, "path");
      const dstPath = checkedPath(args.targetPath, "targetPath");
      const content = await getFileChecked(srcPath);
      await putFileChecked(dstPath, false, valueToBlob(content));
      data = null;
      break;
    }
    case "rename_file":
      await renameFileChecked(checkedPath(args.path, "path"), checkedPath(args.targetPath, "targetPath"));
      data = null;
      break;
    case "remove_file":
      await removeFileChecked(checkedPath(args.path, "path"));
      data = null;
      break;
    case "unique_filename":
      data = await getUniqueFilenameChecked(checkedPath(args.path, "path"));
      break;
  }
  return { output: outputForAction(args.action, data, { maxChars: args.maxChars }) };
}
