#!/bin/bash

# Android APK 자동 빌드 스크립트
# 사용법: ./auto-build.sh [debug|release|both]

set -e

# 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
BUILD_OUTPUT_DIR="$PROJECT_ROOT/build-outputs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$BUILD_OUTPUT_DIR/build_$TIMESTAMP.log"

# 빌드 타입 (기본값: debug)
BUILD_TYPE=${1:-debug}

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 로그 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}
log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}
log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# 빌드 출력 디렉토리 생성
mkdir -p "$BUILD_OUTPUT_DIR"

# 로그 시작
echo "=========================================" | tee "$LOG_FILE"
echo "Android APK 자동 빌드 시작: $TIMESTAMP" | tee -a "$LOG_FILE"
echo "빌드 타입: $BUILD_TYPE" | tee -a "$LOG_FILE"
echo "=========================================" | tee -a "$LOG_FILE"

# 환경 변수 설정
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$HOME/Android/Sdk
export PATH=$PATH:$JAVA_HOME/bin
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/build-tools/34.0.0

# 환경 확인
log_info "환경 확인..."
echo "JAVA_HOME: $JAVA_HOME" | tee -a "$LOG_FILE"
echo "ANDROID_HOME: $ANDROID_HOME" | tee -a "$LOG_FILE"

# 프로젝트 디렉토리로 이동
cd "$PROJECT_ROOT"

# 1. Git 최신 코드 가져오기 (선택사항)
# log_info "Git 최신 코드 가져오기..."
# git pull origin main 2>&1 | tee -a "$LOG_FILE" || log_warn "Git pull 실패 또는 변경사항 없음"

# 2. 의존성 설치
log_info "의존성 확인..."
if [ ! -d "node_modules" ]; then
    log_info "의존성 설치 중..."
    pnpm install 2>&1 | tee -a "$LOG_FILE"
else
    log_info "의존성 이미 설치됨"
fi

# 3. 웹 앱 빌드
log_info "웹 앱 빌드..."
pnpm build 2>&1 | tee -a "$LOG_FILE"

# 4. Capacitor 동기화
log_info "Capacitor Android 동기화..."
npx cap sync android 2>&1 | tee -a "$LOG_FILE"

# 4.5. Capacitor 버그 수정 (cdvPluginPostBuildExtras)
if [ -f "android/capacitor-cordova-android-plugins/build.gradle" ]; then
    if ! grep -q "cdvPluginPostBuildExtras = \[\]" "android/capacitor-cordova-android-plugins/build.gradle"; then
        log_info "Capacitor 빌드 스크립트 버그 수정 중..."
        sed -i '/cordovaAndroidVersion/a\    cdvPluginPostBuildExtras = []' android/capacitor-cordova-android-plugins/build.gradle
    fi
fi

# 5. Android 디렉토리 존재 확인
if [ ! -d "android" ]; then
    log_error "Android 디렉토리가 없습니다. 'npx cap add android'를 먼저 실행하세요."
    exit 1
fi

# 6. Android 디렉토리로 이동
cd android

# 7. Gradle 실행 권한 확인
if [ ! -x "./gradlew" ]; then
    log_info "Gradlew 실행 권한 부여..."
    chmod +x ./gradlew
fi

# 8. Gradle 클린 (선택사항)
# log_info "Gradle 클린..."
# ./gradlew clean 2>&1 | tee -a "$LOG_FILE"

# 9. APK 빌드 함수
build_apk() {
    local type=$1
    log_info "=== $type APK 빌드 시작 ==="

    if [ "$type" = "debug" ]; then
        log_info "디버그 APK 빌드 중..."
        ./gradlew assembleDebug 2>&1 | tee -a "$LOG_FILE"

        APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
        OUTPUT_NAME="nanumpay-debug-$TIMESTAMP.apk"
    else
        log_info "릴리스 APK 빌드 중..."

        # 릴리스 빌드 (서명 없이)
        ./gradlew assembleRelease 2>&1 | tee -a "$LOG_FILE"

        APK_PATH="app/build/outputs/apk/release/app-release-unsigned.apk"
        OUTPUT_NAME="nanumpay-release-unsigned-$TIMESTAMP.apk"
    fi

    # APK 존재 확인 및 복사
    if [ -f "$APK_PATH" ]; then
        cp "$APK_PATH" "$BUILD_OUTPUT_DIR/$OUTPUT_NAME"
        log_info "✅ APK 생성 완료: $BUILD_OUTPUT_DIR/$OUTPUT_NAME"

        # 최신 버전 심볼릭 링크 생성
        ln -sf "$OUTPUT_NAME" "$BUILD_OUTPUT_DIR/nanumpay-$type-latest.apk"

        # 파일 크기 출력
        SIZE=$(du -h "$BUILD_OUTPUT_DIR/$OUTPUT_NAME" | cut -f1)
        log_info "파일 크기: $SIZE"

        return 0
    else
        log_error "❌ APK 파일을 찾을 수 없습니다: $APK_PATH"

        # 가능한 APK 위치 확인
        log_info "가능한 APK 파일 찾기..."
        find app/build/outputs -name "*.apk" 2>/dev/null | tee -a "$LOG_FILE"

        return 1
    fi
}

# 10. 빌드 실행
case "$BUILD_TYPE" in
    debug)
        build_apk "debug"
        ;;
    release)
        build_apk "release"
        ;;
    both)
        build_apk "debug"
        build_apk "release"
        ;;
    *)
        log_error "잘못된 빌드 타입: $BUILD_TYPE"
        echo "사용법: $0 [debug|release|both]"
        exit 1
        ;;
esac

# 11. 빌드 완료
echo "" | tee -a "$LOG_FILE"
echo "=========================================" | tee -a "$LOG_FILE"
log_info "🎉 빌드 완료!"
echo "빌드 결과물: $BUILD_OUTPUT_DIR" | tee -a "$LOG_FILE"
echo "로그 파일: $LOG_FILE" | tee -a "$LOG_FILE"
echo "=========================================" | tee -a "$LOG_FILE"

# 12. 오래된 빌드 파일 정리 (30일 이상) - 선택사항
# log_info "오래된 빌드 파일 정리..."
# find "$BUILD_OUTPUT_DIR" -name "*.apk" -mtime +30 -delete 2>/dev/null || true
# find "$BUILD_OUTPUT_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true

exit 0