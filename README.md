# NanumPay(나눔에셋 수당관리)

보험 판매 수당 지급 관리 및 현황 시스템 **NanumPay** 프로젝트입니다.  
이 레포지토리는 **Web SSR 서버**와 **App(Capacitor Wrapper)** 를 하나의 Monorepo로 관리합니다.

---

## 📂 프로젝트 구조

```
nanumpay/
 ├ apps/
 │   ├ app/   # Capacitor + SvelteKit (adapter-static)
 │   │        # - 서버 주소 입력 화면 (app-setup)
 │   │        # - 저장된 주소로 Web SSR 진입
 │   │
 │   └ web/   # SvelteKit SSR (adapter-exe)
 │            # - NanumPay Web 서비스 (대시보드, 사용자 관리 등)
 │
 ├ pnpm-workspace.yaml
 ├ package.json
 └ README.md
```

---

## ⚙️ 개발 환경

- [SvelteKit](https://kit.svelte.dev/) (v2)
- [Svelte 5](https://svelte.dev/)
- [Vite](https://vitejs.dev/)
- [TailwindCSS](https://tailwindcss.com/) (v4)
- [Capacitor](https://capacitorjs.com/) (v7)
- [pnpm](https://pnpm.io/) (Workspace 관리)

---

## 🚀 개발 방법

### Web (SSR 서버)

```bash
# web 개발 서버 실행
cd apps/web
pnpm run dev

# 루트에서 실행도 가능
pnpm --filter nanumpay-web dev
```

### App (Android/iOS)

```bash
# app 개발 서버 실행
cd apps/app
pnpm run dev

# Android 환경 구축 (최초 1회)
pnpm app:setup

# Android Debug APK 빌드
pnpm app:build:android

# Android Release APK 빌드
pnpm app:build:android:release

# Capacitor 동기화
pnpm cap:sync

# Android Studio 열기
pnpm cap:android
```

---

## 🏗️ 빌드 방법

### Web (SSR 서버 실행 파일)

```bash
pnpm --filter nanumpay-web build
```

- `apps/web/build/` 또는 `dist/` 에 결과물이 생성됩니다.

### App (Android APK 빌드)

```bash
# Android 빌드 환경 구축 (최초 1회)
pnpm app:setup

# Debug APK 빌드
pnpm app:build:android

# Release APK 빌드
pnpm app:build:android:release
```

- APK 파일 위치: `apps/app/build-outputs/nanumpay-debug-latest.apk`
- 자세한 빌드 가이드: [apps/app/BUILD_README.md](apps/app/BUILD_README.md)

---

## 📌 동작 개요

- **App**
  - 오프라인 상태에서 서버 주소 설정 (app-setup)
  - 이후 Web SSR 서버를 WebView로 감싸서 표시
- **Web**
  - 실제 NanumPay 서비스 UI와 비즈니스 로직 제공
  - SSR 지원 (adapter-exe 사용)

---

## 🚀 CI/CD (GitHub Actions)

### 자동 빌드
- **Android**: Push to main → APK 자동 빌드
- **iOS**: Push to main → iOS 앱 자동 빌드 (macOS runner)

### 수동 실행
GitHub Actions 탭에서 "Run workflow" 클릭

### 빌드 상태
![Android Build](https://github.com/tyranno/nanumpay/actions/workflows/android-build.yml/badge.svg)
![iOS Build](https://github.com/tyranno/nanumpay/actions/workflows/ios-build.yml/badge.svg)

## 📱 모바일 앱 빌드

### Android (Linux/Windows/Mac)
- 로컬 빌드 가능: `pnpm app:build:android`
- 자세한 가이드: [apps/app/BUILD_README.md](apps/app/BUILD_README.md)

### iOS (Mac 필요)
- 클라우드 빌드 권장 (Appflow, EAS Build)
- 자세한 가이드: [apps/app/IOS_BUILD_GUIDE.md](apps/app/IOS_BUILD_GUIDE.md)

## 🌐 서버 배포

### 배포 명령어

```bash
# 테스트 서버 (www.nanumpay.xyz)
pnpm release:deploy:test

# 본 서버 (www.nanumasset.com)
pnpm release:deploy:web

# HTTPS 전용 모드 (HTTP → HTTPS 리다이렉트)
pnpm release:deploy:test --redirect
pnpm release:deploy:web --redirect
```

### 배포 시 자동 설정 항목
- Nginx 리버스 프록시 (포트 80/443)
- MongoDB 설치 및 초기화
- Let's Encrypt SSL 인증서 (자동 갱신 포함)
- 정적 페이지 (`/privacy`, `/terms`)

### SSL/HTTPS
- **기본 모드**: HTTP + HTTPS 병행
- **인증서**: Let's Encrypt (90일 유효, 자동 갱신)
- **자동 갱신**: systemd timer (하루 2회)

---

## 📋 앱스토어 정책 페이지

앱스토어 등록 시 필요한 정적 페이지입니다. 인증 없이 접근 가능합니다.

| 페이지 | URL |
|-------|-----|
| 개인정보처리방침 | https://www.nanumasset.com/privacy |
| 이용약관 | https://www.nanumasset.com/terms |

**소스 위치**: `apps/web/install/linux/static/`

---

## 📖 추가 정보

- 공통 개발 도구(Prettier, ESLint 등)는 루트에서 관리
- 앱/웹 전용 패키지는 각 워크스페이스에서 `pnpm --filter` 로 설치
- 상세 배포 가이드: [docs/배포_및_SSL_설정_가이드.md](docs/배포_및_SSL_설정_가이드.md)
