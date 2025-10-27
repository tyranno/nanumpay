#!/bin/bash

# iOS 온라인 테스트 도우미
# Appetize.io를 사용한 빠른 iOS 앱 테스트

set -e

echo "================================================"
echo "    iOS 앱 온라인 테스트 (Appetize.io)"
echo "================================================"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${YELLOW}이 스크립트는 Appetize.io를 사용하여 iOS 앱을 테스트합니다.${NC}"
echo -e "${YELLOW}무료 계정으로 월 1분 테스트 가능합니다.${NC}"
echo ""

# 1. GitHub Actions 상태 확인
check_github_build() {
    echo -e "${BLUE}📱 GitHub Actions iOS 빌드 확인 중...${NC}"

    if command -v gh &> /dev/null; then
        echo "최근 iOS 빌드 목록:"
        gh run list --workflow=ios-build.yml --limit=3

        echo ""
        echo "최신 빌드 다운로드? (y/n)"
        read -r download

        if [ "$download" = "y" ]; then
            echo "Run ID 입력:"
            read -r RUN_ID

            mkdir -p ios-builds
            gh run download "$RUN_ID" -D ios-builds/

            echo -e "${GREEN}✅ 다운로드 완료!${NC}"
            echo "위치: ios-builds/"
        fi
    else
        echo "GitHub CLI가 설치되지 않았습니다."
        echo "수동으로 GitHub Actions에서 artifacts를 다운로드하세요:"
        echo "https://github.com/[your-username]/nanumpay/actions"
    fi
}

# 2. Appetize.io 업로드 안내
appetize_upload() {
    echo ""
    echo -e "${BLUE}🚀 Appetize.io 업로드 가이드${NC}"
    echo "================================================"
    echo ""
    echo "1. Appetize.io 접속 및 가입 (무료):"
    echo "   ${GREEN}https://appetize.io/signup${NC}"
    echo ""
    echo "2. 앱 업로드:"
    echo "   ${GREEN}https://appetize.io/upload${NC}"
    echo ""
    echo "3. 다운로드한 파일 업로드:"

    if [ -d "ios-builds" ]; then
        echo "   발견된 빌드 파일:"
        find ios-builds -name "*.app" -o -name "*.zip" -o -name "*.ipa" 2>/dev/null | while read -r file; do
            echo "   📦 $file"
        done
    else
        echo "   GitHub Actions에서 다운로드한 .zip 파일 사용"
    fi

    echo ""
    echo "4. 업로드 완료 후 생성된 URL로 접속하여 테스트!"
    echo ""
    echo -e "${YELLOW}💡 팁: 1분 제한은 페이지 새로고침으로 리셋 가능${NC}"
}

# 3. 로컬 웹 테스트 (빠른 대안)
local_web_test() {
    echo ""
    echo -e "${BLUE}🌐 로컬 웹 브라우저 테스트${NC}"
    echo "================================================"
    echo ""
    echo "iOS 시뮬레이션을 위한 웹 개발 서버 시작:"
    echo ""

    cd /home/doowon/project/my/nanumpay/apps/app

    # 서버 시작
    echo -e "${GREEN}개발 서버를 시작합니다...${NC}"
    echo "브라우저에서 다음과 같이 테스트하세요:"
    echo ""
    echo "1. Chrome/Edge:"
    echo "   - http://localhost:5174 접속"
    echo "   - F12 → 모바일 뷰 → iPhone 14 Pro 선택"
    echo ""
    echo "2. Safari (더 정확한 iOS 시뮬레이션):"
    echo "   - 개발자 메뉴 활성화"
    echo "   - 개발자 → 반응형 디자인 모드"
    echo "   - iPhone 선택"
    echo ""

    pnpm dev --host --port 5174
}

# 4. 테스트 체크리스트
show_checklist() {
    echo ""
    echo -e "${BLUE}✅ iOS 테스트 체크리스트${NC}"
    echo "================================================"
    cat << 'EOF'

기본 기능 테스트:
□ 앱 시작 및 로딩
□ 메인 화면 표시
□ 네비게이션 동작
□ 버튼 클릭/터치
□ 스크롤 동작
□ 입력 필드 동작

Capacitor 기능:
□ 로컬 스토리지 (Preferences)
□ 네트워크 연결 확인
□ 화면 회전
□ Safe Area 표시

성능 체크:
□ 페이지 로딩 속도
□ 애니메이션 부드러움
□ 메모리 사용량

iOS 특수 기능:
□ 스와이프 제스처
□ Pull-to-refresh
□ iOS 키보드 동작
□ 상태바 표시

EOF
}

# 5. 빠른 링크 모음
quick_links() {
    echo ""
    echo -e "${BLUE}🔗 빠른 링크${NC}"
    echo "================================================"
    echo ""
    echo "📱 온라인 테스트 서비스:"
    echo "   • Appetize.io: https://appetize.io (무료 1분)"
    echo "   • BrowserStack: https://www.browserstack.com/app-live (30분 무료)"
    echo "   • AWS Device Farm: https://aws.amazon.com/device-farm/ (1000분 무료)"
    echo ""
    echo "📚 문서:"
    echo "   • Capacitor iOS: https://capacitorjs.com/docs/ios"
    echo "   • TestFlight: https://developer.apple.com/testflight/"
    echo ""
    echo "🛠 도구:"
    echo "   • GitHub Actions: https://github.com/[your-repo]/actions"
    echo "   • iOS 시뮬레이터 스킨: https://appetize.io/demo"
}

# 메인 메뉴
main_menu() {
    while true; do
        echo ""
        echo "================================================"
        echo "    iOS 온라인 테스트 도우미"
        echo "================================================"
        echo "1. GitHub Actions 빌드 확인 및 다운로드"
        echo "2. Appetize.io 업로드 가이드"
        echo "3. 로컬 웹 브라우저 테스트 (빠른 테스트)"
        echo "4. 테스트 체크리스트 보기"
        echo "5. 빠른 링크 모음"
        echo "6. 종료"
        echo ""
        echo -n "선택 (1-6): "
        read -r choice

        case $choice in
            1) check_github_build ;;
            2) appetize_upload ;;
            3) local_web_test ;;
            4) show_checklist ;;
            5) quick_links ;;
            6) echo "종료합니다."; exit 0 ;;
            *) echo "잘못된 선택입니다." ;;
        esac
    done
}

# 빠른 시작 옵션
if [ "$1" = "--quick" ]; then
    echo -e "${GREEN}빠른 Appetize.io 테스트 시작!${NC}"
    echo ""
    echo "1. 브라우저 열기: https://appetize.io/upload"
    echo "2. GitHub Actions에서 .zip 다운로드"
    echo "3. Appetize.io에 업로드"
    echo "4. 생성된 링크로 테스트!"
    exit 0
fi

# 메인 메뉴 실행
main_menu