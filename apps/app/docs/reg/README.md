# 앱스토어 등록 자료 (App Store Registration Materials)

앱스토어(Google Play, Apple App Store) 등록에 필요한 자료입니다.

## 폴더 구조

```
reg/
├── README.md                    # 이 파일
├── app-icon-1024x1024.png       # 앱 아이콘 (1024x1024)
├── feature-graphic.svg          # 피처 그래픽 (1024x500)
├── app-description-ko.md        # 앱 설명 (한국어)
├── app-description-en.md        # 앱 설명 (영어)
├── data-safety-declaration.md   # 데이터 안전 신고서
├── store-console-guide.md       # 스토어 콘솔 입력 가이드 ⭐ NEW
└── screenshots/                 # 스크린샷
    ├── admin/                   # 관리자 화면
    │   ├── home.png             # 관리자 홈
    │   ├── members.png          # 용역자 관리
    │   ├── organization.png     # 조직도
    │   ├── payment.png          # 용역비 관리대장
    │   ├── planner-commission.png # 설계사 수수료
    │   ├── tax.png              # 세금 관리
    │   └── settings.png         # 설정
    ├── user/                    # 사용자(용역자) 화면
    │   ├── home.png             # 대시보드
    │   ├── income.png           # 수입 내역
    │   ├── network.png          # 네트워크
    │   └── profile.png          # 프로필
    └── planner/                 # 설계사 화면
        └── home.png             # 설계사 홈
```

## 필요 자료 체크리스트

### Google Play Store

| 항목 | 파일 | 상태 |
|-----|-----|-----|
| 앱 아이콘 (512x512) | app-icon-1024x1024.png (리사이즈 필요) | O |
| 피처 그래픽 (1024x500) | feature-graphic.svg → PNG 변환 필요 | O |
| 스크린샷 (최소 2장) | screenshots/ | O |
| 짧은 설명 (80자) | app-description-ko.md | O |
| 전체 설명 (4000자) | app-description-ko.md | O |
| 개인정보처리방침 URL | https://www.nanumasset.com/privacy | O |
| 데이터 안전 섹션 | data-safety-declaration.md | O |

### Apple App Store

| 항목 | 파일 | 상태 |
|-----|-----|-----|
| 앱 아이콘 (1024x1024) | app-icon-1024x1024.png | O |
| 스크린샷 (6.9", 6.7", 6.5", 5.5") | screenshots/ (리사이즈 필요) | O |
| 앱 설명 | app-description-ko.md | O |
| 개인정보처리방침 URL | https://www.nanumasset.com/privacy | O |
| App Privacy Details | data-safety-declaration.md | O |

## 스크린샷 재생성

```bash
# 스크린샷 스크립트 실행
node scripts/test/take-screenshots.cjs
```

## 이미지 변환

SVG → PNG 변환이 필요한 경우:

```bash
# ImageMagick 사용
convert feature-graphic.svg feature-graphic.png

# 또는 Inkscape 사용
inkscape feature-graphic.svg --export-type=png --export-filename=feature-graphic.png
```

## 정책 페이지 URL

| 페이지 | URL |
|-------|-----|
| 개인정보처리방침 | https://www.nanumasset.com/privacy |
| 이용약관 | https://www.nanumasset.com/terms |

---

**생성일**: 2025-12-12
**스크립트**: scripts/test/take-screenshots.cjs
