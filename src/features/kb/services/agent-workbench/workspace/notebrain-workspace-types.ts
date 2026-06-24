export type NotebrainLogicalPath = string;
export type NotebrainRelativePath = string;
export type NotebrainAbsolutePath = string;

export interface NotebrainWorkspaceFileEntry {
  name: string;
  relativePath: NotebrainRelativePath;
  isDir: boolean;
  size?: number;
  updatedAt?: number;
}

export interface NotebrainWorkspaceReadTextResult {
  content: string;
  truncated: boolean;
  chars: number;
}

export type NotebrainLogType =
  | "command"
  | "skill_install"
  | "mcp_call"
  | "workspace_file"
  | "tool";

export interface NotebrainLogRecord {
  id: string;
  type: NotebrainLogType;
  startedAt: number;
  finishedAt?: number;
  ok: boolean;
  toolName?: string;
  source?: string;
  cwd?: string;
  command?: string;
  durationMs?: number;
  summary: string;
  errorCode?: string;
}

