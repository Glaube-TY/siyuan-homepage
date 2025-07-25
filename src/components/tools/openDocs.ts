import { openTab, openMobileFileById } from "siyuan"; 

export function openDocs(plugin: any, id: string) {
    if (plugin.isMobile) {
        // 关闭移动端弹窗
        if (plugin.currentMobileDialog) {
            plugin.currentMobileDialog.close();
            plugin.currentMobileDialog = null;
        }
        openMobileFileById(plugin.app, id);
    } else {
        openTab({
            app: plugin.app,
            doc: {
                id: id,
            },
        });
    }
}