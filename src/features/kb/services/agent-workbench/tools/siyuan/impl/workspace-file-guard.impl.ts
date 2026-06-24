export interface WorkspacePathAllowed {
  ok: true;
  path: string;
}

export interface WorkspacePathBlocked {
  ok: false;
  code: "workspace_file_path_not_allowed";
  message: string;
}

export type WorkspacePathGuardResult = WorkspacePathAllowed | WorkspacePathBlocked;

const ALLOWED_ROOTS = [
  "/data/assets",
  "/data/templates",
  "/data/widgets",
  "/data/public",
  "/data/storage/petal/siyuan-homepage",
];

function fail(message: string): WorkspacePathBlocked {
  return { ok: false, code: "workspace_file_path_not_allowed", message };
}

export function normalizeWorkspacePath(raw: string): string {
  let path = raw.trim().replace(/\\/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.startsWith("/assets/")) path = `/data${path}`;
  if (path === "/assets") path = "/data/assets";
  return path.replace(/\/+/g, "/").replace(/\/$/, "");
}

export function guardWorkspaceFilePath(raw: unknown): WorkspacePathGuardResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return fail("路径不能为空。");
  }
  const path = normalizeWorkspacePath(raw);

  if (path === "/" || path === "/data" || path.includes("../") || path.includes("/..") || path.includes("..")) {
    return fail("路径不能为根目录或包含 ..。");
  }
  if (/^[a-zA-Z]:\//.test(path) || path.startsWith("//")) {
    return fail("不允许系统绝对路径。");
  }
  if (path === "/conf" || path.startsWith("/conf/") || path === "/temp" || path.startsWith("/temp/")) {
    return fail("不允许访问 conf/temp 等敏感目录。");
  }
  if (path === "/data/.siyuan" || path.startsWith("/data/.siyuan/")) {
    return fail("不允许访问 data/.siyuan。");
  }
  if (path.startsWith("/data/storage/petal/") && !path.startsWith("/data/storage/petal/siyuan-homepage/") && path !== "/data/storage/petal/siyuan-homepage") {
    return fail("不允许访问其他插件的 storage 目录。");
  }

  const allowed = ALLOWED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
  if (!allowed) {
    return fail("路径不在允许的工作区目录白名单内。");
  }

  return { ok: true, path };
}
