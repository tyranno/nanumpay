# NanumPay Android App 빌드 가이드

## 📱 개요
NanumPay 모바일 앱은 Capacitor를 사용하여 웹 서비스를 Android/iOS 앱으로 패키징합니다.

## 🚀 빠른 시작

### 1. 환경 구축 (최초 1회)
프로젝트 루트에서:
```bash
# Android 빌드 환경 자동 구축
pnpm app:setup

# 또는 apps/app 디렉토리에서
./setup-android-env.sh
```

### 2. APK 빌드
프로젝트 루트에서:
```bash
# Debug APK 빌드 (개발용)
pnpm app:build:android

# Release APK 빌드 (배포용)
pnpm app:build:android:release
```

또는 apps/app 디렉토리에서:
```bash
# Debug APK
./auto-build.sh debug

# Release APK
./auto-build.sh release
```

### 3. 빌드 결과
- Debug APK: `apps/app/build-outputs/nanumpay-debug-latest.apk`
- Release APK: `apps/app/build-outputs/nanumpay-release-latest.apk`

## 📋 환경 요구사항

### 자동 설치 (setup-android-env.sh가 처리)
- ✅ Java 17 OpenJDK
- ✅ Android SDK (API Level 35)
- ✅ Android Build Tools
- ✅ Gradle
- ✅ Capacitor CLI

### 수동 설치가 필요한 항목
- Node.js 18+ 및 pnpm
- Git

## 🛠️ 주요 명령어

### 프로젝트 루트에서
```bash
# 의존성 설치
pnpm install

# 웹 앱 개발 서버
pnpm dev:app

# 웹 앱 빌드
pnpm build:app

# Capacitor 동기화
pnpm cap:sync

# Android Studio 열기
pnpm cap:android

# Android 환경 구축
pnpm android:setup

# Debug APK 빌드
pnpm android:build:debug

# Release APK 빌드
pnpm android:build:release

# Android 빌드 정리
pnpm android:clean
```

### apps/app 디렉토리에서
```bash
# 환경 구축
./setup-android-env.sh

# 자동 빌드
./auto-build.sh [debug|release]

# Gradle 직접 실행
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```

## 📁 프로젝트 구조
```
apps/app/
├── src/                    # SvelteKit 소스 코드
├── android/                # Android 네이티브 프로젝트
├── ios/                    # iOS 네이티브 프로젝트 (미구현)
├── build/                  # 빌드된 웹 앱
├── www/                    # build 심볼릭 링크
├── build-outputs/          # APK 출력 디렉토리
├── capacitor.config.json   # Capacitor 설정
├── auto-build.sh          # 자동 빌드 스크립트
└── setup-android-env.sh   # 환경 구축 스크립트
```

## 🔧 설정 파일

### capacitor.config.json
```json
{
  "appId": "com.nanumpay.app",
  "appName": "NanumPay",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  }
}
```

### 서버 URL 설정 (src/lib/config.js)
```javascript
export const DEFAULT_SERVER_URL = 'https://nanumpay.com';
```

## 📝 빌드 프로세스

1. **웹 앱 빌드**: SvelteKit 정적 사이트 생성
2. **Capacitor Sync**: 웹 자산을 네이티브 프로젝트로 복사
3. **Gradle Build**: Android APK 생성
4. **APK 복사**: build-outputs 디렉토리로 복사

## 🐛 문제 해결

### Java 버전 오류
```bash
# Java 17 설치 확인
java -version

# JAVA_HOME 설정
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

### Android SDK 경로 오류
```bash
# ANDROID_HOME 설정
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### Capacitor Sync 오류
```bash
# www 심볼릭 링크 재생성
rm -f www
ln -s build www

# Capacitor 재동기화
npx cap sync android
```

### 빌드 캐시 문제
```bash
# Gradle 캐시 정리
cd android
./gradlew clean

# 전체 재빌드
cd ..
./auto-build.sh debug
```

## 📱 APK 설치

### ADB를 통한 설치
```bash
# 디바이스 연결 확인
adb devices

# APK 설치
adb install build-outputs/nanumpay-debug-latest.apk
```

### 수동 설치
1. APK 파일을 Android 디바이스로 복사
2. 파일 관리자에서 APK 실행
3. "출처를 알 수 없는 앱" 설치 허용
4. 설치 진행

## 🚀 배포

### Release APK 서명
Release APK는 배포 전 서명이 필요합니다:
```bash
# 키스토어 생성 (최초 1회)
keytool -genkey -v -keystore nanumpay.keystore -alias nanumpay -keyalg RSA -keysize 2048 -validity 10000

# APK 서명
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore nanumpay.keystore app-release-unsigned.apk nanumpay

# APK 최적화
zipalign -v 4 app-release-unsigned.apk nanumpay-release-signed.apk
```

### Google Play Store 업로드
1. Google Play Console 접속
2. 앱 생성 또는 선택
3. 릴리스 관리 → 앱 릴리스
4. 서명된 APK 업로드
5. 릴리스 정보 입력
6. 검토 및 출시

## 📖 참고 문서

- [Capacitor 공식 문서](https://capacitorjs.com/docs)
- [Android 개발자 문서](https://developer.android.com/docs)
- [SvelteKit 문서](https://kit.svelte.dev/docs)

## 🤝 지원

문제가 있으신가요?
- 프로젝트 이슈 트래커에 문제를 보고해주세요
- 자세한 로그와 함께 오류 메시지를 포함해주세요
- 빌드 환경 정보를 제공해주세요 (OS, Node 버전, Java 버전 등)