# NanumPay App - 기술 문서

**프로젝트**: NanumPay Mobile App (Capacitor + SvelteKit)
**최종 업데이트**: 2025-10-27
**버전**: 1.0.0

---

## 📌 빠른 시작 가이드

### 개발 환경 구동
```bash
# 1. 의존성 설치
pnpm install

# 2. 개발 서버 실행
pnpm dev

# 3. 빌드
pnpm build

# 4. Android 앱 실행
npx cap sync android
npx cap open android

# 5. iOS 앱 실행
npx cap sync ios
npx cap open ios
```

### 핵심 설정
- **기본 서버 URL**: `http://localhost:3100` (config.js에서 변경 가능)
- **앱 ID**: `com.nanumpay.app`
- **앱 이름**: NanumPay

---

## 🎯 프로젝트 개요

### 목적
Web 서버(`apps/web`)를 모바일 앱으로 래핑하는 하이브리드 앱 쉘

### 핵심 기능
1. **서버 연결 확인**: Health Check API(`/api/health`)를 통한 서버 상태 확인
2. **자동 리다이렉트**: 서버 연결 성공 시 웹 페이지로 완전 이동
3. **설정 관리**: 서버 URL 설정 및 저장 (디바이스 로컬 저장소)

### 기술 스택
- **프레임워크**: SvelteKit 2.48.0 + Capacitor 7.4.4
- **빌드 도구**: Vite 7.1.12
- **스타일링**: Tailwind CSS 4.1.16
- **플랫폼**: Android, iOS

---

## 📁 프로젝트 구조

```
apps/app/
├── src/                          # 소스코드
│   ├── lib/                      # 공용 라이브러리
│   │   ├── assets/
│   │   │   └── favicon.svg       # 파비콘
│   │   ├── config.js             # ⭐ 앱 설정 (서버 URL 등)
│   │   ├── server-check.js       # ⭐ 서버 연결 체크 유틸리티
│   │   └── index.js
│   ├── routes/
│   │   ├── +layout.svelte        # 레이아웃 (CSS 적용)
│   │   ├── +page.svelte          # ⭐ 메인 페이지 (Health Check)
│   │   └── app-setup/
│   │       └── +page.svelte      # ⭐ 서버 설정 페이지
│   ├── app.css                   # Tailwind CSS
│   └── app.html                  # HTML 템플릿
├── android/                      # Android 네이티브 프로젝트
├── ios/                          # iOS 네이티브 프로젝트
├── build/                        # 빌드 출력 (정적 파일)
├── static/                       # 정적 리소스
├── package.json                  # 의존성 관리
├── capacitor.config.js           # ⭐ Capacitor 설정
├── svelte.config.js              # SvelteKit 설정
├── vite.config.js                # Vite 설정
└── CLAUDE.md                     # 이 문서
```

---

## 🔄 앱 동작 플로우

### 메인 플로우
```
1. 앱 시작
   ↓
2. 로딩 화면 표시 ("서버 연결 확인 중...")
   ↓
3. 저장된 서버 URL 확인
   - 있으면: 저장된 URL 사용
   - 없으면: DEFAULT_SERVER_URL 사용 (config.js)
   ↓
4. Health Check API 호출 (/api/health)
   - 타임아웃: 5초
   - 응답 검증: status === 'ok'
   ↓
5. 결과 처리
   ├─ ✅ 성공 → window.location.href로 웹 서버로 완전 이동
   └─ ❌ 실패 → 설정 페이지로 이동 (/app-setup)
```

### 설정 페이지 플로우
```
1. 서버 URL 입력 필드 표시
   - 기존 URL 또는 DEFAULT_SERVER_URL 표시
   ↓
2. 사용자 동작
   ├─ "연결 테스트" → Health Check만 실행 (결과 표시)
   └─ "저장 후 접속" → Health Check + 저장 + 메인 페이지로 이동
   ↓
3. 성공 시 메인 페이지로 돌아가서 다시 Health Check
```

---

## 💻 핵심 코드 분석

### 1. src/lib/config.js
```javascript
// 기본 서버 URL (환경변수로 오버라이드 가능)
export const DEFAULT_SERVER_URL =
  import.meta.env.VITE_DEFAULT_SERVER_URL || 'http://localhost:3100';

// 서버 연결 타임아웃 (5초)
export const CONNECTION_TIMEOUT = 5000;

// 앱 정보
export const APP_INFO = {
  name: 'NanumPay',
  version: '0.0.1'
};
```

### 2. src/lib/server-check.js
```javascript
/**
 * Health Check API를 통해 서버 연결 가능 여부 확인
 * @param {string} url - 체크할 서버 URL
 * @returns {Promise<{success: boolean, url: string, error?: string, data?: any}>}
 */
export async function checkServerConnection(url) {
  // 1. URL 형식 검증
  // 2. /api/health 엔드포인트 호출
  // 3. 타임아웃 처리 (AbortController 사용)
  // 4. 응답 검증 (status === 'ok')
  // 5. 결과 반환
}
```

### 3. src/routes/+page.svelte (메인 페이지)
```javascript
async function initializeApp() {
  // 1. Preferences에서 저장된 URL 로드
  const { value } = await Preferences.get({ key: 'serverUrl' });
  let urlToCheck = value || DEFAULT_SERVER_URL;

  // 2. 서버 연결 확인
  const result = await checkServerConnection(urlToCheck);

  if (result.success) {
    // 3-1. 성공: 웹으로 완전 이동
    window.location.href = result.url;
  } else {
    // 3-2. 실패: 설정 페이지로
    goto('/app-setup?error=' + encodeURIComponent(result.error));
  }
}
```

### 4. src/routes/app-setup/+page.svelte (설정 페이지)
```javascript
// 서버 URL 저장 및 접속
async function saveUrl() {
  // 1. 서버 연결 테스트
  const result = await checkServerConnection(serverUrl);

  if (result.success) {
    // 2. URL 저장
    await Preferences.set({ key: 'serverUrl', value: serverUrl });

    // 3. 메인 페이지로 이동
    goto('/');
  } else {
    // 에러 메시지 표시
    errorMessage = result.error;
  }
}
```

---

## 🔧 설정 파일

### capacitor.config.js
```javascript
const config = {
  appId: 'com.nanumpay.app',
  appName: 'NanumPay',
  webDir: 'build',  // SvelteKit 빌드 출력 디렉토리
  server: {
    // 개발 시 로컬 서버 사용 (필요시 주석 해제)
    // url: 'http://localhost:5173',
    // cleartext: true
  }
};
```

### svelte.config.js
```javascript
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      fallback: 'index.html'  // SPA 모드
    })
  }
};
```

---

## 📦 주요 의존성

### 프로덕션 의존성
- `@capacitor/core`: 7.4.4 - 핵심 Capacitor 라이브러리
- `@capacitor/android`: 7.4.4 - Android 플랫폼 지원
- `@capacitor/ios`: 7.4.4 - iOS 플랫폼 지원
- `@capacitor/preferences`: 7.0.2 - 디바이스 저장소 API

### 개발 의존성
- `@sveltejs/kit`: 2.48.0 - SvelteKit 프레임워크
- `@sveltejs/adapter-static`: 3.0.10 - 정적 사이트 생성
- `svelte`: 5.42.2 - Svelte 컴파일러
- `vite`: 7.1.12 - 빌드 도구
- `tailwindcss`: 4.1.16 - CSS 프레임워크

---

## 🚀 빌드 및 배포

### 개발 환경
```bash
# 개발 서버 실행
pnpm dev

# 빌드 (정적 파일 생성)
pnpm build
```

### Android 배포
```bash
# 1. 웹 앱 빌드
pnpm build

# 2. Capacitor 동기화
npx cap sync android

# 3. Android Studio 열기
npx cap open android

# 4. Android Studio에서 APK/AAB 빌드
```

### iOS 배포
```bash
# 1. 웹 앱 빌드
pnpm build

# 2. Capacitor 동기화
npx cap sync ios

# 3. Xcode 열기
npx cap open ios

# 4. Xcode에서 IPA 빌드
```

---

## ⚠️ 알려진 이슈 및 해결책

### 1. CORS 이슈
**문제**: 다른 도메인에서 Health Check API 호출 시 CORS 오류 발생 가능

**해결책**: 웹 서버의 `/api/health` 엔드포인트에 CORS 헤더 추가
```javascript
// apps/web/src/routes/api/health/+server.js
export async function GET() {
  return json(
    { status: 'ok', timestamp: new Date().toISOString(), service: 'nanumpay-web' },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept'
      }
    }
  );
}
```

### 2. 환경변수 설정
**문제**: 프로덕션 빌드 시 기본 서버 URL이 localhost로 고정됨

**해결책**: `.env.production` 파일 생성
```bash
# .env.production
VITE_DEFAULT_SERVER_URL=https://your-production-server.com

# 빌드 명령
pnpm build --mode production
```

### 3. 서버 URL 재설정
**문제**: 웹으로 이동 후 서버 URL 변경 불가

**해결책**:
- 앱을 완전 종료 후 재시작
- 또는 서버가 다운되면 자동으로 설정 페이지로 돌아옴

---

## 📝 개발 팁

### 1. Health Check API 요구사항
웹 서버는 반드시 `/api/health` 엔드포인트를 제공해야 함:
```json
{
  "status": "ok",
  "timestamp": "2025-10-27T10:00:00.000Z",
  "service": "nanumpay-web"
}
```

### 2. 로컬 개발 시 서버 URL
- 웹 개발 서버: `http://localhost:3100` (apps/web)
- 앱 개발 서버: `http://localhost:5173` (apps/app)
- Android 에뮬레이터에서 호스트 접근: `http://10.0.2.2:3100`

### 3. 디버깅
```javascript
// 서버 체크 결과 로깅
const result = await checkServerConnection(urlToCheck);
console.log('Health Check 결과:', result);

// Preferences 저장값 확인
const { value } = await Preferences.get({ key: 'serverUrl' });
console.log('저장된 URL:', value);
```

---

## 🔍 향후 개선 사항

### 우선순위: 높음
1. **CORS 헤더 추가** - 웹 서버 `/api/health` 엔드포인트
2. **프로덕션 환경변수 설정** - `.env.production` 파일
3. **앱 아이콘 및 스플래시 스크린** 추가

### 우선순위: 중간
1. **오프라인 감지** - 네트워크 연결 상태 모니터링
2. **재시도 로직** - 연결 실패 시 자동 재시도
3. **에러 로깅** - 프로덕션 에러 추적

### 우선순위: 낮음
1. **앱 업데이트 체크** - 새 버전 알림
2. **다국어 지원** - i18n 추가
3. **푸시 알림** - FCM/APNS 통합

---

## 📞 문의사항

이 문서에 대한 질문이나 개선사항이 있으면:
1. 이 문서 업데이트
2. 관련 코드 주석 추가
3. 팀원과 공유

---

**마지막 업데이트**: 2025-10-27
**작성자**: Claude (AI Assistant)
**검토자**: -