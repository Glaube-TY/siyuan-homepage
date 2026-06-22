import type { NormalizedAttributeViewKey } from "./attribute-view-normalizer";

export interface EncodedAttributeViewValue {
  ok: boolean;
  value?: any;
  message?: string;
}

export function createSiyuanLikeId(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const random = Math.random().toString(36).slice(2, 9).padEnd(7, "0");
  return `${timestamp}-${random}`;
}

function parseBoolean(valueText: string): boolean {
  return ["1", "true", "yes", "y", "是", "对", "已完成", "完成", "checked"].includes(valueText.trim().toLowerCase());
}

function splitMultiSelect(valueText: string): string[] {
  return valueText
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function withKeyId(key: NormalizedAttributeViewKey, value: any, includeKeyId: boolean): any {
  return includeKeyId ? { keyID: key.keyId, ...value } : value;
}

export function createAttributeViewValue(
  key: NormalizedAttributeViewKey,
  valueText: string,
  options: { valueTypeHint?: string; includeKeyId?: boolean } = {},
): EncodedAttributeViewValue {
  const type = (options.valueTypeHint || key.type || "text").trim();
  const includeKeyId = options.includeKeyId === true;

  switch (type) {
    case "block":
      return { ok: true, value: withKeyId(key, { block: { content: valueText } }, includeKeyId) };
    case "text":
    case "url":
    case "email":
    case "phone":
    case "template":
      return { ok: true, value: withKeyId(key, { [type]: { content: valueText } }, includeKeyId) };
    case "number": {
      const numberValue = Number(valueText);
      if (!Number.isFinite(numberValue)) {
        return { ok: false, message: `字段「${key.name}」是数字类型，无法写入非数字值：${valueText}` };
      }
      return { ok: true, value: withKeyId(key, { number: { content: numberValue, isNotEmpty: true } }, includeKeyId) };
    }
    case "checkbox":
      return { ok: true, value: withKeyId(key, { checkbox: { checked: parseBoolean(valueText) } }, includeKeyId) };
    case "date":
      return { ok: true, value: withKeyId(key, { date: { content: valueText, isNotEmpty: true } }, includeKeyId) };
    case "select":
      return { ok: true, value: withKeyId(key, { mSelect: [{ content: valueText, color: "" }] }, includeKeyId) };
    case "mSelect": {
      const values = splitMultiSelect(valueText);
      return { ok: true, value: withKeyId(key, { mSelect: values.map((content) => ({ content, color: "" })) }, includeKeyId) };
    }
    case "relation":
    case "rollup":
      return { ok: false, message: `当前版本不支持写入 ${type} 类型字段，请手动处理或改写普通字段。` };
    default:
      return { ok: false, message: `当前版本不支持写入字段类型：${type}` };
  }
}

/**
 * 创建空值，用于清空单元格。
 */
export function createEmptyAttributeViewValue(
  key: NormalizedAttributeViewKey,
  options: { includeKeyId?: boolean } = {},
): EncodedAttributeViewValue {
  const type = key.type || "text";
  const includeKeyId = options.includeKeyId === true;

  switch (type) {
    case "block":
      return { ok: false, message: `字段「${key.name}」是主字段，不允许清空。` };
    case "text":
    case "url":
    case "email":
    case "phone":
    case "template":
      return { ok: true, value: withKeyId(key, { [type]: { content: "" } }, includeKeyId) };
    case "number":
      return { ok: true, value: withKeyId(key, { number: { content: 0, isNotEmpty: false } }, includeKeyId) };
    case "checkbox":
      return { ok: true, value: withKeyId(key, { checkbox: { checked: false } }, includeKeyId) };
    case "date":
      return { ok: true, value: withKeyId(key, { date: { content: 0, isNotEmpty: false } }, includeKeyId) };
    case "select":
    case "mSelect":
      return { ok: true, value: withKeyId(key, { mSelect: [] }, includeKeyId) };
    case "relation":
    case "rollup":
      return { ok: false, message: `字段「${key.name}」（${type}）暂不支持清空。` };
    default:
      return { ok: false, message: `字段「${key.name}」（${type}）暂不支持清空。` };
  }
}
