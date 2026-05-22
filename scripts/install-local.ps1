[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\spacemolt'),
  [string]$Bun = ''
)

$ErrorActionPreference = 'Stop'

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$BinDir = Join-Path $InstallDir 'bin'
$VersionsDir = Join-Path $InstallDir 'versions'

if (-not $Bun) {
  $BunCommand = Get-Command bun -ErrorAction SilentlyContinue
  if ($BunCommand) {
    $Bun = $BunCommand.Source
  } else {
    $HomeBun = Join-Path $HOME '.bun\bin\bun.exe'
    if (Test-Path -LiteralPath $HomeBun) {
      $Bun = $HomeBun
    } else {
      throw 'bun not found. Install Bun or pass -Bun C:\path\to\bun.exe.'
    }
  }
}

Push-Location $RootDir
try {
  & $Bun build src/client.ts --compile --outfile spacemolt
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$BuiltExe = Join-Path $RootDir 'spacemolt.exe'
if (-not (Test-Path -LiteralPath $BuiltExe)) {
  $BuiltExe = Join-Path $RootDir 'spacemolt'
}
if (-not (Test-Path -LiteralPath $BuiltExe)) {
  throw "build did not create $BuiltExe"
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
New-Item -ItemType Directory -Force -Path $VersionsDir | Out-Null

$Stamp = Get-Date -Format 'yyyyMMddHHmmss'
$Suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$VersionedExe = Join-Path $VersionsDir "spacemolt-$Stamp-$Suffix.exe"
$TempExe = "$VersionedExe.tmp"
$Shim = Join-Path $BinDir 'spacemolt.cmd'
$TempShim = "$Shim.tmp"

Copy-Item -LiteralPath $BuiltExe -Destination $TempExe -Force
Move-Item -LiteralPath $TempExe -Destination $VersionedExe -Force

$RelativeExe = "..\versions\$(Split-Path -Leaf $VersionedExe)"
$ShimContent = @"
@echo off
"%~dp0$RelativeExe" %*
"@
Set-Content -LiteralPath $TempShim -Value $ShimContent -NoNewline -Encoding ASCII
Move-Item -LiteralPath $TempShim -Destination $Shim -Force

Write-Host "Installed $Shim"
Write-Host "Installed executable $VersionedExe"

$PathEntries = ($env:PATH -split ';') | Where-Object { $_ }
$BinDirFull = (Resolve-Path $BinDir).Path
$OnPath = $false
foreach ($Entry in $PathEntries) {
  try {
    if ((Resolve-Path $Entry -ErrorAction Stop).Path -ieq $BinDirFull) {
      $OnPath = $true
      break
    }
  } catch {
    if ($Entry -ieq $BinDirFull) {
      $OnPath = $true
      break
    }
  }
}

if (-not $OnPath) {
  Write-Warning "$BinDirFull is not on PATH."
  Write-Host 'Add it to your user PATH to run spacemolt from anywhere.'
}
