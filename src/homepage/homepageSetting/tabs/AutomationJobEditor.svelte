<script lang="ts">
  import { onMount } from "svelte";
  import { getNotificationDeviceId } from "@/features/notification-center";
  import { createAutomationJobId, AUTOMATION_DEFAULT_BUDGET, type AutomationJobDefinition, type AutomationReplyTarget } from "@/features/agent-platform/automation/automation-job-contract";
  import { automationJobStore } from "@/features/agent-platform/automation/automation-job-store";
  import { encodeAutomationRobotRoute } from "@/features/agent-platform/automation/automation-robot-route";
  import { listAutomationSensors } from "@/features/agent-platform/automation/automation-sensor-registry";
  import { restoreKbChatSessions } from "@/features/kb/services/agent-workbench/storage/chat-session-facade";
  import { getNotebrainPlugin } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
  import { RobotKernelClient, getPluginKernelPort } from "@/features/robot-assistant/runtime/robot-kernel-client";
  import { RobotSettingsClient } from "@/features/robot-assistant/settings/robot-settings-client";

  type Kind = "agent" | "monitor";
  type TriggerKind = "once" | "daily" | "weekly" | "monthly" | "interval" | "sensor";
  type TargetChannel = "none" | "kb" | "robot";
  type ConversationMode = "new" | "existing";
  interface TargetOption {
    value: string;
    label: string;
    searchText: string;
    conversationId: string;
    routeRef?: string;
    updatedAt: number;
  }

  let { job: initialJob, copyFrom: initialCopy, onSaved, onCancel } = $props<{
    job?: AutomationJobDefinition;
    copyFrom?: AutomationJobDefinition;
    onSaved: () => void | Promise<void>;
    onCancel: () => void;
  }>();

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
  const initialTarget = base?.output.replyTarget;
  let targetChannel = $state<TargetChannel>(initialTarget?.kind === "robot" ? "robot" : initialTarget?.kind === "kb-conversation" ? "kb" : "none");
  let conversationMode = $state<ConversationMode>(initialTarget?.conversationMode ?? "new");
  let localTargets = $state<TargetOption[]>([]);
  let robotTargets = $state<TargetOption[]>([]);
  let selectedConversationId = $state(initialTarget?.conversationId ?? "");
  let selectedRobotRoute = $state(initialTarget?.kind === "robot" ? initialTarget.routeRef : "");
  let activeRobotProvider = $state("");
  let targetSearch = $state("");
  let targetsLoading = $state(false);
  let saving = $state(false);
  let error = $state("");
  let visibleTargets = $derived((targetChannel === "robot" ? robotTargets : localTargets).filter((option) => {
    const query = targetSearch.trim().toLocaleLowerCase();
    return !query || option.searchText.includes(query);
  }));

  function localDateTimeValue(timestamp: number): string {
    const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
    return date.toISOString().slice(0, 16);
  }

  function providerLabel(provider: string): string {
    return provider === "wechat" ? "微信" : provider === "feishu" ? "飞书" : provider === "qq" ? "QQ" : provider;
  }

  function buildReplyTarget(): AutomationReplyTarget | undefined {
    if (targetChannel === "none") return undefined;
    if (targetChannel === "kb") {
      if (conversationMode === "new") return { kind: "kb-conversation", conversationMode: "new" };
      if (!selectedConversationId) throw new Error("请选择一个本地 AI 对话。");
      return { kind: "kb-conversation", conversationMode: "existing", conversationId: selectedConversationId };
    }
    const option = robotTargets.find((item) => item.conversationId === selectedConversationId);
    const routeRef = conversationMode === "existing" ? option?.routeRef : selectedRobotRoute || option?.routeRef;
    if (!routeRef) throw new Error("请选择接收结果的机器人会话。");
    if (conversationMode === "existing" && !option) throw new Error("请选择一个已有机器人对话。");
    return {
      kind: "robot",
      routeRef,
      conversationMode,
      ...(conversationMode === "existing" ? { conversationId: option!.conversationId } : {}),
    };
  }

  function setTargetChannel(channel: TargetChannel): void {
    targetChannel = channel;
    targetSearch = "";
    if (channel === "none") return;
    if (!base) conversationMode = "new";
    const options = channel === "robot" ? robotTargets : localTargets;
    const selected = options.find((item) => item.conversationId === selectedConversationId);
    if (!selected) selectedConversationId = options[0]?.conversationId ?? "";
    if (channel === "robot" && !selectedRobotRoute) selectedRobotRoute = options[0]?.routeRef ?? "";
  }

  function selectTarget(option: TargetOption): void {
    selectedConversationId = option.conversationId;
    if (option.routeRef) selectedRobotRoute = option.routeRef;
  }

  async function refreshTargets(): Promise<void> {
    targetsLoading = true;
    try {
      const snapshot = await restoreKbChatSessions().catch(() => null);
      localTargets = (snapshot?.conversations ?? []).map((conversation) => ({
        value: conversation.id,
        conversationId: conversation.id,
        label: conversation.title,
        searchText: `${conversation.title} ${conversation.id}`.toLocaleLowerCase(),
        updatedAt: conversation.updatedAt,
      })).sort((a, b) => b.updatedAt - a.updatedAt);
      const kernel = new RobotKernelClient(getPluginKernelPort(getNotebrainPlugin()));
      const nextRobotTargets: TargetOption[] = [];
      if (kernel.available) {
        const client = new RobotSettingsClient(kernel);
        const settings = await client.getSettings();
        activeRobotProvider = settings.activeProvider === "none" ? "" : settings.activeProvider;
        const sessions = await client.getSessions();
        for (const item of sessions) {
          const key = item.key && typeof item.key === "object" ? item.key as Record<string, unknown> : {};
          const provider = typeof key.provider === "string" ? key.provider : "";
          const accountId = typeof key.accountId === "string" ? key.accountId : "";
          const chatId = typeof key.chatId === "string" ? key.chatId : "";
          const senderId = typeof key.senderId === "string" ? key.senderId : undefined;
          const conversationId = typeof item.conversationId === "string" ? item.conversationId : "";
          if (!conversationId || !accountId || !chatId || provider !== activeRobotProvider) continue;
          const routeRef = encodeAutomationRobotRoute({ provider: provider as "wechat" | "feishu" | "qq", accountId, chatId, ...(senderId ? { senderId } : {}) });
          const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "机器人会话";
          const label = `${item.active === true ? "默认 · " : ""}${providerLabel(provider)} · ${title}`;
          const updatedAt = typeof item.lastActivityAt === "number" ? item.lastActivityAt : typeof item.createdAt === "number" ? item.createdAt : 0;
          nextRobotTargets.push({ value: conversationId, conversationId, routeRef, label, searchText: `${label} ${conversationId}`.toLocaleLowerCase(), updatedAt });
        }
      }
      robotTargets = nextRobotTargets.sort((a, b) => b.updatedAt - a.updatedAt);
      const defaultTarget = robotTargets.find((item) => item.label.startsWith("默认 · ")) ?? robotTargets[0];
      if (defaultTarget && (!selectedRobotRoute || !robotTargets.some((item) => item.routeRef === selectedRobotRoute))) selectTarget(defaultTarget);
      if (targetChannel === "robot") {
        const selected = robotTargets.find((item) => item.conversationId === selectedConversationId)
          ?? robotTargets.find((item) => item.routeRef === selectedRobotRoute);
        if (selected) selectTarget(selected);
      }
    } finally {
      targetsLoading = false;
    }
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
      const execution = {
        goal: content.trim(), profileId: targetChannel === "robot" ? "remote-robot" : "knowledge-chat",
        allowedToolNames: [], allowedActionNames: [], memoryAccess: "none" as const, unattendedWritePolicy: "deny" as const,
        budget: source?.task.execution.budget ?? { ...AUTOMATION_DEFAULT_BUDGET },
      };
      const replyTarget = buildReplyTarget();
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
    <fieldset class="target-panel wide">
      <legend>结果发送到</legend>
      <div class="segmented" role="group" aria-label="发送渠道">
        <button type="button" class:active={targetChannel === "none"} onclick={() => setTargetChannel("none")}>仅运行记录</button>
        <button type="button" class:active={targetChannel === "kb"} onclick={() => setTargetChannel("kb")}>本地 AI</button>
        <button type="button" class:active={targetChannel === "robot"} onclick={() => setTargetChannel("robot")}>机器人</button>
      </div>
      {#if targetChannel !== "none"}
        <div class="segmented mode" role="group" aria-label="会话方式">
          <button type="button" class:active={conversationMode === "new"} onclick={() => { conversationMode = "new"; targetSearch = ""; }}>每次新建对话</button>
          <button type="button" class:active={conversationMode === "existing"} onclick={() => conversationMode = "existing"}>选择已有对话</button>
        </div>
        {#if targetChannel === "robot" && !activeRobotProvider}
          <div class="target-empty">请先在机器人助手中启用默认渠道</div>
        {:else if targetChannel === "robot" && robotTargets.length === 0}
          <div class="target-empty">当前默认机器人还没有可用会话</div>
        {:else if conversationMode === "existing"}
          <label class="target-search">
            <span>搜索{targetChannel === "robot" ? "机器人" : "本地"}对话</span>
            <input class="b3-text-field" type="search" bind:value={targetSearch} placeholder="输入标题或会话 ID" />
          </label>
          <div class="target-list" role="listbox" aria-label="选择对话">
            {#if targetsLoading}
              <div class="target-empty">正在读取会话…</div>
            {:else if visibleTargets.length === 0}
              <div class="target-empty">没有找到可用对话</div>
            {:else}
              {#each visibleTargets as option (option.value)}
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedConversationId === option.conversationId}
                  class:selected={selectedConversationId === option.conversationId}
                  onclick={() => selectTarget(option)}
                >
                  <span>{option.label}</span><small>{option.conversationId}</small>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      {/if}
    </fieldset>
  </div>
  {#if error}<div class="error" role="alert">{error}</div>{/if}
  <footer><button type="button" class="b3-button b3-button--cancel" onclick={onCancel}>取消</button><button type="submit" class="b3-button b3-button--text" disabled={saving}>{saving ? "保存中…" : initialJob ? "保存修改" : "创建任务"}</button></footer>
</form>

<style>
  .editor{display:flex;flex:1;min-height:0;flex-direction:column;padding:16px;overflow:auto;box-sizing:border-box}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.form-grid>label{display:flex;flex-direction:column;gap:6px;font-size:12px}.form-grid .wide{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea{box-sizing:border-box;width:100%}.form-grid input:not([type="checkbox"]),.form-grid select{min-height:34px}.target-panel{min-width:0;margin:0;padding:10px 12px;border:1px solid var(--b3-border-color);border-radius:8px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px}.segmented{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:3px;background:var(--b3-theme-background);border-radius:7px}.segmented.mode{grid-template-columns:repeat(2,minmax(0,1fr))}.segmented button{min-height:32px;border:0;border-radius:5px;background:transparent;color:var(--b3-theme-on-surface);cursor:pointer}.segmented button:hover{background:var(--b3-list-hover)}.segmented button.active{background:var(--b3-theme-surface);color:var(--b3-theme-primary);box-shadow:0 1px 3px rgb(0 0 0 / .12)}.target-search{display:flex;flex-direction:column;gap:6px;font-size:12px}.target-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:190px;overflow:auto;padding:2px}.target-list>button{display:flex;min-width:0;min-height:46px;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;padding:7px 10px;border:1px solid var(--b3-border-color);border-radius:7px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);text-align:left;cursor:pointer}.target-list>button:hover{background:var(--b3-list-hover)}.target-list>button.selected{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest)}.target-list span,.target-list small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.target-list small{color:var(--b3-theme-on-surface-light)}.target-empty{grid-column:1/-1;padding:20px;text-align:center;color:var(--b3-theme-on-surface-light)}.error{margin-top:12px;color:var(--b3-theme-error);font-size:12px}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--b3-border-color)}
  @media(max-width:760px){.form-grid{grid-template-columns:1fr}.target-list{grid-template-columns:1fr}.segmented{grid-template-columns:1fr}}
</style>
