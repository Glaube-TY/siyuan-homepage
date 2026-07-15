export type NotificationLevel = "info" | "success" | "warning" | "error" | "urgent";

export type NotificationSource =
  | "task"
  | "countdown"
  | "diary"
  | "review"
  | "project"
  | "focus"
  | "ai"
  | "mcp"
  | "manual"
  | "system"
  | string;

export interface NotificationEvent {
  id?: string;
  type: string;
  source: NotificationSource;
  sourceId?: string;
  title: string;
  content: string;
  level?: NotificationLevel;
  createdAt?: string;
  scheduledAt?: string;
  expiresAt?: string;
  occurrenceKey: string;
  url?: string;
  tags?: string[];
  extra?: Record<string, unknown>;
}

export type NotificationDeliveryTarget =
  | { kind: "desktop" }
  | { kind: "mobile" }
  | { kind: "external-default" }
  | { kind: "external"; channelId: string };

export type NotificationExternalChannelType = "webhook" | "feishu";

export interface NotificationExternalBaseChannel {
  id: string;
  title: string;
  type: NotificationExternalChannelType;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  timeoutMs?: number;
}

export interface NotificationWebhookChannel extends NotificationExternalBaseChannel {
  type: "webhook";
  method: "POST";
  url: string;
  headers?: Record<string, string>;
  bodyTemplateMode?: "default" | "customJson";
  customJsonTemplate?: string;
}

export interface NotificationFeishuChannel extends NotificationExternalBaseChannel {
  type: "feishu";
  webhookUrl: string;
  secret?: string;
  messageFormat?: "text" | "post";
}

export type NotificationExternalChannel = NotificationWebhookChannel | NotificationFeishuChannel;

export interface NotificationCenterSettings {
  version: 1;
  desktop: {
    enabled: boolean;
    timeoutMs: number;
    maxContentChars: number;
    errorStyleForErrorLevel: boolean;
  };
  mobile: {
    enabled: boolean;
    timeoutType: "default" | "never";
    planningHorizonDays: number;
  };
  external: {
    enabled: boolean;
    defaultChannelIds: string[];
    channels: NotificationExternalChannel[];
    rateLimit: { enabled: boolean; minIntervalMs: number };
    dedupe: { enabled: boolean; windowMs: number };
  };
  migration?: {
    version: 1;
    migratedAt: string;
    notifyBridgeSettingsMigrated: boolean;
    oldHistoryMigrated: boolean;
    error?: string;
  };
}

export interface NotificationSendOptions {
  targets: NotificationDeliveryTarget[];
  force?: boolean;
  reason?: string;
  recordHistory?: boolean;
}

export type NotificationTargetKind = "desktop" | "mobile" | "external";
export type NotificationDeliveryStatus = "delivered" | "scheduled" | "skipped" | "failed" | "cancelled";

export interface NotificationDeliveryResult {
  targetKey: string;
  targetKind: NotificationTargetKind;
  targetTitle: string;
  status: NotificationDeliveryStatus;
  deviceId?: string;
  channelId?: string;
  notificationId?: number;
  statusCode?: number;
  durationMs?: number;
  message?: string;
}

export interface NotificationDeliveryError extends NotificationDeliveryResult {
  status: "failed" | "skipped";
  code: string;
}

export interface NotificationSendResult {
  ok: boolean;
  fullyDelivered: boolean;
  eventId: string;
  occurrenceKey: string;
  delivered: NotificationDeliveryResult[];
  skipped: NotificationDeliveryResult[];
  errors: NotificationDeliveryError[];
}

export interface NotificationResolvedTarget {
  targetKey: string;
  targetKind: NotificationTargetKind;
  targetTitle: string;
  deviceId?: string;
  channelId?: string;
  channel?: NotificationExternalChannel;
}

export interface NotificationTargetOption {
  key: string;
  kind: NotificationDeliveryTarget["kind"];
  title: string;
  enabled: boolean;
  availableOnCurrentDevice: boolean;
  channelId?: string;
  reason?: string;
}

export interface NotificationDeliveryHistoryRecord {
  id: string;
  eventId: string;
  occurrenceKey: string;
  source: string;
  type: string;
  sourceId?: string;
  title: string;
  scheduledAt?: string;
  targetKey: string;
  targetKind: NotificationTargetKind;
  targetTitle: string;
  deviceId?: string;
  channelId?: string;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  firstAttemptAt: string;
  lastAttemptAt: string;
  deliveredAt?: string;
  notificationId?: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  payloadHash?: string;
  legacyExternalCompleted?: boolean;
}

export interface NotificationHistoryIndex {
  schema: "siyuan-homepage-notification-history-index";
  version: 1;
  revision: number;
  updatedAt: string;
  years: number[];
  yearCounts: Record<string, number>;
  totalRecords: number;
}

export interface NotificationHistoryYearFile {
  schema: "siyuan-homepage-notification-history";
  version: 1;
  revision: number;
  year: number;
  updatedAt: string;
  records: NotificationDeliveryHistoryRecord[];
}

export interface MobileNotificationPlanRequest {
  planKey: string;
  source: NotificationSource;
  ruleId: string;
  event: NotificationEvent;
  scheduledAt: string;
}

export interface MobilePlanBuildContext {
  now: Date;
  horizonEnd: Date;
  planningHorizonDays: number;
}

export interface MobileNotificationPlanProvider {
  id: string;
  source: NotificationSource;
  buildPlans(context: MobilePlanBuildContext): Promise<MobileNotificationPlanRequest[]>;
}

export interface MobileNotificationPlanRecord {
  planKey: string;
  source: string;
  ruleId: string;
  occurrenceKey: string;
  scheduledAt: string;
  notificationId: number;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface MobileNotificationPlanFile {
  schema: "siyuan-homepage-notification-mobile-plans";
  version: 1;
  revision: number;
  updatedAt: string;
  deviceId: string;
  plans: Record<string, MobileNotificationPlanRecord>;
}

export interface MobilePlanRuntimeStatus {
  planCount: number;
  nextScheduledAt?: string;
  lastReconciledAt?: string;
  lastError?: string;
  lastClearResult?: {
    clearedCount: number;
    retainedFailureCount: number;
  };
}
