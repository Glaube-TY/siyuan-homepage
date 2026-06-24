import {
  ensureNotebrainDir,
  writeNotebrainJson,
} from "./notebrain-workspace-fs";
import { NOTEBRAIN_WORKSPACE_LOGICAL_ROOT } from "./notebrain-workspace-paths";

const REQUIRED_DIRS = [
  "chat",
  "skills/user",
  "skills/installed",
  "mcp",
  "projects/default",
  "tmp",
  "tmp/trash",
  "logs/commands",
  "logs/tools",
  "logs/skills",
  "logs/mcp",
];

export async function ensureNotebrainWorkspace(): Promise<{
  ok: boolean;
  logicalRoot: string;
  ensuredDirs: string[];
}> {
  const ensuredDirs: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    await ensureNotebrainDir(dir);
    ensuredDirs.push(dir);
  }
  await writeNotebrainJson("skills/.keep.json", { version: 1 });
  return {
    ok: true,
    logicalRoot: NOTEBRAIN_WORKSPACE_LOGICAL_ROOT,
    ensuredDirs,
  };
}

