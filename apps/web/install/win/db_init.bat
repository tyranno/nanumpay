@echo off
setlocal enabledelayedexpansion

rem 기본값
if "%MONGO_URI%"=="" set "MONGO_URI=mongodb://localhost:27017"
if "%DB_NAME%"=="" set "DB_NAME=nanumpay"
if "%ADMIN_LOGIN_ID%"=="" set "ADMIN_LOGIN_ID=관리자"
if "%ADMIN_NAME%"=="" set "ADMIN_NAME=관리자"
if "%ROLE%"=="" set "ROLE=admin"
if "%FORCE%"=="" set "FORCE=false"
if "%DB_DIR%"=="" set "DB_DIR=%ProgramFiles%\Nanumpay\db"
if "%BCRYPT_COST%"=="" set "BCRYPT_COST=10"

set "BCRYPT_HASH=%BCRYPT_HASH%"

:parse
if "%~1"=="" goto after_parse
for /f "tokens=1,2 delims==" %%A in ("%~1") do ( set "k=%%~A" & set "v=%%~B" )
set "k=%k:~2%"
if /I "%k%"=="uri" set "MONGO_URI=%v%"
if /I "%k%"=="db" set "DB_NAME=%v%"
if /I "%k%"=="loginId" set "ADMIN_LOGIN_ID=%v%"
if /I "%k%"=="name" set "ADMIN_NAME=%v%"
if /I "%k%"=="role" set "ROLE=%v%"
if /I "%k%"=="password" set "ADMIN_PASSWORD=%v%"
if /I "%k%"=="hash" set "BCRYPT_HASH=%v%"
if /I "%k%"=="force" set "FORCE=true"
if /I "%k%"=="cost" set "BCRYPT_COST=%v%"
shift
goto parse
:after_parse

where mongosh >nul 2>nul
if errorlevel 1 (
  where mongo >nul 2>nul
  if errorlevel 1 (
    echo ERROR: mongosh/mongo not found in PATH.
    exit /b 10
  ) else ( set "MONGO_SHELL=mongo" )
) else ( set "MONGO_SHELL=mongosh" )

rem bcrypt 해시: htpasswd 있으면 생성, 없으면 --hash 필수
if "%BCRYPT_HASH%"=="" (
  where htpasswd >nul 2>nul
  if %errorlevel%==0 (
    for /f "tokens=2 delims=:" %%H in ('echo %ADMIN_PASSWORD% ^| htpasswd -niBC %BCRYPT_COST% %ADMIN_LOGIN_ID%') do set "BCRYPT_HASH=%%H"
  ) else (
    echo ERROR: Provide --hash="^<bcrypt^>" or ensure htpasswd is installed.
    exit /b 11
  )
)

set "CONNECT_URI=%MONGO_URI%"
echo %CONNECT_URI% | find "/" >nul || set "CONNECT_URI=%MONGO_URI%/%DB_NAME%"

rem ===== 여기부터 추가: TEMP에 임시 래퍼 생성 =====
set "TMP_SCHEMA=%TEMP%\nanumpay.schema.%RANDOM%.%RANDOM%.js"
set "TMP_INDEXES=%TEMP%\nanumpay.indexes.%RANDOM%.%RANDOM%.js"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dbDir = '%DB_DIR%';" ^
  "$s = Join-Path $dbDir 'schema.users.json';" ^
  "$i = Join-Path $dbDir 'indexes.users.json';" ^
  "$out1 = '%TMP_SCHEMA%'; $out2 = '%TMP_INDEXES%';" ^
  "$sj = (Test-Path $s) ? (Get-Content -Raw $s) : $null;" ^
  "$ij = (Test-Path $i) ? (Get-Content -Raw $i) : '[]';" ^
  "Set-Content -Encoding UTF8 $out1 ('globalThis.USERS_SCHEMA='  + ($sj ?? 'null') + ';');" ^
  "Set-Content -Encoding UTF8 $out2 ('globalThis.USERS_INDEXES=' +  $ij           + ';');"

for %%F in ("%TMP_SCHEMA%") do set "LS1=%%~fF"
for %%F in ("%TMP_INDEXES%") do set "LS2=%%~fF"
set "LS1=%LS1:\=/%"
set "LS2=%LS2:\=/%"
rem ===== 추가 끝 =====

pushd "%DB_DIR%"
set ^"EVAL=var DB_NAME='%DB_NAME%', ADMIN_LOGIN_ID='%ADMIN_LOGIN_ID%', ADMIN_NAME='%ADMIN_NAME%', ADMIN_HASH='%BCRYPT_HASH%', ROLE='%ROLE%', FORCE=%FORCE%;^"
echo [init] connecting: %CONNECT_URI%
%MONGO_SHELL% "%CONNECT_URI%" --quiet ^
  --eval "load('%LS1%'); load('%LS2%');" ^
  --eval "%EVAL%" ^
  --file ".\init.mongo.js"
set "EC=%ERRORLEVEL%"
popd

rem 임시 파일 정리 (항상)
del /q "%TMP_SCHEMA%" "%TMP_INDEXES%" >nul 2>&1

echo [init] done.
endlocal & exit /b %EC%
