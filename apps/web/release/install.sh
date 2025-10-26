#!/bin/bash

# Nanumpay 설치 스크립트
# 필요한 의존성을 먼저 확인하고 DEB 패키지를 설치합니다

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================="
echo "  Nanumpay 설치 스크립트"
echo "========================================="
echo ""

# Root 권한 확인
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ 이 스크립트는 root 권한이 필요합니다.${NC}"
    echo -e "${YELLOW}   sudo ./install.sh 로 실행해주세요${NC}"
    exit 1
fi

# 현재 디렉토리에서 DEB 파일 찾기
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEB_FILE=$(ls -t "$SCRIPT_DIR"/nanumpay_*.deb 2>/dev/null | head -1)

if [ -z "$DEB_FILE" ]; then
    echo -e "${RED}❌ DEB 파일을 찾을 수 없습니다${NC}"
    echo -e "${YELLOW}   이 스크립트를 DEB 파일과 같은 디렉토리에 두고 실행하세요${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} DEB 파일 발견: $(basename "$DEB_FILE")"
echo ""

# 1. 시스템 업데이트
echo -e "${BLUE}[1/4]${NC} 패키지 목록 업데이트 중..."
apt-get update -qq

# 2. 필수 의존성 확인 및 설치
echo -e "${BLUE}[2/4]${NC} 필수 의존성 확인 중..."

REQUIRED_PACKAGES="nginx adduser systemd bash"
MISSING_PACKAGES=""

for pkg in $REQUIRED_PACKAGES; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
        MISSING_PACKAGES="$MISSING_PACKAGES $pkg"
    fi
done

if [ -n "$MISSING_PACKAGES" ]; then
    echo -e "${YELLOW}   설치 필요:$MISSING_PACKAGES${NC}"
    echo -e "${BLUE}   의존성 패키지 설치 중...${NC}"
    apt-get install -y $MISSING_PACKAGES
    echo -e "${GREEN}✓${NC} 의존성 패키지 설치 완료"
else
    echo -e "${GREEN}✓${NC} 모든 의존성이 이미 설치되어 있습니다"
fi
echo ""

# 3. 권장 패키지 확인
echo -e "${BLUE}[3/4]${NC} 권장 패키지 확인 중..."

RECOMMENDED_PACKAGES="mongosh"
MISSING_RECOMMENDED=""

for pkg in $RECOMMENDED_PACKAGES; do
    if ! command -v $pkg >/dev/null 2>&1; then
        MISSING_RECOMMENDED="$MISSING_RECOMMENDED $pkg"
    fi
done

if [ -n "$MISSING_RECOMMENDED" ]; then
    echo -e "${YELLOW}   권장 패키지 누락:$MISSING_RECOMMENDED${NC}"
    echo -e "${YELLOW}   (선택사항) MongoDB 관리를 위해 mongosh 설치를 권장합니다${NC}"

    read -p "   권장 패키지를 설치하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # MongoDB 공식 저장소가 있는지 확인
        if [ -f "/etc/apt/sources.list.d/mongodb-org-8.0.list" ] || grep -q "mongodb" /etc/apt/sources.list; then
            apt-get install -y mongosh 2>/dev/null || echo -e "${YELLOW}   mongosh 설치 실패 (수동 설치 필요)${NC}"
        else
            echo -e "${YELLOW}   MongoDB 저장소가 설정되지 않았습니다. 수동 설치가 필요합니다.${NC}"
        fi
    fi
else
    echo -e "${GREEN}✓${NC} 권장 패키지가 이미 설치되어 있습니다"
fi
echo ""

# 4. Nanumpay 패키지 설치
echo -e "${BLUE}[4/4]${NC} Nanumpay 패키지 설치 중..."

# 기존 패키지가 설치되어 있는지 확인
if dpkg -l | grep -q "^ii.*nanumpay"; then
    INSTALLED_VERSION=$(dpkg -l | grep "^ii.*nanumpay" | awk '{print $3}')
    echo -e "${YELLOW}   기존 버전이 설치되어 있습니다: $INSTALLED_VERSION${NC}"

    read -p "   기존 버전을 제거하고 새 버전을 설치하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}   기존 패키지 제거 중...${NC}"
        apt-get remove -y nanumpay
    else
        echo -e "${YELLOW}   설치를 취소합니다${NC}"
        exit 0
    fi
fi

# DEB 패키지 설치
echo -e "${BLUE}   DEB 패키지 설치 중...${NC}"
if apt install -y "$DEB_FILE"; then
    echo -e "${GREEN}✓${NC} Nanumpay 설치 완료!"
else
    echo -e "${RED}❌ 설치 실패${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}  설치 완료!${NC}"
echo "========================================="
echo ""

# 서비스 상태 확인
if systemctl is-active --quiet nanumpay; then
    echo -e "${GREEN}✓${NC} Nanumpay 서비스가 실행 중입니다"
else
    echo -e "${YELLOW}⚠${NC} Nanumpay 서비스가 실행되지 않고 있습니다"
    echo -e "${BLUE}   시작 명령: sudo systemctl start nanumpay${NC}"
fi

# Nginx 상태 확인
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓${NC} Nginx가 실행 중입니다"
else
    echo -e "${YELLOW}⚠${NC} Nginx가 실행되지 않고 있습니다"
    echo -e "${BLUE}   시작 명령: sudo systemctl start nginx${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}접속 정보:${NC}"
echo "  URL: http://localhost"
echo "  관리자: http://localhost/admin"
echo "  계정: 관리자 / admin1234!!"
echo ""
echo -e "${BLUE}서비스 관리:${NC}"
echo "  상태 확인: sudo systemctl status nanumpay"
echo "  시작: sudo systemctl start nanumpay"
echo "  중지: sudo systemctl stop nanumpay"
echo "  재시작: sudo systemctl restart nanumpay"
echo "  로그: sudo journalctl -u nanumpay -f"
echo ""
echo -e "${BLUE}Nginx 관리:${NC}"
echo "  상태 확인: sudo systemctl status nginx"
echo "  설정 테스트: sudo nginx -t"
echo "  재시작: sudo systemctl restart nginx"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}브라우저에서 http://localhost 로 접속하세요!${NC}"
echo ""
