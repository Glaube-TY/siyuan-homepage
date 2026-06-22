# 属性视图 API 快照

本目录用于记录数据库助手开发时的真实思源 API 返回结构，避免基于猜测适配。

## 测试对象

- 数据库名称：图书馆
- avID / databaseId：20260420145219-g3lym8q
- 当前文档 ID：20260518213736-owqbuwv

## 文件说明

- 01-query-current-doc-blocks.json：当前文档块结构
- 02-query-possible-av-blocks-in-doc.json：疑似数据库块
- 03-search-attribute-view-empty.json：空关键词搜索属性视图
- 04-search-attribute-view-keyword-library.json：按“图书馆”搜索
- 05-search-attribute-view-keyword-book-title.json：按“书名”搜索
- 06-search-attribute-view-keyword-isbn.json：按“ISBN”搜索
- 07-get-attribute-view-library.json：读取属性视图本体
- 08-get-attribute-view-keys-by-av-id.json：读取字段结构
- 09-render-attribute-view-av-only.json：只传 avID 渲染
- 10-render-attribute-view-av-and-block.json：传 avID + blockID 渲染
- 11-render-attribute-view-av-and-view.json：传 avID + viewID 渲染
- 12-render-attribute-view-av-block-view.json：传 avID + blockID + viewID 渲染
- 13-get-item-ids-by-bound-ids.json：绑定块 ID 映射 itemID
- 90-optional-set-attribute-view-block-attr-item-id.json：可选写入测试

## 结论

测试完成后填写：

1. searchAttributeView 返回的真实 avID 字段是：avID
2. 数据库块 ID 字段是：blockID
3. getAttributeView 里的 viewID 路径是：av.viewID / av.views[].id
4. renderAttributeView 能返回 rows 的请求组合是：只传 avID 即可返回 rows
5. rows 在响应中的路径是：data.view.rows
6. 每一行的 itemID 字段是：row.id
7. 每一行的 boundBlockId 字段是：row.cells[].value.blockID（绑定块 ID）
8. 每个 cell 的 keyID 字段是：cell.value.keyID
9. getAttributeViewItemIDsByBoundIDs 的返回结构是：blockID -> itemID 对象 map
10. setAttributeViewBlockAttr 是否只用 itemID 写入成功：是

> 以上结论来自 docs/api-snapshots/attribute-view 的真实 Apifox 快照，不是猜测。