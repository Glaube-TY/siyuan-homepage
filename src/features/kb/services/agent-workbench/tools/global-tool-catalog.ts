/**
 * 全局工具目录（只读元数据）
 *
 * 仅用于 UI / 设置展示，不参与 ToolRegistry 业务流程。
 */

export interface GlobalToolMeta {
  name: "read_docs" | "web_read_page" | "edit_global_memory";
  title: string;
  description: string;
}

export const globalToolCatalog: GlobalToolMeta[] = [
  {
    name: "read_docs",
    title: "读取本地文档正文",
    description: "根据 docId、blockId 读取思源笔记中的文档/块正文内容。",
  },
  {
    name: "web_read_page",
    title: "读取网页正文",
    description: "读取指定 URL 的网页正文并转换为 Markdown。",
  },
  {
    name: "edit_global_memory",
    title: "编辑全局记忆",
    description: "管理配置好的记忆文档条目，可新增、修改、删除或调整顺序。",
  },
];
