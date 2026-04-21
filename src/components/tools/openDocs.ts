import { openTab, openMobileFileById } from "siyuan";

// 思源新版本支持的 doc.mode 参数（运行时支持，类型声明可能滞后）
// 0: 预览模式, 1: 编辑模式, 2: 分屏预览模式
export type DocOpenMode = 0 | 1 | 2;

export interface OpenDocOptions {
    id: string;
    mode?: DocOpenMode;
    action?: string[];
    zoomIn?: boolean;
}

export function openDocs(plugin: any, id: string, mode?: DocOpenMode) {
    if (plugin.isMobile) {
        // 关闭移动端弹窗
        if (plugin.currentMobileDialog) {
            plugin.currentMobileDialog.close();
            plugin.currentMobileDialog = null;
        }
        openMobileFileById(plugin.app, id);
    } else {
        const docConfig: OpenDocOptions = { id };
        if (mode !== undefined) {
            docConfig.mode = mode;
        }
        openTab({
            app: plugin.app,
            doc: docConfig as any, // 类型兼容：运行时支持 mode，但类型声明可能未更新
        });
    }
}