# Copyright (c) 2024 by frostime. All Rights Reserved.
# @Author       : frostime
# @Date         : 2024-09-06 19:15:53
# @FilePath     : /scripts/elevate.ps1
# @LastEditTime : 2024-09-06 19:39:13
# @Description  : Force to elevate the script to admin privilege.

param (
    [string]$scriptPath
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDir = Split-Path -Parent $scriptDir

$envNamesToPreserve = @(
    "SIYUAN_PLUGIN_DIR",
    "SIYUAN_API_TOKEN",
    "SIYUAN_TOKEN",
    "SIYUAN_AUTH_TOKEN",
    "SIYUAN_API_TOKEN_FILE"
)

function ConvertTo-SingleQuotedPowerShellLiteral {
    param (
        [string]$value
    )
    return "'" + ($value -replace "'", "''") + "'"
}

if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    $commandLines = @(
        '$ErrorActionPreference = "Stop"'
    )
    foreach ($name in $envNamesToPreserve) {
        $value = [Environment]::GetEnvironmentVariable($name, "Process")
        if ($null -ne $value -and $value -ne "") {
            $commandLines += ('$env:' + $name + ' = ' + (ConvertTo-SingleQuotedPowerShellLiteral $value))
        }
    }
    $commandLines += ('& ' + (ConvertTo-SingleQuotedPowerShellLiteral $MyInvocation.MyCommand.Path) + ' -scriptPath ' + (ConvertTo-SingleQuotedPowerShellLiteral $scriptPath))
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(($commandLines -join [Environment]::NewLine)))
    $args = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCommand"
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args -WorkingDirectory $projectDir
    exit
}

Set-Location -Path $projectDir
& node $scriptPath

pause
