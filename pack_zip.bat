@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM 生成时间戳 (格式: YYYYMMDDHHmmss)
for /f %%a in ('powershell -Command "Get-Date -Format 'yyyyMMddHHmmss'"') do set "timestamp=%%a"

REM ============================================
REM 自动收集当前目录下所有文件和文件夹
REM 排除 .git 目录、本脚本自身以及 .gitignore 中列出的条目
REM ============================================

set "OUTPUT_ZIP=%timestamp%.zip"

echo 输出文件: %OUTPUT_ZIP%
echo.

powershell -Command "$ignorePatterns = @('.git', 'pack_zip.bat', '*.zip'); if (Test-Path '.gitignore') { $ignorePatterns += (Get-Content '.gitignore' | Where-Object { $_ -and $_ -notmatch '^\s*#' } | ForEach-Object { $_.Trim() -replace '/$','' }) }; $files = Get-ChildItem -Force | Where-Object { $name = $_.Name; $ignored = $false; foreach ($p in $ignorePatterns) { if ($name -like $p) { $ignored = $true; break } }; -not $ignored }; if ($files.Count -eq 0) { Write-Host '[错误] 未找到需要打包的文件！'; exit 1 }; Write-Host '正在打包以下文件:'; $files | ForEach-Object { Write-Host ('  - ' + $_.Name) }; Compress-Archive -Path $files.FullName -DestinationPath '%OUTPUT_ZIP%' -Force"

if %errorlevel% equ 0 (
    echo.
    echo [成功] 打包完成: %OUTPUT_ZIP%
) else (
    echo.
    echo [失败] 打包过程中出现错误！
)

pause
