import { loadOpenTasks } from "@/features/task-notify/task-notify-rules";
import { getDiaryDocForNotify, loadDiaryConfig } from "@/features/enhanced-diary-notify/enhanced-diary-notify-rules";

export interface AutomationSensorResult { fingerprint: string; summary: string }
export interface AutomationSensor { id: string; label: string; evaluate(now: Date): Promise<AutomationSensorResult> }

const sensors = new Map<string, AutomationSensor>();

export function registerAutomationSensor(sensor: AutomationSensor): () => void {
  sensors.set(sensor.id, sensor);
  return () => sensors.delete(sensor.id);
}

export function listAutomationSensors(): AutomationSensor[] { return [...sensors.values()]; }

export function getAutomationSensor(id: string): AutomationSensor | undefined { return sensors.get(id); }

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

registerAutomationSensor({
  id: "task-overdue", label: "逾期任务变化",
  async evaluate(now) {
    const today = localDate(now);
    const tasks = (await loadOpenTasks()).filter((task) => {
      const deadline = task.parsed.deadline?.trim();
      return Boolean(deadline && deadline < today);
    });
    const ids = tasks.map((task) => task.id).sort();
    return { fingerprint: ids.join(",") || "none", summary: `当前有 ${tasks.length} 条逾期任务。` };
  },
});

registerAutomationSensor({
  id: "enhanced-diary-status", label: "今日日记状态变化",
  async evaluate(now) {
    const config = await loadDiaryConfig();
    const result = await getDiaryDocForNotify(now, config.dailyNotebookId);
    return { fingerprint: result.state === "exists" ? `exists:${result.id}` : result.state, summary: result.state === "exists" ? "今日日记已创建。" : result.state === "missing" ? "今日日记尚未创建。" : "今日日记状态暂时无法确认。" };
  },
});
