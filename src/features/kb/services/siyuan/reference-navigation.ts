/**
 * 引用跳转服务
 * 负责根据 ReferenceItem 跳转到思源笔记中的源内容
 */

import { openTab, openMobileFileById } from "siyuan";
import type { ReferenceItem } from "../../types/chat";
import { getBlockByID } from "@/api";
import { pushErrMsg } from "@/api";

// 复用 settings service 中的插件实例获取方式
// 避免重新传参链
let pluginInstance: any = null;

/**
 * 设置插件实例（由外部注入）
 */
export function setReferenceNavigationPlugin(plugin: any) {
  pluginInstance = plugin;
}

/**
 * 获取插件实例
 */
function getPlugin(): any {
  return pluginInstance;
}

/**
 * 跳转到引用项的源内容
 * @param item 引用项
 * @returns 是否成功
 */
export async function navigateToReference(item: ReferenceItem): Promise<boolean> {
  // Web page references — open in new tab, no plugin needed
  if (item.sourceType === "web_page" && item.url) {
    try {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      console.error("[ReferenceNavigation] Failed to open web page:", item.url);
      pushErrMsg("无法打开网页", 3000);
      return false;
    }
  }

  const plugin = getPlugin();
  if (!plugin) {
    console.error("[ReferenceNavigation] Plugin instance not set");
    pushErrMsg("插件未初始化，无法跳转", 3000);
    return false;
  }

  // 优先使用 sourceBlockIds 定位到具体块
  if (item.sourceBlockIds.length > 0) {
    const blockId = item.sourceBlockIds[0];
    const success = await openDocumentByBlockId(plugin, blockId);
    if (success) {
      return true;
    }
    // 块查询失败，继续尝试文档级 fallback
  }

  // 文档级 fallback：如果 sourceBlockIds 为空或块定位失败，且 docId 存在，则直接打开文档
  if (item.docId) {
    const success = await openDocumentByDocId(plugin, item.docId);
    if (success) {
      return true;
    }
  }

  // 无法打开，提示用户
  pushErrMsg(`无法定位到引用来源：${item.docTitle}`, 3000);
  return false;
}

/**
 * 通过文档 ID 打开文档（公开 API）
 * 用于 attachedDocs chip 点击等场景
 */
export async function navigateToDocId(docId: string, title?: string): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) {
    console.error("[ReferenceNavigation] Plugin instance not set");
    pushErrMsg("插件未初始化，无法跳转", 3000);
    return false;
  }
  if (!docId) {
    pushErrMsg("文档 ID 为空，无法打开", 3000);
    return false;
  }
  const success = await openDocumentByDocId(plugin, docId);
  if (!success) {
    pushErrMsg(`无法打开文档${title ? "：" + title : ""}`, 3000);
  }
  return success;
}

/**
 * 通过文档 ID 直接打开文档
 * 用于 Agent Pipeline 等场景，只有 docId 没有 sourceBlockIds 时
 */
async function openDocumentByDocId(plugin: any, docId: string): Promise<boolean> {
  try {
    if (!docId) {
      console.error("[ReferenceNavigation] docId is empty");
      return false;
    }

    // 根据平台打开文档
    if (plugin.isMobile) {
      // 移动端
      openMobileFileById(plugin.app, docId);
    } else {
      // 桌面端
      openTab({
        app: plugin.app,
        doc: {
          id: docId,
        },
      });
    }

    return true;
  } catch (e) {
    console.error("[ReferenceNavigation] Failed to open document by docId:", e);
    return false;
  }
}

/**
 * 通过块 ID 查询并打开所属文档
 * 流程：blockId -> getBlockByID -> root_id -> openTab/openMobileFileById
 */
async function openDocumentByBlockId(plugin: any, blockId: string): Promise<boolean> {
  try {
    // 1. 查询块信息
    const block = await getBlockByID(blockId);
    if (!block) {
      console.error("[ReferenceNavigation] Block not found:", blockId);
      return false;
    }

    // 2. 获取所属文档 ID (root_id)
    const docId = block.root_id;
    if (!docId) {
      console.error("[ReferenceNavigation] Block has no root_id:", block);
      return false;
    }

    // 3. 根据平台打开文档
    if (plugin.isMobile) {
      // 移动端
      openMobileFileById(plugin.app, docId);
    } else {
      // 桌面端
      openTab({
        app: plugin.app,
        doc: {
          id: docId,
        },
      });
    }

    return true;
  } catch (e) {
    console.error("[ReferenceNavigation] Failed to open document by block:", e);
    return false;
  }
}