# iOS 빌드를 위한 Mac 사양 가이드

## 📱 최소 요구사항 (Minimum)

### Mac Mini M1 (2020) - 추천
- **CPU**: Apple M1 (8코어)
- **RAM**: 8GB
- **저장공간**: 256GB SSD
- **가격**: 중고 40-50만원 / 신품 85만원
- **빌드 시간**: 약 3-5분
- **평가**: ✅ 가성비 최고, 개인 개발자 추천

### Mac Mini Intel (2018)
- **CPU**: Intel Core i3 (쿼드코어)
- **RAM**: 8GB
- **저장공간**: 128GB SSD
- **가격**: 중고 30-40만원
- **빌드 시간**: 약 5-8분
- **평가**: ⚠️ 사용 가능하나 느림

### MacBook Air M1 (2020)
- **CPU**: Apple M1 (8코어)
- **RAM**: 8GB
- **저장공간**: 256GB SSD
- **가격**: 중고 80-100만원 / 신품 130만원
- **빌드 시간**: 약 3-5분
- **평가**: ✅ 휴대성 필요시 추천

## 🚀 권장 사양 (Recommended)

### Mac Mini M2 (2023)
- **CPU**: Apple M2 (8코어)
- **RAM**: 16GB
- **저장공간**: 512GB SSD
- **가격**: 신품 110만원부터
- **빌드 시간**: 약 2-3분
- **평가**: ✅✅ 최적의 성능/가격 밸런스

### Mac Studio M2 Max (2023)
- **CPU**: Apple M2 Max (12코어)
- **RAM**: 32GB
- **저장공간**: 512GB SSD
- **가격**: 신품 280만원부터
- **빌드 시간**: 약 1-2분
- **평가**: 💎 팀 개발/CI 서버용

## 🛠️ 소프트웨어 요구사항

### 운영체제
- **최소**: macOS Monterey 12.0
- **권장**: macOS Sonoma 14.0 이상
- **필수**: 최신 버전 유지 (App Store 제출 요구사항)

### Xcode
- **최소**: Xcode 14.0
- **권장**: Xcode 15.0 이상
- **용량**: 약 10-15GB
- **다운로드**: Mac App Store (무료)

### 개발 도구
```bash
# Homebrew 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js 설치
brew install node@18

# CocoaPods 설치
sudo gem install cocoapods

# Fastlane 설치 (선택)
brew install fastlane
```

## 💾 저장 공간 요구사항

### 최소 여유 공간
- **Xcode**: 15GB
- **iOS Simulator**: 5GB per device
- **프로젝트 빌드 캐시**: 10GB
- **node_modules**: 2GB
- **Android Studio** (선택): 10GB
- **총 권장 여유 공간**: 50GB 이상

### 저장 공간 관리 팁
```bash
# Xcode 캐시 정리
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# 오래된 시뮬레이터 삭제
xcrun simctl delete unavailable

# CocoaPods 캐시 정리
pod cache clean --all
```

## 🔋 성능 비교

| 모델 | 빌드 시간 | 가격대 | 전력 소비 | 추천도 |
|------|----------|--------|----------|--------|
| Mac Mini M1 8GB | 3-5분 | 40-50만 | 20W | ⭐⭐⭐⭐⭐ |
| Mac Mini M2 16GB | 2-3분 | 110만 | 25W | ⭐⭐⭐⭐ |
| MacBook Air M1 | 3-5분 | 80-100만 | 30W | ⭐⭐⭐⭐ |
| Mac Studio M2 Max | 1-2분 | 280만+ | 60W | ⭐⭐⭐ |
| Mac Mini Intel i3 | 5-8분 | 30-40만 | 65W | ⭐⭐ |

## 💰 비용 절감 팁

### 1. 중고 Mac Mini M1 (최고 가성비)
- **리퍼비시**: Apple 공식 리퍼 제품 (보증 1년)
- **당근마켓**: 40-50만원 선
- **세컨웨어**: 검증된 중고 판매점

### 2. Mac Mini 호스팅 서비스
- **MacStadium**: 월 $99 (약 13만원)
- **MacinCloud**: 시간당 $1 (약 1,300원)
- **Scaleway**: 월 €59.99 (약 8만원)

### 3. 친구/동료와 공유
- 여러 개발자가 하나의 Mac 공유
- TeamViewer/AnyDesk로 원격 접속
- Jenkins/Fastlane으로 자동화

## 📊 프로젝트별 권장 사양

### NanumPay 같은 단순 WebView 앱
- **최소**: Mac Mini M1 8GB
- **이유**: 네이티브 기능 최소, 빌드 빠름
- **예상 빌드 시간**: 2-3분

### 복잡한 네이티브 앱
- **권장**: Mac Mini M2 16GB 이상
- **이유**: 다양한 라이브러리, 큰 프로젝트
- **예상 빌드 시간**: 5-10분

### 팀 개발/CI 서버
- **권장**: Mac Studio M2 Max 32GB
- **이유**: 동시 다중 빌드, 24시간 운영
- **예상 빌드 시간**: 1-2분

## 🎯 결론 및 추천

### 개인 개발자 (예산 제한)
**Mac Mini M1 8GB (중고)** - 40-50만원
- Capacitor 앱 빌드 충분
- 전력 효율 최고
- 소음 없음

### 개인 개발자 (예산 여유)
**Mac Mini M2 16GB (신품)** - 110만원
- 미래 대비 투자
- 다양한 프로젝트 대응
- 5년 이상 사용 가능

### 스타트업/소규모 팀
**Mac Mini M2 Pro 32GB** - 180만원
- 팀원 공유 가능
- CI/CD 서버 겸용
- 동시 빌드 지원

### 기업/대규모 팀
**Mac Studio M2 Ultra** - 500만원+
- 전용 빌드 서버
- 수십 개 동시 빌드
- 엔터프라이즈급 성능

## ⚠️ 주의사항

1. **Intel Mac 구매 주의**
   - Apple Silicon 전환 완료
   - Intel Mac 지원 중단 예정
   - M1 이상 구매 권장

2. **RAM 업그레이드 불가**
   - Apple Silicon Mac은 RAM 추가 불가
   - 구매 시 충분한 RAM 선택 필수

3. **macOS 버전 확인**
   - 최신 Xcode는 최신 macOS 필요
   - 구형 Mac은 macOS 업데이트 제한

4. **Apple Developer 계정**
   - 연 $99 (약 13만원)
   - 실제 디바이스 테스트 필수
   - App Store 배포 필수

## 🔗 유용한 링크

- [Apple Refurbished Store](https://www.apple.com/kr/shop/refurbished)
- [Mac 성능 비교](https://www.apple.com/kr/mac/compare/)
- [Xcode 시스템 요구사항](https://developer.apple.com/kr/xcode/)
- [macOS Sonoma 호환성](https://support.apple.com/ko-kr/HT213843)

## 💡 FAQ

### Q: M1 8GB로 충분한가요?
**A**: Capacitor/WebView 앱은 충분합니다. 복잡한 네이티브 앱은 16GB 권장.

### Q: Intel Mac도 괜찮나요?
**A**: 2-3년 내 지원 중단 예상. M1 이상 구매 권장.

### Q: 맥북 vs 맥 미니?
**A**: 고정 작업장 있으면 Mac Mini (가성비), 이동 필요하면 MacBook.

### Q: 중고 구매 시 주의점?
**A**: 배터리 상태(MacBook), 보증 기간, macOS 업데이트 가능 여부 확인.

### Q: 원격으로만 사용 가능?
**A**: 가능. MacinCloud, MacStadium 등 클라우드 서비스 활용.