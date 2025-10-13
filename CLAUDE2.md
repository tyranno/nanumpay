# Claude 세션 컨텍스트 문서 v2

**프로젝트**: Nanumpay MLM 시스템
**작성일**: 2025-10-13
**현재 버전**: v7.0 재정비 중
**이전 문서**: CLAUDE.md

---

## 🔥 현재 상황 (2025-10-13)

### 문제점
- 7월+8월 테스트: 잘 작동하는 것처럼 보임
- **9월 추가 시**: 금액 계산이 완전히 엉터리로 나옴
- 주차마다 금액이 달라짐 (같아야 함!)
- 이미지 예상값과 DB 실제값이 완전히 다름

### 원인
- 코드가 너무 복잡해짐
- 여러 곳에서 금액 계산 로직이 분산됨
- 등급 분포 계산이 여러 곳에서 중복됨
- 디버깅 불가능한 상태

### 조치
- **git restore로 수정사항 원복 완료** ✅
- 처음부터 **모듈 단위로 재작성** 결정

---

## 📋 사용자 요구사항 (단순화된 4단계)

### Step 1: 용역자 등록
```
- 개별 등록 or 엑셀 bulk 등록
- User 생성/업데이트만
```

### Step 2: 계층도 갱신
```
- 등록일 기준으로 월별 스냅샷 생성
- MonthlyTreeSnapshots 저장
```

### Step 3: 지급계획서 작성 (주간별) ⭐ 핵심
```
3-1. 계층도에서 지급 대상자 추출 (등록월별)
   - 등록자 (신규)
   - 승급자 (등급 상승)
   - 미승급자 중 추가지급 대상자 선정

3-2. 대상자 인원 기준으로 등급별 분배금 산정
   - 전체 대상자(등록+승급+추가지급) 기준 등급 분포 계산
   - 등급별 금액 계산 (누적 방식)

3-3. 귀속월 다음달부터 10회 분배 계획서 작성
   - WeeklyPaymentPlans 생성 (10회)

3-4. 승급 시 추가지급 중단 처리
   - 귀속월 다음달부터 추가지급 계획 모두 종료 (terminated)
```

### Step 4: 주간별 총계 갱신
```
- WeeklyPaymentSummary 갱신
- 등급별 금액, 인원수, 총액, 월 전체 총계
```

---

## 🎯 작업 계획 (순서대로)

### 1단계: 원복 및 확인 ✅ 완료
```bash
# 수정사항 원복
git restore apps/web/src/lib/server/services/paymentPlanService.js
git restore apps/web/src/lib/server/services/registrationService.js
git restore apps/web/src/routes/api/admin/payment/schedule/+server.js
git restore test_registration.py

# 상태: clean
```

### 2단계: 7월+8월만 테스트 (9월 제외)
```bash
# DB 초기화
cd /home/doowon/project/my/nanumpay/apps/web/install/linux
./db_init.sh --force

# 서버 실행
cd /home/doowon/project/my/nanumpay
pnpm dev:web --host

# 7월 데이터만 등록
python test_registration.py
# → 7월 Excel만 선택

# 8월 데이터만 등록
python test_registration.py
# → 8월 Excel만 선택

# 웹에서 확인
http://localhost:3100/admin/payment
```

**확인 사항**:
- 7월 등급 분포: F1=2, F2=1 ✅
- 8월 등급 분포: F1=4, F2=2 ✅
- 8월 추가지급 금액이 맞는지 확인
- 주차별로 같은 금액인지 확인

### 3단계: 금액 계산 모듈 분리
```javascript
// 새 파일: apps/web/src/lib/server/utils/paymentCalculator.js

/**
 * 등급별 지급액 계산 (누적 방식)
 *
 * @param {number} totalRevenue - 총 매출
 * @param {Object} gradeDistribution - 등급 분포 {F1: 2, F2: 1, ...}
 * @returns {Object} 등급별 지급액 {F1: 240000, F2: 810000, ...}
 */
export function calculateGradePayments(totalRevenue, gradeDistribution) {
  const rates = {
    F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
    F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
  };

  const payments = {};
  let previousAmount = 0;

  const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

  for (let i = 0; i < grades.length; i++) {
    const grade = grades[i];
    const nextGrade = grades[i + 1];

    const currentCount = gradeDistribution[grade] || 0;
    const nextCount = nextGrade ? (gradeDistribution[nextGrade] || 0) : 0;

    if (currentCount > 0) {
      const poolAmount = totalRevenue * rates[grade];
      const poolCount = currentCount + nextCount;

      if (poolCount > 0) {
        const additionalPerPerson = poolAmount / poolCount;
        payments[grade] = previousAmount + additionalPerPerson;
        previousAmount = payments[grade];
      } else {
        payments[grade] = previousAmount;
      }
    } else {
      payments[grade] = 0;
    }
  }

  return payments;
}
```

**테스트 작성**:
```javascript
// 새 파일: apps/web/src/lib/server/utils/paymentCalculator.test.js

import { calculateGradePayments } from './paymentCalculator.js';

describe('calculateGradePayments', () => {
  test('7월 매출 계산 (F1:2, F2:1)', () => {
    const result = calculateGradePayments(3000000, { F1: 2, F2: 1 });

    expect(result.F1).toBe(240000);  // (3000000 × 0.24) / 3
    expect(result.F2).toBe(810000);  // 240000 + (3000000 × 0.19) / 1
  });

  test('8월 매출 계산 (F1:4, F2:2)', () => {
    const result = calculateGradePayments(3000000, { F1: 4, F2: 2 });

    expect(result.F1).toBe(120000);  // (3000000 × 0.24) / 6
    expect(result.F2).toBe(405000);  // 120000 + (3000000 × 0.19) / 2
  });
});
```

### 4단계: 분배 인원 산출 모듈 분리
```javascript
// 새 파일: apps/web/src/lib/server/utils/distributionCalculator.js

/**
 * 지급 대상자 추출
 *
 * @param {string} monthKey - 귀속 월 (YYYY-MM)
 * @returns {Object} { registrants: [], promoted: [], additionalPayments: [] }
 */
export async function getPaymentTargets(monthKey) {
  // MonthlyRegistrations에서 조회
  const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });

  return {
    registrants: monthlyReg?.paymentTargets?.registrants || [],
    promoted: monthlyReg?.paymentTargets?.promoted || [],
    additionalPayments: monthlyReg?.paymentTargets?.additionalPayments || []
  };
}

/**
 * 등급 분포 계산
 *
 * @param {Object} targets - { registrants, promoted, additionalPayments }
 * @returns {Object} 등급 분포 { F1: 2, F2: 1, ... }
 */
export function calculateGradeDistribution(targets) {
  const distribution = {
    F1: 0, F2: 0, F3: 0, F4: 0,
    F5: 0, F6: 0, F7: 0, F8: 0
  };

  // 등록자
  for (const reg of targets.registrants) {
    distribution[reg.grade]++;
  }

  // 승급자
  for (const prom of targets.promoted) {
    distribution[prom.newGrade]++;
  }

  // 추가지급 대상자
  for (const add of targets.additionalPayments) {
    distribution[add.grade]++;
  }

  return distribution;
}
```

**테스트 작성**:
```javascript
// 새 파일: apps/web/src/lib/server/utils/distributionCalculator.test.js

import { calculateGradeDistribution } from './distributionCalculator.js';

describe('calculateGradeDistribution', () => {
  test('7월: 등록자만 (F1:2, F2:1)', () => {
    const targets = {
      registrants: [
        { userId: 'u1', grade: 'F2' },
        { userId: 'u2', grade: 'F1' },
        { userId: 'u3', grade: 'F1' }
      ],
      promoted: [],
      additionalPayments: []
    };

    const result = calculateGradeDistribution(targets);

    expect(result.F1).toBe(2);
    expect(result.F2).toBe(1);
  });

  test('8월: 등록자+승급자+추가지급 (F1:4, F2:2)', () => {
    const targets = {
      registrants: [
        { userId: 'u4', grade: 'F1' },
        { userId: 'u5', grade: 'F1' },
        { userId: 'u6', grade: 'F1' }
      ],
      promoted: [
        { userId: 'u2', newGrade: 'F2' }
      ],
      additionalPayments: [
        { userId: 'u1', grade: 'F2' },
        { userId: 'u3', grade: 'F1' }
      ]
    };

    const result = calculateGradeDistribution(targets);

    expect(result.F1).toBe(4);  // 3(등록) + 1(추가지급)
    expect(result.F2).toBe(2);  // 1(승급) + 1(추가지급)
  });
});
```

### 5단계: 지급계획 생성 로직 재작성
```javascript
// apps/web/src/lib/server/services/paymentPlanService.js 수정

import { calculateGradePayments } from '../utils/paymentCalculator.js';
import { getPaymentTargets, calculateGradeDistribution } from '../utils/distributionCalculator.js';

/**
 * 월별 지급 계획 생성 (통합 처리)
 *
 * @param {string} monthKey - 귀속 월 (YYYY-MM)
 */
export async function createMonthlyPaymentPlans(monthKey) {
  console.log(`\n[지급계획 생성] ${monthKey} 시작`);

  // 1. 지급 대상자 추출
  const targets = await getPaymentTargets(monthKey);
  console.log(`  대상자: 등록 ${targets.registrants.length}, 승급 ${targets.promoted.length}, 추가지급 ${targets.additionalPayments.length}`);

  // 2. 등급 분포 계산
  const gradeDistribution = calculateGradeDistribution(targets);
  console.log(`  등급 분포:`, gradeDistribution);

  // 3. 매출 조회
  const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });
  const totalRevenue = monthlyReg.getEffectiveRevenue();
  console.log(`  매출: ${totalRevenue.toLocaleString()}원`);

  // 4. 등급별 금액 계산
  const gradePayments = calculateGradePayments(totalRevenue, gradeDistribution);
  console.log(`  등급별 금액:`, gradePayments);

  // 5. 지급 시작일 계산 (귀속월 다음달 첫 금요일)
  const startDate = getPaymentStartDateForMonth(monthKey);
  console.log(`  지급 시작일: ${startDate}`);

  // 6. 각 대상자별 10회 계획 생성
  const plans = [];

  // 6-1. 등록자 (기본지급)
  for (const reg of targets.registrants) {
    const plan = await createBasicPlan({
      userId: reg.userId,
      userName: reg.userName,
      grade: reg.grade,
      revenueMonth: monthKey,
      amount: gradePayments[reg.grade],
      startDate,
      추가지급단계: 0
    });
    plans.push(plan);
  }

  // 6-2. 승급자 (기본지급)
  for (const prom of targets.promoted) {
    const plan = await createBasicPlan({
      userId: prom.userId,
      userName: prom.userName,
      grade: prom.newGrade,
      revenueMonth: monthKey,
      amount: gradePayments[prom.newGrade],
      startDate,
      추가지급단계: 0
    });
    plans.push(plan);

    // 6-3. 승급자는 기존 추가지급 중단
    await terminateAdditionalPayments(prom.userId, monthKey);
  }

  // 6-4. 추가지급 대상자
  for (const add of targets.additionalPayments) {
    const plan = await createAdditionalPlan({
      userId: add.userId,
      userName: add.userName,
      grade: add.grade,
      revenueMonth: monthKey,
      amount: gradePayments[add.grade],
      startDate,
      추가지급단계: add.추가지급단계
    });
    plans.push(plan);
  }

  console.log(`[지급계획 생성] ${monthKey} 완료: ${plans.length}개`);
  return plans;
}

/**
 * 귀속월 다음달 첫 금요일 계산
 */
function getPaymentStartDateForMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const nextMonth = new Date(year, month, 1); // 다음달 1일
  return getNextFriday(nextMonth);
}

/**
 * 승급 시 기존 추가지급 중단
 */
async function terminateAdditionalPayments(userId, promotionMonth) {
  console.log(`  [추가지급 중단] ${userId} - ${promotionMonth}부터`);

  // 해당 사용자의 모든 추가지급 계획 조회
  const plans = await WeeklyPaymentPlans.find({
    userId,
    installmentType: 'additional',
    planStatus: 'active'
  });

  for (const plan of plans) {
    // promotionMonth 이후 installments를 모두 terminated로
    for (const inst of plan.installments) {
      if (inst.weekNumber >= getWeekNumber(promotionMonth)) {
        inst.status = 'terminated';
      }
    }

    plan.planStatus = 'terminated';
    plan.terminatedBy = 'promotion';
    plan.terminatedAt = new Date();
    await plan.save();
  }

  console.log(`    중단된 계획: ${plans.length}개`);
}
```

### 6단계: 승급 시 추가지급 중단 처리
- `terminateAdditionalPayments` 함수 구현 (위 참조)
- 승급 월(다음달) 첫 주부터 terminated 처리
- planStatus도 'terminated'로 변경

### 7단계: 전체 통합 테스트
```bash
# DB 초기화
cd /home/doowon/project/my/nanumpay/apps/web/install/linux
./db_init.sh --force

# 7월+8월+9월 모두 등록
python test_registration.py

# 웹에서 확인
# - 주차별 금액이 동일한지
# - 9월 승급 시 추가지급 중단 확인
```

---

## 🔍 디버깅 포인트

### 확인해야 할 것
1. **7월+8월 정상 작동 여부**
   - 등급 분포 정확성
   - 금액 계산 정확성
   - 주차별 동일 금액

2. **9월 추가 시 문제점**
   - 어디서 금액이 틀어지는지
   - 승급 처리가 제대로 되는지
   - 추가지급 중단이 올바른지

3. **모듈 단위 테스트**
   - `calculateGradePayments` 함수
   - `calculateGradeDistribution` 함수
   - 각각 독립적으로 정확한지

---

## 📝 다음 세션 시작 시

### 1. DB 초기화
```bash
cd /home/doowon/project/my/nanumpay/apps/web/install/linux
./db_init.sh --force
```

### 2. 서버 실행
```bash
cd /home/doowon/project/my/nanumpay
pnpm dev:web --host
```

### 3. 현재 진행 상태 확인
- CLAUDE2.md 읽기
- 어디까지 완료했는지 확인
- 다음 단계 진행

---

## 🎯 최종 목표

**주차별로 금액이 동일하게 나오도록!**
- 사장님 F2: 8월 전체 주차 81,000원
- 사장님 F2: 9월 1주 162,000원 (기본+추가)
- 사장님 F2: 9월 2주 이후 81,000원 (승급으로 추가지급 중단)

---

**작성일**: 2025-10-13
**작성자**: Claude (AI Assistant)
**다음 작업**: 7월+8월 테스트부터 시작
