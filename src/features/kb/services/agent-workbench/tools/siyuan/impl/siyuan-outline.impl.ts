import { getDocOutline } from "../../../../../../../api";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import type { SiyuanOutlineInput } from "../contracts/siyuan-outline.contract";
import { outputForAction, requireString } from "./siyuan-tool-impl-utils.impl";

interface OutlineStats {
  count: number;
}

function simplifyOutlineNode(node: any, depth: number, maxDepth: number, stats: OutlineStats): any | null {
  if (!node || typeof node !== "object" || depth > maxDepth) return null;
  stats.count++;
  const rawChildren = Array.isArray(node.children) ? node.children : [];
  const children = rawChildren
    .map((child: any) => simplifyOutlineNode(child, depth + 1, maxDepth, stats))
    .filter(Boolean);
  const id = String(node.id ?? node.blockId ?? "");
  const name = String(node.name ?? node.content ?? node.title ?? "");
  return {
    id,
    name,
    type: String(node.type ?? ""),
    depth,
    childrenCount: rawChildren.length,
    ...(children.length > 0 ? { children } : {}),
  };
}

export async function executeSiyuanOutline(args: SiyuanOutlineInput): Promise<{ output: SiyuanToolOutput }> {
  const docId = requireString(args.docId, "docId");
  const maxDepth = args.maxDepth ?? 8;
  const raw = await getDocOutline(docId);
  const roots = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.outline) ? (raw as any).outline : [];
  const stats = { count: 0 };
  const outline = roots
    .map((node: any) => simplifyOutlineNode(node, 1, maxDepth, stats))
    .filter(Boolean);
  return {
    output: outputForAction("outline", { docId, outline }, {
      maxItems: args.maxItems,
      meta: { originalOutlineItems: stats.count, maxDepth },
    }),
  };
}
