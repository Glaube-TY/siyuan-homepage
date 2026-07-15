<script lang="ts">
  import { showMessage } from "siyuan";
  import { getBlockBreadcrumb } from "@/api";
  import {
    COUNTDOWN_EVENT_KINDS,
    COUNTDOWN_ICON_ALLOWLIST,
    COUNTDOWN_KIND_LABELS,
    COUNTDOWN_PRIORITY_LABELS,
    createCountdownEventDraft,
    type CountdownCategoryRecord,
    type CountdownEventInput,
    type CountdownEventKind,
    type CountdownEventRecord,
    type CountdownIconName,
    type CountdownPriority,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
  import type { CountdownEventNotifyOverride } from "@/features/countdown-notify/types";
  import { getLunarYearForSolarDate } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
  import CountdownEventNotifyOverrideEditor from "@/features/countdown-notify/components/CountdownEventNotifyOverrideEditor.svelte";
  import {
    searchDocsForChatAttachment,
    type ChatDocSearchResult,
  } from "@/features/kb/services/siyuan/search-docs-for-chat";
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    event?: CountdownEventRecord;
    categories: CountdownCategoryRecord[];
    mobile: boolean;
    advancedEnabled: boolean;
    notifyOverride?: CountdownEventNotifyOverride;
    notifyError?: string | null;
    notifyDisabled?: boolean;
    onCancel: () => void;
    onSave: (
      draft: CountdownEventInput,
      override: Omit<CountdownEventNotifyOverride, "eventId">,
    ) => Promise<void>;
  }
  let {
    event,
    categories,
    mobile,
    advancedEnabled,
    notifyOverride,
    notifyError = null,
    notifyDisabled = false,
    onCancel,
    onSave,
  }: Props = $props();
  let draft = $state<CountdownEventInput>(createCountdownEventDraft());
  let tags = $state("");
  let saving = $state(false);
  let initialized = $state(false);
  let linkedTitle = $state("");
  let linkedQuery = $state("");
  let linkedSearching = $state(false);
  let linkedResults = $state<ChatDocSearchResult[]>([]);
  let override = $state<Omit<CountdownEventNotifyOverride, "eventId">>({
    mode: "inherit",
    remindOnDay: true,
    advanceDays: [],
    time: "08:00",
    deliveryTargets: [],
    includeInDigest: true,
  });
  const COLOR_INPUT_FALLBACK = "#808080";
  const COLOR_INPUT_PATTERN = /^#[0-9a-f]{6}$/i;
  function getColorInputValue(value: string | undefined): string {
    return value && COLOR_INPUT_PATTERN.test(value)
      ? value
      : COLOR_INPUT_FALLBACK;
  }
  function cloneDraft(
    source: CountdownEventInput | CountdownEventRecord,
  ): CountdownEventInput {
    return {
      ...source,
      tags: [...(source.tags ?? [])],
      lunarDate: source.lunarDate ? { ...source.lunarDate } : undefined,
    };
  }
  function cloneDeliveryTargets(
    targets: CountdownEventNotifyOverride["deliveryTargets"],
  ): CountdownEventNotifyOverride["deliveryTargets"] {
    return targets.map((target) => ({ ...target }));
  }
  $effect(() => {
    if (!initialized) {
      draft = cloneDraft(event ?? createCountdownEventDraft());
      tags = (event?.tags ?? []).join("、");
      override = notifyOverride
        ? {
            mode: notifyOverride.mode,
            remindOnDay: notifyOverride.remindOnDay,
            advanceDays: [...notifyOverride.advanceDays],
            time: notifyOverride.time,
            deliveryTargets: cloneDeliveryTargets(
              notifyOverride.deliveryTargets,
            ),
            includeInDigest: notifyOverride.includeInDigest,
          }
        : {
            mode: "inherit",
            remindOnDay: true,
            advanceDays: [],
            time: "08:00",
            deliveryTargets: [],
            includeInDigest: true,
          };
      initialized = true;
      if (draft.linkedBlockId) void resolveLinkedTitle(draft.linkedBlockId);
    }
  });
  async function resolveLinkedTitle(blockId: string): Promise<void> {
    const expected = blockId;
    try {
      const breadcrumb = await getBlockBreadcrumb(blockId);
      const nodes = Array.isArray(breadcrumb) ? breadcrumb : [];
      const current = nodes.at(-1);
      const title = String(
        current?.name || current?.content || current?.title || "",
      ).trim();
      if (draft.linkedBlockId === expected) linkedTitle = title || blockId;
    } catch {
      if (draft.linkedBlockId === expected) linkedTitle = blockId;
    }
  }
  async function searchLinkedDocuments(): Promise<void> {
    const query = linkedQuery.trim();
    if (!query) {
      linkedResults = [];
      return;
    }
    linkedSearching = true;
    try {
      linkedResults = await searchDocsForChatAttachment(query, 12);
    } finally {
      linkedSearching = false;
    }
  }
  function selectLinkedDocument(result: ChatDocSearchResult): void {
    draft = { ...draft, linkedBlockId: result.docId };
    linkedTitle = result.title || result.docId;
    linkedResults = [];
    linkedQuery = "";
  }
  function clearLinkedBlock(): void {
    draft = { ...draft, linkedBlockId: undefined };
    linkedTitle = "";
    linkedResults = [];
  }
  function chooseKind(kind: CountdownEventKind): void {
    draft = {
      ...draft,
      kind,
      recurrence:
        kind === "birthday" || kind === "anniversary"
          ? "yearly"
          : draft.recurrence,
      icon: (
        {
          birthday: "cake",
          anniversary: "heart",
          deadline: "flag",
          expiration: "clock",
          milestone: "target",
          subscription: "credit-card",
          custom: "calendar",
        } as Record<CountdownEventKind, CountdownIconName>
      )[kind],
    };
  }
  async function submit(): Promise<void> {
    if (!draft.name?.trim()) {
      showMessage("请输入纪念日名称", 3000, "error");
      return;
    }
    if (draft.calendar === "solar" && !draft.date) {
      showMessage("请选择公历日期", 3000, "error");
      return;
    }
    if (
      draft.calendar === "lunar" &&
      (!draft.lunarDate?.year || !draft.lunarDate.month || !draft.lunarDate.day)
    ) {
      showMessage("请填写完整农历日期", 3000, "error");
      return;
    }
    if (
      advancedEnabled &&
      !notifyDisabled &&
      override.mode === "custom" &&
      !override.deliveryTargets.length
    ) {
      showMessage("自定义提醒至少选择一种通知方式", 4000, "error");
      return;
    }
    saving = true;
    try {
      await onSave(
        {
          ...draft,
          tags: tags
            .split(/[、,，]/)
            .map((value) => value.trim())
            .filter(Boolean),
        },
        override,
      );
    } finally {
      saving = false;
    }
  }
  function ensureLunar(): void {
    if (!draft.lunarDate) {
      const now = new Date();
      draft = {
        ...draft,
        lunarDate: {
          year: getLunarYearForSolarDate(now) ?? now.getFullYear(),
          month: 1,
          day: 1,
          isLeapMonth: false,
        },
      };
    }
  }
</script>

<aside class="shp-countdown-editor" class:mobile>
  <header>
    <CountdownIconButton name="arrow-left" label="返回" onclick={onCancel} />
    <div>
      <strong>{event ? "编辑纪念日" : "新增纪念日"}</strong><small
        >{event
          ? "修改会同步到所有纪念日组件"
          : "创建后自动进入统一事件库"}</small
      >
    </div>
  </header>
  <div class="shp-countdown-editor-body">
    <section>
      <h3>基础信息</h3>
      <label
        ><span>名称</span><input
          class="b3-text-field"
          maxlength="120"
          bind:value={draft.name}
          placeholder="例如：妈妈生日"
        /></label
      >
      <div class="shp-countdown-editor-kinds">
        {#each COUNTDOWN_EVENT_KINDS as kind}<button
            type="button"
            class:active={draft.kind === kind}
            onclick={() => chooseKind(kind)}
            ><CountdownIcon
              name={(
                {
                  birthday: "cake",
                  anniversary: "heart",
                  deadline: "flag",
                  expiration: "clock",
                  milestone: "target",
                  subscription: "credit-card",
                  custom: "calendar",
                } as Record<CountdownEventKind, CountdownIconName>
              )[kind]}
            />{COUNTDOWN_KIND_LABELS[kind]}</button
          >{/each}
      </div>
      <label
        ><span>图标</span><select class="b3-text-field" bind:value={draft.icon}
          >{#each COUNTDOWN_ICON_ALLOWLIST as icon}<option value={icon}
              >{icon}</option
            >{/each}</select
        ></label
      ><label
        ><span>强调色</span><input
          type="color"
          value={getColorInputValue(draft.color)}
          onchange={(event) =>
            (draft = { ...draft, color: event.currentTarget.value })}
        /></label
      ><label
        ><span>分类</span><select
          class="b3-text-field"
          bind:value={draft.categoryId}
          ><option value="">未分类</option>{#each categories as category}<option
              value={category.id}>{category.name}</option
            >{/each}</select
        ></label
      ><label
        ><span>标签</span><input
          class="b3-text-field"
          bind:value={tags}
          placeholder="用逗号分隔"
        /></label
      ><label
        ><span>优先级</span><select
          class="b3-text-field"
          bind:value={draft.priority}
          >{#each ["high", "normal", "low"] as priority}<option value={priority}
              >{COUNTDOWN_PRIORITY_LABELS[
                priority as CountdownPriority
              ]}</option
            >{/each}</select
        ></label
      >
    </section>
    <section>
      <h3>日期设置</h3>
      <div class="shp-countdown-editor-segment">
        <button
          type="button"
          class:active={draft.calendar !== "lunar"}
          onclick={() => (draft = { ...draft, calendar: "solar" })}>公历</button
        ><button
          type="button"
          class:active={draft.calendar === "lunar"}
          onclick={() => {
            ensureLunar();
            draft = { ...draft, calendar: "lunar" };
          }}>农历</button
        >
      </div>
      <div class="shp-countdown-editor-segment">
        <button
          type="button"
          class:active={draft.recurrence !== "yearly"}
          onclick={() => (draft = { ...draft, recurrence: "none" })}
          >一次性</button
        ><button
          type="button"
          class:active={draft.recurrence === "yearly"}
          onclick={() => (draft = { ...draft, recurrence: "yearly" })}
          >每年重复</button
        >
      </div>
      {#if draft.calendar === "lunar"}{@const lunar = draft.lunarDate!}
        <div class="shp-countdown-editor-lunar">
          <input
            class="b3-text-field"
            type="number"
            min="1900"
            max="2200"
            value={lunar.year}
            onchange={(e) =>
              (draft = {
                ...draft,
                lunarDate: { ...lunar, year: Number(e.currentTarget.value) },
              })}
          /><input
            class="b3-text-field"
            type="number"
            min="1"
            max="12"
            value={lunar.month}
            onchange={(e) =>
              (draft = {
                ...draft,
                lunarDate: { ...lunar, month: Number(e.currentTarget.value) },
              })}
          /><input
            class="b3-text-field"
            type="number"
            min="1"
            max="30"
            value={lunar.day}
            onchange={(e) =>
              (draft = {
                ...draft,
                lunarDate: { ...lunar, day: Number(e.currentTarget.value) },
              })}
          /><label
            ><input
              type="checkbox"
              class="b3-switch fn__flex-center"
              checked={lunar.isLeapMonth}
              onchange={(e) =>
                (draft = {
                  ...draft,
                  lunarDate: { ...lunar, isLeapMonth: e.currentTarget.checked },
                })}
            />闰月</label
          >
        </div>
        {#if draft.recurrence === "yearly"}<label
            ><span>闰月策略</span><select
              class="b3-text-field"
              bind:value={draft.lunarLeapMonthPolicy}
              ><option value="exact">仅对应闰月</option><option
                value="regular-fallback">回退普通月份</option
              ></select
            ></label
          ><label
            ><span>缺失日期</span><select
              class="b3-text-field"
              bind:value={draft.lunarMissingDayPolicy}
              ><option value="last-day">使用月末</option><option value="skip"
                >跳过当年</option
              ></select
            ></label
          >{/if}{:else}<label
          ><span>公历日期</span><input
            type="date"
            class="b3-text-field"
            bind:value={draft.date}
          /></label
        >{#if draft.recurrence === "yearly" && draft.date?.endsWith("-02-29")}<label
            ><span>非闰年</span><select
              class="b3-text-field"
              bind:value={draft.solarLeapDayPolicy}
              ><option value="feb28">2 月 28 日</option><option value="mar1"
                >3 月 1 日</option
              ><option value="skip">跳过</option></select
            ></label
          >{/if}{/if}{#if draft.recurrence === "yearly"}<label
          ><span>计数显示</span><select
            class="b3-text-field"
            bind:value={draft.countLabelMode}
            ><option value="auto">自动</option><option value="anniversary"
              >周年次数</option
            ><option value="age">年龄</option><option value="none"
              >不显示</option
            ></select
          ></label
        >{/if}
    </section>
    <section>
      <h3>详情</h3>
      <label class="vertical"
        ><span>备注</span><textarea
          class="b3-text-field"
          maxlength="2000"
          rows="4"
          bind:value={draft.note}
        ></textarea></label
      >
      <div class="shp-countdown-editor-linked">
        <span>关联思源文档或块</span>
        {#if draft.linkedBlockId}<div
            class="shp-countdown-editor-linked-current"
          >
            <strong>{linkedTitle || draft.linkedBlockId}</strong><small
              >{draft.linkedBlockId}</small
            ><button type="button" onclick={clearLinkedBlock}>清除</button>
          </div>{/if}
        <div class="shp-countdown-editor-linked-search">
          <input
            class="b3-text-field"
            bind:value={linkedQuery}
            placeholder="输入文档标题后搜索"
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void searchLinkedDocuments();
              }
            }}
          /><button
            type="button"
            disabled={linkedSearching}
            onclick={() => void searchLinkedDocuments()}
            >{linkedSearching ? "搜索中…" : "选择文档"}</button
          >
        </div>
        {#if linkedResults.length}<div
            class="shp-countdown-editor-linked-results"
          >
            {#each linkedResults as result (result.docId)}<button
                type="button"
                onclick={() => selectLinkedDocument(result)}
                ><strong>{result.title || "未命名文档"}</strong><small
                  >{result.path || result.docId}</small
                ></button
              >{/each}
          </div>{/if}
        <details>
          <summary>直接填写块 ID</summary><input
            class="b3-text-field"
            value={draft.linkedBlockId || ""}
            placeholder="20260715120000-abcdefg"
            onchange={(event) => {
              const value = event.currentTarget.value.trim();
              draft = { ...draft, linkedBlockId: value || undefined };
              linkedTitle = "";
              if (value) void resolveLinkedTitle(value);
            }}
          />
        </details>
      </div>
      {#if draft.recurrence !== "yearly"}<label
          ><span>过期策略</span><select
            class="b3-text-field"
            bind:value={draft.pastBehavior}
            ><option value="keep">保留并显示已过去</option><option
              value="auto-archive">安全维护时自动归档</option
            ></select
          ></label
        >{/if}
    </section>
    <section>
      <h3>提醒</h3>
      {#if advancedEnabled}{#if notifyError}<div
            class="shp-countdown-editor-notify-error"
          >
            <strong>提醒设置读取失败</strong><span>{notifyError}</span><small
              >事件其他内容仍可保存，本次不会修改提醒设置。</small
            >
          </div>{:else}<CountdownEventNotifyOverrideEditor
            value={override}
            disabled={notifyDisabled}
            onChange={(value) => (override = value)}
          />{/if}
        {:else}<div class="shp-countdown-editor-locked">
          <strong>纪念日通知为 VIP 专属</strong><span
            >开通后可使用桌面、手机和外联提醒。事件其他字段仍可正常保存。</span
          >
        </div>{/if}
    </section>
  </div>
  <footer>
    <button type="button" class="b3-button b3-button--cancel" onclick={onCancel}
      >取消</button
    ><button
      type="button"
      class="b3-button b3-button--text"
      disabled={saving}
      onclick={() => void submit()}>{saving ? "保存中…" : "保存纪念日"}</button
    >
  </footer>
</aside>

<style>
  .shp-countdown-editor {
    position: absolute;
    inset: 0 0 0 auto;
    width: min(520px, 100%);
    z-index: 5;
    display: flex;
    flex-direction: column;
    background: var(--b3-theme-background);
    border-left: 1px solid var(--b3-border-color);
    box-shadow: -4px 0 14px
      color-mix(in srgb, var(--b3-theme-on-background) 8%, transparent);
  }
  .shp-countdown-editor.mobile {
    width: 100%;
    border-left: 0;
  }
  .shp-countdown-editor header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-bottom: 1px solid var(--b3-border-color);
  }
  .shp-countdown-editor header div {
    display: grid;
  }
  .shp-countdown-editor header small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: grid;
    gap: 14px;
  }
  .shp-countdown-editor section {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 9px;
  }
  .shp-countdown-editor h3 {
    margin: 0;
    font-size: 14px;
  }
  .shp-countdown-editor label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .shp-countdown-editor label > span {
    font-size: 13px;
  }
  .shp-countdown-editor label > .b3-text-field {
    width: 65%;
    max-width: 270px;
  }
  .shp-countdown-editor label.vertical {
    align-items: stretch;
    flex-direction: column;
  }
  .shp-countdown-editor label.vertical > .b3-text-field {
    width: 100%;
    max-width: none;
  }
  .shp-countdown-editor-kinds {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .shp-countdown-editor-kinds button,
  .shp-countdown-editor-segment button {
    min-height: 42px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: transparent;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .shp-countdown-editor-kinds button.active,
  .shp-countdown-editor-segment button.active {
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
  }
  .shp-countdown-editor-segment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .shp-countdown-editor-lunar {
    display: grid;
    grid-template-columns: repeat(3, 1fr) auto;
    gap: 6px;
    align-items: center;
  }
  .shp-countdown-editor-locked {
    display: grid;
    gap: 5px;
    padding: 10px;
    border-radius: 8px;
    background: var(--b3-theme-surface);
  }
  .shp-countdown-editor-notify-error {
    display: grid;
    gap: 5px;
    padding: 10px;
    border-radius: 8px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-error);
  }
  .shp-countdown-editor-notify-error span,
  .shp-countdown-editor-notify-error small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-editor-locked span {
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }
  .shp-countdown-editor-linked {
    display: grid;
    gap: 7px;
  }
  .shp-countdown-editor-linked > span {
    font-size: 13px;
  }
  .shp-countdown-editor-linked-current,
  .shp-countdown-editor-linked-search {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .shp-countdown-editor-linked-current {
    padding: 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
  }
  .shp-countdown-editor-linked-current strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .shp-countdown-editor-linked-current small {
    flex: 1;
    min-width: 0;
    color: var(--b3-theme-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .shp-countdown-editor-linked button {
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: transparent;
    color: inherit;
  }
  .shp-countdown-editor-linked-search input {
    flex: 1;
    min-width: 0;
  }
  .shp-countdown-editor-linked-results {
    display: grid;
    gap: 5px;
    max-height: 190px;
    overflow: auto;
  }
  .shp-countdown-editor-linked-results button {
    display: grid;
    justify-items: start;
    height: auto;
    min-height: 46px;
    text-align: left;
  }
  .shp-countdown-editor-linked-results small,
  .shp-countdown-editor-linked details {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-editor-linked details input {
    width: 100%;
    margin-top: 6px;
  }
  .shp-countdown-editor footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--b3-border-color);
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  @media (max-width: 380px) {
    .shp-countdown-editor-kinds {
      grid-template-columns: repeat(2, 1fr);
    }
    .shp-countdown-editor label {
      align-items: stretch;
      flex-direction: column;
    }
    .shp-countdown-editor label > .b3-text-field {
      width: 100%;
      max-width: none;
    }
  }
</style>
