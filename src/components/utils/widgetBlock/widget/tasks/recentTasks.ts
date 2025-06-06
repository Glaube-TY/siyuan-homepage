import { sql } from "@/api";

export interface RecentTasksInfo {
    id: string;       
    markdown: string;
    content: string;
    created: string;
    updated: string;
    hpath: string;
}

export async function getLatestTasks(): Promise<RecentTasksInfo[]> {
    try {
        const query = `
            SELECT *
            FROM blocks 
            WHERE subtype = 't' AND type != 'l'
            ORDER BY updated DESC
            LIMIT 9999999999999
        `;
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest tasks:", error);
        return [];
    }
}