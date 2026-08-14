import { mount } from "svelte";
import { showMessage } from "siyuan";
import { isSiyuanMobileFrontend, svelteDialog } from "@/libs/dialog";
import FavoritesManagerDialog from "./components/FavoritesManagerDialog.svelte";

export async function openFavoritesManagerDialog(plugin: any): Promise<void> {
    if (!plugin?.ADVANCED) {
        showMessage(
            "收藏文档管理与分组为 VIP 专属功能。已有分组和组件设置会完整保留，开通或续费后可继续使用。",
            5000,
            "info",
        );
        return;
    }
    try {
        const mobile = isSiyuanMobileFrontend();
        let ref: ReturnType<typeof svelteDialog>;
        ref = svelteDialog({
            title: "",
            mobileCloseControl: "content",
            width: "min(900px, calc(100vw - 32px))",
            height: "min(650px, calc(100vh - 48px))",
            constructor: (container) =>
                mount(FavoritesManagerDialog, {
                    target: container,
                    props: {
                        plugin,
                        mobile,
                        onClose: () => ref.close(),
                    },
                }),
        });
        ref.dialog.element.classList.add("favorites-manager-dialog-host");
    } catch (error) {
        console.warn("[favorites-manager] 打开失败", error);
        showMessage(
            error instanceof Error ? error.message : "收藏文档管理打开失败",
            5000,
            "error",
        );
    }
}
