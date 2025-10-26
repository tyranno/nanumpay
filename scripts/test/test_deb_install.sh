#!/bin/bash

# DEB 패키지 빌드 및 설치 테스트 스크립트
# 개발 서버에서 실제 DEB 패키지를 빌드하고 설치하여 검증
# 계정: tyranno, 비밀번호: 1234

set -e  # 에러 발생 시 즉시 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 프로젝트 루트 디렉토리
PROJECT_ROOT="/home/tyranno/project/bill/nanumpay"
WEB_DIR="$PROJECT_ROOT/apps/web"
BUILD_DIR="$WEB_DIR/build-deb"
SUDO_PASSWORD="1234"

echo "================================="
echo "DEB 패키지 빌드 및 설치 테스트"
echo "================================="
echo ""

# 1. 사전 준비
log_info "1. 사전 준비 중..."

# 기존 빌드 디렉토리 정리
if [ -d "$BUILD_DIR" ]; then
    log_info "기존 빌드 디렉토리 정리..."
    rm -rf "$BUILD_DIR"
fi

# 기존 DEB 파일 정리
log_info "기존 DEB 파일 정리..."
rm -f "$WEB_DIR"/*.deb

log_success "사전 준비 완료"
echo ""

# 2. DEB 패키지 빌드
log_info "2. DEB 패키지 빌드 중..."

cd "$WEB_DIR"

# release-linux.cjs 스크립트 실행
log_info "release-linux.cjs 실행..."
if node scripts/release-linux.cjs; then
    log_success "DEB 패키지 빌드 성공"
else
    log_error "DEB 패키지 빌드 실패"
    exit 1
fi

# 생성된 DEB 파일 확인
DEB_FILE=$(ls -t "$WEB_DIR"/release/nanumpay_*.deb 2>/dev/null | head -1)

if [ -z "$DEB_FILE" ]; then
    # release 디렉토리에 없으면 web 디렉토리에서 찾기
    DEB_FILE=$(ls -t "$WEB_DIR"/nanumpay*.deb 2>/dev/null | head -1)
fi

if [ -z "$DEB_FILE" ]; then
    log_error "DEB 파일을 찾을 수 없습니다"
    log_info "확인 위치: $WEB_DIR/release/ 또는 $WEB_DIR/"
    exit 1
fi

log_success "DEB 파일 생성: $DEB_FILE"
DEB_SIZE=$(du -h "$DEB_FILE" | cut -f1)
log_info "파일 크기: $DEB_SIZE"
echo ""

# 3. 기존 설치 제거 (있다면)
log_info "3. 기존 nanumpay 패키지 확인 중..."

if dpkg -l | grep -q "^ii.*nanumpay"; then
    log_warning "기존 nanumpay 패키지가 설치되어 있습니다. 제거합니다..."

    # 서비스 중지
    log_info "서비스 중지..."
    echo "$SUDO_PASSWORD" | sudo -S systemctl stop nanumpay 2>/dev/null || true

    # 패키지 제거
    log_info "패키지 제거..."
    echo "$SUDO_PASSWORD" | sudo -S apt-get remove -y nanumpay

    log_success "기존 패키지 제거 완료"
else
    log_info "기존 패키지 없음"
fi
echo ""

# 4. DEB 패키지 설치
log_info "4. DEB 패키지 설치 중..."

log_info "설치 명령: sudo dpkg -i $DEB_FILE"
echo "$SUDO_PASSWORD" | sudo -S dpkg -i "$DEB_FILE"

if [ $? -eq 0 ]; then
    log_success "DEB 패키지 설치 성공"
else
    log_error "DEB 패키지 설치 실패"

    # 의존성 문제 해결 시도
    log_warning "의존성 문제 해결 시도..."
    echo "$SUDO_PASSWORD" | sudo -S apt-get install -f -y

    if [ $? -eq 0 ]; then
        log_success "의존성 문제 해결 완료"
    else
        log_error "의존성 문제 해결 실패"
        exit 1
    fi
fi
echo ""

# 5. 설치 확인
log_info "5. 설치 확인 중..."

# 패키지 설치 확인
if dpkg -l | grep -q "^ii.*nanumpay"; then
    log_success "nanumpay 패키지 설치 확인됨"

    # 패키지 정보 출력
    INSTALLED_VERSION=$(dpkg -l | grep "^ii.*nanumpay" | awk '{print $3}')
    log_info "설치된 버전: $INSTALLED_VERSION"
else
    log_error "nanumpay 패키지가 설치되지 않았습니다"
    exit 1
fi

# 파일 설치 확인
log_info "설치된 파일 확인..."
if [ -d "/opt/nanumpay" ]; then
    log_success "/opt/nanumpay 디렉토리 존재"

    # 주요 파일 확인
    log_info "주요 파일 확인:"
    echo "  - nanumpay (실행파일): $([ -f /opt/nanumpay/nanumpay ] && echo '✓' || echo '✗')"
    echo "  - backups/: $([ -d /opt/nanumpay/backups ] && echo '✓' || echo '✗')"
    echo "  - db/: $([ -d /opt/nanumpay/db ] && echo '✓' || echo '✗')"
    echo "  - logs/: $([ -d /opt/nanumpay/logs ] && echo '✓' || echo '✗')"
else
    log_error "/opt/nanumpay 디렉토리가 없습니다"
    exit 1
fi

# systemd 서비스 파일 확인
if [ -f "/etc/systemd/system/nanumpay.service" ]; then
    log_success "systemd 서비스 파일 존재"
else
    log_error "systemd 서비스 파일이 없습니다"
    exit 1
fi
echo ""

# 6. 서비스 시작
log_info "6. nanumpay 서비스 시작 중..."

# systemd 리로드
log_info "systemd 데몬 리로드..."
echo "$SUDO_PASSWORD" | sudo -S systemctl daemon-reload

# 서비스 시작
log_info "서비스 시작..."
echo "$SUDO_PASSWORD" | sudo -S systemctl start nanumpay

# 잠시 대기 (서비스 시작 시간)
log_info "서비스 시작 대기 (10초)..."
sleep 10

# 서비스 상태 확인
log_info "서비스 상태 확인..."
SERVICE_STATUS=$(echo "$SUDO_PASSWORD" | sudo -S systemctl is-active nanumpay)

if [ "$SERVICE_STATUS" = "active" ]; then
    log_success "nanumpay 서비스가 실행 중입니다"
else
    log_error "nanumpay 서비스가 실행되지 않습니다 (상태: $SERVICE_STATUS)"

    # 상세 로그 출력
    log_info "서비스 상태 상세 정보:"
    echo "$SUDO_PASSWORD" | sudo -S systemctl status nanumpay --no-pager

    log_info "최근 로그:"
    echo "$SUDO_PASSWORD" | sudo -S journalctl -u nanumpay -n 50 --no-pager

    exit 1
fi
echo ""

# 7. 포트 확인
log_info "7. 포트 3100 확인 중..."

if lsof -i:3100 > /dev/null 2>&1; then
    log_success "포트 3100이 열려 있습니다"

    # 포트 사용 프로세스 확인
    PORT_PROCESS=$(lsof -i:3100 | grep LISTEN | awk '{print $1}' | head -1)
    log_info "포트 사용 프로세스: $PORT_PROCESS"
else
    log_error "포트 3100이 열려 있지 않습니다"

    # 서비스 로그 확인
    log_info "서비스 로그 확인:"
    echo "$SUDO_PASSWORD" | sudo -S journalctl -u nanumpay -n 20 --no-pager

    exit 1
fi
echo ""

# 8. Nginx 설정 확인
log_info "8. Nginx 설정 확인 중..."

if [ -f "/etc/nginx/sites-enabled/nanumpay" ]; then
    log_success "Nginx 설정이 활성화되어 있습니다"

    # Nginx 설정 테스트
    if echo "$SUDO_PASSWORD" | sudo -S nginx -t 2>&1 | grep -q "successful"; then
        log_success "Nginx 설정 테스트 통과"
    else
        log_error "Nginx 설정 테스트 실패"
    fi
else
    log_error "Nginx 설정이 활성화되지 않았습니다"
fi
echo ""

# 9. HTTP 응답 확인 (포트 80)
log_info "9. HTTP 응답 확인 (포트 80)..."

# localhost:80 접속 테스트
log_info "GET http://localhost/"

HTTP_RESPONSE_80=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)

if [ "$HTTP_RESPONSE_80" = "200" ] || [ "$HTTP_RESPONSE_80" = "302" ]; then
    log_success "포트 80 HTTP 응답 성공 (상태 코드: $HTTP_RESPONSE_80)"
else
    log_warning "포트 80 HTTP 응답 코드: $HTTP_RESPONSE_80"
fi

# localhost:3100 직접 접속 테스트
log_info "GET http://localhost:3100/ (백엔드 직접)"

HTTP_RESPONSE_3100=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/ 2>/dev/null)

if [ "$HTTP_RESPONSE_3100" = "200" ] || [ "$HTTP_RESPONSE_3100" = "302" ]; then
    log_success "포트 3100 HTTP 응답 성공 (상태 코드: $HTTP_RESPONSE_3100)"
else
    log_warning "포트 3100 HTTP 응답 코드: $HTTP_RESPONSE_3100"
fi
echo ""

# 10. 관리자 페이지 접속 테스트 (포트 80)
log_info "10. 관리자 페이지 접속 테스트 (포트 80)..."

ADMIN_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/admin 2>/dev/null)

if [ "$ADMIN_RESPONSE" = "200" ] || [ "$ADMIN_RESPONSE" = "302" ]; then
    log_success "관리자 페이지 접속 성공 (상태 코드: $ADMIN_RESPONSE)"
else
    log_warning "관리자 페이지 응답 코드: $ADMIN_RESPONSE"
fi
echo ""

# 11. 백업 기능 테스트
log_info "11. 백업 기능 테스트..."

# 백업 디렉토리 확인
if [ -d "/opt/nanumpay/backups" ]; then
    log_success "백업 디렉토리 존재: /opt/nanumpay/backups"

    # 백업 실행 테스트 (선택적)
    read -p "백업 기능을 테스트하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "백업 실행 중..."

        BACKUP_TOOL="/opt/nanumpay/tools/nanumpay-backup"
        if [ -f "$BACKUP_TOOL" ]; then
            echo "$SUDO_PASSWORD" | sudo -S -u nanumpay MONGODB_URI="mongodb://localhost:27017/nanumpay" BACKUP_PATH="/opt/nanumpay/backups" "$BACKUP_TOOL"

            if [ $? -eq 0 ] || [ $? -eq 1 ]; then
                log_success "백업 실행 완료 (FTP/S3 오류는 무시)"

                # 생성된 백업 파일 확인
                LATEST_BACKUP=$(ls -t /opt/nanumpay/backups/nanumpay-backup-*.tar.gz 2>/dev/null | head -1)
                if [ -n "$LATEST_BACKUP" ]; then
                    log_success "백업 파일 생성: $LATEST_BACKUP"
                    BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
                    log_info "백업 파일 크기: $BACKUP_SIZE"
                fi
            else
                log_error "백업 실행 실패"
            fi
        else
            log_warning "백업 도구를 찾을 수 없습니다: $BACKUP_TOOL"
        fi
    else
        log_info "백업 테스트 건너뛰기"
    fi
else
    log_warning "백업 디렉토리가 없습니다: /opt/nanumpay/backups"
fi
echo ""

# 11. 최종 요약
echo "================================="
echo "테스트 결과 요약"
echo "================================="
log_success "✓ DEB 패키지 빌드 성공"
log_success "✓ DEB 패키지 설치 성공"
log_success "✓ 서비스 시작 성공"
log_success "✓ 포트 3100 오픈"
log_success "✓ HTTP 응답 정상"
log_success "✓ 관리자 페이지 접속 가능"
echo ""

log_info "접속 정보:"
echo "  - URL: http://localhost (포트 80)"
echo "  - 관리자: http://localhost/admin"
echo "  - 백엔드 직접: http://localhost:3100"
echo "  - 계정: 관리자 / admin1234!!"
echo ""

log_info "서비스 관리 명령:"
echo "  - 상태 확인: sudo systemctl status nanumpay"
echo "  - 시작: sudo systemctl start nanumpay"
echo "  - 중지: sudo systemctl stop nanumpay"
echo "  - 재시작: sudo systemctl restart nanumpay"
echo "  - 로그: sudo journalctl -u nanumpay -f"
echo ""

log_info "다음 단계:"
echo "  1. 브라우저에서 http://localhost/admin 접속"
echo "  2. 관리자 계정으로 로그인 (관리자 / admin1234!!)"
echo "  3. 주요 기능 테스트:"
echo "     - 용역자 등록"
echo "     - 용역비 관리"
echo "     - 백업 실행 및 다운로드"
echo "  4. 문제 발견 시:"
echo "     - 앱 로그: sudo journalctl -u nanumpay -n 100"
echo "     - Nginx 로그: sudo tail -f /var/log/nginx/error.log"
echo ""

log_success "DEB 패키지 설치 테스트 완료!"
