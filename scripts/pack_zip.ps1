[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

try {
    $root = (Resolve-Path -LiteralPath $ProjectRoot).Path
    Push-Location -LiteralPath $root

    try {
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        $outputName = "$timestamp.zip"
        $outputPath = Join-Path $root $outputName

        $gitFiles = @(& git -C $root -c core.quotePath=false ls-files --cached --others --exclude-standard -- .)
        if ($LASTEXITCODE -ne 0) {
            throw "当前目录不是可用的 Git 仓库，无法按 .gitignore 收集文件。"
        }

        $excludedPaths = @(
            "pack_zip.bat",
            "scripts/pack_zip.ps1"
        )
        $relativeFiles = @(
            $gitFiles | ForEach-Object {
                $relativePath = ([string]$_).Trim()
                if ($relativePath -and $relativePath -notin $excludedPaths -and $relativePath -notlike "*.zip") {
                    $fullPath = Join-Path $root ($relativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
                    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
                        $relativePath
                    }
                }
            }
        )

        if ($relativeFiles.Count -eq 0) {
            throw "没有找到可打包的文件。"
        }

        Write-Host "项目目录: $root"
        Write-Host "文件数量: $($relativeFiles.Count)"
        Write-Host "输出文件: $outputPath"

        if (Test-Path -LiteralPath $outputPath) {
            Remove-Item -LiteralPath $outputPath -Force
        }

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [System.IO.Compression.ZipFile]::Open(
            $outputPath,
            [System.IO.Compression.ZipArchiveMode]::Create
        )
        try {
            foreach ($relativePath in $relativeFiles) {
                $fullPath = Join-Path $root ($relativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
                if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                    throw "文件在打包过程中消失：$relativePath"
                }
                $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive,
                    $fullPath,
                    $relativePath,
                    [System.IO.Compression.CompressionLevel]::Optimal
                )
            }
        }
        finally {
            $archive.Dispose()
        }

        $archive = Get-Item -LiteralPath $outputPath
        if ($archive.Length -le 0) {
            throw "压缩包已生成，但文件大小为 0。"
        }

        Write-Host "压缩包大小: $($archive.Length) bytes"
        exit 0
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Error $_
    exit 1
}
