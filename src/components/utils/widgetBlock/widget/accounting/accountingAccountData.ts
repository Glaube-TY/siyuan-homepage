import {
    archiveAccountingAsset as archiveAsset,
    bulkMergeAccountingAssets,
    readAccountingAssets,
    writeAccountingAsset,
} from "./accountingLocalStore";
import { normalizeAccountingCurrency } from "./accountingConstants";
import type {
    AccountingAccount,
    AccountingAccountInput,
    AccountingAccountLoadResult,
    AccountingAccountStoreStatus,
} from "./accountingTypes";

function createStatus(ok: boolean, message: string): AccountingAccountStoreStatus {
    return { ok, missingFields: [], message };
}

function createAccountId(): string {
    return `accounting-asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAccount(input: AccountingAccountInput): AccountingAccount {
    const now = new Date().toISOString();
    return {
        accountId: input.accountId || createAccountId(),
        rowId: input.rowId || input.accountId || createAccountId(),
        name: input.name?.trim() || "未命名资产",
        type: input.type?.trim() || "other",
        currency: normalizeAccountingCurrency(input.currency),
        openingBalance: Math.max(0, Number(input.openingBalance) || 0),
        currentBalance: Math.max(0, Number(input.currentBalance) || 0),
        sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
        note: input.note?.trim() || "",
        archived: input.archived ?? false,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
    };
}

export async function loadAccountingAccounts(plugin: any): Promise<AccountingAccountLoadResult> {
    try {
        const accounts = await readAccountingAssets(plugin, false);
        return {
            accounts: accounts.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
            status: createStatus(true, `${accounts.length} 个资产`),
        };
    } catch (error) {
        return {
            accounts: [],
            status: createStatus(false, error instanceof Error ? error.message : "本地资产数据加载失败"),
        };
    }
}

export async function saveAccountingAccount(
    plugin: any,
    input: AccountingAccountInput,
): Promise<AccountingAccount> {
    const account = normalizeAccount(input);
    await writeAccountingAsset(plugin, account);
    return account;
}

export async function archiveAccountingAccount(plugin: any, accountId: string): Promise<void> {
    await archiveAsset(plugin, accountId);
}

export async function bulkSaveAccountingAccounts(plugin: any, inputs: AccountingAccountInput[]): Promise<AccountingAccount[]> {
    const accounts = inputs.map(normalizeAccount);
    await bulkMergeAccountingAssets(plugin, accounts);
    return accounts;
}
