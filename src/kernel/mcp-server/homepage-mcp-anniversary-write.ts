import SHA256 from "crypto-js/sha256";
import { getBlockInfo } from "../../api";
import {
  createCountdownEventDraft, loadCountdownCenterData, normalizeCountdownEvent,
  COUNTDOWN_KIND_LABELS, type CountdownCenterLoadResult, type CountdownEventInput, type CountdownEventRecord,
} from "../../components/utils/widgetBlock/widget/countdown/countdownData";
import {
  HOMEPAGE_MCP_ANNIVERSARY_WRITES, homepageMcpWritePreviewSchema,
  type HomepageMcpAnniversaryWriteAction, type HomepageMcpWritePreview,
} from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { fingerprintHomepageMcpValue } from "./homepage-mcp-write-access";

export class HomepageMcpAnniversaryConflict extends Error {}

export interface PreparedAnniversaryWrite {
  preview: HomepageMcpWritePreview;
  stateFingerprint: string;
  before: CountdownCenterLoadResult;
  linkedDocument?: { id: string; fingerprint: string };
}

function digest(value: unknown): string {
  // 正式服务的可选字段可能为 undefined；先按 JSON 持久化语义规范化。
  return fingerprintHomepageMcpValue(JSON.parse(JSON.stringify(value)));
}

function text(value: unknown, max = 1024): string {
  if (typeof value !== "string" || !value.trim() || value.length > max ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error("纪念日预览字段无效。");
  }
  return value;
}

async function readState(): Promise<CountdownCenterLoadResult> {
  const loaded = await loadCountdownCenterData({ includeArchived: true });
  if (!loaded.status.ok || !Number.isSafeInteger(loaded.revision) || loaded.revision < 0 ||
    loaded.file.revision !== loaded.revision || !Array.isArray(loaded.events) || !Array.isArray(loaded.categories) ||
    loaded.events.length > 10_000 || loaded.categories.length > 10_000 ||
    loaded.file.events.length !== loaded.events.length || loaded.file.categories.length !== loaded.categories.length ||
    new Set(loaded.events.map((event) => event.id)).size !== loaded.events.length ||
    new Set(loaded.categories.map((category) => category.id)).size !== loaded.categories.length) {
    throw new Error("纪念日业务状态无效。");
  }
  return loaded;
}

function categoryName(before: CountdownCenterLoadResult, id: string | null | undefined, receiving = false): string {
  if (id == null) return "未分类";
  const category = before.categories.find((row) => row.id === id);
  if (!category || (receiving && category.archived)) throw new Error("目标分类不存在或不能接收事件。");
  return text(category.name, 40) + (category.archived ? "（已归档）" : "");
}

function proposedEvent(args: Record<string, unknown>, current?: CountdownEventRecord): CountdownEventRecord {
  if (current) {
    const patch = args.patch as Partial<CountdownEventInput> & { categoryId?: string | null };
    return normalizeCountdownEvent({ ...current, ...patch, id: current.id,
      categoryId: patch.categoryId === undefined ? current.categoryId : patch.categoryId ?? undefined });
  }
  const kind = args.kind as CountdownEventRecord["kind"] | undefined;
  return normalizeCountdownEvent({ ...createCountdownEventDraft(kind), ...args,
    id: "mcp-preview", name: args.name as string,
    recurrence: args.recurrence as CountdownEventRecord["recurrence"] ?? (kind === "birthday" || kind === "anniversary" ? "yearly" : "none"),
    categoryId: args.categoryId as string | undefined ?? undefined });
}

function dateLabel(event: CountdownEventRecord): string {
  if (event.calendar === "solar") return `公历 ${event.date}`;
  const lunar = event.lunarDate!;
  return `农历 ${lunar.year}年${lunar.isLeapMonth ? "闰" : ""}${lunar.month}月${lunar.day}日`;
}

async function linkedDocumentFingerprint(id: string): Promise<string> {
  const info = await getBlockInfo(id);
  if (!info || typeof info.rootID !== "string" || !/^\d{14}-[a-z0-9]{7}$/.test(info.rootID)) {
    throw new Error("无法复核关联思源文档。");
  }
  return digest(info);
}

const PATCH_LABELS: Record<string, string> = {
  name: "事件名称", kind: "事件类型", calendar: "历法", recurrence: "重复规则", date: "公历日期",
  lunarDate: "农历日期", categoryId: "目标分类", tags: "标签", priority: "优先级", note: "备注",
  linkedBlockId: "关联文档", pastBehavior: "过期处理",
};

export async function prepareHomepageMcpAnniversaryWrite(
  action: HomepageMcpAnniversaryWriteAction, args: Record<string, unknown>,
): Promise<PreparedAnniversaryWrite> {
  const before = await readState();
  const operation = HOMEPAGE_MCP_ANNIVERSARY_WRITES[action];
  const categoryAction = ["create_category", "update_category", "archive_category", "delete_category"]
    .some((name) => action === `homepage_anniversary.${name}`);
  const current = categoryAction || action === "homepage_anniversary.add" ? undefined
    : before.events.find((event) => event.id === (args.eventId as string).trim());
  const category = categoryAction && action !== "homepage_anniversary.create_category"
    ? before.categories.find((row) => row.id === (args.categoryId as string).trim()) : undefined;
  if (categoryAction && action !== "homepage_anniversary.create_category" && !category) throw new Error("分类不存在。");
  if (!categoryAction && action !== "homepage_anniversary.add" && !current) throw new Error("纪念日事件不存在。");
  if (current && (args.expectedRevision !== before.revision || args.expectedUpdatedAt !== current.updatedAt)) {
    throw new HomepageMcpAnniversaryConflict();
  }
  if (category && (action === "homepage_anniversary.delete_category"
    ? args.expectedRevision !== before.revision : args.expectedUpdatedAt !== category.updatedAt)) throw new HomepageMcpAnniversaryConflict();
  const target = category ?? current;
  const preview: HomepageMcpWritePreview = {
    action, operationName: operation.name, consequence: operation.consequence,
    targetName: target ? text(target.name, 200) : text((args.name as string).trim(), 200),
    targetId: target ? text(target.id, 128) : null, affectedCount: 1, details: [],
  };
  const detail = (label: string, value: string) => preview.details.push({ label, value: text(value) });
  let linkedDocument: PreparedAnniversaryWrite["linkedDocument"];
  if (categoryAction) {
    const patch = action === "homepage_anniversary.create_category" ? args : args.patch as Record<string, unknown>;
    if (action === "homepage_anniversary.create_category" || action === "homepage_anniversary.update_category") {
      const labels: Record<string, string> = { name: "分类名称", icon: "图标", color: "颜色" };
      const keys = action === "homepage_anniversary.create_category" ? ["name", "icon", "color"] : Object.keys(patch).sort();
      if (!keys.length || keys.some((key) => !(key in labels))) throw new Error("分类修改字段为空或无效。");
      const name = patch.name === undefined ? category!.name : text((patch.name as string).trim(), 40);
      if (before.categories.some((row) => row.id !== category?.id && !row.archived && row.name === name)) throw new Error("分类名称已存在。");
      if (category) detail("修改字段", keys.map((key) => labels[key]).join("、"));
      for (const key of keys) detail(labels[key] + (category ? "变更后" : ""),
        key === "name" ? name : key === "icon" ? String(patch.icon ?? "bookmark") : String(patch.color ?? "未设置"));
    } else {
      const members = before.events.filter((event) => event.categoryId === category!.id);
      detail("当前归档状态", category!.archived ? "已归档" : "未归档");
      detail("关联事件数量（含已归档）", String(members.length));
      if (action === "homepage_anniversary.archive_category") {
        if (category!.archived) throw new Error("分类已经归档。");
      } else {
        if (args.expectedEventCount !== members.length) throw new HomepageMcpAnniversaryConflict();
        preview.affectedCount = 1 + members.length;
        const destination = (args.moveToCategoryId as string | null | undefined)?.trim();
        if (destination === category!.id) throw new Error("目标分类不能与源分类相同。");
        detail("成员事件移入", categoryName(before, destination, true));
      }
    }
  } else if (action === "homepage_anniversary.delete_permanently") {
    detail("事件类型及日期", `${COUNTDOWN_KIND_LABELS[current!.kind]}；${dateLabel(current!)}`);
    detail("当前归档状态", current!.archived ? "已归档" : "未归档");
    detail("所属分类", categoryName(before, current!.categoryId));
    if (current!.linkedBlockId) linkedDocument = { id: current!.linkedBlockId,
      fingerprint: await linkedDocumentFingerprint(current!.linkedBlockId) };
  } else if (action === "homepage_anniversary.add") {
    const proposed = proposedEvent(args);
    detail("事件类型", COUNTDOWN_KIND_LABELS[proposed.kind]);
    detail("日期", dateLabel(proposed));
    detail("重复规则", proposed.recurrence === "yearly" ? "每年" : "不重复");
    detail("目标分类", categoryName(before, proposed.categoryId, true));
  } else if (action === "homepage_anniversary.update") {
    const patch = args.patch as Record<string, unknown>;
    if (!patch || Object.keys(patch).length === 0 || Object.keys(patch).some((key) => !(key in PATCH_LABELS))) {
      throw new Error("纪念日修改字段为空或无效。");
    }
    categoryName(before, current!.categoryId);
    const proposed = proposedEvent(args, current);
    if (patch.categoryId !== undefined) categoryName(before, proposed.categoryId, true);
    // JSON 对象的字段顺序不属于参数语义，审批摘要须在各次 RPC 间保持稳定。
    const patchKeys = Object.keys(patch).sort();
    detail("当前类型及日期", `${COUNTDOWN_KIND_LABELS[current!.kind]}；${dateLabel(current!)}`);
    detail("修改字段", patchKeys.map((key) => PATCH_LABELS[key]).join("、"));
    for (const key of patchKeys) {
      let value: string;
      if (key === "note") value = "将更新备注（内容不展示）";
      else if (key === "categoryId") value = categoryName(before, proposed.categoryId, true);
      else if (key === "kind") value = COUNTDOWN_KIND_LABELS[proposed.kind];
      else if (key === "calendar") value = proposed.calendar === "solar" ? "公历" : "农历";
      else if (key === "recurrence") value = proposed.recurrence === "yearly" ? "每年" : "不重复";
      else if (key === "lunarDate") value = JSON.stringify(proposed.lunarDate);
      else if (key === "tags") value = proposed.tags.length ? `${proposed.tags.join("、").slice(0, 800)}（共 ${proposed.tags.length} 项）` : "无标签";
      else value = String(proposed[key as keyof CountdownEventRecord]);
      detail(PATCH_LABELS[key] + "变更后", value);
    }
  } else {
    const archived = current!.archived === true;
    if (archived !== (action === "homepage_anniversary.restore")) throw new Error("纪念日归档状态不符合操作要求。");
    detail("当前归档状态", archived ? "已归档" : "未归档");
  }
  const safePreview = homepageMcpWritePreviewSchema.parse(preview);
  const state = JSON.stringify([before.revision, before.file.events.map((event) => [event.id, digest(event)]),
    before.file.categories.map((category) => [category.id, digest(category)]), safePreview, linkedDocument ?? null]);
  if (state.length > 1_000_000) throw new Error("纪念日状态超出审批边界。");
  return { before, preview: safePreview, stateFingerprint: SHA256(state).toString(), linkedDocument };
}

export async function verifyHomepageMcpAnniversaryWrite(
  action: HomepageMcpAnniversaryWriteAction, args: Record<string, unknown>, prepared: PreparedAnniversaryWrite, data: unknown,
): Promise<boolean> {
  if (!data || typeof data !== "object") return false;
  const envelope = data as { action?: string; result?: { revision?: number; eventId?: string; action?: string; event?: { eventId?: string };
    category?: { categoryId?: string }; categoryId?: string; deleted?: boolean; archived?: boolean; movedEventCount?: number; moveToCategoryId?: string | null } };
  if (envelope.action !== action || !envelope.result) return false;
  const before = prepared.before, after = await readState(), result = envelope.result;
  if (after.revision !== before.revision + 1 || result.revision !== after.revision) return false;
  const sameRows = (left: unknown[], right: unknown[]) => JSON.stringify(left.map(digest)) === JSON.stringify(right.map(digest));
  if (["create_category", "update_category", "archive_category", "delete_category"].some((name) => action === `homepage_anniversary.${name}`)) {
    const created = action === "homepage_anniversary.create_category", deleted = action === "homepage_anniversary.delete_category";
    const id = created || action === "homepage_anniversary.update_category" ? result.category?.categoryId : result.categoryId;
    if (typeof id !== "string" || !id || (!created && id !== (args.categoryId as string).trim()) ||
      after.categories.length !== before.categories.length + (created ? 1 : deleted ? -1 : 0) ||
      !sameRows(before.file.categories.filter((row) => row.id !== id), after.file.categories.filter((row) => row.id !== id))) return false;
    const current = before.categories.find((row) => row.id === id), actual = after.categories.find((row) => row.id === id);
    if (deleted) {
      const destination = (args.moveToCategoryId as string | null | undefined)?.trim();
      if (actual || result.deleted !== true || result.movedEventCount !== args.expectedEventCount ||
        (result.moveToCategoryId ?? undefined) !== destination || after.events.length !== before.events.length) return false;
      return before.file.events.every((event, index) => {
        const saved = after.file.events[index];
        if (event.categoryId !== id) return digest(event) === digest(saved);
        return saved?.id === event.id && digest(saved) === digest({ ...event, categoryId: destination, updatedAt: saved.updatedAt });
      });
    }
    if (!actual || !sameRows(before.file.events, after.file.events)) return false;
    if (created) return !current && digest({ name: actual.name, icon: actual.icon, color: actual.color, archived: actual.archived }) ===
      digest({ name: (args.name as string).trim(), icon: args.icon ?? "bookmark", color: args.color, archived: false });
    if (!current || actual.updatedAt === current.updatedAt) return false;
    const patch = args.patch as Record<string, unknown> | undefined;
    const expected = action === "homepage_anniversary.update_category"
      ? { ...current, ...patch, name: patch!.name === undefined ? current.name : (patch!.name as string).trim() }
      : { ...current, archived: true };
    return digest(actual) === digest({ ...expected, updatedAt: actual.updatedAt }) &&
      (action !== "homepage_anniversary.archive_category" || result.archived === true);
  }
  const id = action === "homepage_anniversary.add" || action === "homepage_anniversary.update"
    ? result.event?.eventId : result.eventId;
  if (typeof id !== "string" || !id || (action !== "homepage_anniversary.add" && id !== (args.eventId as string).trim()) ||
    after.revision !== before.revision + 1 || result.revision !== after.revision ||
    JSON.stringify(before.file.categories.map(digest)) !== JSON.stringify(after.file.categories.map(digest))) return false;
  const added = action === "homepage_anniversary.add";
  const deleted = action === "homepage_anniversary.delete_permanently";
  if (after.events.length !== before.events.length + (added ? 1 : deleted ? -1 : 0) ||
    (added && before.events.some((event) => event.id === id)) ||
    JSON.stringify(before.file.events.filter((event) => event.id !== id).map(digest)) !==
      JSON.stringify(after.file.events.filter((event) => event.id !== id).map(digest))) return false;
  const actual = after.events.find((event) => event.id === id);
  if (deleted) return !actual && result.action === "delete_permanently" && (!prepared.linkedDocument ||
    await linkedDocumentFingerprint(prepared.linkedDocument.id) === prepared.linkedDocument.fingerprint);
  if (!actual) return false;
  const current = before.events.find((event) => event.id === id);
  if (current && actual.updatedAt === current.updatedAt) return false;
  if (added) {
    const proposed = proposedEvent(args);
    const businessFields = (event: CountdownEventRecord) => {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, order: _order, ...fields } = event;
      return fields;
    };
    return digest(businessFields(actual)) === digest(businessFields(proposed));
  }
  const expected = action === "homepage_anniversary.update" ? proposedEvent(args, current!)
    : { ...current!, archived: action === "homepage_anniversary.archive" };
  return digest(actual) === digest({ ...expected, updatedAt: actual.updatedAt }) &&
    (action === "homepage_anniversary.update" || result.action === action.slice("homepage_anniversary.".length));
}
