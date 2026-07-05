const DANGEROUS_COMMANDS = new Set([
  "cmd", "cmd.exe", "cmd.com",
  "powershell", "powershell.exe", "pwsh", "pwsh.exe",
  "bash", "sh", "zsh", "fish",
  "wscript", "cscript", "mshta", "reg", "rundll32",
]);

const DANGEROUS_ARGS = new Set([
  "/c", "-c", "-command", "-encodedcommand", "--eval", "-e",
  "rm", "del", "rmdir", "format",
]);

export function isDangerousCommand(command: string, args: string[]): { hardDeny: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const trimmedCmd = command.trim();
  const baseCmd = trimmedCmd
    .toLowerCase()
    .replace(/\.(cmd|exe|com|bat)$/i, "")
    .split(/[\\/]/)
    .pop() ?? "";
  if (DANGEROUS_COMMANDS.has(baseCmd)) {
    reasons.push(`命令 "${command}" 属于高风险 shell/脚本引擎`);
  }

  const lowerArgs = args.map((a) => a.toLowerCase());
  const joined = lowerArgs.join(" ");
  if (lowerArgs.some((arg) => DANGEROUS_ARGS.has(arg))) {
    reasons.push("参数包含高风险执行开关（如 /c, -c, rm, del 等）");
  }
  if (joined.includes("rm -rf") || joined.includes("rm -fr") || joined.includes("rm -r -f")) {
    reasons.push("参数包含递归强制删除（rm -rf）");
  }
  if (/curl\s+.*\|\s*sh/.test(joined) || /wget\s+.*\|\s*sh/.test(joined)) {
    reasons.push("参数包含管道下载并执行 shell 脚本");
  }
  if (/invoke-webrequest|iwr/.test(joined)) {
    reasons.push("参数包含 PowerShell 远程下载执行");
  }

  return { hardDeny: reasons.length > 0, reasons };
}
