/**
 * 全局工具目录（只读元数据）
 *
 * 仅用于 UI / 设置展示，不参与 ToolRegistry 业务流程。
 */

export interface GlobalToolMeta {
  name: "read_docs" | "web_read_page" | "edit_global_memory" | "get_doc_info";
  title: string;
  description: string;
}

export const globalToolCatalog: GlobalToolMeta[] = [
  {
    name: "read_docs",
    title: "读取本地文档正文",
    description: "读取思源笔记中指定文档或内容块的正文，供 AI 参考。",
  },
  {
    name: "web_read_page",
    title: "读取网页正文",
    description: "读取指定网页的正文内容，供 AI 参考。",
  },
  {
    name: "edit_global_memory",
    title: "编辑全局记忆",
    description: "管理已配置的记忆文档条目，可新增、修改、删除或调整顺序。",
  },
  {
    name: "get_doc_info",
    title: "查看文档信息",
    description: "查看指定文档的标题、路径、笔记本、创建时间、更新时间和标签等信息，不读取正文内容。",
  },
];
