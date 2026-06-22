import { removeAttributeViewKeyChecked } from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  RemoveAttributeViewKeyInput,
  RemoveAttributeViewKeyOutput,
} from "../contracts/remove-attribute-view-key.contract";
import { readAttributeViewSafeOutput } from "./read-attribute-view.impl";

type ExecResult = { ok: boolean; safeOutput: RemoveAttributeViewKeyOutput; errorCode?: string };

function fail(args: RemoveAttributeViewKeyInput, message: string, errorCode: string): ExecResult {
  return {
    ok: false,
    errorCode,
    safeOutput: {
      status: "failed",
      databaseId: args.databaseId,
      keyId: args.keyId,
      keyName: args.expectedKeyName ?? "",
      keyType: "",
      message,
    },
  };
}

// 主字段类型 - 只有 block 类型是真正的主字段
const PRIMARY_FIELD_TYPES = new Set(["block"]);

// 不开放给 Agent 删除的字段类型
const BLOCKED_FIELD_TYPES = new Set(["relation", "rollup"]);

/**
 * 判断字段是否为主字段
 * - type === "block" 是主字段
 * - raw 中有 isPrimary/primary 等明确标记时是主字段
 * - mAsset 不再默认视为主字段
 */
function isPrimaryKey(key: { type: string; raw?: unknown }): boolean {
  if (PRIMARY_FIELD_TYPES.has(key.type)) return true;
  // 检查 raw 中的主字段标记
  const raw = key.raw as Record<string, unknown> | undefined;
  if (raw && typeof raw === "object") {
    if (raw.isPrimary === true || raw.primary === true || raw.main === true) return true;
  }
  return false;
}

export async function executeRemoveAttributeViewKey(
  _deps: SiyuanToolDeps,
  args: RemoveAttributeViewKeyInput,
): Promise<ExecResult> {
  const databaseId = args.databaseId.trim();
  const keyId = args.keyId.trim();
  const removeRelationDest = args.removeRelationDest ?? false;

  try {
    // 读取 schema 验证字段存在
    const read = await readAttributeViewSafeOutput({
      databaseId,
      includeRows: false,
      includeRaw: true, // 需要 raw 来判断主字段
    });

    // 查找目标字段
    const targetKey = read.schema.find((key) => key.keyId === keyId);
    if (!targetKey) {
      return fail(args, `字段 ID「${keyId}」不存在于数据库中，请使用 read_attribute_view 返回的真实 keyId。`, "key_not_found");
    }

    // 如果传入了 expectedKeyName，校验字段名是否一致
    if (args.expectedKeyName) {
      const expectedName = args.expectedKeyName.trim();
      if (targetKey.name !== expectedName) {
        return fail(args, `字段名不匹配：期望「${expectedName}」，实际「${targetKey.name}」。请确认 keyId 是否正确。`, "key_name_mismatch");
      }
    }

    // 检查是否为 relation/rollup 字段 - 第一版直接拒绝
    if (BLOCKED_FIELD_TYPES.has(targetKey.type)) {
      return fail(args, `字段「${targetKey.name}」（类型：${targetKey.type}）是复杂关联字段，删除暂不开放给 Agent。`, "relation_field_blocked");
    }

    // 检查是否为主字段
    if (isPrimaryKey(targetKey)) {
      return fail(args, `字段「${targetKey.name}」（类型：${targetKey.type}）是主字段，不允许删除。`, "primary_field_delete_rejected");
    }

    // 执行删除
    await removeAttributeViewKeyChecked(databaseId, keyId, removeRelationDest);

    return {
      ok: true,
      safeOutput: {
        status: "success",
        databaseId,
        keyId,
        keyName: targetKey.name,
        keyType: targetKey.type,
        message: `已在数据库「${read.database.name || databaseId}」删除字段「${targetKey.name}」（${targetKey.type}）。`,
      },
    };
  } catch (error) {
    return fail(args, `删除数据库字段失败：${error instanceof Error ? error.message : String(error)}`, "attribute_view_key_remove_failed");
  }
}
