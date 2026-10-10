import { SiyuanApiError, WorkspaceStorageReadError, type WorkspaceStorageData } from "@/api";

export const WORKSPACE_DIRECTORY_LABELS: Record<WorkspaceStorageData["directories"][number]["name"], string> = {
    data: "工作空间数据", repo: "数据仓库", history: "历史记录", temp: "临时文件", conf: "配置", other: "其他",
};

export function formatStorageSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${Number(value.toFixed(index === 0 ? 0 : 2))} ${units[index]}`;
}

export function formatStorageTime(calculatedAt: number): string {
    return new Date(calculatedAt).toLocaleString("zh-CN", { hour12: false });
}

export function workspaceStorageFailure(error: unknown): string {
    if (error instanceof WorkspaceStorageReadError) {
        return {
            permission: "无管理员权限：请以管理员身份登录当前 Kernel 后重试。",
            connection: "Kernel 连接失败：请检查当前思源连接后重试。",
            response: "接口返回结构异常：未使用此响应更新容量，请检查 Kernel 版本。",
            timeout: "接口超时：本次未取得完整统计，请稍后手动重试。",
            unsupported: "当前 Kernel 不支持存储统计接口，请确认思源版本为 3.8.6 或更高。",
        }[error.kind];
    }
    if (error instanceof SiyuanApiError) {
        if (error.siyuanCode === -1 && error.siyuanMsg === "failed to calculate workspace storage") {
            return "工作空间扫描失败：未取得完整容量，请检查 Kernel 日志后手动重试。";
        }
        return `工作空间统计接口调用失败（code=${error.siyuanCode}），请检查当前 Kernel 后重试。`;
    }
    return "工作空间统计读取失败，请检查当前 Kernel 后重试。";
}
