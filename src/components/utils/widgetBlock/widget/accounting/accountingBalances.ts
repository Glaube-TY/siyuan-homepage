import type { AccountingAccount, AccountingRecord } from "./accountingTypes";

export function signedAccountingBalance(value: unknown): number {
    if (value === undefined) return 0;
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value))) {
        throw new Error("账户余额必须是有效金额，原数据未覆盖");
    }
    return Number(value);
}

export function resolveAccountingAccount(ref: string | undefined, accounts: AccountingAccount[], currency?: string): AccountingAccount | undefined {
    if (!ref) return undefined;
    return accounts.find(a => a.accountId === ref) || accounts.find(a => a.rowId === ref)
        || accounts.find(a => (a.name.toLowerCase() === ref.toLowerCase() || a.aliases?.some(name => name.toLowerCase() === ref.toLowerCase()))
            && (!currency || accountingCurrency(a.currency) === accountingCurrency(currency)));
}

export function accountingCurrency(currency: string | undefined): string {
    return currency?.trim().toUpperCase() || "CNY";
}

export function roundAccountingBalance(value: number, currency: string): number {
    const factor = ["JPY", "KRW"].includes(accountingCurrency(currency)) ? 1 : 100;
    return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
}

export interface AccountingCurrencyBalance {
    currency: string;
    assets: number;
    liabilities: number;
    net: number;
    pending: boolean;
}

export function inspectAccountingBalances(accounts: AccountingAccount[], records: AccountingRecord[]) {
    const balances = new Map<string, number>();
    const issues = new Map<string, string>();
    const unmatched = new Set<string>();
    for (const account of accounts) {
        balances.set(account.accountId, signedAccountingBalance(account.openingBalance));
    }
    for (const record of records) {
        if (record.archived) continue;
        const amount = Number(record.amount);
        const apply = (ref: string | undefined, delta: number) => {
            const account = resolveAccountingAccount(ref, accounts, record.currency) || resolveAccountingAccount(ref, accounts);
            if (!account) { if (ref) unmatched.add(ref); return; }
            const named = accounts.filter(a => (a.name.toLowerCase() === ref?.toLowerCase() || a.aliases?.some(name => name.toLowerCase() === ref?.toLowerCase()))
                && accountingCurrency(a.currency) === accountingCurrency(record.currency));
            if (ref !== account.accountId && ref !== account.rowId && named.length > 1) {
                for (const candidate of named) issues.set(candidate.accountId, "历史账户名称重复，请核对流水的账户关联");
                return;
            }
            if (!Number.isFinite(amount) || amount < 0) { issues.set(account.accountId, "关联流水金额异常，请核对原记录"); return; }
            if (accountingCurrency(record.currency) !== accountingCurrency(account.currency)) {
                issues.set(account.accountId, "关联流水与账户币种不同，请核对金额和币种");
                return;
            }
            balances.set(account.accountId, roundAccountingBalance((balances.get(account.accountId) || 0) + delta, account.currency));
        };
        if (record.direction === "expense") apply(record.account, -amount);
        else if (record.direction === "income") apply(record.account, amount);
        else if (record.direction === "transfer") { apply(record.account, -amount); apply(record.counterAccount, amount); }
    }
    const groups = new Map<string, AccountingCurrencyBalance>();
    for (const account of accounts) {
        if (account.archived) continue;
        const currency = accountingCurrency(account.currency);
        const group = groups.get(currency) || { currency, assets: 0, liabilities: 0, net: 0, pending: false };
        const balance = balances.get(account.accountId) || 0;
        group.assets = roundAccountingBalance(group.assets + Math.max(0, balance), currency);
        group.liabilities = roundAccountingBalance(group.liabilities + Math.max(0, -balance), currency);
        group.net = roundAccountingBalance(group.assets - group.liabilities, currency);
        group.pending ||= issues.has(account.accountId);
        groups.set(currency, group);
    }
    return { balances, issues, unmatched: [...unmatched], currencies: [...groups.values()] };
}

export function validateAccountingRecordCurrency(record: AccountingRecord, accounts: AccountingAccount[]): void {
    const refs = record.direction === "transfer" ? [record.account, record.counterAccount] : [record.account];
    for (const ref of refs) {
        const account = resolveAccountingAccount(ref, accounts, record.currency) || resolveAccountingAccount(ref, accounts);
        if (!account) {
            if (record.direction === "transfer") throw new Error("转账需明确转出和转入账户，请先关联账户");
            continue;
        }
        if (accountingCurrency(record.currency) !== accountingCurrency(account.currency)) {
            throw new Error("流水与账户币种不一致；跨币种转账请先按实际兑换分别记录");
        }
        if (ref !== account.accountId && ref !== account.rowId && accounts.filter(a => accountingCurrency(a.currency) === accountingCurrency(record.currency) && (a.name.toLowerCase() === ref?.toLowerCase() || a.aliases?.some(name => name.toLowerCase() === ref?.toLowerCase()))).length > 1) {
            throw new Error("账户名称存在重复，请明确选择账户 ID");
        }
    }
    if (record.direction === "transfer" && resolveAccountingAccount(refs[0], accounts, record.currency)?.accountId === resolveAccountingAccount(refs[1], accounts, record.currency)?.accountId) {
        throw new Error("转出账户和转入账户不能相同");
    }
}
