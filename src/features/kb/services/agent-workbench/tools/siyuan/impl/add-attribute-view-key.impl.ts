import { addAttributeViewKeyChecked } from "@/api";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type {
  AddAttributeViewKeyInput,
  AddAttributeViewKeyOutput,
} from "../contracts/add-attribute-view-key.contract";
import { ATTRIBUTE_VIEW_KEY_TYPE_VALUES } from "../contracts/add-attribute-view-key.contract";
import { normalizeFieldName } from "../internal/attribute-view/attribute-view-normalizer";
import { createSiyuanLikeId } from "../internal/attribute-view/attribute-view-value-codec";
import { readAttributeViewSafeOutput } from "./read-attribute-view.impl";

type ExecResult = { ok: boolean; safeOutput: AddAttributeViewKeyOutput; errorCode?: string };

function fail(args: AddAttributeViewKeyInput, message: string, errorCode: string, keyId = ""): ExecResult {
  return {
    ok: false,
    errorCode,
    safeOutput: {
      status: "failed",
      databaseId: args.databaseId,
      keyId,
      keyName: args.keyName,
      keyType: args.keyType,
      message,
    },
  };
}

export async function executeAddAttributeViewKey(
  _deps: SiyuanToolDeps,
  args: AddAttributeViewKeyInput,
): Promise<ExecResult> {
  const databaseId = args.databaseId.trim();
  const keyName = args.keyName.trim();
  const keyType = args.keyType.trim();

  if (!ATTRIBUTE_VIEW_KEY_TYPE_VALUES.includes(keyType as any)) {
    return fail(args, `不支持的字段类型：${keyType}`, "unsupported_key_type");
  }

  try {
    const read = await readAttributeViewSafeOutput({
      databaseId,
      includeRows: false,
      includeRaw: false,
    });

    const duplicated = read.schema.some((key) => normalizeFieldName(key.name) === normalizeFieldName(keyName));
    if (duplicated) {
      return fail(args, `字段「${keyName}」已存在，不会重复创建。`, "duplicate_key_name");
    }

    const keyId = createSiyuanLikeId();
    let previousKeyId = args.previousKeyId?.trim() || read.schema[read.schema.length - 1]?.keyId || "";

    // 验证 previousKeyId 是否存在于 schema 中
    if (args.previousKeyId?.trim() && !read.schema.some((key) => key.keyId === args.previousKeyId?.trim())) {
      return fail(args, `previousKeyId「${args.previousKeyId}」不存在于当前数据库字段中，请使用 read_attribute_view 返回的真实 keyId。`, "invalid_previous_key_id");
    }
    await addAttributeViewKeyChecked(
      databaseId,
      keyId,
      keyName,
      keyType,
      args.keyIcon?.trim() ?? "",
      previousKeyId,
    );

    return {
      ok: true,
      safeOutput: {
        status: "success",
        databaseId,
        keyId,
        keyName,
        keyType,
        message: `已在数据库「${read.database.name || databaseId}」新增字段「${keyName}」。`,
      },
    };
  } catch (error) {
    return fail(args, `新增数据库字段失败：${error instanceof Error ? error.message : String(error)}`, "attribute_view_key_add_failed");
  }
}
