import { mount } from "svelte";
import { showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import AccountingDetailDialog from "./AccountingDetailDialog.svelte";
import { DEFAULT_ACCOUNTING_CONFIG } from "./accountingConstants";
import { loadAccountingSettings } from "./accountingSettings";
import { loadAccountingAccounts } from "./accountingAccountData";
import type { AccountingAppSettings } from "./accountingSettings";
import type { AccountingAccountLoadResult } from "./accountingTypes";
import {
    ensureHomepageEntitlementGranted,
    resolveHomepageEntitlementMessage,
} from "@/features/entitlement/homepage-entitlement";

export type AccountingDetailTab = "overview" | "transactions" | "record" | "analytics" | "settings" | "assets";

export async function openAccountingDetailDialogFromPlugin(
    plugin: any,
    initialTab: AccountingDetailTab = "overview",
): Promise<void> {
    if (!await ensureHomepageEntitlementGranted(plugin)) {
        showMessage(resolveHomepageEntitlementMessage("记账"), 4000, "error");
        return;
    }

    try {
        const appSettings: AccountingAppSettings = await loadAccountingSettings(plugin);
        const accountResult: AccountingAccountLoadResult = await loadAccountingAccounts(plugin);
        let dialog: ReturnType<typeof svelteDialog>;
        const closeOnEntitlementUnavailable = () => dialog?.close();
        window.addEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);

        try {
            dialog = svelteDialog({
                title: "",
                mobileCloseControl: "content",
                width: "min(980px, calc(100vw - 32px))",
                height: "min(760px, calc(100vh - 64px))",
                callback: () => window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable),
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
        } catch (error) {
            window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
            throw error;
        }

        dialog.dialog.element.classList.add("accounting-detail-dialog-host");
        if (dialog.mobile) {
            dialog.dialog.element.classList.add("accounting-detail-dialog-host--mobile");
        }
    } catch {
        showMessage("打开记账失败，请稍后重试", 3000, "error");
    }
}
