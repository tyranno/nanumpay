# iOS 앱 실제 구동 테스트 가이드

## 🚀 Mac 없이 iOS 앱 테스트하기

### 방법 1: Appetize.io (무료 체험)

**장점:**
- 브라우저에서 바로 iOS 시뮬레이터 실행
- 무료 플랜: 월 1분 무료 (데모용 충분)
- 실제 iOS 환경과 거의 동일

**설정 방법:**

1. **Appetize.io 계정 생성**
   - https://appetize.io 접속
   - 무료 계정 가입

2. **GitHub Actions 수정 - 실제 디바이스용 빌드**
   ```yaml
   # .github/workflows/ios-build-device.yml
   name: iOS Device Build for Testing

   on:
     workflow_dispatch:
       inputs:
         build_type:
           description: 'Build Type'
           required: true
           default: 'debug'
           type: choice
           options:
             - debug
             - release

   jobs:
     build:
       runs-on: macos-latest

       steps:
         - uses: actions/checkout@v4

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '20'

         - name: Install dependencies
           working-directory: ./apps/app
           run: |
             npm install
             npx cap sync ios

         - name: Build for Device
           working-directory: ./apps/app/ios/App
           run: |
             # 디바이스용 빌드 (서명 없이)
             xcodebuild -workspace App.xcworkspace \
                       -scheme App \
                       -configuration Debug \
                       -sdk iphoneos \
                       -derivedDataPath build \
                       CODE_SIGN_IDENTITY="" \
                       CODE_SIGNING_REQUIRED=NO \
                       CODE_SIGNING_ALLOWED=NO

         - name: Create IPA
           working-directory: ./apps/app/ios/App
           run: |
             # .app을 .ipa로 패키징
             mkdir -p Payload
             cp -r build/Build/Products/Debug-iphoneos/App.app Payload/
             zip -r NanumPay.ipa Payload

         - name: Upload IPA
           uses: actions/upload-artifact@v4
           with:
             name: ios-ipa-${{ github.run_number }}
             path: apps/app/ios/App/NanumPay.ipa
   ```

3. **Appetize.io에 업로드**
   - Appetize.io 대시보드에서 "Upload" 클릭
   - GitHub Actions에서 다운로드한 .ipa 파일 업로드
   - 업로드 완료 후 브라우저에서 바로 실행!

---

### 방법 2: BrowserStack (기업용, 무료 체험)

**장점:**
- 실제 기기 테스트 가능
- 다양한 iOS 버전 지원
- 30분 무료 체험

**사용법:**
1. https://www.browserstack.com/app-live 접속
2. 무료 체험 신청
3. .ipa 파일 업로드
4. 실제 iPhone/iPad에서 테스트

---

### 방법 3: TestFlight (실제 기기 테스트)

**요구사항:**
- Apple 개발자 계정 ($99/년)
- 실제 iPhone/iPad 필요

**GitHub Actions 자동 배포 설정:**

```yaml
# .github/workflows/ios-testflight.yml
name: Deploy to TestFlight

on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: ./apps/app
        run: |
          npm install
          npx cap sync ios

      - name: Setup certificates
        env:
          BUILD_CERTIFICATE_BASE64: ${{ secrets.BUILD_CERTIFICATE_BASE64 }}
          P12_PASSWORD: ${{ secrets.P12_PASSWORD }}
          BUILD_PROVISION_PROFILE_BASE64: ${{ secrets.BUILD_PROVISION_PROFILE_BASE64 }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          # 인증서 설정 (Apple 개발자 계정 필요)
          # ... 인증서 설정 코드 ...

      - name: Build and Upload to TestFlight
        working-directory: ./apps/app/ios/App
        env:
          APP_STORE_CONNECT_API_KEY_ID: ${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}
          APP_STORE_CONNECT_ISSUER_ID: ${{ secrets.APP_STORE_CONNECT_ISSUER_ID }}
          APP_STORE_CONNECT_API_KEY_BASE64: ${{ secrets.APP_STORE_CONNECT_API_KEY_BASE64 }}
        run: |
          xcodebuild -workspace App.xcworkspace \
                    -scheme App \
                    -configuration Release \
                    -archivePath $PWD/build/App.xcarchive \
                    clean archive

          xcodebuild -exportArchive \
                    -archivePath $PWD/build/App.xcarchive \
                    -exportOptionsPlist ExportOptions.plist \
                    -exportPath $PWD/build

          xcrun altool --upload-app \
                      -f build/App.ipa \
                      -type ios \
                      --apiKey $APP_STORE_CONNECT_API_KEY_ID \
                      --apiIssuer $APP_STORE_CONNECT_ISSUER_ID
```

---

### 방법 4: 웹 브라우저에서 iOS 시뮬레이션

가장 간단한 방법으로, 개발 중 빠른 테스트용:

```bash
# 앱 개발 서버 실행
cd apps/app
pnpm dev --host

# 브라우저에서 접속
# Chrome/Edge: F12 → 모바일 뷰 → iPhone 선택
# Safari: 개발자 도구 → Responsive Design Mode
```

**Safari에서 더 정확한 iOS 시뮬레이션:**
1. Safari 열기
2. 개발자 메뉴 활성화 (환경설정 → 고급 → 메뉴 막대에서 개발자 메뉴 보기)
3. 개발자 → 사용자 에이전트 → Safari - iOS
4. 개발자 → 반응형 디자인 모드 (Cmd+Ctrl+R)

---

### 방법 5: iOS 시뮬레이터 원격 접속 (AWS Mac)

**AWS EC2 Mac 인스턴스 사용:**
- 시간당 $1.083 (최소 24시간)
- 실제 Mac 환경
- Xcode 시뮬레이터 사용 가능

설정이 복잡하지만 완벽한 Mac 개발 환경을 제공합니다.

---

## 🎯 추천 테스트 전략

### 개발 단계별 추천:

1. **초기 개발**: 웹 브라우저 iOS 시뮬레이션
2. **기능 테스트**: Appetize.io 무료 체험
3. **릴리즈 전**: BrowserStack 30분 체험
4. **실제 배포**: TestFlight (Apple 개발자 계정 필요)

### Web Container 앱의 경우:

귀하의 앱은 웹 컨테이너이므로:
1. **웹 브라우저 테스트로 90% 커버 가능**
2. **Appetize.io로 네이티브 기능 확인**
3. **최종 배포 전 TestFlight 권장**

---

## 📱 빠른 시작 (Appetize.io)

### 1분 안에 테스트 시작하기:

1. **GitHub Actions 실행**
   ```bash
   # GitHub 웹사이트에서:
   # Actions → iOS Build → Run workflow
   ```

2. **IPA 다운로드**
   - Actions 완료 후 Artifacts 다운로드

3. **Appetize.io 업로드**
   - https://appetize.io/upload
   - 다운로드한 .ipa 파일 드래그 앤 드롭

4. **브라우저에서 실행!**
   - 생성된 링크 클릭
   - 실제 iOS처럼 터치/스와이프 가능

---

## 💡 팁

### Appetize.io 무료 사용 팁:
- 1분 제한이지만 페이지 새로고침하면 리셋
- 주요 기능만 빠르게 테스트
- 스크린샷 캡처 가능

### 비용 절감 팁:
- 개발은 웹 브라우저로
- 중요 테스트만 Appetize.io
- 최종 확인은 지인의 iPhone 활용

---

## 🔧 문제 해결

### .ipa 파일이 Appetize.io에서 안 열릴 때:

1. **서명 문제인 경우:**
   ```yaml
   # GitHub Actions에 추가
   CODE_SIGN_IDENTITY=""
   CODE_SIGNING_REQUIRED=NO
   ```

2. **아키텍처 문제인 경우:**
   ```yaml
   # arm64와 x86_64 모두 빌드
   -arch arm64 -arch x86_64
   ```

### 앱이 느릴 때:
- Appetize.io는 스트리밍이므로 인터넷 속도 영향
- 오전 시간대가 덜 붐빔

---

## 📚 추가 자료

- [Appetize.io 문서](https://docs.appetize.io)
- [BrowserStack 가이드](https://www.browserstack.com/docs)
- [TestFlight 설정](https://developer.apple.com/testflight/)

---

마지막 업데이트: 2025-10-27