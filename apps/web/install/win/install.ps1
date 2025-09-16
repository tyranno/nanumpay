param(
  [string]$InstallDir = "$env:ProgramFiles\AgentTree"
)

$ErrorActionPreference = "Stop"

# 1) ProgramData 환경파일 준비
$envDir  = Join-Path $env:ProgramData "AgentTree"
$envFile = Join-Path $envDir "agent-tree.env"
if (-not (Test-Path $envDir)) { New-Item -Force -ItemType Directory -Path $envDir | Out-Null }
if (-not (Test-Path $envFile)) {
@'
PORT=3000
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/agent-tree
JWT_SECRET=change-me
JWT_EXPIRES=7d
'@ | Set-Content -Encoding UTF8 $envFile
}

# 2) WinSW 선택(아키텍처 감지) 및 서비스 EXE 이름 정렬
$svcId     = "AgentTree"
$exePath   = Join-Path $InstallDir "agent-tree.exe"     # 애플리케이션 실행파일
$winswX64  = Join-Path $InstallDir "WinSW-x64.exe"      # 설치본에 동봉된 파일
$winswX86  = Join-Path $InstallDir "WinSW-x86.exe"      # 설치본에 동봉된 파일
$winswDst  = Join-Path $InstallDir "$svcId.exe"         # 베이스명 통일: AgentTree.exe (WinSW 규칙)
$xmlPath   = Join-Path $InstallDir "$svcId.xml"
$logDir    = Join-Path $InstallDir "logs"

$Is64 = [Environment]::Is64BitOperatingSystem
$winswSrc = if ($Is64) { $winswX64 } else { $winswX86 }
if (-not (Test-Path $winswSrc)) {
  throw "WinSW binary not found: $winswSrc (ensure both WinSW-x64.exe and WinSW-x86.exe are installed)"
}

# 선택된 WinSW를 서비스 EXE 이름으로 복사(리네임)
Copy-Item -Force $winswSrc $winswDst

# 3) env 파일을 XML <env>로 변환
function Escape-Xml([string]$s) {
  [System.Security.SecurityElement]::Escape($s)
}
$envLines = @()
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*$' -or $_ -match '^\s*#') { return }
  $kv = $_.Split('=',2)
  if ($kv.Length -ne 2) { return }
  $name = (Escape-Xml $kv[0].Trim())
  $val  = (Escape-Xml $kv[1].Trim())
  $envLines += "  <env name=""$name"" value=""$val"" />"
}

# 4) WinSW XML 생성 (AgentTree.xml)
$xml = @"
<service>
  <id>$svcId</id>
  <name>$svcId</name>
  <description>AgentTree EXE service</description>
  <executable>$exePath</executable>
  <workingdirectory>$InstallDir</workingdirectory>
  <logpath>$logDir</logpath>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="5 sec" />
  <resetfailure>1 day</resetfailure>
$(($envLines -join "`r`n"))
</service>
"@
$xml | Out-File -Encoding UTF8 $xmlPath

# 5) 기존 서비스 제거 후 설치/시작
& $winswDst stop      2>$null | Out-Null
& $winswDst uninstall 2>$null | Out-Null
& $winswDst install
& $winswDst start

# 6) DB 초기화 (기존 배치 그대로 호출)
$bat = Join-Path $InstallDir "db_init.bat"
if (Test-Path $bat) {
  cmd.exe /c `"$bat`" `"$InstallDir`"
}

Write-Host "[install] done"
exit 0
