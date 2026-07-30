export interface HeatmapDocumentCountMaps {
    documentCreated: Record<string, number>;
    documentUpdated: Record<string, number>;
}

function normalizePresenceMap(source: Record<string, number> | undefined): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [day, count] of Object.entries(source || {})) {
        if (Number(count) > 0) result[day] = 1;
    }
    return result;
}

export function mergeHeatmapDocumentCountDays(
    previous: Partial<HeatmapDocumentCountMaps> | undefined,
    createdDay: string,
    updatedDays: string | string[],
): HeatmapDocumentCountMaps {
    const result: HeatmapDocumentCountMaps = {
        documentCreated: normalizePresenceMap(previous?.documentCreated),
        documentUpdated: normalizePresenceMap(previous?.documentUpdated),
    };
    if (createdDay) result.documentCreated[createdDay] = 1;
    const normalizedUpdatedDays = Array.isArray(updatedDays) ? updatedDays : [updatedDays];
    for (const day of normalizedUpdatedDays) {
        if (day) result.documentUpdated[day] = 1;
    }
    return result;
}

export function aggregateHeatmapDocumentCounts(
    contributions: Array<{ counts?: Partial<HeatmapDocumentCountMaps> }>,
): HeatmapDocumentCountMaps {
    const totals: HeatmapDocumentCountMaps = {
        documentCreated: {},
        documentUpdated: {},
    };
    for (const contribution of contributions) {
        const normalized = mergeHeatmapDocumentCountDays(contribution.counts, "", "");
        for (const day of Object.keys(normalized.documentCreated)) {
            totals.documentCreated[day] = (totals.documentCreated[day] || 0) + 1;
        }
        for (const day of Object.keys(normalized.documentUpdated)) {
            totals.documentUpdated[day] = (totals.documentUpdated[day] || 0) + 1;
        }
    }
    return totals;
}
