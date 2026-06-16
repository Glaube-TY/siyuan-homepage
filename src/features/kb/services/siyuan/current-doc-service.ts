import { sqlSelectReadonly } from "./read-only-kernel";

function getDocumentIdFromActiveTab(): string | null {
  try {
    // 步骤1：获取所有可见的 protyle 候选
    const allProtyles = Array.from(document.querySelectorAll('.protyle:not(.fn__none)'));

    // 步骤2：筛掉属于非正文区域的 protyle
    const contentProtyles = allProtyles.filter((protyle) => {
      // 排除 dock 面板内的 protyle
      if (protyle.closest('.dock')) return false;
      if (protyle.closest('.dockPanel')) return false;
      // 排除文件树内的 protyle
      if (protyle.closest('.file-tree')) return false;
      if (protyle.closest('.sy__file')) return false;
      // 排除侧边栏内的 protyle
      if (protyle.closest('.sidebar')) return false;
      if (protyle.closest('.side-panel')) return false;
      // 排除标签面板内的 protyle
      if (protyle.closest('.tag-panel')) return false;
      if (protyle.closest('.sy__tag')) return false;
      return true;
    });

    // 步骤3：在每个候选 protyle 内查找 docId 来源
    for (const protyle of contentProtyles) {
      // 优先：从 .protyle-title[data-node-id] 取 docId
      const titleEl = protyle.querySelector('.protyle-title[data-node-id]');
      if (titleEl) {
        const docId = titleEl.getAttribute('data-node-id');
        if (docId) {
          return docId;
        }
      }

      // 备选：从 breadcrumb active item 取 docId
      const breadcrumbEl = protyle.querySelector('.protyle-breadcrumb__item--active[data-node-id]');
      if (breadcrumbEl) {
        const docId = breadcrumbEl.getAttribute('data-node-id');
        if (docId) {
          return docId;
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[current-doc-service] 主策略获取文档 ID 失败:', err);
    return null;
  }
}

/**
 * 备用 DOM 策略
 * 当主策略失败时使用
 * 此方法在多页签下可能命中错误的隐藏文档
 */
function fallbackGetDocumentId(): string | null {
  try {
    // 查找活动窗口中的文档编辑器
    const activeWnd = document.querySelector('.layout__wnd--active');
    if (activeWnd) {
      // 在窗口内查找第一个非隐藏的 protyle
      const protyleElement = activeWnd.querySelector('.protyle:not(.fn__none)');
      if (protyleElement) {
        // 不再从 .protyle 取 data-node-id，改为从 title 或 breadcrumb 取
        const titleEl = protyleElement.querySelector('.protyle-title[data-node-id]');
        if (titleEl) {
          const docId = titleEl.getAttribute('data-node-id');
          if (docId) {
            return docId;
          }
        }

        const breadcrumbEl = protyleElement.querySelector('.protyle-breadcrumb__item--active[data-node-id]');
        if (breadcrumbEl) {
          const docId = breadcrumbEl.getAttribute('data-node-id');
          if (docId) {
            return docId;
          }
        }
      }
    }

    const visibleProtyle = document.querySelector('.protyle:not(.fn__none)');
    if (visibleProtyle) {
      const titleEl = visibleProtyle.querySelector('.protyle-title[data-node-id]');
      if (titleEl) {
        const docId = titleEl.getAttribute('data-node-id');
        if (docId) {
          return docId;
        }
      }

      const breadcrumbEl = visibleProtyle.querySelector('.protyle-breadcrumb__item--active[data-node-id]');
      if (breadcrumbEl) {
        const docId = breadcrumbEl.getAttribute('data-node-id');
        if (docId) {
          return docId;
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[current-doc-service] 备用策略获取文档 ID 失败:', err);
    return null;
  }
}


export function getCurrentDocumentId(): string | null {
  const tabDocId = getDocumentIdFromActiveTab();
  if (tabDocId) {
    return tabDocId;
  }

  return fallbackGetDocumentId();
}

export function getCurrentDocumentIdOrThrow(): string {
  const docId = getCurrentDocumentId();
  if (!docId) {
    throw new Error("无法获取当前文档 ID，请确保已打开一个文档");
  }
  return docId;
}

function getTitleFromDom(docId: string): string | null {
  try {
    const titleEl = document.querySelector(
      `.protyle-title[data-node-id="${docId}"] .protyle-title__input`
    );
    if (titleEl) {
      const text = (titleEl.textContent || "").trim();
      if (text) return text;
    }
    const breadcrumbEl = document.querySelector(
      `.protyle-breadcrumb__item--active[data-node-id="${docId}"]`
    );
    if (breadcrumbEl) {
      const text = (breadcrumbEl.textContent || "").trim();
      if (text) return text;
    }
  } catch {
    // ignore DOM errors
  }
  return null;
}

export interface DocAttachmentMeta {
  docId: string;
  title: string;
  box?: string;
  path?: string;
}

export async function resolveDocMetaForAttachment(docId: string): Promise<DocAttachmentMeta> {
  const domTitle = getTitleFromDom(docId);

  try {
    const escapedDocId = docId.replace(/'/g, "''");
    const rows = await sqlSelectReadonly<{ content?: string; box?: string; path?: string }>(
      `SELECT content, box, path FROM blocks WHERE id = '${escapedDocId}' AND type = 'd'`,
      { maxLimit: 1, allowedTables: ["blocks"] }
    );

    if (rows && rows.length > 0) {
      const sqlTitle = (rows[0].content || "").trim();
      return {
        docId,
        title: domTitle || sqlTitle || "未命名文档",
        box: rows[0].box || undefined,
        path: rows[0].path || undefined,
      };
    }
  } catch {
    // SQL fallback failed
  }

  return {
    docId,
    title: domTitle || "未命名文档",
  };
}