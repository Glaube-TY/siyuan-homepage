// 思源新版本支持的 doc.mode 参数（运行时支持，类型声明可能滞后）
// 0: 预览模式, 1: 编辑模式, 2: 分屏预览模式
export type DocOpenMode = 0 | 1 | 2;

export interface OpenDocOptions {
    id: string;
    mode?: DocOpenMode;
    action?: string[];
    zoomIn?: boolean;
}

type OpenDocsRuntime = (plugin: any, id: string, mode?: DocOpenMode) => void;
let openDocsRuntime: OpenDocsRuntime | null = null;

export function setOpenDocsRuntime(runtime: OpenDocsRuntime): void {
    openDocsRuntime = runtime;
}

export function openDocs(plugin: any, id: string, mode?: DocOpenMode) {
    if (!openDocsRuntime) throw new Error("当前运行时不支持打开文档界面。");
    openDocsRuntime(plugin, id, mode);
}

export function openDocsInClientRuntime(
    plugin: any,
    id: string,
    mode: DocOpenMode | undefined,
    adapters: {
        openMobileFileById(app: unknown, id: string): void;
        openTab(options: { app: unknown; doc: OpenDocOptions }): void;
    },
): void {
    if (plugin.isMobile) {
        // 关闭移动端弹窗
        if (plugin.currentMobileDialog) {
            plugin.currentMobileDialog.close();
            plugin.currentMobileDialog = null;
        }
        if (typeof plugin?.closeMobileEnhancedDiaryWorkspace === "function") {
            plugin.closeMobileEnhancedDiaryWorkspace();
        }
        adapters.openMobileFileById(plugin.app, id);
    } else {
        const docConfig: OpenDocOptions = { id };
        if (mode !== undefined) {
            docConfig.mode = mode;
        }
        adapters.openTab({
            app: plugin.app,
            doc: docConfig as any, // 类型兼容：运行时支持 mode，但类型声明可能未更新
        });
    }
}
