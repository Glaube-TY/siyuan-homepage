/**
 * Query Variants
 *
 * 通用检索查询规整与变体生成工具。
 * 不做具体问法词表删除，不针对中文表达做特殊规则。
 */

/**
 * 规整检索查询
 * - trim
 * - 合并空白
 * - 去掉首尾常见标点
 */
export function normalizeRetrievalQuery(query: string): string {
  let cleaned = query.trim();
  cleaned = cleaned.replace(/\s+/g, " ");

  const punctPattern = /^[^\w\u4e00-\u9fff]+|[^\w\u4e00-\u9fff]+$/g;
  cleaned = cleaned.replace(punctPattern, "").trim();

  return cleaned;
}

/**
 * 提取英文、数字、连字符、下划线组成的 token
 * - 过滤长度 < 2
 * - 保留原始大小写
 * - 去重
 * - 最多 8 个
 */
export function extractAsciiTerms(query: string): string[] {
  const regex = /[A-Za-z0-9][A-Za-z0-9_-]*/g;
  const matches = query.match(regex) || [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of matches) {
    if (token.length < 2) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
    if (result.length >= 8) break;
  }

  return result;
}

/**
 * 构建检索查询变体数组
 * - cleaned 非空时加入 variants
 * - asciiTerms >= 2 时加入 join(" ")
 * - asciiTerms >= 1 时逐个加入
 * - 去重
 * - 最多返回 6 个
 */
export function buildRetrievalQueryVariants(query: string): string[] {
  const cleaned = normalizeRetrievalQuery(query);
  const variants: string[] = [];
  const seen = new Set<string>();

  const add = (v: string) => {
    if (!v || seen.has(v)) return;
    seen.add(v);
    variants.push(v);
  };

  if (cleaned) {
    add(cleaned);
  }

  const asciiTerms = extractAsciiTerms(cleaned);

  if (asciiTerms.length >= 2) {
    add(asciiTerms.join(" "));
  }

  for (const term of asciiTerms) {
    add(term);
  }

  return variants.slice(0, 6);
}

/**
 * 选择主要检索查询
 * - 如果 asciiTerms >= 2，优先返回 asciiPhrase
 * - 如果 asciiTerms === 1，返回该 term
 * - 否则返回 variants[0] 或 normalizeRetrievalQuery(query)
 */
export function pickPrimaryRetrievalQuery(query: string): string {
  const normalized = normalizeRetrievalQuery(query);
  const asciiTerms = extractAsciiTerms(normalized);

  if (asciiTerms.length >= 2) {
    const asciiPhrase = asciiTerms.join(" ");
    const variants = buildRetrievalQueryVariants(query);
    if (variants.includes(asciiPhrase)) {
      return asciiPhrase;
    }
    return asciiPhrase;
  }

  if (asciiTerms.length === 1) {
    return asciiTerms[0];
  }

  const variants = buildRetrievalQueryVariants(query);
  return variants[0] || normalized;
}
