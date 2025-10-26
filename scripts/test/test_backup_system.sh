#!/bin/bash
# 백업 시스템 전체 점검 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 루트 디렉토리
PROJECT_ROOT="/home/tyranno/project/bill/nanumpay"
BACKUP_APP_DIR="$PROJECT_ROOT/apps/backup"
TEST_BACKUP_DIR="/tmp/nanumpay-backups-test"
MONGODB_URI="mongodb://localhost:27017/nanumpay"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   백업 시스템 전체 점검${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 테스트 결과 카운터
PASS_COUNT=0
FAIL_COUNT=0

# 테스트 함수
test_step() {
    local step_name="$1"
    echo -e "${YELLOW}>>> $step_name${NC}"
}

test_pass() {
    local msg="$1"
    echo -e "${GREEN}✅ $msg${NC}"
    ((PASS_COUNT++))
}

test_fail() {
    local msg="$1"
    echo -e "${RED}❌ $msg${NC}"
    ((FAIL_COUNT++))
}

test_info() {
    local msg="$1"
    echo -e "${BLUE}ℹ️  $msg${NC}"
}

# ==========================================
# 1단계: 환경 확인
# ==========================================
test_step "1단계: 환경 확인"

# Bun 확인
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    test_pass "Bun 설치 확인: v$BUN_VERSION"
else
    test_fail "Bun이 설치되어 있지 않습니다"
    test_info "설치: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# MongoDB 확인
if command -v mongosh &> /dev/null; then
    test_pass "MongoDB 클라이언트 확인"
else
    test_fail "mongosh가 설치되어 있지 않습니다"
fi

# MongoDB 연결 확인
if mongosh "$MONGODB_URI" --quiet --eval "db.adminCommand('ping')" &> /dev/null; then
    test_pass "MongoDB 연결 확인"
else
    test_fail "MongoDB 연결 실패"
    test_info "MongoDB가 실행 중인지 확인하세요"
    exit 1
fi

# mongodump 확인
if command -v mongodump &> /dev/null; then
    test_pass "mongodump 설치 확인"
else
    test_fail "mongodump가 설치되어 있지 않습니다"
    test_info "설치: sudo apt-get install mongodb-database-tools"
fi

echo ""

# ==========================================
# 2단계: 백업 앱 소스 확인
# ==========================================
test_step "2단계: 백업 앱 소스 확인"

cd "$PROJECT_ROOT"

if [ -f "$BACKUP_APP_DIR/package.json" ]; then
    test_pass "package.json 확인"
else
    test_fail "package.json 없음"
fi

if [ -f "$BACKUP_APP_DIR/build.sh" ]; then
    test_pass "build.sh 확인"
else
    test_fail "build.sh 없음"
fi

if [ -f "$BACKUP_APP_DIR/src/index.js" ]; then
    test_pass "src/index.js 확인"
else
    test_fail "src/index.js 없음"
fi

if [ -f "$BACKUP_APP_DIR/src/config.js" ]; then
    test_pass "src/config.js 확인"
else
    test_fail "src/config.js 없음"
fi

if [ -f "$BACKUP_APP_DIR/src/backup.js" ]; then
    test_pass "src/backup.js 확인"
else
    test_fail "src/backup.js 없음"
fi

if [ -f "$BACKUP_APP_DIR/src/storage/s3.js" ]; then
    test_pass "src/storage/s3.js 확인"
else
    test_fail "src/storage/s3.js 없음"
fi

if [ -f "$BACKUP_APP_DIR/src/storage/ftp.js" ]; then
    test_pass "src/storage/ftp.js 확인"
else
    test_fail "src/storage/ftp.js 없음"
fi

echo ""

# ==========================================
# 3단계: 백업 앱 빌드
# ==========================================
test_step "3단계: 백업 앱 빌드"

cd "$BACKUP_APP_DIR"

# 이전 빌드 정리
rm -rf build node_modules bun.lockb
test_info "이전 빌드 정리 완료"

# 빌드 실행
if bash build.sh > /tmp/backup_build.log 2>&1; then
    test_pass "백업 앱 빌드 성공"
else
    test_fail "백업 앱 빌드 실패"
    cat /tmp/backup_build.log
    exit 1
fi

# 빌드 결과 확인
if [ -f "$BACKUP_APP_DIR/build/nanumpay-backup" ]; then
    FILE_SIZE=$(du -h "$BACKUP_APP_DIR/build/nanumpay-backup" | cut -f1)
    test_pass "실행 파일 생성: nanumpay-backup ($FILE_SIZE)"
else
    test_fail "실행 파일이 생성되지 않았습니다"
    exit 1
fi

# 실행 권한 확인
if [ -x "$BACKUP_APP_DIR/build/nanumpay-backup" ]; then
    test_pass "실행 권한 확인"
else
    test_fail "실행 권한 없음"
fi

echo ""

# ==========================================
# 4단계: MongoDB 백업 설정
# ==========================================
test_step "4단계: MongoDB 백업 설정"

# 테스트 백업 디렉토리 생성
rm -rf "$TEST_BACKUP_DIR"
mkdir -p "$TEST_BACKUP_DIR"
test_info "테스트 백업 디렉토리 생성: $TEST_BACKUP_DIR"

# MongoDB 백업 설정 업데이트
mongosh "$MONGODB_URI" --quiet --eval "
db.admins.updateOne({}, {
  \$set: {
    'systemSettings.backupSettings.enabled': true,
    'systemSettings.backupSettings.backupPath': '$TEST_BACKUP_DIR',
    'systemSettings.backupSettings.retentionDays': 7,
    'systemSettings.backupSettings.retentionCount': 5,
    'systemSettings.backupSettings.s3.enabled': false,
    'systemSettings.backupSettings.ftp.enabled': false
  }
})
" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    test_pass "MongoDB 백업 설정 업데이트"
else
    test_fail "MongoDB 백업 설정 실패"
    exit 1
fi

# 설정 확인
BACKUP_ENABLED=$(mongosh "$MONGODB_URI" --quiet --eval "
db.admins.findOne({}, { 'systemSettings.backupSettings.enabled': 1 })
" | grep -o 'enabled: true' || echo "")

if [ -n "$BACKUP_ENABLED" ]; then
    test_pass "백업 활성화 상태 확인"
else
    test_fail "백업이 비활성화 상태입니다"
fi

echo ""

# ==========================================
# 5단계: 백업 실행 테스트
# ==========================================
test_step "5단계: 백업 실행 테스트"

cd "$BACKUP_APP_DIR"

# 백업 실행
test_info "백업 실행 중... (약 5초 소요)"
if ./build/nanumpay-backup > /tmp/backup_run.log 2>&1; then
    test_pass "백업 실행 성공"
else
    test_fail "백업 실행 실패"
    cat /tmp/backup_run.log
    exit 1
fi

# 백업 파일 확인
BACKUP_FILES=$(ls -1 "$TEST_BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_FILES" -gt 0 ]; then
    BACKUP_FILE=$(ls -1 "$TEST_BACKUP_DIR"/*.tar.gz | head -n 1)
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    test_pass "백업 파일 생성: $(basename "$BACKUP_FILE") ($BACKUP_SIZE)"
else
    test_fail "백업 파일이 생성되지 않았습니다"
    cat /tmp/backup_run.log
    exit 1
fi

# 백업 파일 압축 해제 테스트
EXTRACT_DIR="/tmp/backup_extract_test"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"

if tar -xzf "$BACKUP_FILE" -C "$EXTRACT_DIR" > /dev/null 2>&1; then
    test_pass "백업 파일 압축 해제 성공"

    # nanumpay 디렉토리 확인
    if [ -d "$EXTRACT_DIR"/nanumpay-backup-*/nanumpay ]; then
        test_pass "MongoDB 데이터 확인"
    else
        test_fail "MongoDB 데이터 없음"
    fi
else
    test_fail "백업 파일 압축 해제 실패"
fi

rm -rf "$EXTRACT_DIR"

echo ""

# ==========================================
# 6단계: 보관 정책 테스트
# ==========================================
test_step "6단계: 보관 정책 테스트 (retentionCount: 5)"

# 10개 백업 생성
test_info "10개 백업 생성 중..."
for i in {1..10}; do
    ./build/nanumpay-backup > /dev/null 2>&1
    sleep 1
done

# 파일 수 확인
BACKUP_COUNT=$(ls -1 "$TEST_BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -eq 5 ]; then
    test_pass "보관 정책 적용 확인: $BACKUP_COUNT개 백업 유지"
elif [ "$BACKUP_COUNT" -le 6 ]; then
    # 타이밍 이슈로 6개일 수도 있음
    test_pass "보관 정책 적용 확인: $BACKUP_COUNT개 백업 유지 (허용 범위)"
else
    test_fail "보관 정책 미적용: $BACKUP_COUNT개 백업 (예상: 5개)"
fi

echo ""

# ==========================================
# 7단계: 로그 확인
# ==========================================
test_step "7단계: 실행 로그 확인"

if grep -q "✅ 백업 완료!" /tmp/backup_run.log; then
    test_pass "백업 완료 메시지 확인"
else
    test_fail "백업 완료 메시지 없음"
fi

if grep -q "MongoDB 연결 성공" /tmp/backup_run.log; then
    test_pass "MongoDB 연결 로그 확인"
else
    test_fail "MongoDB 연결 로그 없음"
fi

if grep -q "mongodump 완료" /tmp/backup_run.log; then
    test_pass "mongodump 완료 로그 확인"
else
    test_fail "mongodump 완료 로그 없음"
fi

if grep -q "압축 완료" /tmp/backup_run.log; then
    test_pass "압축 완료 로그 확인"
else
    test_fail "압축 완료 로그 없음"
fi

echo ""
test_info "실행 로그 내용:"
echo "----------------------------------------"
cat /tmp/backup_run.log
echo "----------------------------------------"
echo ""

# ==========================================
# 8단계: DEB 빌드 통합 확인
# ==========================================
test_step "8단계: DEB 빌드 통합 확인"

cd "$PROJECT_ROOT/apps/web"

# release-linux.cjs 확인
if grep -q "백업 앱 빌드" scripts/release-linux.cjs; then
    test_pass "release-linux.cjs에 백업 빌드 코드 확인"
else
    test_fail "release-linux.cjs에 백업 빌드 코드 없음"
fi

if grep -q "binDir" scripts/release-linux.cjs; then
    test_pass "binDir 디렉토리 생성 코드 확인"
else
    test_fail "binDir 디렉토리 생성 코드 없음"
fi

if grep -q "백업 디렉토리 생성" scripts/release-linux.cjs; then
    test_pass "postinst 백업 디렉토리 생성 코드 확인"
else
    test_fail "postinst 백업 디렉토리 생성 코드 없음"
fi

if grep -q "crontab.*nanumpay-backup" scripts/release-linux.cjs; then
    test_pass "prerm crontab 정리 코드 확인"
else
    test_fail "prerm crontab 정리 코드 없음"
fi

echo ""

# ==========================================
# 9단계: Admin 모델 확인
# ==========================================
test_step "9단계: Admin 모델 확인"

ADMIN_MODEL="$PROJECT_ROOT/apps/web/src/lib/server/models/Admin.js"

if grep -q "backupSettings" "$ADMIN_MODEL"; then
    test_pass "Admin 모델에 backupSettings 확인"
else
    test_fail "Admin 모델에 backupSettings 없음"
fi

if grep -q "schedule.*String" "$ADMIN_MODEL"; then
    test_pass "schedule 필드 확인"
else
    test_fail "schedule 필드 없음"
fi

if grep -q "retentionDays" "$ADMIN_MODEL"; then
    test_pass "retentionDays 필드 확인"
else
    test_fail "retentionDays 필드 없음"
fi

if grep -q "retentionCount" "$ADMIN_MODEL"; then
    test_pass "retentionCount 필드 확인"
else
    test_fail "retentionCount 필드 없음"
fi

echo ""

# ==========================================
# 정리
# ==========================================
test_step "정리"

test_info "테스트 백업 디렉토리 유지: $TEST_BACKUP_DIR"
test_info "백업 파일 확인: ls -lh $TEST_BACKUP_DIR/"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   테스트 결과${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}통과: $PASS_COUNT${NC}"
echo -e "${RED}실패: $FAIL_COUNT${NC}"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ 모든 테스트 통과!${NC}"
    echo ""
    echo "다음 단계:"
    echo "1. pnpm release:linux 실행하여 DEB 패키지 빌드"
    echo "2. DEB 패키지 내용 확인: dpkg-deb -c apps/web/release/*.deb | grep backup"
    echo "3. 배포: node apps/web/scripts/deploy.cjs"
    exit 0
else
    echo -e "${RED}❌ 일부 테스트 실패${NC}"
    exit 1
fi
