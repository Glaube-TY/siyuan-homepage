/**
 * 知识库搜索相关类型
 */

/** SearchHit 中的单元信息 */
export type SearchHitUnit = {
  id: string;
  docId: string;
  box: string;
  type: "heading" | "paragraph" | "list" | "code" | "table" | "doc" | "other";
  title: string;
  path?: string;
  text: string;
  preview: string;
  headingPath: string[];
  sourceBlockIds: string[];
  level?: number;
  updated?: string;
  blockCount?: number;
};

export type SearchHit = {
  unit: SearchHitUnit;
  score: number;
};
