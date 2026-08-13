# 科技主题实现交接

## 复用边界

- 主题入口：`src/homepage/theme/builtins/technology/definition.ts`
- 共享布局：`TechnologyTheme.svelte` 仅组合现有 Identity、Status、Actions、Banner、Sections 与 Region。
- 页面 token 与区域样式：`technology.scss`。
- 组件类别契约：`widgets/manifest.ts`。
- 通用组件壳层：`widgets/index.scss`。

## 主题中心

- 内置主题发现时强制经典主题第一，其余按内置目录稳定排序。
- 卡片不再加载预览图片，只显示名称、说明、权限、版本、状态和操作。
- 统一名称为：经典、卡片、手绘、纸质、简洁、科技。

## 验证

- 运行 `pnpm verify:homepage-theme` 验证注册、会员回退、命名、排序、共享区域、组件契约和无远程资源。
- 运行 `pnpm typecheck` 与生产构建验证 Svelte/TypeScript 和打包边界。
- 后续视觉调整只修改 `--hp-tech-*` 与主题作用域样式，不新增并行布局或逐组件特判。
