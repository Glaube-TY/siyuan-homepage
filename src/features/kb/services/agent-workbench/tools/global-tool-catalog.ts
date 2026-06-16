/**
 * 全局工具目录（只读元数据）
 *
 * 仅用于 UI / 设置展示，不参与 ToolRegistry 业务流程。
 */

export interface GlobalToolMeta {
  name: "read_docs" | "web_read_page" | "edit_global_memory" | "get_doc_info";
  title: string;
  description: string;
  readOnly: boolean;
}

export const globalToolCatalog: GlobalToolMeta[] = [
  {
    name: "read_docs",
    title: "读取本地文档正文",
    description: "读取思源笔记中指定文档或内容块的正文，供 AI 参考。",
    readOnly: true,
  },
  {
    name: "web_read_page",
    title: "读取网页正文",
    description: "读取指定网页的正文内容，供 AI 参考。",
    readOnly: true,
  },
  {
    name: "edit_global_memory",
    title: "编辑全局记忆",
    description: "用修改后的完整记忆内容替换当前全局记忆，不暴露记忆文档 ID。",
    readOnly: false,
  },
  {
    name: "get_doc_info",
    title: "查看文档信息",
    description: "查看指定文档的标题、路径、笔记本、创建时间、更新时间和标签等信息，不读取正文内容。",
    readOnly: true,
  },
];
