# GitHub Actions 빌드 가이드

## 🎯 수동 빌드 방법 (Push 시 자동 빌드 X)

### 📱 iOS 빌드 실행

1. **GitHub 저장소 페이지 접속**
   ```
   https://github.com/tyranno/nanumpay
   ```

2. **Actions 탭 클릭**

3. **iOS Build 워크플로우 선택**

4. **Run workflow 버튼 클릭**
   - Build Type: `debug` (개발) 또는 `release` (배포)
   - TestFlight 배포: 체크 (선택사항)

5. **빌드 시작 (약 10-15분 소요)**

### 🤖 Android 빌드 실행

1. **Actions 탭 → Android Build 선택**

2. **Run workflow 버튼 클릭**
   - Build Type: `debug` 또는 `release`
   - GitHub Release 생성: 체크 (선택사항)

3. **빌드 완료 후 APK 다운로드**

## 💡 빌드 시나리오

### 개발 중 (일일 개발)
```bash
# Android 로컬 빌드로 테스트
pnpm app:build:android

# iOS는 건드리지 않음 (GitHub Actions 시간 절약)
```

### 주요 기능 완성 시
```bash
# 1. 코드 커밋
git add .
git commit -m "feat: 주요 기능 완성"
git push origin main

# 2. GitHub Actions에서 수동으로
# - iOS Build → Run workflow → debug
# - 테스트 확인
```

### 버전 출시 준비
```bash
# 1. 버전 태그 생성
git tag v1.0.0
git push origin v1.0.0

# 2. GitHub Actions에서
# - iOS Build → Run workflow → release + TestFlight
# - Android Build → Run workflow → release + GitHub Release
```

## ⏰ GitHub Actions 무료 시간 관리

### 월 2,000분 (33시간) 활용법

| 빌드 유형 | 소요 시간 | 월 가능 횟수 |
|----------|----------|-------------|
| iOS Debug | 10-15분 | 130-200회 |
| iOS Release | 15-20분 | 100-130회 |
| Android | 5-10분 | 200-400회 |

### 시간 절약 팁

1. **불필요한 자동 빌드 OFF**
   - push 할 때마다 빌드 ❌
   - 필요할 때만 수동 실행 ✅

2. **Android는 로컬에서**
   ```bash
   # 로컬 빌드 (무료, 빠름)
   pnpm app:build:android
   ```

3. **iOS만 GitHub Actions**
   - 주 1-2회 정도
   - 출시 직전 집중 테스트

## 🔧 워크플로우 설정 변경

### 자동 빌드 활성화 (필요시)
```yaml
# .github/workflows/ios-build.yml
on:
  workflow_dispatch:  # 수동 실행 유지
  push:  # 주석 해제
    branches:
      - main
    paths:
      - 'apps/app/**'  # app 폴더 변경 시만
```

### 특정 태그에만 자동 빌드
```yaml
on:
  workflow_dispatch:
  push:
    tags:
      - 'v*'  # v1.0.0 같은 태그 푸시 시
```

### 주간 자동 빌드 (정기 점검)
```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'  # 매주 일요일 자정
```

## 📊 빌드 상태 확인

### Actions 탭에서 확인
- ✅ 녹색: 성공
- ❌ 빨간색: 실패
- 🟡 노란색: 진행 중

### 빌드 결과물 다운로드
1. Actions 탭 → 완료된 워크플로우 클릭
2. Artifacts 섹션
3. 다운로드:
   - iOS: `ios-build.zip`
   - Android: `debug-apk.zip`

## 🚀 실제 사용 예시

### 시나리오 1: 버그 수정
```bash
# 1. Android에서 버그 수정 및 테스트
pnpm app:build:android
adb install apps/app/build-outputs/nanumpay-debug-latest.apk

# 2. 확인 완료 후 커밋
git add .
git commit -m "fix: 로그인 버그 수정"
git push origin main

# 3. iOS는 다음 주요 업데이트 때 빌드
```

### 시나리오 2: 새 버전 출시
```bash
# 1. 버전 업데이트
npm version patch  # 1.0.0 → 1.0.1

# 2. 푸시
git push origin main --tags

# 3. GitHub Actions에서 수동 실행
# - iOS: release + TestFlight ✅
# - Android: release + GitHub Release ✅
```

### 시나리오 3: 긴급 패치
```bash
# 1. 핫픽스 브랜치
git checkout -b hotfix/urgent-fix

# 2. 수정 및 푸시
git push origin hotfix/urgent-fix

# 3. GitHub Actions 수동 실행
# - 브랜치 선택하여 빌드
```

## ⚠️ 주의사항

1. **무료 시간 초과 시**
   - 다음 달까지 대기
   - 또는 유료 플랜 ($4/월부터)

2. **빌드 실패 시**
   - 로그 확인 (Actions 탭)
   - 주로 인증서/프로비저닝 문제

3. **Artifacts 보관 기간**
   - 90일 후 자동 삭제
   - 중요한 빌드는 별도 저장

## 💡 Pro Tips

### GitHub Actions 시간 확인
Settings → Billing → Actions 사용량 확인

### 빌드 캐시 활용
```yaml
- uses: actions/cache@v3
  with:
    path: |
      ~/.gradle/caches
      ~/.gradle/wrapper
    key: gradle-${{ hashFiles('**/*.gradle*') }}
```

### 병렬 빌드 (시간 단축)
```yaml
strategy:
  matrix:
    platform: [ios, android]
```

## 📞 문제 해결

### "빌드 시간 초과"
→ 무료 2,000분 소진 → 다음 달 대기

### "Provisioning Profile 오류"
→ Apple Developer에서 갱신 필요

### "Android 서명 오류"
→ Keystore 파일 GitHub Secrets 추가

---

💡 **핵심**: Android는 로컬에서, iOS만 필요할 때 GitHub Actions로!