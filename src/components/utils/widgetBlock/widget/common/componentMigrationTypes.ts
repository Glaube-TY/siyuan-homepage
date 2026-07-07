export interface NotebookOption {
    label: string;
    value: string;
}

export type ComponentMigrationStatusValue = "idle" | "success" | "error";

export interface ComponentMigrationStatus {
    lastRunAt?: string;
    lastStatus?: ComponentMigrationStatusValue;
    lastMessage?: string;
    migratedCount?: number;
    skippedCount?: number;
    cleanedCount?: number;
    cleanupFailedCount?: number;
    refreshedCount?: number;
    removedCount?: number;
}
