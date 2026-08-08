/**
 * 已确认空布局（confirmed/verified empty layout）的纯决策逻辑。
 *
 * 桌面与移动端恢复层对“合法空布局”的判定必须严格：
 * - 只有 Homepage Agent 的 explicit-storage-refresh（已事务提交 + 写后验证）允许请求；
 * - 普通 initial-load / config-refresh / 同步临时空读不得使用；
 * - 必须绑定 expectedLayoutRevision，且真实 storage 双读仍为空。
 *
 * 本文件不依赖 siyuan / @/ 运行时，可在 Node 测试环境直接验证。
 */

export interface ConfirmedEmptyLayoutParams {
    mode: string;
    targetWidgetCount: number;
    targetRenderableWidgetCount: number;
    currentSectionUnresolvedWidgetCount: number;
}

/**
 * 桌面 root 是否允许把当前空布局当作“已确认的合法空布局”执行安全清空。
 *
 * 必须同时满足：
 * - 仅 explicit-storage-refresh；
 * - 真实 targetWidgetIds 为空；
 * - targetRenderableWidgetIds 为空；
 * - manifest unresolved 当前也不要求渲染任何组件。
 *
 * 绝不根据 order 长度自动推断；initial-load / config-refresh 恒为 false。
 */
export function shouldConfirmEmptyLayout(params: ConfirmedEmptyLayoutParams): boolean {
    return (
        params.mode === "explicit-storage-refresh"
        && params.targetWidgetCount === 0
        && params.targetRenderableWidgetCount === 0
        && params.currentSectionUnresolvedWidgetCount === 0
    );
}

export interface MobileEmptyVerificationParams {
    firstReadSucceeded: boolean;
    firstOrderEmpty: boolean;
    secondLayoutExists: boolean;
    secondRevisionMatches: boolean;
    secondOrderEmpty: boolean;
}

/**
 * 移动端“已确认空布局”双读判定：
 * 第一次读取必须成功且 order 为空；第二次读取必须存在、revision 与第一次一致、order 仍为空。
 * 任一不满足都返回 false，调用方必须保留现有 DOM，由 latest-wins 重新处理。
 */
export function shouldClearMobileConfirmedEmpty(params: MobileEmptyVerificationParams): boolean {
    return (
        params.firstReadSucceeded
        && params.firstOrderEmpty
        && params.secondLayoutExists
        && params.secondRevisionMatches
        && params.secondOrderEmpty
    );
}
