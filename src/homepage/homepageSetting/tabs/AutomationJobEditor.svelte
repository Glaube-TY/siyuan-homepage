<script lang="ts">
  import { onMount } from "svelte";
  import { getNotificationDeviceId } from "@/features/notification-center";
  import { createAutomationJobId, type AutomationJobDefinition, type AutomationReplyTarget } from "@/features/agent-platform/automation/automation-job-contract";
  import { automationJobStore } from "@/features/agent-platform/automation/automation-job-store";
  import { encodeAutomationRobotRoute } from "@/features/agent-platform/automation/automation-robot-route";
  import { listAutomationSensors } from "@/features/agent-platform/automation/automation-sensor-registry";
  import { restoreKbChatSessions } from "@/features/kb/services/agent-workbench/storage/chat-session-facade";
  import { getNotebrainPlugin } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
  import { RobotKernelClient, getPluginKernelPort } from "@/features/robot-assistant/runtime/robot-kernel-client";
  import { RobotSettingsClient } from "@/features/robot-assistant/settings/robot-settings-client";

  type Kind = "agent" | "monitor";
  type TriggerKind = "once" | "daily" | "weekly" | "monthly" | "interval" | "sensor";
  interface TargetOption { value: string; label: string }

  let { job: initialJob, copyFrom: initialCopy, onSaved, onCancel } = $props<{
    job?: AutomationJobDefinition;
    copyFrom?: AutomationJobDefinition;
    onSaved: () => void | Promise<void>;
    onCancel: () => void;
  }>();

  const KNOWLEDGE_ACTIONS = ["search", "read_docs", "read_evidence", "get_doc_info", "list_map", "list_by_time", "outline", "refs", "extra_search"];
  const DIARY_ACTIONS = ["overview", "query_tasks", "query_records", "find_docs"];
  const sensors = listAutomationSensors();
  // svelte-ignore state_referenced_locally -- 弹窗实例生命周期内编辑目标不会变化。
  const base = initialJob ?? initialCopy;
  // svelte-ignore state_referenced_locally -- 仅用于初始化独立表单草稿。
  let name = $state(initialCopy ? `${initialCopy.name}（副本）` : initialJob?.name ?? "");
  let kind = $state<Kind>(base?.task.kind ?? "agent");
  let content = $state(base?.task.execution.goal ?? "");
  let triggerKind = $state<TriggerKind>(base?.trigger.kind ?? "once");
  let onceAt = $state(localDateTimeValue(base?.trigger.kind === "once" ? base.trigger.at : Date.now() + 3_600_000));
  let dailyTime = $state(base?.trigger.kind === "daily" || base?.trigger.kind === "weekly" || base?.trigger.kind === "monthly" ? base.trigger.time : "08:00");
  let weeklyDays = $state(base?.trigger.kind === "weekly" ? base.trigger.weekdays.join(",") : "1,2,3,4,5");
  let monthlyDays = $state(base?.trigger.kind === "monthly" ? base.trigger.daysOfMonth.join(",") : "1");
  let intervalMinutes = $state(base?.trigger.kind === "interval" || base?.trigger.kind === "sensor" ? base.trigger.intervalMinutes : 60);
  let sensorId = $state(base?.trigger.kind === "sensor" ? base.trigger.sensorId : sensors[0]?.id ?? "task-overdue");
  let agentKnowledge = $state(base?.task.execution.allowedToolNames.includes("siyuan_kb") ?? true);
  let agentDiary = $state(base?.task.execution.allowedToolNames.includes("diary_task") ?? true);
  let agentMemory = $state(base?.task.execution.memoryAccess === "read");
  let targetOptions = $state<TargetOption[]>([]);
  let targetValue = $state(targetToValue(base?.output.replyTarget));
  let saving = $state(false);
  let error = $state("");

  function localDateTimeValue(timestamp: number): string {
    const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
    return date.toISOString().slice(0, 16);
  }

  function providerLabel(provider: string): string {
    return provider === "wechat" ? "微信" : provider === "feishu" ? "飞书" : provider === "qq" ? "QQ" : provider;
  }

  function targetToValue(target?: AutomationReplyTarget): string {
    return target?.kind === "robot" ? `robot:${target.routeRef}` : target?.kind === "kb-conversation" ? `kb:${target.conversationId}` : "";
  }

  function valueToTarget(value: string): AutomationReplyTarget | undefined {
    if (value.startsWith("robot:")) return { kind: "robot", routeRef: value.slice(6) };
    if (value.startsWith("kb:")) return { kind: "kb-conversation", conversationId: value.slice(3) };
  }

  async function refreshTargets(): Promise<void> {
    const options: TargetOption[] = [];
    const snapshot = await restoreKbChatSessions().catch(() => null);
    for (const conversation of snapshot?.conversations ?? []) {
      options.push({ value: `kb:${conversation.id}`, label: `本地 AI · ${conversation.title}` });
    }
    const kernel = new RobotKernelClient(getPluginKernelPort(getNotebrainPlugin()));
    if (kernel.available) {
      const client = new RobotSettingsClient(kernel);
      const [sessions, settings] = await Promise.all([client.getSessions(), client.getSettings()]);
      const seen = new Set<string>();
      for (const item of sessions) {
        const key = item.key && typeof item.key === "object" ? item.key as Record<string, unknown> : {};
        const provider = typeof key.provider === "string" ? key.provider : "";
        const accountId = typeof key.accountId === "string" ? key.accountId : "";
        const chatId = typeof key.chatId === "string" ? key.chatId : "";
        if (provider !== settings.activeProvider || !accountId || !chatId) continue;
        const routeRef = encodeAutomationRobotRoute({ provider: provider as "wechat" | "feishu" | "qq", accountId, chatId });
        const value = `robot:${routeRef}`;
        if (seen.has(value)) continue;
        seen.add(value);
        const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "机器人会话";
        options.push({ value, label: `${item.active === true ? "默认 · " : ""}${providerLabel(provider)} · ${title}` });
      }
    }
    targetOptions = options;
  }

  async function save(): Promise<void> {
    if (!name.trim() || !content.trim()) { error = "请填写名称和执行目标。"; return; }
    saving = true; error = "";
    try {
      const current = initialJob ? await automationJobStore.getJob(initialJob.jobId) : undefined;
      if (initialJob && (!current || current.revision !== initialJob.revision)) throw new Error("任务已发生变化，请关闭后重新编辑。");
      const source = current ?? initialCopy;
      const now = Date.now();
      const timeZone = source?.trigger.timeZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai");
      const parseDays = (value: string, max: number) => Array.from(new Set(value.split(",").map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= max)));
      const trigger = kind === "monitor" || triggerKind === "sensor"
        ? { kind: "sensor" as const, sensorId, intervalMinutes, timeZone }
        : triggerKind === "daily" ? { kind: "daily" as const, time: dailyTime, timeZone }
        : triggerKind === "weekly" ? { kind: "weekly" as const, time: dailyTime, weekdays: parseDays(weeklyDays, 7), timeZone }
        : triggerKind === "monthly" ? { kind: "monthly" as const, time: dailyTime, daysOfMonth: parseDays(monthlyDays, 31), timeZone }
        : triggerKind === "interval" ? { kind: "interval" as const, intervalMinutes, anchorAt: source?.trigger.kind === "interval" ? source.trigger.anchorAt : now, timeZone }
        : { kind: "once" as const, at: new Date(onceAt).getTime(), timeZone };
      const allowedToolNames = [agentKnowledge ? "siyuan_kb" : "", agentDiary ? "diary_task" : ""].filter(Boolean);
      const allowedActionNames = [
        ...(agentKnowledge ? KNOWLEDGE_ACTIONS.map((action) => `siyuan_kb:${action}`) : []),
        ...(agentDiary ? DIARY_ACTIONS.map((action) => `diary_task:${action}`) : []),
      ];
      const execution = {
        goal: content.trim(), profileId: "background-job", allowedToolNames, allowedActionNames,
        memoryAccess: agentMemory ? "read" as const : "none" as const,
        budget: source?.task.execution.budget ?? { maxTokens: 30_000, maxToolCalls: 12, maxDurationMs: 300_000 },
      };
      const replyTarget = valueToTarget(targetValue);
      const next: AutomationJobDefinition = {
        schemaVersion: 1, jobId: current?.jobId ?? createAutomationJobId(), revision: current ? current.revision + 1 : 1,
        name: name.trim(), enabled: source?.enabled ?? true, source: current?.source ?? { surface: "settings" }, trigger,
        task: kind === "agent" ? { kind: "agent", execution } : { kind: "monitor", execution },
        runner: source?.runner ?? { deviceId: getNotificationDeviceId(), runtime: "frontend", requiredCapabilities: [] },
        policy: source?.policy ?? { catchUp: "latest", overlap: "skip", maxRetries: 1, maxConsecutiveFailures: 3, expiresAfterMs: 86_400_000 },
        output: { ...(replyTarget ? { replyTarget } : {}) },
        createdAt: current?.createdAt ?? now, updatedAt: now,
      };
      await automationJobStore.saveJob(next, current?.revision);
      await onSaved();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      saving = false;
    }
  }

  onMount(() => void refreshTargets());
</script>

<form class="editor" onsubmit={(event) => { event.preventDefault(); void save(); }}>
  <div class="form-grid">
    <label><span>名称</span><input class="b3-text-field" bind:value={name} placeholder="如：每天早报" /></label>
    <label><span>任务类型</span><select class="b3-select" bind:value={kind} onchange={() => { if (kind === "monitor") triggerKind = "sensor"; }}><option value="agent">定时 Agent</option><option value="monitor">心跳任务</option></select></label>
    <label><span>触发方式</span><select class="b3-select" bind:value={triggerKind} disabled={kind === "monitor"}><option value="once">仅一次</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="interval">按间隔</option>{#if kind === "monitor"}<option value="sensor">数据变化</option>{/if}</select></label>
    {#if triggerKind === "once"}<label><span>执行时间</span><input class="b3-text-field" type="datetime-local" bind:value={onceAt} /></label>{/if}
    {#if triggerKind === "daily" || triggerKind === "weekly" || triggerKind === "monthly"}<label><span>执行时间</span><input class="b3-text-field" type="time" bind:value={dailyTime} /></label>{/if}
    {#if triggerKind === "weekly"}<label><span>星期（1-7，逗号分隔）</span><input class="b3-text-field" bind:value={weeklyDays} /></label>{/if}
    {#if triggerKind === "monthly"}<label><span>日期（1-31，逗号分隔）</span><input class="b3-text-field" bind:value={monthlyDays} /></label>{/if}
    {#if triggerKind === "interval" || triggerKind === "sensor"}<label><span>检查间隔（分钟）</span><input class="b3-text-field" type="number" min="1" max="10080" bind:value={intervalMinutes} /></label>{/if}
    {#if triggerKind === "sensor"}<label><span>心跳检测器</span><select class="b3-select" bind:value={sensorId}>{#each sensors as sensor}<option value={sensor.id}>{sensor.label}</option>{/each}</select></label>{/if}
    <label class="wide"><span>执行目标</span><textarea class="b3-text-field" rows="5" bind:value={content}></textarea></label>
    <fieldset class="capability-panel wide"><legend>可读取范围</legend><label><input type="checkbox" bind:checked={agentKnowledge} />知识库</label><label><input type="checkbox" bind:checked={agentDiary} />任务与日记</label><label><input type="checkbox" bind:checked={agentMemory} />全局记忆</label></fieldset>
    <label class="wide"><span>结果发送到</span><select class="b3-select" bind:value={targetValue}><option value="">仅保存运行记录</option>{#each targetOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}{#if targetValue && !targetOptions.some((option) => option.value === targetValue)}<option value={targetValue}>已绑定的会话</option>{/if}</select></label>
  </div>
  {#if error}<div class="error" role="alert">{error}</div>{/if}
  <footer><button type="button" class="b3-button b3-button--cancel" onclick={onCancel}>取消</button><button type="submit" class="b3-button b3-button--text" disabled={saving}>{saving ? "保存中…" : initialJob ? "保存修改" : "创建任务"}</button></footer>
</form>

<style>
  .editor{display:flex;flex:1;min-height:0;flex-direction:column;padding:16px;overflow:auto;box-sizing:border-box}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.form-grid>label{display:flex;flex-direction:column;gap:6px;font-size:12px}.form-grid .wide{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea{box-sizing:border-box;width:100%}.form-grid input:not([type="checkbox"]),.form-grid select{min-height:34px}.capability-panel{display:flex;align-items:center;gap:18px;margin:0;padding:10px 12px;border:1px solid var(--b3-border-color);border-radius:8px}.capability-panel label{display:flex;align-items:center;gap:5px}.error{margin-top:12px;color:var(--b3-theme-error);font-size:12px}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--b3-border-color)}
  @media(max-width:760px){.form-grid{grid-template-columns:1fr}.capability-panel{align-items:flex-start;flex-direction:column;gap:8px}}
</style>
