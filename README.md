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

## 📖 추가 정보

- 공통 개발 도구(Prettier, ESLint 등)는 루트에서 관리
- 앱/웹 전용 패키지는 각 워크스페이스에서 `pnpm --filter` 로 설치
