import {
    archiveAccountingAsset as archiveAsset,
    bulkMergeAccountingAssets,
    readAccountingAssets,
    writeAccountingAsset,
} from "./accountingLocalStore";
import { accountingCurrency, signedAccountingBalance } from "./accountingBalances";
import { readPluginJsonFileChecked } from "../sharedLocalStorage/sharedLocalStorage";
import { ASSETS_SCHEMA } from "./accountingStoragePaths";
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
    if (input.balanceConvention !== undefined && input.balanceConvention !== "signed") throw new Error("账户余额方式无效");
    const openingBalance = signedAccountingBalance(input.openingBalance);
    return {
        ...input,
        accountId: input.accountId || createAccountId(),
        rowId: input.rowId || input.accountId || createAccountId(),
        name: input.name?.trim() || "未命名资产",
        type: input.type?.trim() || "other",
        currency: accountingCurrency(input.currency),
        openingBalance,
        currentBalance: input.currentBalance === undefined ? openingBalance : signedAccountingBalance(input.currentBalance),
        sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
        note: input.note?.trim() || "",
        archived: input.archived ?? false,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
    };
}

export async function loadAccountingAccounts(plugin: any, includeArchived = false): Promise<AccountingAccountLoadResult> {
    try {
        const accounts = await readAccountingAssets(plugin, includeArchived);
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
    options: { expectedUpdatedAt?: string } = {},
): Promise<AccountingAccount> {
    const existing = input.accountId ? (await readAccountingAssets(plugin, true)).find(a => a.accountId === input.accountId) : undefined;
    const account = normalizeAccount({ ...existing, ...input });
    return writeAccountingAsset(plugin, account, { expectedUpdatedAt: options.expectedUpdatedAt ?? existing?.updatedAt });
}

export async function archiveAccountingAccount(plugin: any, accountId: string, options: { expectedUpdatedAt?: string } = {}): Promise<void> {
    await archiveAsset(plugin, accountId, options);
}

export async function readAccountingAccountBackup(plugin: any, path: string): Promise<unknown> {
    if (!/^accounting\/backups\/accounting-assets-[a-z0-9-]+\.json$/.test(path)) throw new Error("账户快照路径无效");
    const data = await readPluginJsonFileChecked(plugin, path);
    if (!data || typeof data !== "object" || (data as any).schema !== ASSETS_SCHEMA || ![1, 2].includes((data as any).version) || !Array.isArray((data as any).assets)) {
        throw new Error("账户快照不存在或内容异常");
    }
    return data;
}

export async function bulkSaveAccountingAccounts(plugin: any, inputs: AccountingAccountInput[]): Promise<AccountingAccount[]> {
    const accounts = inputs.map(normalizeAccount);
    await bulkMergeAccountingAssets(plugin, accounts);
    return accounts;
}
