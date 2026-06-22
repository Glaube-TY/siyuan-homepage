/**
 * 将 getAttributeViewItemIDsByBoundIDs 返回结果规范化为 blockId -> itemID 映射。
 * 共享纯函数，安全处理各种返回格式。
 *
 * 规则：
 * - 数组项必须同时有 blockID/blockId 和 itemID/itemId/rowID/rowId 才映射
 * - 对象 map 的值为 string/number 时可作为 itemID
 * - 对象 map 的值为对象时，只读取 itemID、itemId、rowID、rowId
 * - 禁止从 id、blockID、blockId、boundBlockID、boundBlockId 推导 itemID
 */
export function normalizeItemIdMap(raw: any, blockIds: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const candidates = [raw, raw?.items, raw?.data, raw?.data?.items, raw?.itemIDs, raw?.itemIds];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        // 只有明确 blockID/blockId 与 itemID/itemId/rowID/rowId 同时存在时，才建立映射
        const blockId = String(item?.blockID ?? item?.blockId ?? "").trim();
        const rowId = String(item?.itemID ?? item?.itemId ?? item?.rowID ?? item?.rowId ?? "").trim();
        if (blockId && rowId) {
          result[blockId] = rowId;
        }
      }
    } else if (typeof candidate === "object") {
      // 对象 map 形式：按传入 blockIds 取值
      // 安全处理：只接受 string/number 类型的值，不接受对象
      // 如果值是对象，只允许读取 itemID、itemId、rowID、rowId
      for (const blockId of blockIds) {
        const rawValue = (candidate as Record<string, unknown>)[blockId];
        if (typeof rawValue === "string" || typeof rawValue === "number") {
          const rowId = String(rawValue).trim();
          if (rowId) {
            result[blockId] = rowId;
          }
        } else if (rawValue && typeof rawValue === "object") {
          // 值是对象时，只从 itemID/itemId/rowID/rowId 读取
          // 禁止从 id/blockID/blockId/boundBlockID/boundBlockId 推导
          const obj = rawValue as Record<string, unknown>;
          const itemID = String(obj?.itemID ?? obj?.itemId ?? obj?.rowID ?? obj?.rowId ?? "").trim();
          if (itemID) {
            result[blockId] = itemID;
          }
        }
      }
    }
  }

  return result;
}
