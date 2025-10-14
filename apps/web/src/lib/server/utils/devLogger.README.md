# devLogger 사용법

## 개요
개발 로그를 환경변수로 제어하는 유틸리티입니다. Production 환경에서 자동으로 로그를 끄고, 코드 수정 없이 환경변수만으로 제어할 수 있습니다.

## 사용법

### 1. import
```javascript
import { devLog } from '../../utils/devLogger.js';
```

### 2. console.log 대신 devLog 사용
```javascript
// 기존
console.log('등급 재계산 완료');
console.log('='.repeat(80));

// 변경 후
devLog.log('등급 재계산 완료');
devLog.separator();
```

### 3. 중요한 출력은 console.log 유지
```javascript
// ⭐ 항상 표시해야 하는 출력 (사용자에게 보여줄 정보)
console.log(`  - 전체 등록자: ${monthlyReg.registrationCount}명`);
console.log(`  - 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);

// 개발 로그 (디버깅용)
devLog.log(`  중복 체크: ${exists ? 'SKIP' : 'OK'}`);
devLog.debug(`  상세 정보: ${JSON.stringify(user)}`);
```

## 환경변수 제어

### 개발 중 (로그 ON)
```bash
# .env 또는 실행 시
NODE_ENV=development  # 기본값
# 또는 아무 설정 안 함
```

### 프로덕션 (로그 OFF)
```bash
# .env.production
NODE_ENV=production
```

### 개발 중에도 로그 끄기
```bash
# 일시적으로 끄기
DEV_LOG=false pnpm dev:web

# 또는 .env에 추가
DEV_LOG=false
```

### 디버그 로그 활성화
```bash
# 더 상세한 로그 표시
DEV_LOG_LEVEL=debug pnpm dev:web
```

## API

### devLog.log(...args)
일반 로그 출력
```javascript
devLog.log('등급 재계산 완료');
devLog.log('사용자:', user.name);
```

### devLog.info(...args)
정보 로그 (파란색)
```javascript
devLog.info('처리 시작');
```

### devLog.warn(...args)
경고 로그 (노란색)
```javascript
devLog.warn('중복된 사용자:', userId);
```

### devLog.error(...args)
에러 로그 (빨간색) - **항상 출력**
```javascript
devLog.error('처리 실패:', error);
```

### devLog.success(...args)
성공 로그 (초록색)
```javascript
devLog.success('등록 완료:', count, '명');
```

### devLog.debug(...args)
디버그 로그 (회색) - `DEV_LOG_LEVEL=debug`일 때만
```javascript
devLog.debug('상세 정보:', JSON.stringify(data));
```

### devLog.separator(char = '=', length = 80)
구분선 출력
```javascript
devLog.separator();           // ================...
devLog.separator('-', 40);    // --------------------
```

### devLog.section(title)
섹션 헤더 출력
```javascript
devLog.section('[Step 2] 등급 재계산');
// 출력:
// ================================================================================
// [Step 2] 등급 재계산
// ================================================================================
```

## 로그 레벨 정리

| 로그 종류 | 개발 환경 | Production | 용도 |
|---------|---------|-----------|-----|
| `console.log` | ✅ 출력 | ✅ 출력 | 사용자에게 보여줄 중요 정보 |
| `devLog.log` | ✅ 출력 | ❌ 무시 | 일반 디버깅 로그 |
| `devLog.info` | ✅ 출력 | ❌ 무시 | 정보성 로그 |
| `devLog.warn` | ✅ 출력 | ❌ 무시 | 경고 로그 |
| `devLog.error` | ✅ 출력 | ✅ 출력 | 에러 로그 (항상) |
| `devLog.debug` | ⚠️ 조건부 | ❌ 무시 | 상세 디버깅 (DEV_LOG_LEVEL=debug) |

## 실전 예시

### Step 모듈에서 사용
```javascript
import { devLog } from '../../utils/devLogger.js';

export async function executeStep2(users) {
  devLog.section('[Step 2] 등급 재계산 및 월별 인원 관리');

  // 디버깅 로그
  devLog.log(`  등록 대상: ${users.length}명`);
  devLog.debug('사용자 목록:', users.map(u => u.name));

  // ... 처리 로직 ...

  // ⭐ 중요한 결과는 console.log (항상 표시)
  console.log(`\n  [월별 인원 현황] ⭐`);
  console.log(`  - 전체 등록자: ${count}명`);
  console.log(`  - 매출: ${revenue.toLocaleString()}원`);

  devLog.separator();
  return result;
}
```

## 마이그레이션 가이드

### 1단계: devLog import 추가
```javascript
import { devLog } from '../../utils/devLogger.js';
```

### 2단계: console.log → devLog.log 변경 (선택적)
```javascript
// 디버깅용 로그만 변경
- console.log('처리 중...');
+ devLog.log('처리 중...');

// 중요한 출력은 그대로 유지
console.log('✅ 등록 완료'); // 변경 안 함
```

### 3단계: 구분선 개선
```javascript
- console.log('='.repeat(80));
+ devLog.separator();

- console.log('\n[Step 2] 등급 재계산');
- console.log('='.repeat(80));
+ devLog.section('[Step 2] 등급 재계산');
```

## 장점

1. **코드 수정 없이 제어**: 환경변수만 변경
2. **Production 최적화**: 자동으로 로그 제거
3. **색상 지원**: 로그 구분 쉬움
4. **유연한 제어**: 레벨별 로그 제어 가능
5. **C의 #define과 유사**: 조건부 컴파일처럼 동작

## 주의사항

1. **에러는 항상 표시**: `devLog.error()`는 production에서도 출력
2. **사용자 출력은 console.log**: 중요한 정보는 devLog 사용 안 함
3. **성능**: devLog는 조건 체크만 하므로 성능 영향 최소화
