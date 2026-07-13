import { listDocsByPathChecked, sqlChecked } from "@/api";
import { escapeSqlString } from "@/components/tools/siyuanSqlPaging";
import type { EnhancedDiaryProjectStorageConfig } from "./enhancedDiaryTypes";

export const MAX_ROOT_PROJECTS = 5000;

export interface ProjectContainerInfo {
    mode: "notebook" | "parentDoc";
    notebookId: string;
    parentDocId?: string;
    parentDocPath?: string;
    parentDocHpath?: string;
    parentDocTitle?: string;
}

export interface ProjectChildDoc {
    id: string;
    name: string;
    title: string;
    path: string;
    hpath: string;
    notebookId: string;
    updated: string;
    sort: number;
    order: number;
}

export interface ParentDocValidation {
    valid: boolean;
    info?: {
        id: string;
        title: string;
        notebookId: string;
        path: string;
        hpath: string;
    };
    error?: string;
}

function normalizeDocPath(path: unknown): string {
    const value = String(path || "/");
    return value.endsWith(".sy") ? value : value === "/" ? value : `${value}.sy`;
}

function deriveTitle(content: unknown, hpath: unknown, fallback: string): string {
    const fromContent = String(content || "").trim();
    if (fromContent) return fromContent;
    const fromHpath = String(hpath || "").trim();
    if (fromHpath) {
        const segments = fromHpath.split("/").filter(Boolean);
        if (segments.length) return segments[segments.length - 1];
    }
    return fallback;
}

function mapListDocsFilesToProjectChildDocs(files: any[], notebookId: string): ProjectChildDoc[] {
    return files
        .slice(0, MAX_ROOT_PROJECTS)
        .map((file: any, order: number) => ({
            id: String(file?.id || ""),
            name: String(file?.name || file?.id || "").replace(/\.sy$/i, ""),
            title: deriveTitle(file?.name, file?.hPath || file?.hpath, String(file?.id || "")),
            path: normalizeDocPath(file?.path),
            hpath: String(file?.hPath || file?.hpath || ""),
            notebookId,
            updated: String(file?.mtime || file?.updated || ""),
            sort: Number(file?.sort ?? order),
            order,
        }))
        .filter((doc) => doc.id);
}

function isEmptyParentDocError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || "");
    return message.includes("system cannot find the file specified") ||
        message.includes("找不到文件") ||
        message.includes("找不到指定的文件") ||
        /cannot find the file/i.test(message);
}

export async function resolveProjectContainer(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ProjectContainerInfo> {
    if (storage.mode === "notebook") {
        if (!storage.notebookId) throw new Error("尚未配置项目笔记本。");
        return { mode: "notebook", notebookId: storage.notebookId };
    }
    if (!storage.parentDocId) throw new Error("尚未配置项目父文档。");
    const rows = await sqlChecked(
        `SELECT id, type, box, path, hpath, content FROM blocks WHERE id = '${escapeSqlString(storage.parentDocId)}' LIMIT 1`,
    );
    const row = rows[0];
    if (!row) throw new Error("项目父文档不存在，请重新选择。");
    if (String(row.type || "") !== "d") throw new Error("项目父文档 ID 不是文档，请选择一个有效的父文档。");
    const notebookId = String(row.box || "");
    if (!notebookId) throw new Error("项目父文档所属笔记本无效。");
    const rawPath = String(row.path || "");
    if (!rawPath) throw new Error("项目父文档路径无效。");
    const parentDocPath = rawPath.replace(/\.sy$/i, "");
    if (!parentDocPath) throw new Error("项目父文档路径无效。");
    const parentDocHpath = String(row.hpath || "");
    if (!parentDocHpath) throw new Error("无法取得父文档可读路径，未创建项目文档。");
    return {
        mode: "parentDoc",
        notebookId,
        parentDocId: storage.parentDocId,
        parentDocPath,
        parentDocHpath,
        parentDocTitle: deriveTitle(row.content, row.hpath, storage.parentDocId),
    };
}

export async function listDirectProjectDocs(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ProjectChildDoc[]> {
    const container = await resolveProjectContainer(storage);
    if (container.mode === "notebook") {
        const response = await listDocsByPathChecked(container.notebookId, "/");
        const files = Array.isArray(response?.files) ? response.files : [];
        return mapListDocsFilesToProjectChildDocs(files, container.notebookId);
    }
    const parentPath = container.parentDocPath || "";
    if (!parentPath) return [];
    try {
        const response = await listDocsByPathChecked(container.notebookId, parentPath);
        const files = Array.isArray(response?.files) ? response.files : [];
        return mapListDocsFilesToProjectChildDocs(files, container.notebookId);
    } catch (error) {
        if (isEmptyParentDocError(error)) return [];
        throw error;
    }
}

export async function validateProjectParentDoc(id: string): Promise<ParentDocValidation> {
    const trimmed = id.trim();
    if (!trimmed) {
        return { valid: false, error: "请输入父文档 ID。" };
    }
    let rows: any[];
    try {
        rows = await sqlChecked(
            `SELECT id, type, box, path, hpath, content FROM blocks WHERE id = '${escapeSqlString(trimmed)}' LIMIT 1`,
        );
    } catch {
        return { valid: false, error: "父文档查询失败，请稍后重试。" };
    }
    const row = rows[0];
    if (!row) {
        return { valid: false, error: "该 ID 不存在，请确认是否为思源文档 ID。" };
    }
    if (String(row.type || "") !== "d") {
        return { valid: false, error: "该 ID 不是文档，请选择一个有效的父文档。" };
    }
    const notebookId = String(row.box || "");
    if (!notebookId) {
        return { valid: false, error: "该文档所属笔记本无效。" };
    }
    const path = String(row.path || "");
    if (!path) {
        return { valid: false, error: "该文档路径无效。" };
    }
    return {
        valid: true,
        info: {
            id: String(row.id),
            title: deriveTitle(row.content, row.hpath, String(row.id)),
            notebookId,
            path: normalizeDocPath(path),
            hpath: String(row.hpath || ""),
        },
    };
}

export function isDirectChildPath(childPath: string, parentPath: string): boolean {
    if (!parentPath) return false;
    const prefix = `${parentPath.replace(/\/$/, "")}/`;
    if (!childPath.startsWith(prefix)) return false;
    const relative = childPath.slice(prefix.length);
    return Boolean(relative) && !relative.includes("/") && relative.endsWith(".sy");
}
