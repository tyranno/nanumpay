#!/bin/bash

#################################################
# Android 빌드 환경 자동 구축 스크립트
#
# 이 스크립트는 다음 작업을 수행합니다:
# 1. Java 17 OpenJDK 설치
# 2. Android SDK 설치 및 설정
# 3. Android 빌드 도구 설치
# 4. 환경 변수 설정
# 5. Capacitor Android 프로젝트 초기화
#################################################

set -e  # 에러 발생 시 즉시 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 루트 권한 확인
check_sudo() {
    if ! sudo -n true 2>/dev/null; then
        log_info "이 스크립트는 일부 작업에 sudo 권한이 필요합니다."
        sudo -v
    fi
}

# OS 확인
check_os() {
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        log_error "이 스크립트는 Linux에서만 실행 가능합니다."
        exit 1
    fi
}

# Java 17 설치
install_java() {
    log_info "Java 17 OpenJDK 확인 중..."

    if ! command -v java &> /dev/null || ! java -version 2>&1 | grep -q "17"; then
        log_info "Java 17 설치 중..."
        sudo apt-get update
        sudo apt-get install -y openjdk-17-jdk
    else
        log_info "Java 17이 이미 설치되어 있습니다."
    fi

    # JAVA_HOME 설정
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
    log_info "JAVA_HOME: $JAVA_HOME"
}

# Android SDK 설치
install_android_sdk() {
    log_info "Android SDK 설치 중..."

    # Android SDK 경로 설정
    ANDROID_HOME=$HOME/Android/Sdk

    if [ ! -d "$ANDROID_HOME" ]; then
        log_info "Android SDK 디렉토리 생성 중..."
        mkdir -p "$ANDROID_HOME"
    fi

    # Command line tools 다운로드
    if [ ! -d "$ANDROID_HOME/cmdline-tools" ]; then
        log_info "Android Command Line Tools 다운로드 중..."
        cd /tmp
        wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
        unzip -q commandlinetools-linux-11076708_latest.zip
        mkdir -p "$ANDROID_HOME/cmdline-tools"
        mv cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
        rm commandlinetools-linux-11076708_latest.zip
        cd -
    else
        log_info "Android Command Line Tools가 이미 설치되어 있습니다."
    fi

    # 환경 변수 설정
    export ANDROID_HOME=$ANDROID_HOME
    export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

    # 라이센스 동의
    log_info "Android SDK 라이센스 동의 중..."
    yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null 2>&1 || true

    # 필요한 패키지 설치
    log_info "Android SDK 패키지 설치 중..."
    $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
        "platform-tools" \
        "platforms;android-35" \
        "build-tools;35.0.0" \
        "extras;google;google_play_services" \
        "extras;google;m2repository" \
        "extras;android;m2repository"

    log_info "Android SDK 설치 완료"
}

# bashrc에 환경 변수 추가
update_bashrc() {
    log_info "환경 변수를 ~/.bashrc에 추가 중..."

    # 기존 설정 제거
    sed -i '/# Android SDK Environment/,/# End Android SDK Environment/d' ~/.bashrc

    # 새 설정 추가
    cat >> ~/.bashrc << 'EOF'

# Android SDK Environment
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
# End Android SDK Environment
EOF

    log_info "환경 변수 설정 완료"
}

# Node.js 의존성 설치
install_node_deps() {
    log_info "Node.js 의존성 설치 중..."

    # apps/app 디렉토리로 이동
    cd "$(dirname "$0")"

    # npm 패키지 설치
    if [ -f "package.json" ]; then
        log_info "npm 패키지 설치 중..."
        npm install

        # Capacitor 관련 패키지 확인
        if ! npm list @capacitor/cli &>/dev/null; then
            log_info "Capacitor CLI 설치 중..."
            npm install -D @capacitor/cli @capacitor/core
        fi
    else
        log_error "package.json을 찾을 수 없습니다."
        exit 1
    fi
}

# Capacitor Android 프로젝트 설정
setup_capacitor_android() {
    log_info "Capacitor Android 프로젝트 설정 중..."

    cd "$(dirname "$0")"

    # 기존 Android 디렉토리 백업
    if [ -d "android" ]; then
        log_warning "기존 Android 디렉토리를 백업합니다..."
        mv android android.backup.$(date +%Y%m%d_%H%M%S)
    fi

    # capacitor.config 파일 확인
    if [ ! -f "capacitor.config.json" ] && [ ! -f "capacitor.config.ts" ]; then
        log_info "Capacitor 설정 파일 생성 중..."
        cat > capacitor.config.json << 'EOF'
{
  "appId": "com.nanumpay.app",
  "appName": "NanumPay",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  }
}
EOF
    fi

    # www 심볼릭 링크 생성
    if [ ! -e "www" ]; then
        log_info "www 심볼릭 링크 생성 중..."
        ln -s build www
    fi

    # 웹 앱 빌드
    log_info "웹 앱 빌드 중..."
    npm run build

    # Android 플랫폼 추가
    log_info "Capacitor Android 플랫폼 추가 중..."
    npx cap add android

    # Android 프로젝트 파일 수정
    setup_android_gradle_files

    # Capacitor sync
    log_info "Capacitor 동기화 중..."
    npx cap sync android || true
}

# Android Gradle 파일 설정
setup_android_gradle_files() {
    log_info "Android Gradle 파일 설정 중..."

    # local.properties 생성
    cat > android/local.properties << EOF
sdk.dir=$HOME/Android/Sdk
EOF

    # Java 17 설정 추가
    if [ -f "android/app/build.gradle" ]; then
        # compileOptions 추가 (이미 있으면 스킵)
        if ! grep -q "compileOptions" android/app/build.gradle; then
            sed -i '/android {/a\
\
    compileOptions {\
        sourceCompatibility JavaVersion.VERSION_17\
        targetCompatibility JavaVersion.VERSION_17\
    }' android/app/build.gradle
        fi
    fi

    # 전체 프로젝트에 Java 17 적용
    if [ -f "android/build.gradle" ]; then
        if ! grep -q "afterEvaluate" android/build.gradle; then
            cat >> android/build.gradle << 'EOF'

allprojects {
    afterEvaluate {
        if (plugins.hasPlugin('com.android.application') || plugins.hasPlugin('com.android.library')) {
            android {
                compileOptions {
                    sourceCompatibility JavaVersion.VERSION_17
                    targetCompatibility JavaVersion.VERSION_17
                }
            }
        }
    }
}
EOF
        fi
    fi

    # capacitor.settings.gradle 생성
    if [ ! -f "android/capacitor.settings.gradle" ]; then
        cat > android/capacitor.settings.gradle << 'EOF'
include ':capacitor-android'
project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')

include ':capacitor-preferences'
project(':capacitor-preferences').projectDir = new File('../node_modules/@capacitor/preferences/android')
EOF
    fi

    # capacitor.build.gradle 생성
    if [ ! -f "android/app/capacitor.build.gradle" ]; then
        cat > android/app/capacitor.build.gradle << 'EOF'
android {
    sourceSets {
        main {
            assets {
                srcDirs += "../node_modules/@capacitor/android/capacitor/src/main/assets"
            }
        }
    }
}

dependencies {
    implementation project(':capacitor-android')
    implementation project(':capacitor-preferences')
}

if (hasProperty('postBuildExtras')) {
    postBuildExtras()
}
EOF
    fi

    # capacitor.config.json 복사
    if [ -f "capacitor.config.json" ]; then
        cp capacitor.config.json android/
    fi

    # assets/public 디렉토리 생성
    mkdir -p android/app/src/main/assets/public
}

# 빌드 테스트
test_build() {
    log_info "테스트 빌드 실행 중..."

    cd "$(dirname "$0")"

    if [ -f "auto-build.sh" ]; then
        ./auto-build.sh debug

        if [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then
            log_info "✅ 빌드 성공!"
            log_info "APK 위치: android/app/build/outputs/apk/debug/app-debug.apk"
        else
            log_error "빌드 실패. 로그를 확인하세요."
            exit 1
        fi
    else
        log_error "auto-build.sh를 찾을 수 없습니다."
        exit 1
    fi
}

# 메인 함수
main() {
    echo "================================================"
    echo "Android 빌드 환경 구축 스크립트"
    echo "================================================"

    # OS 확인
    check_os

    # sudo 권한 확인
    check_sudo

    # Java 17 설치
    install_java

    # Android SDK 설치
    install_android_sdk

    # bashrc 업데이트
    update_bashrc

    # Node.js 의존성 설치
    install_node_deps

    # Capacitor Android 설정
    setup_capacitor_android

    # 빌드 테스트
    read -p "테스트 빌드를 실행하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_build
    fi

    echo "================================================"
    log_info "✅ Android 빌드 환경 구축 완료!"
    log_info "새 터미널을 열거나 'source ~/.bashrc'를 실행하여"
    log_info "환경 변수를 적용하세요."
    echo "================================================"
    echo ""
    log_info "빌드 명령어:"
    echo "  - Debug APK: ./auto-build.sh debug"
    echo "  - Release APK: ./auto-build.sh release"
    echo ""
    log_info "또는 프로젝트 루트에서:"
    echo "  - pnpm android:build:debug"
    echo "  - pnpm android:build:release"
    echo "================================================"
}

# 스크립트 실행
main "$@"