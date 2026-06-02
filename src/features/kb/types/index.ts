/**
 * 知识库类型统一导出
 */

// 搜索相关
export type {
  SearchHit,
  SearchHitUnit,
} from "./search";

// Session/Orchestration 相关
export type {
  KbSessionState,
} from "./session";

// 设置相关
export type {
  KbSettings,
} from "./settings";

// 聊天相关
export type {
  ChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  ErrorChatMessage,
  LoadingChatMessage,
  ReferenceItem,
} from "./chat";
