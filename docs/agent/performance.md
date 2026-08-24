# 性能、启动与打包开发规则

## 适用范围

修改启动路径、后台任务、定时器、可见性生命周期、并发、图表依赖、bundle 或大数据加载时读取本文件。普通业务或 UI 改动不要加载本文件，除非触及这些边界。

## 规则

- 生产包保持自包含；`index.js` 可能从 data URL 运行，不得关闭 `inlineDynamicImports`，除非已有可靠资源加载器。
- 图表从 `src/utils/charts/echarts.ts` 按需注册实际使用的能力；第三方依赖优先使用 modular/core 入口，不恢复完整 bundle。
- 首屏只承担必需工作，Agent、图表、富文本和媒体能力走既有延迟/idle-task 路径；不可见组件暂停高频刷新，组件销毁必须清理 timer、listener 和 Observer。
- 加载进度由真实阶段驱动，不用假动画；组件数据使用有界并发；单个组件或非关键任务失败不能阻塞整页。
- 保留 unload cancellation、数据校验、写后验证和失败隔离。共享运行时 helper 放 `src/utils`，不要复制到功能目录或保留内部旧 re-export 路径。

修改后只运行覆盖实际边界的既有验证；涉及 Svelte/TypeScript 或打包时再运行 typecheck/build。
