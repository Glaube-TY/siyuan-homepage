import { sql } from "@/api";

export async function getConditionDocsByKeyword(conditionDocsKeyPosition: string, conditionDocsKeyWord: string, conditionDocsSortOrder: string) {
    let query = "";
    const safeKeyword = conditionDocsKeyWord.replace(/['"\\]/g, '');

    if (conditionDocsKeyPosition === "anywhere") {
        // 首先获取所有包含关键词的内容块和文档
        query = `
            SELECT *
            FROM blocks
            WHERE content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID
        const docIdsToFetch = new Set<string>();

        // 第一步：遍历所有搜索结果，分类处理
        for (const item of searchResults) {
            if (item.type === 'd') {
                // 如果是文档类型，直接保留
                docsMap.set(item.id, item);
            } else if (item.root_id) {
                // 如果是内容块类型，通过root_id获取文档ID
                docIdsToFetch.add(item.root_id);
            }
        }

        // 第二步：批量获取非文档类型对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询（注意：需要确保ID是安全的）
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "DocTitle") {
        query = `
            SELECT *
            FROM blocks
            WHERE type = 'd'
            AND content LIKE '${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        return await sql(query);
    } else if (conditionDocsKeyPosition === "body") {
        // 关键词位于正文中，只查询非文档类型的内容块，通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE type != 'd'
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "bodyTitle") {
        // 关键词位于正文标题中，只查询类型为h的标题块，通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE type = 'h'
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "paragraph") {
        // 关键词位于段落中，只查询段落块，通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE type = 'p'
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "list") {
        // 关键词位于列表中，查询类型为l（列表块）和i（列表项块），通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE (type = 'l' OR type = 'i')
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "table") {
        // 关键词位于表格中，只查询类型为t的表格块，通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE type = 't'
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "code") {
        // 关键词位于代码块中，只查询类型为c的代码块，通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE type = 'c'
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "quote") {
        // 关键词位于引述块中，只查询类型为b的引述块，通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE type = 'b'
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    } else if (conditionDocsKeyPosition === "formula") {
        // 关键词位于公式块中，只查询类型为m的公式块，通过root_id获取所属文档
        query = `
            SELECT *
            FROM blocks
            WHERE type = 'm'
            AND content LIKE '%${safeKeyword}%'
            ORDER BY ${conditionDocsSortOrder} DESC
        `;

        const searchResults = await sql(query);

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        // 用于存储最终文档的Map，通过id去重
        const docsMap = new Map();

        // 用于存储需要获取的文档ID（通过root_id）
        const docIdsToFetch = new Set<string>();

        // 遍历所有搜索结果，收集root_id
        for (const item of searchResults) {
            if (item.root_id) {
                docIdsToFetch.add(item.root_id);
            }
        }

        // 批量获取这些root_id对应的文档
        if (docIdsToFetch.size > 0) {
            const docIdsArray = Array.from(docIdsToFetch);

            // 使用字符串拼接构建查询
            const docIdsString = docIdsArray.map(id => `'${id}'`).join(',');

            const docsQuery = `
                SELECT *
                FROM blocks
                WHERE type = 'd' 
                AND id IN (${docIdsString})
            `;

            const fetchedDocs = await sql(docsQuery);

            if (Array.isArray(fetchedDocs)) {
                for (const doc of fetchedDocs) {
                    docsMap.set(doc.id, doc);
                }
            }
        }

        // 转换为数组并按指定排序
        const finalDocs = Array.from(docsMap.values());

        // 根据排序字段进行排序
        finalDocs.sort((a, b) => {
            const aValue = a[conditionDocsSortOrder as keyof typeof a];
            const bValue = b[conditionDocsSortOrder as keyof typeof b];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return bValue - aValue;
            }

            return 0;
        });

        return finalDocs;
    }
}

export async function getConditionDocsByTag(tag: string, sortOrder: string,) {
    let safeTag = tag.replace(/'/g, "''");

    const query = `
        SELECT *
        FROM blocks
        WHERE type = 'd'
        AND tag LIKE '%${safeTag}%'
        ORDER BY ${sortOrder} DESC
    `;

    return await sql(query);
}
