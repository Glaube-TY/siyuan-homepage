/**
 * 文档内容编辑 confirmation service。
 * 提供 pending confirmation 的创建、读取、移除和过期清理。
 * 只保存执行前临时 confirmation，不保存执行后状态。
 * 本轮只创建和读取 confirmation，不执行真实写入。
 */

export {
  createDocContentEditConfirmation,
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
  pruneExpiredDocContentEditConfirmations,
  type CreateDocContentEditConfirmationInput,
} from "./doc-content-edit-confirmation-store";
