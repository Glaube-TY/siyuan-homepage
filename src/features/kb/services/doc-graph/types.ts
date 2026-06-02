/**
 * DocGraph 类型定义
 *
 * 为 path-utils.ts 提供类型支撑。
 */

/**
 * 文档展示路径片段
 * 用于 sql-utils.ts 的 toDocTreeSqlPathPrefix
 */
export interface DocDisplayPathPart {
  docId: string;
  title: string;
}
