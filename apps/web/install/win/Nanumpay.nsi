!include "MUI2.nsh"

!define APPNAME "Nanumpay"
!define COMPANY "Nanum Asset"
!define VERSION "${VERSION}"
!define INPUT_DIR "${INPUT_DIR}"
!define OUT_EXE   "${OUT_EXE}"

Name "${APPNAME} ${VERSION}"
OutFile "${OUT_EXE}"
InstallDir "$PROGRAMFILES\${APPNAME}"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "Korean"

Section "Install"
  SetOutPath "$INSTDIR"
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\db"

  ; 실행파일
  File "/oname=agent-tree.exe" "${INPUT_DIR}\dist\agent-tree.exe"

  ; 설치/제거 스크립트 & WinSW & DB init 배치
  File "${INPUT_DIR}\install\win\install.ps1"
  File "${INPUT_DIR}\install\win\uninstall.ps1"
  File "${INPUT_DIR}\install\win\WinSW-x64.exe"
  File "${INPUT_DIR}\install\win\WinSW-x86.exe"
  File "${INPUT_DIR}\install\win\db_init.bat"

  ; DB 리소스
  SetOutPath "$INSTDIR\db"
  File "/oname=init.mongo.js"       "${INPUT_DIR}\install\db\init.mongo.js"
  File "/oname=indexes.users.json"  "${INPUT_DIR}\install\db\indexes.users.json"
  File "/oname=schema.users.json"   "${INPUT_DIR}\install\db\schema.users.json"
  SetOutPath "$INSTDIR"

  ; ProgramData 환경파일(없으면 신규 생성)
  CreateDirectory "$COMMONAPPDATA\Nanumpay"
  IfFileExists "$COMMONAPPDATA\Nanumpay\agent-tree.env" +3 0
    File "/oname=$COMMONAPPDATA\Nanumpay\agent-tree.env" "${INPUT_DIR}\install\win\agent-tree.env"

  ; 설치 스크립트 호출 (서비스 등록 + DB 초기화)
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\install.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "설치 스크립트 실패(코드 $0)."
    Abort
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${COMPANY}"
SectionEnd

Section "Uninstall"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\uninstall.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
SectionEnd
