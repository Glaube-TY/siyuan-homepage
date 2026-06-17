<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type {
    SelectionAiRect,
    SelectionAiSkill,
  } from "../../services/selection-ai/selection-ai-types";

  export let skills: SelectionAiSkill[];
  export let anchorRect: SelectionAiRect | undefined = undefined;
  export let onSelect: ((skill: SelectionAiSkill) => void) | undefined = undefined;
  export let onClose: (() => void) | undefined = undefined;

  let menuEl: HTMLElement;
  let expanded = false;

  $: directSkills = skills.filter((s) => s.placement === "toolbar").sort((a, b) => a.order - b.order);
  $: foldSkills = skills.filter((s) => s.placement === "menu").sort((a, b) => a.order - b.order);
  $: hasFolds = foldSkills.length > 0;

  $: menuStyle = buildMenuStyle(anchorRect, directSkills.length, hasFolds, expanded);

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function buildMenuStyle(
    rect: SelectionAiRect | undefined,
    directCount: number,
    hasFolds: boolean,
    isExpanded: boolean
  ): string {
    const menuWidth = 180;
    const itemHeight = 36;
    let totalItems = directCount;
    if (hasFolds) totalItems += 1; // "更多技能" toggle
    if (isExpanded) totalItems += foldSkills.length;
    const menuHeight = totalItems * itemHeight + 8;

    let left = 12;
    let top = 12;

    if (rect) {
      left = rect.left;
      top = rect.bottom + 6;
      if (top + menuHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - menuHeight - 6);
      }
    } else {
      left = Math.round(window.innerWidth / 2 - menuWidth / 2);
      top = Math.round(window.innerHeight / 2 - menuHeight / 2);
    }

    left = clamp(left, 8, Math.max(8, window.innerWidth - menuWidth - 8));
    top = clamp(top, 8, Math.max(8, window.innerHeight - menuHeight - 8));
    return `left: ${left}px; top: ${top}px;`;
  }

  function handleSkillClick(skill: SelectionAiSkill): void {
    onSelect?.(skill);
    onClose?.();
  }

  function toggleExpand(): void {
    expanded = !expanded;
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (target && menuEl?.contains(target)) return;
    onClose?.();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onClose?.();
    }
  }

  onMount(() => {
    setTimeout(() => {
      document.addEventListener("pointerdown", handleDocumentPointerDown, true);
      document.addEventListener("keydown", handleKeydown, true);
    }, 0);
  });

  onDestroy(() => {
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    document.removeEventListener("keydown", handleKeydown, true);
  });
</script>

<div
  class="shp-selection-ai-action-menu"
  bind:this={menuEl}
  style={menuStyle}
  role="menu"
  aria-label="AI 操作"
>
  {#each directSkills as skill (skill.id)}
    <button
      type="button"
      class="shp-selection-ai-action-menu__item"
      role="menuitem"
      title={skill.name}
      on:click={() => handleSkillClick(skill)}
    >
      <span class="shp-selection-ai-action-menu__icon">AI</span>
      <span class="shp-selection-ai-action-menu__title">{skill.name}</span>
    </button>
  {/each}

  {#if hasFolds}
    <button
      type="button"
      class="shp-selection-ai-action-menu__item shp-selection-ai-action-menu__toggle"
      role="menuitem"
      on:click={toggleExpand}
    >
      <span class="shp-selection-ai-action-menu__icon">⋯</span>
      <span class="shp-selection-ai-action-menu__title">更多技能</span>
      <span class="shp-selection-ai-action-menu__arrow" class:shp-selection-ai-action-menu__arrow--open={expanded}>▸</span>
    </button>

    {#if expanded}
      {#each foldSkills as skill (skill.id)}
        <button
          type="button"
          class="shp-selection-ai-action-menu__item shp-selection-ai-action-menu__item--fold"
          role="menuitem"
          title={skill.name}
          on:click={() => handleSkillClick(skill)}
        >
          <span class="shp-selection-ai-action-menu__icon">AI</span>
          <span class="shp-selection-ai-action-menu__title">{skill.name}</span>
        </button>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .shp-selection-ai-action-menu {
    position: fixed;
    z-index: 10000;
    min-width: 140px;
    max-width: 200px;
    padding: 4px;
    border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    background: var(--b3-theme-background, #fff);
    color: var(--b3-theme-on-background, #1f2329);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
    font-family: var(--b3-font-family, system-ui, sans-serif);
    font-size: 13px;
    line-height: 1.4;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .shp-selection-ai-action-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    transition: background 0.12s ease;
  }

  .shp-selection-ai-action-menu__item:hover,
  .shp-selection-ai-action-menu__item:focus-visible {
    background: var(--b3-list-hover, rgba(0, 0, 0, 0.06));
  }

  .shp-selection-ai-action-menu__toggle {
    color: var(--b3-theme-on-surface-light, #999);
  }

  .shp-selection-ai-action-menu__arrow {
    margin-left: auto;
    font-size: 11px;
    transition: transform 0.15s ease;
  }

  .shp-selection-ai-action-menu__arrow--open {
    transform: rotate(90deg);
  }

  .shp-selection-ai-action-menu__item--fold {
    padding-left: 22px;
    font-size: 12px;
  }
</style>
