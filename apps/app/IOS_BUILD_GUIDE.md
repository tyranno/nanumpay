# iOS 빌드 가이드 (Linux/Windows 환경)

## 🍎 개요
iOS 앱은 Apple의 정책상 macOS에서만 빌드가 가능합니다. Linux나 Windows 환경에서는 다음과 같은 방법을 사용할 수 있습니다.

## 📱 iOS 빌드 옵션

### 옵션 1: 클라우드 빌드 서비스 (권장)

#### 1. **Expo EAS Build** (무료 티어 제공)
```bash
# EAS CLI 설치
npm install -g eas-cli

# EAS 로그인
eas login

# 프로젝트 설정
eas build:configure

# iOS 빌드 시작
eas build --platform ios
```

**장점:**
- 무료 티어 제공 (월 30회 빌드)
- Apple Developer 계정만 있으면 됨
- 자동 서명 관리

**단점:**
- Expo/React Native 기반 프로젝트에 최적화
- Capacitor 프로젝트는 추가 설정 필요

#### 2. **Appflow (Ionic 공식)**
```bash
# Appflow CLI 설치
npm install -g @ionic/cli

# 로그인
ionic login

# 프로젝트 연결
ionic link

# iOS 빌드
ionic package build ios
```

**장점:**
- Capacitor 완벽 지원 (Ionic 공식 서비스)
- 자동 서명 및 배포
- CI/CD 파이프라인 제공

**단점:**
- 유료 서비스 (무료 평가판 14일)
- 월 $29부터 시작

**가격:**
- Starter: $29/월 (100 빌드)
- Growth: $129/월 (무제한 빌드)

#### 3. **Codemagic**
```yaml
# codemagic.yaml
workflows:
  ios-workflow:
    name: iOS Workflow
    environment:
      node: 18
      xcode: latest
    scripts:
      - name: Install dependencies
        script: |
          npm install
          npx cap sync ios
    artifacts:
      - build/ios/ipa/*.ipa
```

**장점:**
- 500분/월 무료
- YAML 기반 설정
- 다양한 프레임워크 지원

**단점:**
- 설정이 복잡함
- 무료 시간 제한

#### 4. **GitHub Actions + macOS Runner**
```yaml
# .github/workflows/ios-build.yml
name: iOS Build
on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm install
          npm run build
          npx cap sync ios

      - name: Build iOS
        run: |
          cd ios/App
          xcodebuild -workspace App.xcworkspace \
            -scheme App \
            -configuration Release \
            -archivePath build/App.xcarchive \
            archive
```

**장점:**
- GitHub 통합
- 무료 (공개 저장소: 무제한, 비공개: 월 2000분)
- 버전 관리와 통합

**단점:**
- 빌드 시간이 느림
- 설정 복잡

### 옵션 2: 원격 Mac 렌탈

#### **MacinCloud**
- 가격: $1/시간 또는 월 $20부터
- 원격 데스크톱 접속
- Xcode 사전 설치

#### **MacStadium**
- 가격: 월 $99부터
- 전용 Mac Mini 렌탈
- CI/CD 통합 가능

### 옵션 3: 로컬 Mac 구매/대여
- Mac Mini M2: 약 $599부터
- 중고 Mac Mini: 약 $300부터
- 일시적 대여: 일 2-3만원

## 🚀 Appflow 설정 가이드 (Capacitor 권장)

### 1. 계정 설정
```bash
# Ionic/Appflow 계정 생성
# https://dashboard.ionicframework.com/signup

# CLI 설치
npm install -g @ionic/cli

# 로그인
ionic login
```

### 2. 프로젝트 연결
```bash
# 프로젝트 루트에서
cd apps/app

# Appflow에 앱 연결
ionic link

# capacitor.config.ts 확인
# appId가 Apple Developer에 등록된 Bundle ID와 일치해야 함
```

### 3. 인증서 설정
1. Apple Developer 콘솔에서 인증서 생성
2. Provisioning Profile 다운로드
3. Appflow 대시보드에서 업로드

### 4. 빌드 설정
```bash
# package.json에 빌드 스크립트 추가
{
  "scripts": {
    "ionic:build": "npm run build",
    "ionic:capacitor:copy": "npx cap copy",
    "ionic:capacitor:update": "npx cap update"
  }
}
```

### 5. 빌드 실행
```bash
# CLI로 빌드
ionic package build ios --type development

# 또는 웹 대시보드에서 빌드
# https://dashboard.ionicframework.com
```

## 🔧 로컬 준비사항

### iOS 빌드를 위한 사전 준비
```bash
# 1. Capacitor iOS 플랫폼 추가 (Linux에서도 가능)
npx cap add ios

# 2. 웹 빌드
npm run build

# 3. Capacitor 동기화
npx cap sync ios

# 4. iOS 프로젝트 생성 완료
# ios/ 폴더가 생성되며, 이를 클라우드 서비스에 업로드
```

### Apple Developer 계정 필요사항
- Apple Developer Program 가입 ($99/년)
- App ID 생성
- 인증서 및 Provisioning Profile 생성
- 디바이스 등록 (개발/테스트용)

## 📝 설정 파일 예시

### appflow.config.json
```json
{
  "apps": [
    {
      "appId": "YOUR_APP_ID",
      "name": "NanumPay",
      "type": "capacitor",
      "root": "apps/app",
      "webDir": "build"
    }
  ]
}
```

### capacitor.config.ts (iOS 설정 추가)
```typescript
const config: CapacitorConfig = {
  appId: 'com.nanumpay.app',
  appName: 'NanumPay',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    iosScheme: 'ionic'  // iOS 스킴 추가
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  }
};
```

## 💰 비용 비교

| 서비스 | 무료 티어 | 유료 플랜 | 특징 |
|--------|-----------|-----------|------|
| **Expo EAS** | 30빌드/월 | $29/월 | 간단한 설정 |
| **Appflow** | 14일 평가판 | $29/월부터 | Capacitor 공식 |
| **Codemagic** | 500분/월 | $38/월부터 | 유연한 설정 |
| **GitHub Actions** | 2000분/월 | $4/월부터 | GitHub 통합 |
| **MacinCloud** | - | $20/월부터 | 원격 Mac |

## 🎯 추천 방법

### 개발/테스트 단계
1. **GitHub Actions** (무료, 비공개 저장소 2000분)
2. **Codemagic** (무료 500분)

### 프로덕션 단계
1. **Appflow** (Capacitor 공식 지원)
2. **Expo EAS** (React Native 마이그레이션 시)

### 예산이 충분한 경우
- 중고 Mac Mini 구매 (30-50만원)
- 장기적으로 가장 경제적

## 📱 TestFlight 배포

iOS 앱을 테스트하려면 TestFlight를 사용:

```bash
# 1. Archive 생성 (Mac 또는 클라우드)
xcodebuild archive

# 2. IPA 생성
xcodebuild -exportArchive

# 3. App Store Connect 업로드
xcrun altool --upload-app

# 4. TestFlight에서 테스터 초대
```

## 🔗 유용한 링크

- [Appflow 문서](https://ionic.io/docs/appflow)
- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Codemagic Capacitor 가이드](https://docs.codemagic.io/getting-started/building-a-capacitor-app/)
- [GitHub Actions macOS Runner](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners)
- [Apple Developer Program](https://developer.apple.com/programs/)

## ⚠️ 주의사항

1. **Apple Developer 계정 필수**
   - 연 $99 비용
   - 앱스토어 배포시 필수

2. **Bundle ID 일치**
   - capacitor.config.ts의 appId
   - Apple Developer의 App ID
   - 모두 일치해야 함

3. **인증서 관리**
   - Development: 개발/테스트용
   - Distribution: 배포용
   - Push Notification: 푸시 알림용

4. **iOS 버전 호환성**
   - 최소 iOS 13.0 이상
   - 최신 Xcode 버전 권장

## 🆘 문제 해결

### "No valid signing identity found"
- Apple Developer 계정 확인
- 인증서 재생성
- Provisioning Profile 업데이트

### "Missing compliance"
- Info.plist에 암호화 사용 여부 명시
- App Store Connect에서 수출 규정 준수 확인

### 빌드 실패
- Node 버전 확인 (18+)
- Capacitor 버전 호환성
- iOS 플랫폼 재생성: `npx cap add ios`