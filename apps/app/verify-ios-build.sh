#!/bin/bash

# iOS 빌드 검증 스크립트
# Mac 없이 Linux에서 iOS 빌드 결과물 확인

set -e

echo "========================================="
echo "    iOS 빌드 검증 도구"
echo "========================================="

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. GitHub Actions에서 아티팩트 다운로드
download_artifact() {
    echo -e "${YELLOW}📥 GitHub Actions 아티팩트 다운로드 중...${NC}"

    # gh CLI 설치 확인
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}❌ GitHub CLI(gh)가 설치되지 않았습니다.${NC}"
        echo "설치하려면: sudo apt-get install gh"
        return 1
    fi

    # 최근 workflow run 확인
    echo "최근 iOS 빌드 확인 중..."
    gh run list --workflow=ios-build.yml --limit=5

    echo ""
    echo "다운로드할 Run ID를 입력하세요:"
    read -r RUN_ID

    # 아티팩트 다운로드
    mkdir -p ios-artifacts
    gh run download "$RUN_ID" -D ios-artifacts/

    echo -e "${GREEN}✅ 다운로드 완료!${NC}"
}

# 2. .app 파일 구조 검증
verify_app_structure() {
    echo -e "${YELLOW}🔍 .app 파일 구조 검증 중...${NC}"

    APP_PATH=$(find ios-artifacts -name "*.app" -type d 2>/dev/null | head -1)

    if [ -z "$APP_PATH" ]; then
        # zip 파일 찾기 및 압축 해제
        ZIP_PATH=$(find ios-artifacts -name "*.zip" 2>/dev/null | head -1)
        if [ -n "$ZIP_PATH" ]; then
            echo "ZIP 파일 발견, 압축 해제 중..."
            unzip -q "$ZIP_PATH" -d ios-artifacts/
            APP_PATH=$(find ios-artifacts -name "*.app" -type d 2>/dev/null | head -1)
        fi
    fi

    if [ -z "$APP_PATH" ]; then
        echo -e "${RED}❌ .app 파일을 찾을 수 없습니다.${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ 앱 발견: $APP_PATH${NC}"
    echo ""
    echo "📁 앱 구조:"
    echo "----------------------------------------"

    # 기본 구조 확인
    if [ -f "$APP_PATH/Info.plist" ]; then
        echo "✅ Info.plist 존재"

        # plist 내용 확인 (Linux에서)
        if command -v plutil &> /dev/null; then
            echo "  앱 이름: $(plutil -extract CFBundleName raw "$APP_PATH/Info.plist" 2>/dev/null || echo "확인 불가")"
            echo "  번들 ID: $(plutil -extract CFBundleIdentifier raw "$APP_PATH/Info.plist" 2>/dev/null || echo "확인 불가")"
            echo "  버전: $(plutil -extract CFBundleShortVersionString raw "$APP_PATH/Info.plist" 2>/dev/null || echo "확인 불가")"
        else
            # plutil 없으면 grep으로 확인
            echo "  번들 ID: $(grep -A1 'CFBundleIdentifier' "$APP_PATH/Info.plist" | tail -1 | sed 's/.*<string>\(.*\)<\/string>/\1/' | xargs)"
        fi
    else
        echo "❌ Info.plist 없음"
    fi

    # 실행 파일 확인
    EXEC_NAME=$(basename "$APP_PATH" .app)
    if [ -f "$APP_PATH/$EXEC_NAME" ]; then
        echo "✅ 실행 파일 존재: $EXEC_NAME"
        echo "  파일 크기: $(du -h "$APP_PATH/$EXEC_NAME" | cut -f1)"

        # 파일 타입 확인
        file_type=$(file "$APP_PATH/$EXEC_NAME" | cut -d: -f2)
        echo "  파일 타입: $file_type"
    else
        echo "❌ 실행 파일 없음"
    fi

    # 리소스 확인
    echo ""
    echo "📦 리소스 파일:"
    echo "  HTML/JS 파일: $(find "$APP_PATH" -name "*.html" -o -name "*.js" | wc -l)개"
    echo "  이미지 파일: $(find "$APP_PATH" -name "*.png" -o -name "*.jpg" | wc -l)개"
    echo "  전체 크기: $(du -sh "$APP_PATH" | cut -f1)"

    # Capacitor 관련 파일 확인
    if [ -d "$APP_PATH/www" ] || [ -d "$APP_PATH/public" ]; then
        echo ""
        echo "✅ Capacitor 웹 리소스 디렉토리 존재"
        WEB_DIR=$([ -d "$APP_PATH/www" ] && echo "$APP_PATH/www" || echo "$APP_PATH/public")
        echo "  index.html: $([ -f "$WEB_DIR/index.html" ] && echo "✅ 존재" || echo "❌ 없음")"

        if [ -f "$WEB_DIR/index.html" ]; then
            echo "  index.html 첫 5줄:"
            head -5 "$WEB_DIR/index.html" | sed 's/^/    /'
        fi
    fi
}

# 3. 빌드 로그 분석
analyze_build_log() {
    echo -e "${YELLOW}📋 빌드 로그 분석 중...${NC}"

    if ! command -v gh &> /dev/null; then
        echo -e "${RED}GitHub CLI가 필요합니다.${NC}"
        return 1
    fi

    echo "분석할 Run ID를 입력하세요 (Enter로 건너뛰기):"
    read -r RUN_ID

    if [ -n "$RUN_ID" ]; then
        gh run view "$RUN_ID" --log > build.log

        echo ""
        echo "빌드 요약:"
        echo "----------------------------------------"

        # 성공/실패 확인
        if grep -q "Build succeeded" build.log; then
            echo -e "${GREEN}✅ 빌드 성공${NC}"
        fi

        # 경고 확인
        WARNINGS=$(grep -c "warning:" build.log || true)
        if [ "$WARNINGS" -gt 0 ]; then
            echo -e "${YELLOW}⚠️  경고: $WARNINGS개${NC}"
        fi

        # 에러 확인
        ERRORS=$(grep -c "error:" build.log || true)
        if [ "$ERRORS" -gt 0 ]; then
            echo -e "${RED}❌ 에러: $ERRORS개${NC}"
        fi

        echo ""
        echo "상세 로그는 build.log 파일을 확인하세요."
    fi
}

# 4. 대체 테스트 방법 안내
show_test_options() {
    echo ""
    echo -e "${YELLOW}🧪 테스트 옵션${NC}"
    echo "========================================="
    echo ""
    echo "1. TestFlight 사용 (Apple 개발자 계정 필요):"
    echo "   - GitHub Actions에서 TestFlight 업로드 설정"
    echo "   - iPhone/iPad에서 TestFlight 앱으로 테스트"
    echo ""
    echo "2. 시뮬레이터 빌드 (현재 설정):"
    echo "   - Mac 사용자에게 .app 파일 전달"
    echo "   - Xcode 시뮬레이터에서 실행"
    echo ""
    echo "3. 웹 브라우저 테스트:"
    echo "   - pnpm dev:app 실행"
    echo "   - 브라우저에서 모바일 뷰 확인"
    echo "   - Safari 개발자 도구로 iOS 시뮬레이션"
    echo ""
    echo "4. BrowserStack 또는 Appetize.io:"
    echo "   - 클라우드 기반 iOS 디바이스 테스트"
    echo "   - 유료 서비스 (무료 평가판 있음)"
}

# 5. 간단한 유효성 검사
quick_validation() {
    echo -e "${YELLOW}⚡ 빠른 유효성 검사${NC}"
    echo "----------------------------------------"

    APP_PATH=$(find ios-artifacts -name "*.app" -type d 2>/dev/null | head -1)

    if [ -n "$APP_PATH" ]; then
        # 필수 파일 체크
        REQUIRED_FILES=(
            "Info.plist"
            "PkgInfo"
        )

        for file in "${REQUIRED_FILES[@]}"; do
            if [ -f "$APP_PATH/$file" ]; then
                echo "✅ $file"
            else
                echo "❌ $file (누락)"
            fi
        done

        # Capacitor 특정 체크
        if [ -d "$APP_PATH/www" ] || [ -d "$APP_PATH/public" ]; then
            echo "✅ 웹 리소스 디렉토리"

            # JavaScript 번들 확인
            JS_FILES=$(find "$APP_PATH" -name "*.js" -type f | wc -l)
            if [ "$JS_FILES" -gt 0 ]; then
                echo "✅ JavaScript 번들 ($JS_FILES 파일)"
            else
                echo "❌ JavaScript 번들 없음"
            fi
        fi

        echo ""
        echo -e "${GREEN}검증 완료!${NC}"
    else
        echo -e "${RED}앱을 찾을 수 없습니다. 먼저 다운로드하세요.${NC}"
    fi
}

# 메인 메뉴
main_menu() {
    while true; do
        echo ""
        echo "========================================="
        echo "    iOS 빌드 검증 도구"
        echo "========================================="
        echo "1. GitHub Actions 아티팩트 다운로드"
        echo "2. .app 파일 구조 검증"
        echo "3. 빌드 로그 분석"
        echo "4. 테스트 옵션 보기"
        echo "5. 빠른 유효성 검사"
        echo "6. 종료"
        echo ""
        echo -n "선택하세요 (1-6): "
        read -r choice

        case $choice in
            1) download_artifact ;;
            2) verify_app_structure ;;
            3) analyze_build_log ;;
            4) show_test_options ;;
            5) quick_validation ;;
            6) echo "종료합니다."; exit 0 ;;
            *) echo -e "${RED}잘못된 선택입니다.${NC}" ;;
        esac
    done
}

# 스크립트 실행
if [ "$1" == "--quick" ]; then
    # 빠른 검증 모드
    quick_validation
else
    # 대화형 모드
    main_menu
fi