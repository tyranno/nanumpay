param(
  [string]$InstallDir = "$env:ProgramFiles\AgentTree"
)

$ErrorActionPreference = "SilentlyContinue"

$winsw = Join-Path $InstallDir "winsw.exe"
if (Test-Path $winsw) {
  & $winsw stop
  & $winsw uninstall
}
Write-Host "[uninstall] service removed"
exit 0
