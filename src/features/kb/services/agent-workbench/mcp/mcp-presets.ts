/**
 * MCP Server presets — known-good configurations for common MCP servers.
 *
 * These are templates the AI can discover via mcp_manage.list_presets.
 * The AI must call mcp_manage.save_server with the resolved config to actually create the server.
 * Presets do NOT auto-create servers.
 */

export interface McpServerPreset {
  id: string;
  title: string;
  description: string;
  transport: "stdio" | "http" | "sse";
  /** Command template — may contain {{PLACEHOLDER}} tokens. */
  command: string;
  /** Args template — may contain {{PLACEHOLDER}} tokens. */
  args: string[];
  /** Which placeholders need resolution. */
  placeholders: Array<{
    name: string;
    description: string;
    /** How to resolve this placeholder at runtime. */
    resolveHint: string;
  }>;
  /** Known-good npm package (verified to exist). */
  verifiedPackage?: string;
  /** Hint about cwd resolution (shown in UI). */
  resolvedCwdHint?: string;
}

export const MCP_SERVER_PRESETS: McpServerPreset[] = [
  {
    id: "filesystem",
    title: "Filesystem MCP Server",
    description: "提供本地文件系统读写操作（list_directory、read_file、write_file、create_directory、move_file、search_files 等）。使用 cwd+'.' 模式，allowed directory 自动设为 notebrain 根目录，避免 Windows 中文路径通过 cmd/npx 传参时被引号破坏。",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    placeholders: [],
    resolvedCwdHint: "cwd 自动设为 notebrain 根目录，allowedDir='.'",
    verifiedPackage: "@modelcontextprotocol/server-filesystem",
  },
];

/**
 * Known-bad or non-existent MCP package names that the AI might hallucinate.
 * mcp_manage.save_server should warn if these appear in args.
 */
export const KNOWN_BAD_MCP_PACKAGES: string[] = [
  "@modelcontextprotocol/server-fetch",
  "@anthropic-ai/mcp-server-fetch",
  "@modelcontextprotocol/server-web",
  "@modelcontextprotocol/server-browser",
  "@modelcontextprotocol/server-search",
  "@modelcontextprotocol/server-memory",
];

/**
 * Check if args contain known-bad package names.
 * Returns the first bad package found, or null.
 */
export function findKnownBadPackage(args: string[]): string | null {
  for (const arg of args) {
    const lower = arg.toLowerCase();
    for (const bad of KNOWN_BAD_MCP_PACKAGES) {
      if (lower === bad.toLowerCase() || lower.endsWith("/" + bad.split("/").pop())) {
        // Double check: only flag if the package is in the known-bad list exactly
        if (KNOWN_BAD_MCP_PACKAGES.some((b) => lower === b.toLowerCase())) {
          return arg;
        }
      }
    }
  }
  return null;
}
