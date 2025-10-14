# registrationService.js 리팩토링 계획

**작성일**: 2025-10-14
**목표**: 12 Steps → 6 Steps 단순화

---

## 🎯 핵심 목표

### 제거할 컬렉션:
- ❌ **MonthlyTreeSnapshots** - 과도한 스냅샷 (불필요)
- ❌ 중복 데이터 제거

### 유지할 컬렉션:
- ✅ **User** - 실시간 계층도
- ✅ **WeeklyPaymentPlans** - 개별 지급 계획
- ✅ **WeeklyPaymentSummary** - 주별 집계 (성능 최적화)
- ✅ **MonthlyRegistrations** - 월별 인원 관리 (수정)

---

## 📊 MonthlyRegistrations 스키마 수정

### 추가 필드:
```javascript
{
  monthKey: "2025-07",
  registrationCount: 3,           // 전체 등록자 수
  totalRevenue: 3000000,          // 매출 (등록자 × 1,000,000)

  registrations: [                // 등록자 목록
    {
      userId: "user001",
      userName: "사장님",
      registrationDate: Date,
      grade: "F2"                 // 현재 등급 (승급 후)
    },
    ...
  ],

  promotedCount: 1,               // ⭐ 신규: 승급자 수
  nonPromotedCount: 2,            // ⭐ 신규: 미승급자 수 (F1)

  adjustedRevenue: null,          // 관리자 수동 조정 (기존)
  gradePayments: {},              // 등급별 지급액 (기존)
  status: 'active'                // 기존
}
```

---

## 📋 새로운 Step 구조 (6단계)

### Step 1: 사용자 정보 조회 및 계층 구조 구성
```javascript
// 입력: userIds (이번 배치 등록자)
// 처리:
//   1. User 조회
//   2. 트리 구조 업데이트 (leftChild, rightChild)
// 출력: users (계층 구조 포함)
```

### Step 2: 등급 재계산 및 월별 인원 관리 ⭐ 핵심
```javascript
// 입력: users (이번 배치)
// 처리:
//   1. 전체 사용자 등급 재계산 (recalculateGrades)
//   2. 승급자 추출 (oldGrade < newGrade)
//   3. 귀속월 파악 (registrationDate 기준)
//   4. MonthlyRegistrations 업데이트:
//      - registrations 배열에 이번 배치 추가
//      - registrationCount 증가
//      - totalRevenue 갱신 (registrationCount × 1,000,000)
//      - promotedCount 계산 (이번 달 등록자 중 승급)
//      - nonPromotedCount 계산 (이번 달 등록자 중 미승급)
//
// 출력:
//   - promoted: 승급자 배열
//   - monthlyReg: 월별 인원 현황
//
// 목표 출력:
//   console.log(`[${registrationMonth} 월별 인원 현황]`);
//   console.log(`  - 전체 등록자: ${monthlyReg.registrationCount}명`);
//   console.log(`  - 승급자: ${monthlyReg.promotedCount}명`);
//   console.log(`  - 미승급자 (F1): ${monthlyReg.nonPromotedCount}명`);
//   console.log(`  - 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);
```

### Step 3: 지급 대상자 확정 및 등급별 인원 구성
```javascript
// 입력:
//   - promoted (Step 2에서)
//   - monthlyReg (Step 2에서)
//
// 처리:
//   3-1. 지급 대상자 3가지 확정:
//        A. 승급자 (promoted) - 전체 승급자
//        B. 미승급 등록자 (monthlyReg에서 계산)
//           - 이번 달 등록자 중 승급 안 한 사람들
//        C. 추가지급 대상자 (조건 확인)
//           - 전체 사용자 - 승급자
//           - 조건 1: 최대 횟수 미도달
//           - 조건 2: F3+ 보험 가입
//
//   3-2. 중복 제거:
//        - 승급자 우선 (등록자이면서 승급자 → 승급자로만 카운트)
//
//   3-3. 등급별 지급 대상 인원 집계:
//        - 승급자 → newGrade로 집계
//        - 미승급 등록자 → F1로 집계
//        - 추가지급 대상자 → 현재 등급으로 집계
//        - 결과: gradeDistribution { F1: 4, F2: 2, ... }
//
//   3-4. 등급별 1회 지급 금액 산출:
//        - 매출: monthlyReg.totalRevenue
//        - 인원: gradeDistribution
//        - 계산: calculateGradePayments(revenue, gradeDistribution)
//        - 결과: gradePayments { F1: 144000, F2: 405000, ... }
//
// 출력:
//   - promotedTargets: 승급자 (지급 대상)
//   - registrantF1Targets: 미승급 등록자 (지급 대상)
//   - additionalTargets: 추가지급 대상자
//   - gradeDistribution: 등급별 인원 분포
//   - gradePayments: 등급별 1회 지급 금액
```

### Step 4: 지급 계획 생성 (3가지 유형)
```javascript
// 입력:
//   - users (이번 배치)
//   - promotedTargets (Step 3에서)
//   - registrantF1Targets (Step 3에서)
//   - additionalTargets (Step 3에서)
//   - gradePayments (Step 3에서)
//
// 처리:
//   4-1. 이번 배치 등록자 계획 생성:
//        - 미승급자: F1 Initial 계획 (10회)
//        - 승급자:
//          * oldGrade Initial 계획 (10회)
//          * newGrade Promotion 계획 (10회)
//
//   4-2. 기존 사용자 중 승급자 계획 생성:
//        - newGrade Promotion 계획 (10회)
//        - 기존 추가지급 계획 중단 (terminated)
//
//   4-3. 추가지급 대상자 계획 생성:
//        - Additional 계획 (10회)
//        - 추가지급단계++
//
//   ⭐ 중요: 지급 시작일 계산
//        - 첫 지급일 = 등록일 + 1개월 + 첫 금요일
//        - 예: 2025-07-15 등록 → 2025-08-22 (금) 첫 지급
//
// 출력:
//   - registrantPlans: 등록자 계획 배열
//   - promotionPlans: 승급자 계획 배열
//   - additionalPlans: 추가지급 계획 배열
```

### Step 5: WeeklyPaymentSummary 업데이트
```javascript
// 입력: 모든 생성된 계획들
//
// 처리:
//   1. 각 계획의 installments를 주차별로 집계
//   2. 주차별로 WeeklyPaymentSummary 생성/업데이트:
//      - weekNumber, monthKey
//      - byGrade: { F1: {userCount, totalAmount}, ... }
//      - totalAmount, totalTax, totalNet
//      - status: 'pending'
//
// 출력: WeeklyPaymentSummary 업데이트 완료
```

### Step 6: 처리 완료 및 결과 반환
```javascript
// 입력: 모든 처리 결과
//
// 처리:
//   1. 로그 출력
//   2. 결과 객체 구성
//
// 출력:
//   {
//     success: true,
//     registeredUsers: users.length,
//     promotedUsers: promoted.length,
//     additionalPaymentUsers: additionalTargets.length,
//     paymentPlans: allPlans.length,
//     monthlyReg: monthlyReg
//   }
```

---

## 🔄 기존 구조와 비교

### 제거되는 Step:
- ❌ 기존 Step 3: 등록자 등급 정보 구성
- ❌ 기존 Step 4: MonthlyRegistrations 업데이트 (Step 2로 통합)
- ❌ 기존 Step 5: MonthlyTreeSnapshots 업데이트 (제거)
- ❌ 기존 Step 8: 승급자 등급 분포 업데이트 (Step 3으로 통합)
- ❌ 기존 Step 11: 추가지급 등급 분포 반영 (Step 3으로 통합)

### 변경:
- **12 Steps → 6 Steps** (절반!)
- 핵심 로직만 남김
- 중복 제거
- 명확한 책임 분리

---

## 📝 작업 순서

1. ✅ REFACTORING_PLAN.md 작성 (이 문서)
2. ⏳ MonthlyRegistrations 스키마 수정
3. ⏳ Step 1 구현
4. ⏳ Step 2 구현 (핵심!)
5. ⏳ Step 3 구현
6. ⏳ Step 4 구현
7. ⏳ Step 5 구현
8. ⏳ Step 6 구현
9. ⏳ MonthlyTreeSnapshots 제거
10. ⏳ 불필요한 모듈 정리
11. ⏳ 테스트 실행 (7-8월 시나리오)
12. ⏳ CLAUDE3.md 업데이트

---

## ⚠️ 주의사항

1. **지급 시작일**: 등록일 + 1개월 + 첫 금요일
2. **매출 계산**: 등록자 수만 (승급자, 추가지급 제외)
3. **중복 제거**: 승급자 우선 원칙
4. **귀속월**: registrationDate 기준

---

**다음 세션 시작 시**:
1. 이 문서 확인
2. TODO 리스트 확인
3. Step 2부터 순차 구현
