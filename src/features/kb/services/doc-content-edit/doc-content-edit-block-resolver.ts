import { checkBlockExist, getBlockInfo, getBlockKramdown, sql } from "../../../../api";

export interface ResolvedDocEditBlock {
  id: string;
  rootId?: string;
  box?: string;
  path?: string;
  content?: string;
  markdown?: string;
  rootTitle?: string;
  kramdown?: string;
  source: "sql" | "kernel";
}

export type DocEditBlockResolution =
  | { status: "exists"; block: ResolvedDocEditBlock }
  | { status: "missing" }
  | { status: "unknown" };

interface KernelBlockInfo {
  box?: string;
  path?: string;
  rootID?: string;
  rootTitle?: string;
}

export interface DocEditBlockResolverDeps {
  sql: typeof sql;
  checkBlockExist: typeof checkBlockExist;
  getBlockInfo: typeof getBlockInfo;
  getBlockKramdown: typeof getBlockKramdown;
}

const defaultResolverDeps: DocEditBlockResolverDeps = {
  sql,
  checkBlockExist,
  getBlockInfo,
  getBlockKramdown,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

async function readKernelBlock(id: string, deps: DocEditBlockResolverDeps): Promise<ResolvedDocEditBlock | undefined> {
  let info: KernelBlockInfo | undefined;
  try {
    const result = await deps.getBlockInfo(id);
    if (isObject(result)) info = result as KernelBlockInfo;
  } catch {
    // getBlockKramdown 仍可能确认块存在。
  }

  let kramdown: string | undefined;
  try {
    const result = await deps.getBlockKramdown(id);
    if (typeof result?.kramdown === "string") kramdown = result.kramdown;
  } catch {
    // getBlockInfo 已经足够证明块存在时，不因 kramdown 暂时失败而降级为不存在。
  }

  const hasInfo = !!info && [info.rootID, info.box, info.path, info.rootTitle].some((value) => typeof value === "string");
  if (!hasInfo && kramdown === undefined) return undefined;

  return {
    id,
    rootId: info?.rootID,
    box: info?.box,
    path: info?.path,
    rootTitle: info?.rootTitle,
    kramdown,
    source: "kernel",
  };
}

/**
 * SQL 是完整元数据来源，但不是刚写入块的唯一存在性事实来源。
 * SQL miss 后使用思源内核 API；API 异常时返回 unknown，不能伪装成 missing。
 */
export async function resolveDocEditBlock(
  id: string,
  deps: DocEditBlockResolverDeps = defaultResolverDeps,
): Promise<DocEditBlockResolution> {
  const normalizedId = id.trim();
  if (!normalizedId) return { status: "unknown" };

  try {
    const rows = await deps.sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(normalizedId)}' LIMIT 1`);
    const row = rows[0] as (Block & { id?: string }) | undefined;
    if (row) {
      return {
        status: "exists",
        block: {
          id: row.id || normalizedId,
          rootId: row.root_id,
          box: row.box,
          path: row.path,
          content: row.content,
          markdown: row.markdown,
          source: "sql",
        },
      };
    }
  } catch {
    // SQL 暂时不可用时继续使用内核 API 判断。
  }

  try {
    const exists = await deps.checkBlockExist(normalizedId);
    if (exists === false) return { status: "missing" };
  } catch {
    // checkBlockExist 异常不能等同于块不存在，继续尝试详情接口。
  }

  const kernelBlock = await readKernelBlock(normalizedId, deps);
  return kernelBlock ? { status: "exists", block: kernelBlock } : { status: "unknown" };
}
