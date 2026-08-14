import { mount } from "svelte";
import { showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import AccountingDetailDialog from "./AccountingDetailDialog.svelte";
import { DEFAULT_ACCOUNTING_CONFIG } from "./accountingConstants";
import { loadAccountingSettings } from "./accountingSettings";
import { loadAccountingAccounts } from "./accountingAccountData";
import type { AccountingAppSettings } from "./accountingSettings";
import type { AccountingAccountLoadResult } from "./accountingTypes";

export type AccountingDetailTab = "overview" | "transactions" | "record" | "analytics" | "settings" | "assets";

export async function openAccountingDetailDialogFromPlugin(
    plugin: any,
    initialTab: AccountingDetailTab = "overview",
): Promise<void> {
    if (!plugin?.ADVANCED) {
        showMessage("记账为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
        return;
    }

    try {
        const appSettings: AccountingAppSettings = await loadAccountingSettings(plugin);
        const accountResult: AccountingAccountLoadResult = await loadAccountingAccounts(plugin);
        let dialog: ReturnType<typeof svelteDialog>;

        dialog = svelteDialog({
            title: "",
            mobileCloseControl: "content",
            width: "min(980px, calc(100vw - 32px))",
            height: "min(760px, calc(100vh - 64px))",
            constructor: (containerEl: HTMLElement) => {
                return mount(AccountingDetailDialog, {
                    target: containerEl,
                    props: {
                        config: DEFAULT_ACCOUNTING_CONFIG,
                        plugin,
                        appSettings,
                        accounts: accountResult.accounts,
                        initialTab,
                        initialRecordId: "",
                        onClose: () => dialog.close(),
                        onChanged: () => undefined,
                        onSettingsChanged: () => undefined,
                    },
                });
            },
        });

        dialog.dialog.element.classList.add("accounting-detail-dialog-host");
        if (dialog.mobile) {
            dialog.dialog.element.classList.add("accounting-detail-dialog-host--mobile");
        }
    } catch {
        showMessage("打开记账失败，请稍后重试", 3000, "error");
    }
}
