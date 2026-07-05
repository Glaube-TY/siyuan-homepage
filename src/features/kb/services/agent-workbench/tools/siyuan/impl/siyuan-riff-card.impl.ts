import {
  addRiffCards,
  batchSetRiffCardsDueTime,
  getNotebookRiffCards,
  getNotebookRiffDueCards,
  getRiffCards,
  getRiffCardsByBlockIDs,
  getRiffDueCards,
  getTreeRiffCards,
  getTreeRiffDueCards,
  removeRiffCards,
  resetRiffCards,
  reviewRiffCard,
  skipReviewRiffCard,
} from "../../../../../../../api";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";
import type { SiyuanToolOutput } from "../contracts/siyuan-common.contract";
import { isFullSiyuanId, normalizeRiffDue, type SiyuanRiffCardInput } from "../contracts/siyuan-riff-card.contract";
import { outputForAction, requireString, requireStringArray } from "./siyuan-tool-impl-utils.impl";

function safeErrorSummary(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function extractCardArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["cards", "blocks", "items", "data", "cardDues"]) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }
  return [];
}

function matchCard(item: unknown, cardID: string): { field: string } | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const record = item as Record<string, unknown>;
  const checks = [
    ["riffCardID", "riffCardID"],
    ["riffCardId", "riffCardId"],
    ["cardID", "cardID"],
    ["cardId", "cardId"],
    ["id", "id"],
  ] as const;
  for (const [key, field] of checks) {
    if (record[key] !== undefined && String(record[key]) === cardID) {
      return { field };
    }
  }
  if (record.riffCard && typeof record.riffCard === "object") {
    const nested = record.riffCard as Record<string, unknown>;
    if (nested.id !== undefined && String(nested.id) === cardID) {
      return { field: "riffCard.id" };
    }
    if (nested.cardID !== undefined && String(nested.cardID) === cardID) {
      return { field: "riffCard.cardID" };
    }
  }
  if (record.card && typeof record.card === "object") {
    const nested = record.card as Record<string, unknown>;
    if (nested.id !== undefined && String(nested.id) === cardID) {
      return { field: "card.id" };
    }
    if (nested.cardID !== undefined && String(nested.cardID) === cardID) {
      return { field: "card.cardID" };
    }
  }
  return undefined;
}

function findCardInfo(value: unknown, cardID: string, depth = 0): { card: unknown; matchedField: string } | undefined {
  if (depth > 5 || value === null || typeof value !== "object") {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const direct = matchCard(item, cardID);
      if (direct) {
        return { card: item, matchedField: direct.field };
      }
    }
    for (const item of value) {
      const found = findCardInfo(item, cardID, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findCardInfo(v, cardID, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export async function executeSiyuanRiffCard(args: SiyuanRiffCardInput): Promise<{ output: SiyuanToolOutput }> {
  let data: unknown;
  const reviewedCards = args.reviewedCardIDs?.map((id) => ({ cardID: id }));
  const resolvePageSize = (): number => Math.min(100, Math.max(1, args.pageSize ?? args.maxItems ?? 20));

  switch (args.action) {
    case "due_cards":
      data = await getRiffDueCards({
        deckID: args.deckID ?? "",
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "tree_due_cards":
      data = await getTreeRiffDueCards({
        rootID: requireString(args.rootID, "rootID"),
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "notebook_due_cards":
      data = await getNotebookRiffDueCards({
        notebook: requireString(args.notebook, "notebook"),
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "list_cards":
      data = await getRiffCards({
        id: args.deckID ?? "",
        page: args.page ?? 1,
        pageSize: resolvePageSize(),
      });
      break;
    case "tree_cards":
      data = await getTreeRiffCards({
        id: requireString(args.rootID, "rootID"),
        page: args.page ?? 1,
        pageSize: resolvePageSize(),
      });
      break;
    case "notebook_cards":
      data = await getNotebookRiffCards({
        id: requireString(args.notebook, "notebook"),
        page: args.page ?? 1,
        pageSize: resolvePageSize(),
      });
      break;
    case "cards_by_block_ids":
      data = await getRiffCardsByBlockIDs(requireStringArray(args.blockIDs, "blockIDs", 50));
      break;
    case "add_cards":
      data = await addRiffCards({
        deckID: requireString(args.deckID, "deckID"),
        blockIDs: requireStringArray(args.blockIDs, "blockIDs", 50),
      });
      break;
    case "remove_cards":
      data = await removeRiffCards({
        deckID: args.deckID ?? "",
        blockIDs: requireStringArray(args.blockIDs, "blockIDs", 50),
      });
      break;
    case "get_card_info": {
      const cardID = requireString(args.cardID, "cardID");
      const deckID = args.deckID ?? "";
      const pageSize = 100;
      const maxPages = 3;
      let found: { card: unknown; matchedField: string } | undefined;
      let lastError: string | undefined;
      for (let page = 1; page <= maxPages; page++) {
        try {
          const resp = await getRiffCards({ id: deckID, page, pageSize });
          found = findCardInfo(resp, cardID);
          if (found) break;
        } catch (err) {
          lastError = safeErrorSummary(err);
          break;
        }
      }
      data = found
        ? { found: true, cardID, deckID, card: found.card, matchedField: found.matchedField, source: "list_cards" }
        : {
            found: false,
            cardID,
            deckID,
            card: null,
            source: "list_cards",
            error: lastError,
            hint: "如 cardID 实际是 blockID，请先用 cards_by_block_ids 或 list_cards 找到 riffCardID 后再查询/写入。",
          };
      break;
    }
    case "move_cards": {
      const fromDeckID = requireString(args.fromDeckID, "fromDeckID");
      const toDeckID = requireString(args.toDeckID, "toDeckID");
      const blockIDs = requireStringArray(args.blockIDs, "blockIDs", 50);
      const addResult = await addRiffCards({ deckID: toDeckID, blockIDs });
      let removeResult: unknown;
      let removeError: string | undefined;
      try {
        removeResult = await removeRiffCards({ deckID: fromDeckID, blockIDs });
      } catch (err) {
        removeError = safeErrorSummary(err);
      }
      data = {
        fromDeckID,
        toDeckID,
        affectedBlocks: blockIDs.length,
        addResult,
        removeResult,
        removeError,
        partial: removeError ? true : undefined,
      };
      if (removeError) {
        throw new Error(`move_cards 部分失败：blockIDs 已添加到目标 deck，但从源 deck 移除失败。${removeError}`);
      }
      break;
    }
    case "review":
      data = await reviewRiffCard({
        deckID: requireString(args.deckID, "deckID"),
        cardID: requireString(args.cardID, "cardID"),
        rating: args.rating ?? 1,
        ...(reviewedCards ? { reviewedCards } : {}),
      });
      break;
    case "skip":
      data = await skipReviewRiffCard({
        deckID: requireString(args.deckID, "deckID"),
        cardID: requireString(args.cardID, "cardID"),
      });
      break;
    case "reset":
      data = await resetRiffCards({
        type: requireString(args.resetType, "resetType"),
        id: requireString(args.id, "id"),
        deckID: args.deckID ?? "",
        ...(args.blockIDs?.length ? { blockIDs: args.blockIDs } : {}),
      });
      break;
    case "set_due_time": {
      if (!args.cardDues || args.cardDues.length === 0) {
        throw new Error("[invalid_args] cardDues 不能为空。");
      }
      const normalizedCardDues = [];
      for (const cd of args.cardDues) {
        if (!isFullSiyuanId(cd.id)) {
          throw new Error(`[invalid_args] set_due_time 的 cardDues[].id 必须是完整 riffCardID（例如 20260703221339-at4oz7a），不要传短后缀或 blockID。收到：${cd.id}`);
        }
        const due = normalizeRiffDue(cd.due);
        if (!due) {
          throw new Error(`[invalid_args] due 无法解析：${cd.due}，需要 YYYYMMDD、YYYYMMDDHHmmss 或 ISO 时间。`);
        }
        normalizedCardDues.push({ id: cd.id, due });
      }
      const kernelResult = await batchSetRiffCardsDueTime({ cardDues: normalizedCardDues });

      let verification: {
        checked: number;
        appliedCount: number;
        applied: boolean;
        partiallyApplied: boolean;
        details: Record<string, boolean | null>;
      } | undefined;
      try {
        const responses: unknown[] = [];
        for (let page = 1; page <= 3; page++) {
          const pageData = await getRiffCards({ id: "", page, pageSize: 100 });
          responses.push(pageData);
          const items = extractCardArray(pageData);
          if (items.length === 0 || items.length < 100) {
            break;
          }
        }
        const details: Record<string, boolean | null> = {};
        let appliedCount = 0;
        for (const cd of normalizedCardDues) {
          const found = findCardInfo(responses, cd.id);
          if (!found) {
            details[cd.id] = null;
          } else {
            const card = found.card as Record<string, unknown>;
            const rawDue = card.due ?? card.dueTime ?? card.nextReview ?? card.reviewTime;
            const normalizedActualDue = typeof rawDue === "string" ? normalizeRiffDue(rawDue) : undefined;
            const applied = normalizedActualDue === cd.due;
            details[cd.id] = applied;
            if (applied) appliedCount++;
          }
        }
        const applied = appliedCount === normalizedCardDues.length;
        const partiallyApplied = appliedCount > 0 && appliedCount < normalizedCardDues.length;
        verification = { checked: normalizedCardDues.length, appliedCount, applied, partiallyApplied, details };
      } catch {
        verification = undefined;
      }

      const warning = verification
        ? verification.appliedCount < normalizedCardDues.length
          ? "内核返回 ok 但 due 未全部生效；该 cardID 可能不在当前接口可修改范围内，或当前思源版本对该卡包不支持 batchSetRiffCardsDueTime。"
          : undefined
        : "未能完成回读验证；请用 list_cards/get_card_info 手动确认 due 是否变化。";
      data = {
        kernelPayloadShape: "cardDues[].due",
        normalizedCardDues,
        kernelResult,
        needsVerification: true,
        warning,
        verification,
      };
      break;
    }
  }
  pushAgentDebugEvent("SIYUAN_RIFF_ACTION_EXECUTED", { toolName: "siyuan_riff_card", action: args.action }, "info");
  return { output: outputForAction(args.action, data, { maxItems: args.maxItems }) };
}
