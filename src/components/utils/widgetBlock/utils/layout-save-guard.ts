/**
 * 判断当前组件容器是否允许写回布局。
 *
 * degraded 表示仍有无法恢复的历史组件，但已恢复的组件区可以安全编辑；
 * 如果只允许 ready，新组件配置会成功落盘，却无法写入 layout.json。
 */
export function canSaveLayoutFromRestoreState(state: string | undefined): boolean {
    return !state || state === "ready" || state === "degraded";
}
