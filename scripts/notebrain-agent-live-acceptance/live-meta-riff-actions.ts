import assert from "node:assert/strict";

import {
  createDocWithMd,
  createNotebookChecked,
  getBlockAttrs,
  removeNotebookChecked,
  setBlockAttrsChecked,
  sql,
} from "../../src/api";
import { siyuanBookmarkManageInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-bookmark-manage.contract";
import { siyuanRiffCardInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-riff-card.contract";
import { siyuanRiffDeckInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-riff-deck.contract";
import { siyuanTagManageInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-tag-manage.contract";
import { executeSiyuanBookmarkManage } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-bookmark-manage.impl";
import { executeSiyuanRiffCard } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-riff-card.impl";
import { executeSiyuanRiffDeck } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-riff-deck.impl";
import { executeSiyuanTagManage } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-tag-manage.impl";

interface ResultRow {
  action: string;
  ok: boolean;
  detail?: string;
}

const results: ResultRow[] = [];

async function run<T>(
  name: string,
  schema: { parse(value: unknown): T },
  execute: (args: T) => Promise<{ output: any }>,
  raw: unknown,
) {
  try {
    const args = schema.parse(raw);
    const output = (await execute(args)).output;
    assert.equal(output.action, (args as any).action);
    results.push({ action: name, ok: true });
    return output;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

async function waitForRows(query: string, predicate: (rows: any[]) => boolean): Promise<any[]> {
  let rows: any[] = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const queried = await sql(query);
    rows = Array.isArray(queried) ? queried : [];
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return rows;
}

function findNamedId(value: unknown, name: string, depth = 0): string {
  if (depth > 8 || value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findNamedId(child, name, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (String(record.name ?? record.title ?? "") === name) {
    return String(record.id ?? record.deckID ?? record.deckId ?? "");
  }
  for (const child of Object.values(record)) {
    const found = findNamedId(child, name, depth + 1);
    if (found) return found;
  }
  return "";
}

function findRiffCardId(value: unknown, blockId: string, depth = 0): string {
  if (depth > 10 || value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findRiffCardId(child, blockId, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const candidateBlockId = String(record.blockID ?? record.blockId ?? record.block_id ?? record.id ?? "");
  if (candidateBlockId === blockId) {
    const candidate = String(record.riffCardID ?? record.riffCardId ?? record.cardID ?? record.cardId ?? record.id ?? "");
    if (candidate && candidate !== blockId) return candidate;
  }
  for (const child of Object.values(record)) {
    const found = findRiffCardId(child, blockId, depth + 1);
    if (found) return found;
  }
  return "";
}

const suffix = Date.now().toString(36);
const tagOld = `notebrain-tag-${suffix}`;
const tagNew = `notebrain-tag-renamed-${suffix}`;
const bookmarkOld = `notebrain-bookmark-${suffix}`;
const bookmarkNew = `notebrain-bookmark-renamed-${suffix}`;
const deckNameA = `Notebrain-Deck-A-${suffix}`;
const deckNameARenamed = `Notebrain-Deck-A2-${suffix}`;
const deckNameB = `Notebrain-Deck-B-${suffix}`;

const createdNotebook = await createNotebookChecked(`Notebrain-Meta-Riff-Acceptance-${Date.now()}`);
const notebookId = String((createdNotebook as any)?.notebook?.id || "");
assert.match(notebookId, /^\d{14}-[a-z0-9]{7}$/);
let deckIdA = "";
let deckIdB = "";

try {
  const docId = await createDocWithMd(
    notebookId,
    "/标签书签闪卡验收",
    `#${tagOld}#\n\n闪卡段落甲\n\n闪卡段落乙`,
  );
  const rows = await waitForRows(
    `SELECT id, type, content, tag FROM blocks WHERE root_id = '${docId}' ORDER BY sort ASC`,
    (items) => items.filter((item) => item.type === "p").length >= 2,
  );
  const paragraphIds = rows.filter((row) => row.type === "p").map((row) => String(row.id));
  assert.ok(paragraphIds.length >= 2);

  await run("tag.list", siyuanTagManageInputSchema, executeSiyuanTagManage, { action: "list" });
  await run("tag.search", siyuanTagManageInputSchema, executeSiyuanTagManage, { action: "search", keyword: tagOld });
  await run("tag.rename", siyuanTagManageInputSchema, executeSiyuanTagManage, { action: "rename", oldLabel: tagOld, newLabel: tagNew });
  await run("tag.remove", siyuanTagManageInputSchema, executeSiyuanTagManage, { action: "remove", label: tagNew });

  await setBlockAttrsChecked(paragraphIds[0], { bookmark: bookmarkOld });
  await run("bookmark.list", siyuanBookmarkManageInputSchema, executeSiyuanBookmarkManage, { action: "list" });
  const bookmarkBlocks = await run("bookmark.list_blocks", siyuanBookmarkManageInputSchema, executeSiyuanBookmarkManage, {
    action: "list_blocks",
    keyword: bookmarkOld,
    maxItems: 20,
  });
  assert.ok((bookmarkBlocks.data as any)?.items?.some((item: any) => item.id === paragraphIds[0]));
  await run("bookmark.rename", siyuanBookmarkManageInputSchema, executeSiyuanBookmarkManage, {
    action: "rename",
    oldBookmark: bookmarkOld,
    newBookmark: bookmarkNew,
    blockIds: [paragraphIds[0]],
  });
  assert.equal((await getBlockAttrs(paragraphIds[0]))?.bookmark, bookmarkNew);
  await run("bookmark.remove", siyuanBookmarkManageInputSchema, executeSiyuanBookmarkManage, {
    action: "remove",
    bookmark: bookmarkNew,
    blockIds: [paragraphIds[0]],
  });
  assert.equal((await getBlockAttrs(paragraphIds[0]))?.bookmark ?? "", "");

  await run("riff_deck.create_a", siyuanRiffDeckInputSchema, executeSiyuanRiffDeck, { action: "create", name: deckNameA });
  await run("riff_deck.create_b", siyuanRiffDeckInputSchema, executeSiyuanRiffDeck, { action: "create", name: deckNameB });
  const deckList = await run("riff_deck.list", siyuanRiffDeckInputSchema, executeSiyuanRiffDeck, { action: "list" });
  deckIdA = findNamedId(deckList.data, deckNameA);
  deckIdB = findNamedId(deckList.data, deckNameB);
  assert.ok(deckIdA && deckIdB, JSON.stringify(deckList.data));
  await run("riff_deck.rename", siyuanRiffDeckInputSchema, executeSiyuanRiffDeck, { action: "rename", deckID: deckIdA, name: deckNameARenamed });

  await run("riff_card.add_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, {
    action: "add_cards",
    deckID: deckIdA,
    blockIDs: paragraphIds.slice(0, 2),
  });
  const cardList = await run("riff_card.list_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, {
    action: "list_cards",
    deckID: deckIdA,
    page: 1,
    pageSize: 20,
  });
  const cardIdA = findRiffCardId(cardList.data, paragraphIds[0]);
  const cardIdB = findRiffCardId(cardList.data, paragraphIds[1]);
  assert.match(cardIdA, /^\d{14}-[a-z0-9]{7}$/);
  assert.match(cardIdB, /^\d{14}-[a-z0-9]{7}$/);

  await run("riff_card.due_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "due_cards", deckID: deckIdA });
  await run("riff_card.tree_due_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "tree_due_cards", rootID: docId });
  await run("riff_card.notebook_due_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "notebook_due_cards", notebook: notebookId });
  await run("riff_card.tree_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "tree_cards", rootID: docId });
  await run("riff_card.notebook_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "notebook_cards", notebook: notebookId });
  await run("riff_card.cards_by_block_ids", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "cards_by_block_ids", blockIDs: paragraphIds.slice(0, 2) });
  const cardInfo = await run("riff_card.get_card_info", siyuanRiffCardInputSchema, executeSiyuanRiffCard, {
    action: "get_card_info",
    deckID: deckIdA,
    cardID: cardIdA,
  });
  assert.equal((cardInfo.data as any)?.found, true);

  await run("riff_card.review", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "review", deckID: deckIdA, cardID: cardIdA, rating: 3 });
  await run("riff_card.skip", siyuanRiffCardInputSchema, executeSiyuanRiffCard, { action: "skip", deckID: deckIdA, cardID: cardIdB });
  await run("riff_card.set_due_time", siyuanRiffCardInputSchema, executeSiyuanRiffCard, {
    action: "set_due_time",
    cardDues: [{ id: cardIdA, due: "2026-08-04T09:30:00+08:00" }],
  });
  await run("riff_card.move_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, {
    action: "move_cards",
    fromDeckID: deckIdA,
    toDeckID: deckIdB,
    blockIDs: paragraphIds.slice(0, 2),
  });
  await run("riff_card.reset", siyuanRiffCardInputSchema, executeSiyuanRiffCard, {
    action: "reset",
    resetType: "deck",
    id: deckIdB,
    deckID: deckIdB,
    blockIDs: paragraphIds.slice(0, 2),
  });
  await run("riff_card.remove_cards", siyuanRiffCardInputSchema, executeSiyuanRiffCard, {
    action: "remove_cards",
    deckID: deckIdB,
    blockIDs: paragraphIds.slice(0, 2),
  });
} finally {
  if (deckIdA) {
    try {
      await executeSiyuanRiffDeck(siyuanRiffDeckInputSchema.parse({ action: "remove", deckID: deckIdA }));
      results.push({ action: "riff_deck.remove_a", ok: true });
    } catch (error) {
      results.push({ action: "riff_deck.remove_a", ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  if (deckIdB) {
    try {
      await executeSiyuanRiffDeck(siyuanRiffDeckInputSchema.parse({ action: "remove", deckID: deckIdB }));
      results.push({ action: "riff_deck.remove_b", ok: true });
    } catch (error) {
      results.push({ action: "riff_deck.remove_b", ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  await removeNotebookChecked(notebookId);
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
