export * from "./types";
export * from "./constants";
export {
  createNotificationExternalChannelId,
  decryptNotificationExternalChannel,
  getNotificationCenterPlugin,
  isNotificationCenterFeatureAvailable,
  loadNotificationCenterSettings,
  normalizeNotificationCenterSettings,
  normalizeNotificationExternalChannel,
  readNotificationCenterSettingsFile,
  saveNotificationCenterSettings,
  setNotificationCenterPlugin,
  updateNotificationCenterMobileSettings,
} from "./notification-center-settings-store";
export * from "./notification-center-history-store";
export * from "./notification-center-target-resolver";
export * from "./notification-center-mobile-plan-registry";
export {
  cancelPendingMobilePlanRefresh,
  clearCurrentDeviceMobilePlans,
  getMobilePlanRuntimeStatus,
  rebuildCurrentDeviceMobilePlans,
  reconcileMobilePlans,
  requestMobilePlanRefresh,
  settleMobilePlanReconcile,
} from "./notification-center-mobile-plan-manager";
export * from "./notification-center-mobile-plan-store";
export * from "./notification-center-migration";
export * from "./notification-center-runtime";
export * from "./notification-center-device";
export * from "./notification-center-redact";
export {
  notify,
  testDesktop,
  testMobile,
  testExternalChannel,
  getTargetOptions,
  settleNotificationCenterOperations,
} from "./notification-center-service";

import {
  notify,
  testDesktop,
  testMobile,
  testExternalChannel,
  getTargetOptions,
} from "./notification-center-service";
import {
  clearCurrentDeviceMobilePlans,
  rebuildCurrentDeviceMobilePlans,
  reconcileMobilePlans,
  requestMobilePlanRefresh,
} from "./notification-center-mobile-plan-manager";

export const notificationCenter = {
  notify,
  testDesktop,
  testMobile,
  testExternalChannel,
  getTargetOptions,
  requestMobilePlanRefresh,
  reconcileMobilePlans,
  rebuildCurrentDeviceMobilePlans,
  clearCurrentDeviceMobilePlans,
};
