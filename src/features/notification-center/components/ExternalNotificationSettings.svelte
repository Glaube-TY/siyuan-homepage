<script lang="ts">
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import { createNotificationExternalChannelId } from "../notification-center-settings-store";
  import type { NotificationCenterSettings, NotificationExternalChannel } from "../types";
  interface Props { value: NotificationCenterSettings["external"]; disabled?: boolean; onChange: (value: NotificationCenterSettings["external"]) => void; onTest: (channelId: string) => void; }
  let { value, disabled = false, onChange, onTest }: Props = $props();
  const patch = (next: Partial<NotificationCenterSettings["external"]>) => onChange({ ...value, ...next });
  function add(type: "webhook" | "feishu"): void {
    const now = new Date().toISOString();
    const base = { id: createNotificationExternalChannelId(type), title: type === "feishu" ? "飞书机器人" : "Webhook", enabled: true, createdAt: now, updatedAt: now, timeoutMs: 10000 };
    const channel: NotificationExternalChannel = type === "feishu"
      ? { ...base, type, webhookUrl: "", secret: "", messageFormat: "text" }
      : { ...base, type, method: "POST", url: "", bodyTemplateMode: "default" };
    patch({ channels: [...value.channels, channel] });
  }
  function update(id: string, next: Partial<NotificationExternalChannel>): void {
    patch({ channels: value.channels.map((channel) => channel.id === id ? { ...channel, ...next, updatedAt: new Date().toISOString() } as NotificationExternalChannel : channel) });
  }
  function remove(id: string): void { patch({ channels: value.channels.filter((channel) => channel.id !== id), defaultChannelIds: value.defaultChannelIds.filter((item) => item !== id) }); }
  function toggleDefault(id: string, checked: boolean): void { patch({ defaultChannelIds: checked ? [...new Set([...value.defaultChannelIds, id])] : value.defaultChannelIds.filter((item) => item !== id) }); }
  function updateHeaders(channel: NotificationExternalChannel, text: string): void {
    if (channel.type !== "webhook") return;
    try { const parsed = text.trim() ? JSON.parse(text) : undefined; update(channel.id, { headers: parsed }); } catch { /* 输入未完成时不覆盖 */ }
  }
</script>
<SettingSection title="外联通知">
  <SettingRow title="开启外联通知" description="投递业务模块传入的标题、正文和结构化参数">
    <input type="checkbox" class="b3-switch fn__flex-center" checked={value.enabled} {disabled} onchange={(e) => patch({ enabled: e.currentTarget.checked })} />
  </SettingRow>
  <SettingRow title="按渠道限流" description="限制同一渠道的连续发送频率">
    <input type="checkbox" class="b3-switch fn__flex-center" checked={value.rateLimit.enabled} {disabled} onchange={(e) => patch({ rateLimit: { ...value.rateLimit, enabled: e.currentTarget.checked } })} />
  </SettingRow>
  <SettingRow title="最小发送间隔" description="同一渠道两次发送之间的最短间隔，单位为毫秒">
    <input type="number" class="b3-text-field control-sm" min="0" max="60000" value={value.rateLimit.minIntervalMs} {disabled} onchange={(e) => patch({ rateLimit: { ...value.rateLimit, minIntervalMs: Number(e.currentTarget.value) } })} />
  </SettingRow>
  <SettingRow title="内存去重" description="在指定时间窗口内忽略重复通知">
    <input type="checkbox" class="b3-switch fn__flex-center" checked={value.dedupe.enabled} {disabled} onchange={(e) => patch({ dedupe: { ...value.dedupe, enabled: e.currentTarget.checked } })} />
  </SettingRow>
  <SettingRow title="去重窗口" description="重复通知判定窗口，单位为毫秒">
    <input type="number" class="b3-text-field control-sm" min="1000" max="3600000" value={value.dedupe.windowMs} {disabled} onchange={(e) => patch({ dedupe: { ...value.dedupe, windowMs: Number(e.currentTarget.value) } })} />
  </SettingRow>
  <SettingRow title="通知渠道" description="Webhook 和飞书只负责接收业务模块传入的通知内容">
    <div class="shp-notification-channel-actions">
      <button type="button" class="b3-button b3-button--text" {disabled} onclick={() => add("webhook")}>添加 Webhook</button>
      <button type="button" class="b3-button b3-button--text" {disabled} onclick={() => add("feishu")}>添加飞书</button>
    </div>
  </SettingRow>
  {#each value.channels as channel (channel.id)}
    <div class="shp-notification-channel-card">
      <div class="shp-notification-channel-header">
        <div><strong>{channel.title}</strong><span>{channel.type === "feishu" ? "飞书" : "Webhook"}</span></div>
        <div class="shp-notification-channel-switches">
          <label><span>启用</span><input type="checkbox" class="b3-switch fn__flex-center" checked={channel.enabled} {disabled} onchange={(e) => update(channel.id, { enabled: e.currentTarget.checked })} /></label>
          <label><span>默认渠道</span><input type="checkbox" class="b3-switch fn__flex-center" checked={value.defaultChannelIds.includes(channel.id)} {disabled} onchange={(e) => toggleDefault(channel.id, e.currentTarget.checked)} /></label>
        </div>
      </div>
      <SettingRow title="名称" description="用于在通知目标中识别此渠道">
        <input class="b3-text-field control-lg" value={channel.title} {disabled} onchange={(e) => update(channel.id, { title: e.currentTarget.value })} />
      </SettingRow>
      <SettingRow title="超时" description="等待渠道响应的最长时间，单位为毫秒">
        <input type="number" class="b3-text-field control-sm" min="1000" max="60000" value={channel.timeoutMs ?? 10000} {disabled} onchange={(e) => update(channel.id, { timeoutMs: Number(e.currentTarget.value) })} />
      </SettingRow>
      {#if channel.type === "webhook"}
        <SettingRow title="Webhook 地址" description="地址会加密保存，不会以明文写入设置文件">
          <input type="password" class="b3-text-field control-lg" value={channel.url} {disabled} onchange={(e) => update(channel.id, { url: e.currentTarget.value })} />
        </SettingRow>
        <SettingRow title="Headers JSON" description="输入后整体替换；为保护密钥，现有值不会回显">
          <textarea class="b3-text-field control-full shp-notification-textarea" {disabled} placeholder={Object.keys(channel.headers ?? {}).length > 0 ? `已配置：${Object.keys(channel.headers ?? {}).join(", ")}` : "{\n  \"Authorization\": \"Bearer ...\"\n}"} onchange={(e) => updateHeaders(channel, e.currentTarget.value)}></textarea>
        </SettingRow>
        <SettingRow title="载荷模板" description="选择默认载荷或自定义 JSON 模板">
          <select class="b3-text-field control-md" value={channel.bodyTemplateMode ?? "default"} {disabled} onchange={(e) => update(channel.id, { bodyTemplateMode: e.currentTarget.value as "default" | "customJson" })}><option value="default">默认 JSON</option><option value="customJson">自定义 JSON</option></select>
        </SettingRow>
        {#if channel.bodyTemplateMode === "customJson"}<SettingRow title="JSON 模板" description="使用现有外联通知模板变量生成请求正文"><textarea class="b3-text-field control-full shp-notification-textarea" value={channel.customJsonTemplate ?? ""} {disabled} onchange={(e) => update(channel.id, { customJsonTemplate: e.currentTarget.value })}></textarea></SettingRow>{/if}
      {:else}
        <SettingRow title="飞书 Webhook" description="地址会加密保存，不会以明文写入设置文件"><input type="password" class="b3-text-field control-lg" value={channel.webhookUrl} {disabled} onchange={(e) => update(channel.id, { webhookUrl: e.currentTarget.value })} /></SettingRow>
        <SettingRow title="签名密钥" description="密钥会加密保存，不会以明文写入设置文件"><input type="password" class="b3-text-field control-lg" value={channel.secret ?? ""} {disabled} onchange={(e) => update(channel.id, { secret: e.currentTarget.value })} /></SettingRow>
        <SettingRow title="消息格式" description="选择飞书机器人接收的消息格式"><select class="b3-text-field control-md" value={channel.messageFormat ?? "text"} {disabled} onchange={(e) => update(channel.id, { messageFormat: e.currentTarget.value as "text" | "post" })}><option value="text">文本</option><option value="post">富文本</option></select></SettingRow>
      {/if}
      <div class="shp-notification-channel-footer"><button type="button" class="b3-button b3-button--text" disabled={disabled || !value.enabled || !channel.enabled} onclick={() => onTest(channel.id)}>测试</button><button type="button" class="b3-button b3-button--cancel shp-notification-danger-button" {disabled} onclick={() => remove(channel.id)}>删除</button></div>
    </div>
  {/each}
</SettingSection>

<style>
  .shp-notification-channel-actions, .shp-notification-channel-footer, .shp-notification-channel-switches { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
  .shp-notification-channel-card { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; }
  .shp-notification-channel-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 8px 8px; }
  .shp-notification-channel-header > div:first-child { display: grid; gap: 2px; }
  .shp-notification-channel-header span { color: var(--b3-theme-on-surface); font-size: 12px; }
  .shp-notification-channel-switches label { display: flex; align-items: center; gap: 6px; }
  .shp-notification-channel-footer { padding-top: 8px; }
  .shp-notification-danger-button { color: var(--b3-theme-error); }
  .shp-notification-textarea { min-height: 80px; resize: vertical; box-sizing: border-box; }
  @media (max-width: 480px) { .shp-notification-channel-header { align-items: flex-start; flex-direction: column; } .shp-notification-channel-actions, .shp-notification-channel-footer, .shp-notification-channel-switches { justify-content: flex-start; } }
</style>
