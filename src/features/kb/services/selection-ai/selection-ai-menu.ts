import { showMessage } from "siyuan";
import type { IMenuItem, Protyle } from "siyuan";
import { emitSelectionAskPayload } from "./selection-ai-chat-bridge";
import { openSelectionAiPopup } from "./selection-ai-popup-controller";
import { openSelectionAiActionMenu } from "./selection-ai-action-menu-controller";
import { captureSelectionAiContext, applySelectionAiSkillTextLimit } from "./selection-ai-selection";
import { getRecentSelectionAiToolbarAnchorRect } from "./selection-ai-toolbar-pointer-tracker";
import type { SelectionAiAction, SelectionAiContext, SelectionAiRect, SelectionAiSkill, SelectionAiToolbarSettings } from "./selection-ai-types";

const TOOLBAR_MENU_NAME = "shp-selection-ai-menu";
const TOOLBAR_ACTION_NAME_PREFIX = "shp-selection-ai-";

export interface SelectionAiPluginHost {
  openKbDock?: () => void | Promise<boolean>;
  ADVANCED?: boolean;
}

function getEnabledSkills(settings: SelectionAiToolbarSettings): SelectionAiSkill[] {
  return settings.skills
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
}

function ensureSelectionContext(
  protyle: Protyle,
  settings: SelectionAiToolbarSettings
): SelectionAiContext | null {
  const context = captureSelectionAiContext(protyle, settings);
  if (!context) {
    showMessage("请先选择一段文字", 3000);
    return null;
  }
  return context;
}

async function handleAskAction(
  plugin: SelectionAiPluginHost,
  context: SelectionAiContext,
  skill?: SelectionAiSkill
): Promise<void> {
  if (plugin.ADVANCED !== true) {
    showMessage("编辑器工具栏 AI 是会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
    return;
  }

  const opened = await plugin.openKbDock?.();
  if (opened !== true) return;

  emitSelectionAskPayload({
    selectedText: context.selectedText,
    originalSelectedText: context.originalSelectedText,
    truncated: context.truncated,
    docId: context.docId,
    blockId: context.blockId,
    docTitle: context.docTitle,
    documentText: context.documentText,
    selectionStartInDocument: context.selectionStartInDocument,
    createdAt: Date.now(),
    skill,
  }, "dock");
}

function runSelectionActionWithContext(options: {
  skill: SelectionAiSkill;
  plugin: SelectionAiPluginHost;
  context: SelectionAiContext;
  settings: SelectionAiToolbarSettings;
  anchorRect?: SelectionAiRect;
}): void {
  if (options.plugin.ADVANCED !== true) {
    showMessage("编辑器工具栏 AI 是会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
    return;
  }

  const { skill } = options;
  const context = applySelectionAiSkillTextLimit(options.context, skill);

  // 内置 ask 技能走侧边栏
  if (skill.builtInAction === "ask") {
    void handleAskAction(options.plugin, context, skill);
    return;
  }

  // 内置技能使用 builtInAction，自定义技能使用 skillId
  const action: SelectionAiAction = skill.builtInAction ?? "explain";

  openSelectionAiPopup({
    request: {
      action,
      context,
      skillId: skill.id,
    },
    settings: options.settings,
    anchorRect: options.anchorRect ?? context.selectionRect,
    advancedEnabled: options.plugin.ADVANCED === true,
  });
}

export function openSelectionAiMenu(options: {
  plugin: SelectionAiPluginHost;
  protyle: Protyle;
  settings: SelectionAiToolbarSettings;
}): void {
  if (options.plugin.ADVANCED !== true) {
    showMessage("编辑器工具栏 AI 是会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
    return;
  }

  const enabledSkills = getEnabledSkills(options.settings);
  if (enabledSkills.length === 0) {
    showMessage("未启用任何选区 AI 操作", 3000);
    return;
  }

  const context = ensureSelectionContext(options.protyle, options.settings);
  if (!context) return;

  // 优先跟随 AI 工具栏按钮位置，fallback 到选区位置
  const toolbarAnchorRect = getRecentSelectionAiToolbarAnchorRect();
  const anchorRect = toolbarAnchorRect ?? context.selectionRect;

  // 使用自定义技能选择菜单，不再依赖 siyuan Menu
  openSelectionAiActionMenu({
    skills: enabledSkills,
    anchorRect,
    onSelect: (skill) => {
      runSelectionActionWithContext({
        skill,
        plugin: options.plugin,
        context,
        settings: options.settings,
        anchorRect,
      });
    },
  });
}

export function createSelectionAiToolbarItems(options: {
  plugin: SelectionAiPluginHost;
  settings: SelectionAiToolbarSettings;
}): Array<string | IMenuItem> {
  return [
    "|",
    {
      name: TOOLBAR_MENU_NAME,
      icon: "iconSparkles",
      tip: "AI",
      tipPosition: "n",
      click: (protyle: Protyle) => {
        openSelectionAiMenu({ ...options, protyle });
      },
    },
  ];
}

export function hasSelectionAiToolbarItem(toolbar: Array<string | IMenuItem>): boolean {
  return toolbar.some((item) => {
    if (typeof item === "string") return false;
    return item.name === TOOLBAR_MENU_NAME || item.name?.startsWith(TOOLBAR_ACTION_NAME_PREFIX);
  });
}

function isSelectionAiToolbarItem(item: string | IMenuItem): boolean {
  if (typeof item === "string") return false;
  return item.name === TOOLBAR_MENU_NAME || item.name?.startsWith(TOOLBAR_ACTION_NAME_PREFIX);
}

export function removeSelectionAiToolbarItems(toolbar: Array<string | IMenuItem>): Array<string | IMenuItem> {
  // 原地清理：从后往前遍历，安全移除本插件 item 及其前面的分隔符
  for (let i = toolbar.length - 1; i >= 0; i--) {
    if (isSelectionAiToolbarItem(toolbar[i])) {
      // 如果前一个元素是 "|"，也移除
      if (i > 0 && toolbar[i - 1] === "|") {
        toolbar.splice(i - 1, 2);
      } else {
        toolbar.splice(i, 1);
      }
    }
  }
  return toolbar;
}
