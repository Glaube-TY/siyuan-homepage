import type { ChatActionMenuItem } from "./types";

export function renderChatActionMainMenu(): string {
  return [
    "机器助手可用命令：",
    "",
    "1. 直接发送任意内容：选择记录快速笔记或创建今日任务",
    "2. 今日任务：查看今日任务",
    "3. 逾期任务：查看逾期任务",
    "4. 帮助：查看完整使用说明",
  ].join("\n");
}

export function renderChatActionContentMenu(actions: ChatActionMenuItem[]): string {
  return [
    "请选择要执行的操作：",
    "",
    ...actions.map((item) => `${item.index}. ${item.label}`),
    "",
    "请直接回复数字。",
  ].join("\n");
}

export function renderQuickNoteSuccessWithHint(_content: string): string {
  return "已记录到快速笔记。";
}

export function renderHelpText(): string {
  return [
    "使用方法：",
    "",
    "* 发送任意文字，机器人会返回操作菜单。",
    "* 回复 1：记录为快速笔记。",
    "* 回复 2：创建为今日任务。",
    "* 发送「今日任务」：查看今日任务。",
    "* 发送「逾期任务」：查看逾期任务。",
    "* 发送「菜单」：查看可用命令。",
    "* 回复 0：取消当前操作。",
    "",
    "注意：菜单有效期有限，过期后请重新发送内容。",
  ].join("\n");
}
