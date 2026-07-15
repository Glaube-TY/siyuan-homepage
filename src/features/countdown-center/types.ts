export type CountdownCenterTab =
  | "overview"
  | "events"
  | "calendar"
  | "notifications"
  | "settings";
export interface OpenCountdownCenterOptions {
  initialTab?: CountdownCenterTab;
  eventId?: string;
  createNew?: boolean;
}
