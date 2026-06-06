# Agent Workbench 调试工具

## 唯一控制台入口

```
window.__kbAgentDebug()
```

所有调试数据通过这一个入口获取。**默认不打印任何 console 日志。**

LLM control plane / raw JSON / fallback / timing 等日志默认也只进入
`window.__kbAgentDebug()` 返回的 `lifecycleEvents`，不会自动 console 打印。

## 命令

| 命令 | 返回值 | 说明 |
|------|--------|------|
| `()` 或 `("all")` | 对象 | 返回全部调试数据 |
| `("json")` | JSON 字符串 | 方便手动复制到编辑器 |
| `("status")` | 对象 | 仅返回轻量状态摘要 |
| `("clear")` | `{ cleared: true }` | 清空所有内存调试数据 |

## 返回数据结构

```ts
{
  status: {
    debugEnabled: boolean,
    lifecycleEventCount: number,
    recentTurnTraceCount: number,
    hasSchemaSanity: boolean,
    lastTurnStatus?: string,
    lastTurnSteps?: number,
  },
  schemaSanity: SchemaSanityResult | null,
  lastTurnTrace: TurnTrace | null,
  recentTurnTraces: TurnTrace[],
  lifecycleEvents: AgentTraceEvent[],
}
```

## 保留的数据

| 数据 | 容量 | 说明 |
|------|------|------|
| 最近 turn trace | 最多 3 次 | 每次只保存轻量事件字段 (type/stepIndex/toolName/ok/durationMs/argsPreview/outputSummary) |
| 生命周期 debug event | 最多 200 条 | 环形裁剪，保存 sanitize 后的轻量 payload |
| schema sanity | 最近一次 | development 模式下工具注册时自动检查 |

## UI 事件持久化

已完成 assistant 消息会保存轻量 `workbenchEvents`，用于刷新后在聊天记录中折叠展示处理过程。

这部分数据不同于 debug ring buffer：

- 可进入会话存储，但只保存轻量 UI 字段。
- 不保存完整 prompt、完整 observation data、工具返回正文或 recentTurnTraces。
- 不进入 Planner prompt，也不进入 `conversationContext`。
- UI 展示使用中文文案，不直接暴露内部事件名。

## 不会做的事

- ❌ 默认不自动 console 打印
- ❌ 不自动复制剪贴板
- ❌ 不保存到 localStorage / 磁盘
- ❌ 不进入 Planner prompt
- ❌ 不阻断运行
- ❌ 不保存完整 prompt、完整正文、完整 observation data

## 实时日志开关

如需在开发时实时查看 console 日志，在浏览器控制台执行：

```
localStorage.KB_AGENT_WORKBENCH_DEBUG = "1"
```

或启用 verbose stream debug：

```
localStorage.KB_AGENT_WORKBENCH_VERBOSE_STREAM_DEBUG = "1"
```

关闭后恢复正常静默模式。

如果控制台还能看到 `[KB-AGENT | ...]`：

- 先确认是否开启了 `localStorage.KB_AGENT_WORKBENCH_DEBUG = "1"`。
- 如果没有开启仍然打印，说明还有直接 console 残留，应继续清理到 debug sink。
- 不恢复 `window.__kbAgentDebug()` 之外的其他 `window.__kbAgent*` 调试入口。

## 发布策略

`window.__kbAgentDebug` 入口可保留在生产版本。因为：
- 默认静默，不影响用户日常使用
- 数据保存在有界内存 ring buffer 中
- 手动触发，不消耗额外资源
- 不包含敏感数据（所有 ID 和文本已 sanitize）
