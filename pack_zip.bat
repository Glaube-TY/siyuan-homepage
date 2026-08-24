@echo off
chcp 65001 >nul
setlocal

set "SCRIPT_DIR=%~dp0"
set "EXIT_CODE=0"

where pwsh.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell 7 pwsh.exe was not found.
    set "EXIT_CODE=9009"
    goto :finish
)

pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\pack_zip.ps1" -ProjectRoot "%SCRIPT_DIR%."
set "EXIT_CODE=%ERRORLEVEL%"

:finish
if "%EXIT_CODE%"=="0" (
    echo.
    echo [OK] Archive completed.
) else (
    echo.
    echo [FAILED] Archive failed. Exit code: %EXIT_CODE%
)

pause
endlocal & exit /b %EXIT_CODE%
