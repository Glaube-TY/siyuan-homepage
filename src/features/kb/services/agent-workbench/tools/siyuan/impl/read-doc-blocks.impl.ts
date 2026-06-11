import { getBlockKramdown, getChildBlocks, sql } from "../../../../../../../api";
import type { ReadDocBlocksInput, ReadDocBlocksOutput } from "../contracts/read-doc-blocks.contract";

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

function normalizeRange(value: number | undefined, min: number, max: number, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  return Math.min(max, Math.max(min, value));
}

function countChars(item: { markdown?: string; kramdown?: string; content?: string }): number {
  return (item.markdown?.length ?? 0) + (item.kramdown?.length ?? 0) + (item.content?.length ?? 0);
}

function truncateItems(
  items: ReadDocBlocksOutput["items"],
  maxChars: number,
): { items: ReadDocBlocksOutput["items"]; truncated: boolean } {
  let total = 0;
  const result: ReadDocBlocksOutput["items"] = [];
  let truncated = false;

  for (const item of items) {
    const textLen = countChars(item);
    if (textLen === 0) {
      result.push(item);
      continue;
    }

    const remaining = maxChars - total;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    if (textLen <= remaining) {
      result.push(item);
      total += textLen;
    } else {
      truncated = true;
      let budget = remaining;

      let md = item.markdown;
      if (md && md.length > budget) {
        md = budget >= 6 ? md.slice(0, budget - 6) + "……" : md.slice(0, budget);
        budget = 0;
      } else {
        budget -= md?.length ?? 0;
      }

      let kr = item.kramdown;
      if (budget > 0 && kr && kr.length > budget) {
        kr = budget >= 6 ? kr.slice(0, budget - 6) + "……" : kr.slice(0, budget);
        budget = 0;
      } else if (budget <= 0) {
        kr = undefined;
      } else {
        budget -= kr?.length ?? 0;
      }

      let ct = item.content;
      if (budget > 0 && ct && ct.length > budget) {
        ct = budget >= 6 ? ct.slice(0, budget - 6) + "……" : ct.slice(0, budget);
        budget = 0;
      } else if (budget <= 0) {
        ct = undefined;
      } else {
        budget -= ct?.length ?? 0;
      }

      result.push({ ...item, markdown: md, kramdown: kr, content: ct });
      total += (md?.length ?? 0) + (kr?.length ?? 0) + (ct?.length ?? 0);
    }

    if (total >= maxChars) {
      truncated = true;
      break;
    }
  }

  return { items: result, truncated };
}

export async function executeReadDocBlocks(
  _deps: unknown,
  args: ReadDocBlocksInput,
): Promise<{ safeOutput: ReadDocBlocksOutput }> {
  const targetId = args.targetId.trim();
  const scope = args.scope;
  const maxBlocks = normalizeRange(args.maxBlocks, 1, 50, 20);
  const maxChars = normalizeRange(args.maxChars, 1, 30000, 8000);

  let rawItems: ReadDocBlocksOutput["items"] = [];

  switch (scope) {
    case "self": {
      const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(targetId)}'`);
      const block = rows[0] as Block | undefined;
      if (!block) {
        return {
          safeOutput: {
            targetId,
            scope,
            items: [],
            truncated: false,
          },
        };
      }
      let kramdown: string | undefined;
      try {
        const kramdownRes = await getBlockKramdown(targetId);
        kramdown = kramdownRes?.kramdown;
      } catch {
        // 忽略 kramdown 读取失败，回退到 block.markdown
      }
      rawItems = [
        {
          id: block.id,
          rootId: block.root_id,
          parentId: block.parent_id,
          type: block.type,
          subType: block.subtype,
          markdown: block.markdown,
          kramdown,
          content: block.content,
          index: 0,
        },
      ];
      break;
    }
    case "children":
    case "document_top": {
      const childBlocks = await getChildBlocks(targetId);
      const limited = childBlocks.slice(0, maxBlocks);
      if (limited.length > 0) {
        const ids = limited.map((c) => `'${escapeSqlId(c.id)}'`).join(",");
        const rows = await sql(`SELECT * FROM blocks WHERE id IN (${ids})`);
        const blockMap = new Map((rows as Block[]).map((b) => [b.id, b]));
        rawItems = limited.map((c, idx) => {
          const b = blockMap.get(c.id);
          return {
            id: c.id,
            rootId: b?.root_id,
            parentId: b?.parent_id,
            type: c.type ?? b?.type ?? "p",
            subType: c.subtype ?? b?.subtype,
            markdown: c.markdown ?? b?.markdown,
            content: b?.content,
            index: idx,
          };
        });
      }
      break;
    }
    case "siblings_window": {
      const before = normalizeRange(args.before, 0, 20, 2);
      const after = normalizeRange(args.after, 0, 20, 2);

      const targetRows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(targetId)}'`);
      const targetBlock = targetRows[0] as Block | undefined;
      if (!targetBlock) {
        return {
          safeOutput: {
            targetId,
            scope,
            items: [],
            truncated: false,
          },
        };
      }
      const parentId = targetBlock.parent_id;
      if (!parentId) {
        return {
          safeOutput: {
            targetId,
            scope,
            items: [
              {
                id: targetBlock.id,
                rootId: targetBlock.root_id,
                parentId: targetBlock.parent_id,
                type: targetBlock.type,
                subType: targetBlock.subtype,
                markdown: targetBlock.markdown,
                content: targetBlock.content,
                index: 0,
              },
            ],
            truncated: false,
          },
        };
      }
      const siblingRows = await sql(
        `SELECT * FROM blocks WHERE parent_id = '${escapeSqlId(parentId)}' ORDER BY sort ASC`,
      );
      const siblings = siblingRows as Block[];
      const idx = siblings.findIndex((b) => b.id === targetId);
      if (idx === -1) {
        return {
          safeOutput: {
            targetId,
            scope,
            items: [],
            truncated: false,
          },
        };
      }
      let start = Math.max(0, idx - before);
      let end = Math.min(siblings.length, idx + 1 + after);
      if (end - start > maxBlocks) {
        // 以 target 为中心对称截取，优先保留 target 附近内容
        const half = Math.floor(maxBlocks / 2);
        const targetOffset = idx - start;
        let newStart = start + Math.max(0, targetOffset - half);
        let newEnd = newStart + maxBlocks;
        if (newEnd > end) {
          newEnd = end;
          newStart = Math.max(start, newEnd - maxBlocks);
        }
        start = newStart;
        end = newEnd;
      }
      const windowBlocks = siblings.slice(start, end);
      rawItems = windowBlocks.map((b, i) => ({
        id: b.id,
        rootId: b.root_id,
        parentId: b.parent_id,
        previousId: windowBlocks[i - 1]?.id,
        nextId: windowBlocks[i + 1]?.id,
        type: b.type,
        subType: b.subtype,
        markdown: b.markdown,
        content: b.content,
        index: start + i,
      }));
      break;
    }
  }

  const { items, truncated } = truncateItems(rawItems, maxChars);

  return {
    safeOutput: {
      targetId,
      scope,
      items,
      truncated,
    },
  };
}
