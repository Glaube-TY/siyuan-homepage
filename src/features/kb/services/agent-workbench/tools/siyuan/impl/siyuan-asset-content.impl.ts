import { getAssetContentByPath, getFileChecked, statAsset } from "../../../../../../../api";
import {
  toSiyuanAssetApiPath,
  toSiyuanAssetWorkspaceFilePath,
} from "../contracts/siyuan-asset-manage.contract";

export const MAX_RAW_ASSET_TEXT_BYTES = 5 * 1024 * 1024;

export type AssetTextContentUnavailableReason =
  | "indexed_content_unavailable"
  | "text_file_too_large"
  | "content_size_unknown"
  | "not_a_file";

export type AssetTextContentResult = {
  path: string;
  content: string | null;
  source: "indexed" | "raw_text" | "unavailable";
  contentAvailable: boolean;
  fileType?: string;
  contentType?: string;
  contentLen?: number;
  reason?: AssetTextContentUnavailableReason;
};

const TEXT_EXTENSIONS = new Set([
  ".c", ".cc", ".conf", ".cpp", ".css", ".csv", ".go", ".h", ".hpp", ".htm", ".html",
  ".ini", ".java", ".js", ".json", ".jsx", ".less", ".log", ".md", ".mjs", ".rs", ".scss",
  ".sh", ".sql", ".svg", ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getTextMetadata(stat: unknown): Pick<AssetTextContentResult, "fileType" | "contentType" | "contentLen"> {
  if (!isRecord(stat)) return {};
  const contentLen = typeof stat.contentLen === "number" && Number.isFinite(stat.contentLen) && stat.contentLen >= 0
    ? stat.contentLen
    : undefined;
  return {
    ...(typeof stat.fileType === "string" ? { fileType: stat.fileType } : {}),
    ...(typeof stat.contentType === "string" ? { contentType: stat.contentType } : {}),
    ...(contentLen !== undefined ? { contentLen } : {}),
  };
}

function isSafeTextAsset(path: string, contentType?: string): boolean {
  if (contentType?.toLowerCase().split(";", 1)[0].trim().startsWith("text/")) return true;
  const dot = path.lastIndexOf(".");
  return dot >= 0 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function unavailable(
  path: string,
  reason: AssetTextContentUnavailableReason,
  metadata: Pick<AssetTextContentResult, "fileType" | "contentType" | "contentLen">,
): AssetTextContentResult {
  return {
    path,
    content: null,
    source: "unavailable",
    contentAvailable: false,
    reason,
    ...metadata,
  };
}

export async function assetFileValueToText(value: unknown): Promise<string> {
  if (typeof value === "string") return value;
  if (typeof Blob !== "undefined" && value instanceof Blob) return value.text();
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const bytes = new Uint8Array(view.byteLength);
    bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return new TextDecoder().decode(bytes);
  }
  throw new Error("[asset_content] 工作区文件返回了不支持的内容类型。");
}

export async function readAssetTextContentByPath(rawPath: string): Promise<AssetTextContentResult> {
  const path = toSiyuanAssetApiPath(rawPath);
  const indexedAsset = await getAssetContentByPath(path);
  if (indexedAsset !== null) {
    return { path, content: indexedAsset.content, source: "indexed", contentAvailable: true };
  }

  const stat = await statAsset(path);
  const metadata = getTextMetadata(stat);
  if (!isRecord(stat)) {
    return unavailable(path, "not_a_file", metadata);
  }
  if (metadata.fileType !== "file") {
    return unavailable(path, "not_a_file", metadata);
  }
  if (!isSafeTextAsset(path, metadata.contentType)) {
    return unavailable(path, "indexed_content_unavailable", metadata);
  }
  if (metadata.contentLen === undefined) {
    return unavailable(path, "content_size_unknown", metadata);
  }
  if (metadata.contentLen > MAX_RAW_ASSET_TEXT_BYTES) {
    return unavailable(path, "text_file_too_large", metadata);
  }

  const raw = await getFileChecked(toSiyuanAssetWorkspaceFilePath(path));
  return {
    path,
    content: await assetFileValueToText(raw),
    source: "raw_text",
    contentAvailable: true,
    ...metadata,
  };
}
