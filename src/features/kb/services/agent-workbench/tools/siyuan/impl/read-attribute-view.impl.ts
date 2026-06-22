import {
  getAttributeView,
  getAttributeViewKeysByAvID,
  getAttributeViewItemIDsByBoundIDs,
  renderAttributeView,
} from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { ReadAttributeViewInput, ReadAttributeViewOutput } from "../contracts/read-attribute-view.contract";
import {
  mergeAttributeViewSchema,
  normalizeAttributeViewRead,
} from "../internal/attribute-view/attribute-view-normalizer";
import { normalizeItemIdMap } from "../internal/attribute-view/attribute-view-id-map";

export { normalizeItemIdMap } from "../internal/attribute-view/attribute-view-id-map";

export interface ReadAttributeViewSafeArgs {
  databaseId: string;
  viewId?: string | null;
  includeRows?: boolean;
  rowLimit?: number;
  includeRaw?: boolean;
}

export async function readAttributeViewSafeOutput(
  args: ReadAttributeViewSafeArgs,
): Promise<ReadAttributeViewOutput> {
  const databaseId = args.databaseId.trim();
  const viewId = args.viewId?.trim() || null;
  const includeRows = args.includeRows !== false;
  const rowLimit = Math.max(1, Math.min(args.rowLimit ?? 30, 500));
  const includeRaw = args.includeRaw === true;

  // 拒绝空 databaseId
  if (!databaseId) {
    throw new Error("[invalid_database_id] databaseId 不能为空，请提供真实的属性视图 ID。");
  }

  const [av, rawKeys] = await Promise.all([
    getAttributeView(databaseId),
    getAttributeViewKeysByAvID(databaseId),
  ]);

  if (!av) {
    throw new Error("[resource_not_found] 未找到数据库/属性视图，请确认 databaseId 是真实属性视图 ID。");
  }

  let renderResult: any = null;
  const warnings: string[] = [];
  if (includeRows) {
    try {
      renderResult = await renderAttributeView({
        id: databaseId,
        ...(viewId ? { viewID: viewId } : {}),
        page: 1,
        pageSize: rowLimit,
        createIfNotExist: false,
      });
    } catch (error) {
      warnings.push(`renderAttributeView 读取视图失败，已回退到 getAttributeView 数据：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 在 normalize 之前，尝试将只有 boundBlockId 的行映射为真实 rowId
  // normalizer 会跳过没有真实 rowId 的行，所以必须在此阶段完成映射
  // 注意：创建 renderResult 的浅复制，避免修改 API 返回的原始对象引用
  if (includeRows && renderResult) {
    const rawRows =
      (Array.isArray(renderResult.rows) && renderResult.rows) ||
      (Array.isArray(renderResult.items) && renderResult.items) ||
      (Array.isArray(renderResult.data?.rows) && renderResult.data.rows) ||
      (Array.isArray(renderResult.data?.items) && renderResult.data.items) ||
      null;

    if (rawRows && rawRows.length > 0) {
      // 收集缺少 itemID/rowID 但有 blockID/blockId/boundBlockID/boundBlockId 的行
      const boundBlockIds: string[] = [];
      const blockIdToRows = new Map<string, any[]>();
      let needsCopy = false;

      for (const rawRow of rawRows) {
        const hasRealId = Boolean(
          (rawRow as any)?.itemID ?? (rawRow as any)?.itemId ??
          (rawRow as any)?.rowID ?? (rawRow as any)?.rowId
        );
        if (hasRealId) continue;

        const boundId = String(
          (rawRow as any)?.boundBlockID ?? (rawRow as any)?.boundBlockId ??
          (rawRow as any)?.blockID ?? (rawRow as any)?.blockId ?? ""
        ).trim();

        if (boundId) {
          if (!blockIdToRows.has(boundId)) {
            blockIdToRows.set(boundId, []);
            boundBlockIds.push(boundId);
          }
          blockIdToRows.get(boundId)!.push(rawRow);
          needsCopy = true;
        }
      }

      if (boundBlockIds.length > 0) {
        try {
          const rawMap = await getAttributeViewItemIDsByBoundIDs(databaseId, boundBlockIds);
          const mapped = normalizeItemIdMap(rawMap, boundBlockIds);

          // 创建浅复制，避免修改原始 API 返回对象
          if (needsCopy) {
            const clonedRows = rawRows.map((row: any) => ({ ...row }));
            // 更新 blockIdToRows 引用到克隆后的行
            blockIdToRows.clear();
            for (const clonedRow of clonedRows) {
              const hasRealId = Boolean(
                clonedRow?.itemID ?? clonedRow?.itemId ??
                clonedRow?.rowID ?? clonedRow?.rowId
              );
              if (hasRealId) continue;
              const boundId = String(
                clonedRow?.boundBlockID ?? clonedRow?.boundBlockId ??
                clonedRow?.blockID ?? clonedRow?.blockId ?? ""
              ).trim();
              if (boundId) {
                if (!blockIdToRows.has(boundId)) {
                  blockIdToRows.set(boundId, []);
                }
                blockIdToRows.get(boundId)!.push(clonedRow);
              }
            }
            // 更新 renderResult 中的行数组引用
            if (Array.isArray(renderResult.rows)) renderResult = { ...renderResult, rows: clonedRows };
            else if (Array.isArray(renderResult.items)) renderResult = { ...renderResult, items: clonedRows };
            else if (Array.isArray(renderResult.data?.rows)) renderResult = { ...renderResult, data: { ...renderResult.data, rows: clonedRows } };
            else if (Array.isArray(renderResult.data?.items)) renderResult = { ...renderResult, data: { ...renderResult.data, items: clonedRows } };
          }

          let mappedCount = 0;
          for (const [blockId, rows] of blockIdToRows) {
            const rowId = mapped[blockId];
            if (rowId) {
              for (const rawRow of rows) {
                // 注入映射到的 rowId，让 normalizer 能识别
                (rawRow as any).itemID = rowId;
                mappedCount++;
              }
            }
          }

          if (mappedCount > 0) {
            warnings.push(`部分绑定块已映射为数据库条目 ID，共 ${mappedCount} 行。`);
          }

          // 统计未能映射的行
          const unmappedCount = boundBlockIds.length - new Set([...blockIdToRows.keys()].filter(k => mapped[k])).size;
          if (unmappedCount > 0) {
            warnings.push(`${unmappedCount} 个绑定块无法映射为数据库条目 ID，已跳过。`);
          }
        } catch (error) {
          warnings.push(`绑定块到数据库条目 ID 映射失败：${error instanceof Error ? error.message : String(error)}，部分行可能被跳过。`);
        }
      }
    }
  }

  const mergedAv = mergeAttributeViewSchema(av, rawKeys);
  const output = normalizeAttributeViewRead({
    databaseId,
    av: mergedAv,
    renderResult,
    viewId,
    includeRows,
    rowLimit,
    includeRaw,
  });

  if (warnings.length > 0) {
    output.warnings = [...(output.warnings ?? []), ...warnings];
  }
  return output;
}

export async function executeReadAttributeView(
  _deps: SiyuanToolDeps,
  args: ReadAttributeViewInput,
): Promise<{ safeOutput: ReadAttributeViewOutput }> {
  return { safeOutput: await readAttributeViewSafeOutput(args) };
}
