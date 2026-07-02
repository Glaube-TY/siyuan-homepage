import { getAttributeView, searchAttributeView } from "@/api";
import { sqlSelectReadonly } from "../../../../siyuan/read-only-kernel";
import { escapeSqlLike } from "../../../../siyuan/safe-sql";
import { buildFtsMatchClause } from "@/components/tools/siyuanSqlPaging";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { ListAttributeViewsInput, ListAttributeViewsOutput } from "../contracts/list-attribute-views.contract";

type Candidate = ListAttributeViewsOutput["items"][number];

function collectRawItems(raw: any): any[] {
  const source =
    (Array.isArray(raw) && raw) ||
    (Array.isArray(raw?.results) && raw.results) ||
    (Array.isArray(raw?.items) && raw.items) ||
    (Array.isArray(raw?.data) && raw.data) ||
    (Array.isArray(raw?.data?.results) && raw.data.results) ||
    [];
  return source;
}

/**
 * 收集 searchAttributeView 返回项中可能的 avID 候选字段。
 * 优先级：databaseId > avID > avId > id（id 仅限 searchAttributeView 来源）
 */
function collectAvIdCandidates(item: any, source: string): string[] {
  const candidates: string[] = [];
  const dbId = String(item?.databaseId ?? "").trim();
  const avId1 = String(item?.avID ?? "").trim();
  const avId2 = String(item?.avId ?? "").trim();
  const rawId = String(item?.id ?? "").trim();

  if (dbId) candidates.push(dbId);
  if (avId1 && avId1 !== dbId) candidates.push(avId1);
  if (avId2 && avId2 !== dbId && avId2 !== avId1) candidates.push(avId2);
  // 仅 searchAttributeView 来源允许 id 作为候选
  if (source === "searchAttributeView" && rawId && !candidates.includes(rawId)) {
    candidates.push(rawId);
  }
  return candidates;
}

function readBlockId(item: any): string | undefined {
  return String(item?.blockID ?? item?.blockId ?? item?.rootID ?? "").trim() || undefined;
}

/**
 * 从 hPath 中提取最后一段作为可读名称。
 * 例如 "测试笔记本1/图书馆" -> "图书馆"
 */
function extractNameFromHPath(hPath: string): string {
  if (!hPath) return "";
  const parts = hPath.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/**
 * 生成候选显示名称。
 * 优先级：av.name > item.avName > item.name > item.title > hPath 最后一段 > children 中第一个非空名称 > candidateId
 */
function generateCandidateName(av: any, item: any, candidateId: string): string {
  // 1. av.name（getAttributeView 返回的真实名称）
  const avName = String(av?.name ?? "").trim();
  if (avName) return avName;

  // 2. item.avName（searchAttributeView 返回的名称）
  const itemAvName = String(item?.avName ?? "").trim();
  if (itemAvName) return itemAvName;

  // 3. item.name / item.title
  const itemName = String(item?.name ?? item?.title ?? "").trim();
  if (itemName) return itemName;

  // 4. hPath 最后一段
  const hPath = String(item?.hPath ?? item?.hpath ?? item?.path ?? "").trim();
  const hPathName = extractNameFromHPath(hPath);
  if (hPathName) return hPathName;

  // 5. children 中第一个非空名称
  const children = Array.isArray(item?.children) ? item.children : [];
  for (const child of children) {
    const childAvName = String(child?.avName ?? "").trim();
    if (childAvName) return childAvName;
    const childViewName = String(child?.viewName ?? "").trim();
    if (childViewName) return childViewName;
    const childHPath = String(child?.hPath ?? "").trim();
    const childHPathName = extractNameFromHPath(childHPath);
    if (childHPathName) return childHPathName;
  }

  // 6. 最后使用 candidateId
  return candidateId;
}

/**
 * 从 item 和 children 中收集 viewID。
 * 真实快照中 viewID 可能在 item.viewID，也可能在 item.children[].viewID。
 */
function collectViewIds(item: any): string[] {
  const viewIds: string[] = [];
  const seen = new Set<string>();

  // 从 item 直接读取
  const itemViewId = String(item?.viewID ?? item?.viewId ?? "").trim();
  if (itemViewId && !seen.has(itemViewId)) {
    viewIds.push(itemViewId);
    seen.add(itemViewId);
  }

  // 从 children 读取
  const children = Array.isArray(item?.children) ? item.children : [];
  for (const child of children) {
    const childViewId = String(child?.viewID ?? child?.viewId ?? "").trim();
    if (childViewId && !seen.has(childViewId)) {
      viewIds.push(childViewId);
      seen.add(childViewId);
    }
  }

  return viewIds;
}

/**
 * 对 searchAttributeView 返回项进行验证和规范化。
 * 只有通过 getAttributeView 验证的 avID 才作为 databaseId 输出。
 */
async function normalizeAndValidateCandidate(
  item: any,
  source: string,
  warnings: string[],
): Promise<Candidate | null> {
  const blockId = readBlockId(item);
  const avIdCandidates = collectAvIdCandidates(item, source);

  // 尝试验证每个候选 ID
  for (const candidateId of avIdCandidates) {
    try {
      const av = await getAttributeView(candidateId);
      if (av) {
        // 从 item 和 children 中收集 viewID
        const viewIds = collectViewIds(item);

        // 生成候选显示名称
        const name = generateCandidateName(av, item, candidateId);

        return {
          databaseId: candidateId,
          name,
          blockId,
          hPath: String(item?.hPath ?? item?.hpath ?? item?.path ?? "").trim() || undefined,
          viewIds: viewIds.length > 0 ? viewIds : undefined,
          viewCount: viewIds.length || undefined,
          source,
          candidateOnly: false,
          usableForRead: true,
          idSource: avIdCandidates.indexOf(candidateId) === 0
            ? (item?.databaseId ? "databaseId" : item?.avID ? "avID" : item?.avId ? "avId" : "id")
            : "validated_candidate",
        };
      }
    } catch {
      // 验证失败，继续尝试下一个候选
    }
  }

  // 所有候选都验证失败，作为候选输出
  if (blockId) {
    warnings.push(`数据库块 ${blockId} 的 avID 候选均未通过验证，已降级为候选。`);
    return {
      databaseId: "",
      name: generateCandidateName(null, item, blockId),
      blockId,
      hPath: String(item?.hPath ?? item?.hpath ?? item?.path ?? "").trim() || undefined,
      source: `${source}_unverified`,
      candidateOnly: true,
      usableForRead: false,
      idSource: "blockId_only",
    };
  }

  return null;
}

function dedupeCandidates(items: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const result: Candidate[] = [];
  for (const item of items) {
    // databaseId 为空的 SQL 候选项用 blockId 去重；否则用 databaseId 去重
    const key = item.databaseId || `block:${item.blockId ?? ""}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function querySqlCandidates(keyword: string, limit: number): Promise<Candidate[]> {
  const conditions = ["type = 'av'"];
  if (keyword) {
    const escaped = escapeSqlLike(keyword);
    const terms = keyword.trim().split(/\s+/).filter((t) => t.length > 0);
    const contentFtsClause = terms.length > 0
      ? buildFtsMatchClause(terms, ["content"], { limit })
      : "1=0";
    conditions.push(`(${contentFtsClause} OR ial LIKE '%${escaped}%' ESCAPE '\\')`);
  }

  const rows = await sqlSelectReadonly<Record<string, string | undefined>>(
    `SELECT id, content, hpath, ial FROM blocks WHERE ${conditions.join(" AND ")} ORDER BY updated DESC LIMIT ${limit}`,
    { maxLimit: limit, allowedTables: ["blocks", "blocks_fts"] },
  );

  // SQL 返回的是 blocks 表的 id，即数据库块 blockId，不一定是真实 avID。
  // 候选项中 databaseId 留空，blockId 作为 candidateBlockId，需要 read_attribute_view 进一步确认。
  // 标记为 candidateOnly=true，usableForRead=false
  return rows.map((row) => ({
    databaseId: "",
    name: row.content || row.id || "",
    blockId: row.id || undefined,
    hPath: row.hpath || undefined,
    source: "sql_blocks_candidate",
    candidateOnly: true as const,
    usableForRead: false as const,
    idSource: "sql_block_id",
  })).filter((item) => item.blockId);
}

export async function executeListAttributeViews(
  _deps: SiyuanToolDeps,
  args: ListAttributeViewsInput,
): Promise<{ safeOutput: ListAttributeViewsOutput }> {
  const keyword = args.keyword?.trim() ?? "";
  const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
  const warnings: string[] = [];
  let candidates: Candidate[] = [];

  try {
    const raw = await searchAttributeView(keyword, []);
    const rawItems = collectRawItems(raw);

    // 如果关键词搜索返回 0 结果，自动调用空关键词搜索获取全量候选，再客户端过滤
    if (rawItems.length === 0 && keyword) {
      warnings.push("内核关键词搜索未命中，已使用空关键词候选进行客户端过滤。");
      const emptyRaw = await searchAttributeView("", []);
      const emptyItems = collectRawItems(emptyRaw);

      // 客户端过滤范围：avName、viewName、hPath、children[].viewName、children[].hPath
      const keywordLower = keyword.toLowerCase();
      const filteredItems = emptyItems.filter((item) => {
        const avName = String(item?.avName ?? "").toLowerCase();
        const viewName = String(item?.viewName ?? "").toLowerCase();
        const hPath = String(item?.hPath ?? "").toLowerCase();
        if (avName.includes(keywordLower) || viewName.includes(keywordLower) || hPath.includes(keywordLower)) {
          return true;
        }
        // 检查 children
        const children = Array.isArray(item?.children) ? item.children : [];
        for (const child of children) {
          const childViewName = String(child?.viewName ?? "").toLowerCase();
          const childHPath = String(child?.hPath ?? "").toLowerCase();
          if (childViewName.includes(keywordLower) || childHPath.includes(keywordLower)) {
            return true;
          }
        }
        return false;
      });

      // 如果仍没命中，并且 keyword 可能是字段名，则对全量候选中 usableForRead=true 的少量候选调用 getAttributeViewKeysByAvID
      if (filteredItems.length === 0) {
        // 最多检查 20 个候选
        const candidatesToCheck = emptyItems.slice(0, 20);
        for (const item of candidatesToCheck) {
          const avIdCandidates = collectAvIdCandidates(item, "searchAttributeView");
          for (const avId of avIdCandidates) {
            try {
              const av = await getAttributeView(avId);
              if (!av) continue;
              // 检查字段名是否匹配
              const keyValues = av.keyValues ?? [];
              const hasMatch = keyValues.some((kv: any) => {
                const keyName = String(kv?.key?.name ?? kv?.name ?? "").toLowerCase();
                return keyName.includes(keywordLower);
              });
              if (hasMatch) {
                filteredItems.push(item);
                break;
              }
            } catch {
              // 验证失败，继续
            }
          }
          if (filteredItems.length >= limit) break;
        }
      }

      // 验证过滤后的候选
      for (const item of filteredItems) {
        const validated = await normalizeAndValidateCandidate(item, "searchAttributeView", warnings);
        if (validated) {
          candidates.push(validated);
        }
      }
    } else {
      // searchAttributeView 来源需要验证 databaseId
      for (const item of rawItems) {
        const validated = await normalizeAndValidateCandidate(item, "searchAttributeView", warnings);
        if (validated) {
          candidates.push(validated);
        }
      }
    }
  } catch (error) {
    warnings.push(`searchAttributeView 调用失败，已尝试 SQL 候选兜底：${error instanceof Error ? error.message : String(error)}`);
  }

  if (candidates.length < limit) {
    try {
      const sqlCandidates = await querySqlCandidates(keyword, limit);
      if (sqlCandidates.length > 0) {
        warnings.push("SQL 结果仅为数据库块候选，不能直接读取；需要通过 searchAttributeView 验证或在思源界面确认真实属性视图 ID。");
      }
      candidates = candidates.concat(sqlCandidates);
    } catch (error) {
      warnings.push(`SQL 候选查询失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const items = dedupeCandidates(candidates).slice(0, limit);
  const truncated = candidates.length > items.length;

  return {
    safeOutput: {
      items,
      count: items.length,
      truncated,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  };
}
