<script lang="ts">
  import { showMessage } from "siyuan";
  import Sortable from "sortablejs";
  import { reorderCountdownCategories } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
  import {
    COUNTDOWN_ICON_ALLOWLIST,
    type CountdownCategoryInput,
    type CountdownCategoryRecord,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    categories: CountdownCategoryRecord[];
    onCreate: (input: CountdownCategoryInput) => Promise<void>;
    onUpdate: (
      id: string,
      input: Partial<CountdownCategoryInput>,
    ) => Promise<void>;
    onArchive: (category: CountdownCategoryRecord) => Promise<void>;
    onDelete: (category: CountdownCategoryRecord) => Promise<void>;
  }
  let { categories, onCreate, onUpdate, onArchive, onDelete }: Props = $props();
  let name = $state("");
  let icon = $state<CountdownCategoryRecord["icon"]>("bookmark");
  async function add() {
    if (!name.trim()) {
      showMessage("请输入分类名称", 3000, "error");
      return;
    }
    await onCreate({ name, icon });
    name = "";
  }
  $effect(() => {
    categories.map((item) => item.id).join("|");
    let sortable: Sortable | null = null;
    const timer = setTimeout(() => {
      const element = document.querySelector(
        ".countdown-center-dialog-host .shp-countdown-category-list",
      ) as HTMLElement | null;
      if (element)
        sortable = Sortable.create(element, {
          animation: 140,
          filter: ".virtual",
          onEnd: () => {
            const ids = Array.from(
              element.querySelectorAll<HTMLElement>("[data-category-id]"),
              (item) => item.dataset.categoryId || "",
            ).filter(Boolean);
            void reorderCountdownCategories(ids);
          },
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      sortable?.destroy();
    };
  });
</script>

<div class="shp-countdown-categories">
  <div class="shp-countdown-category-add">
    <input
      class="b3-text-field"
      bind:value={name}
      placeholder="新分类名称"
    /><select class="b3-text-field" bind:value={icon}
      >{#each COUNTDOWN_ICON_ALLOWLIST as value}<option {value}>{value}</option
        >{/each}</select
    ><CountdownIconButton
      name="add"
      label="新增分类"
      onclick={() => void add()}
    />
  </div>
  <div class="shp-countdown-category-list">
    <div class="shp-countdown-category-row virtual">
      <CountdownIcon name="folder" /><strong>未分类</strong><small
        >虚拟分类</small
      >
    </div>
    {#each categories as category (category.id)}<div
        class="shp-countdown-category-row"
        data-category-id={category.id}
        class:archived={category.archived}
      >
        <input
          type="color"
          value={category.color || "#808080"}
          onchange={(event) =>
            void onUpdate(category.id, { color: event.currentTarget.value })}
        /><input
          class="b3-text-field"
          value={category.name}
          onchange={(event) =>
            void onUpdate(category.id, { name: event.currentTarget.value })}
        /><select
          class="b3-text-field"
          value={category.icon}
          onchange={(event) =>
            void onUpdate(category.id, {
              icon: event.currentTarget
                .value as CountdownCategoryRecord["icon"],
            })}
          >{#each COUNTDOWN_ICON_ALLOWLIST as value}<option {value}
              >{value}</option
            >{/each}</select
        ><CountdownIconButton
          name={category.archived ? "archive-restore" : "archive"}
          label={category.archived ? "恢复分类" : "归档分类"}
          onclick={() => void onArchive(category)}
        /><CountdownIconButton
          name="delete"
          label="删除分类"
          danger
          onclick={() => void onDelete(category)}
        />
      </div>{/each}
  </div>
</div>

<style>
  .shp-countdown-categories {
    display: grid;
    gap: 10px;
  }
  .shp-countdown-category-add,
  .shp-countdown-category-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .shp-countdown-category-add input {
    flex: 1;
  }
  .shp-countdown-category-list {
    display: grid;
    gap: 7px;
  }
  .shp-countdown-category-row {
    padding: 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
  }
  .shp-countdown-category-row > .b3-text-field:first-of-type {
    flex: 1;
  }
  .shp-countdown-category-row.archived {
    opacity: 0.6;
  }
  .shp-countdown-category-row.virtual {
    color: var(--b3-theme-on-surface);
  }
  @media (max-width: 600px) {
    .shp-countdown-category-add {
      flex-wrap: wrap;
    }
    .shp-countdown-category-add input {
      flex-basis: 100%;
    }
    .shp-countdown-category-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
    }
    .shp-countdown-category-row select {
      grid-column: 2;
    }
    .shp-countdown-category-row :global(.shp-countdown-icon-button) {
      grid-row: 1/3;
    }
  }
</style>
