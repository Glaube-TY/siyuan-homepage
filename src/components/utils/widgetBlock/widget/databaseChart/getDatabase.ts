import { fetchSyncPost } from "siyuan";

// 查询数据库所有列字段
export async function getDatabase(databaseID: string) {
    const body = {
        "avID": databaseID,
    };
    const res = await fetchSyncPost("/api/av/getAttributeViewKeysByAvID", body);

    if (res.code === 0) {
        return res.data;
    } else {
        return null;
    }
}

// 查询数据库所有信息
export async function getAttributeView(databaseID: string) {
    const body = {
        "id": databaseID,
    };
    const res = await fetchSyncPost("/api/av/getAttributeView", body);

    if (res.code === 0) {
        return res.data.av;
    } else {
        return null;
    }
}
