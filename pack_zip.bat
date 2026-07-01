@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM 生成时间戳 (格式: YYYYMMDDHHmmss)
for /f %%a in ('powershell -Command "Get-Date -Format 'yyyyMMddHHmmss'"') do set "timestamp=%%a"

REM ============================================
REM 在下方填入你需要打包的文件路径 (相对于脚本所在目录)
REM 多行用空格分隔
REM ============================================
set "FILES=src public docs README.md .github package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts"

REM ============================================
REM 打包逻辑，无需修改
REM ============================================
if "%FILES%"=="" (
    echo [错误] 请先在脚本中设置 FILES 变量，指定需要打包的文件！
    pause
    exit /b 1
)

set "OUTPUT_ZIP=%timestamp%.zip"

echo 正在打包以下文件:
for %%f in (%FILES%) do (
    echo   - %%f
)
echo.
echo 输出文件: %OUTPUT_ZIP%

powershell -Command "$files = '%FILES%' -split ' '; Compress-Archive -Path $files -DestinationPath '%OUTPUT_ZIP%' -Force"

if %errorlevel% equ 0 (
    echo.
    echo [成功] 打包完成: %OUTPUT_ZIP%
) else (
    echo.
    echo [失败] 打包过程中出现错误！
)

pause
