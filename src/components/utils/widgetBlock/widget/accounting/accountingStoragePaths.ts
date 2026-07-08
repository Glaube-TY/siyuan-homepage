// Centralized accounting local storage paths.
// All paths are relative to the plugin data directory and use forward slashes.

export const ACCOUNTING_DIR = "accounting";

export const SETTINGS_FILE = `${ACCOUNTING_DIR}/accounting-settings.json`;
export const ASSETS_FILE = `${ACCOUNTING_DIR}/accounting-assets.json`;
export const SUMMARY_FILE = `${ACCOUNTING_DIR}/accounting-summary-index.json`;
export const RECORDS_INDEX_FILE = `${ACCOUNTING_DIR}/accounting-records-index.json`;

export function getRecordsFile(year: string | number): string {
    return `${ACCOUNTING_DIR}/accounting-records-${year}.json`;
}

export const RECORDS_SCHEMA = "siyuan-homepage-accounting-records";
export const ASSETS_SCHEMA = "siyuan-homepage-accounting-assets";
export const SUMMARY_SCHEMA = "siyuan-homepage-accounting-summary";
export const RECORDS_INDEX_SCHEMA = "siyuan-homepage-accounting-records-index";

export const ACCOUNTING_RECORDS_VERSION = 1;
export const ACCOUNTING_ASSETS_VERSION = 1;
export const ACCOUNTING_SUMMARY_VERSION = 1;
export const ACCOUNTING_RECORDS_INDEX_VERSION = 1;
export const ACCOUNTING_EXPORT_VERSION = 3;
