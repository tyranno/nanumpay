# MLM 시스템 구현 분석 문서

**작성일**: 2025년 9월 21일
**시스템명**: 나눔페이 MLM 용역비 지급 시스템

---

## 📌 시스템 핵심 개요

### 시스템의 5대 핵심 기능
1. **용역자 등록** - 매출의 시작점
2. **등급 자동 계산** - 2진 트리 구조 기반
3. **매출 자동 발생** - 등록 즉시 매출 생성
4. **등급별 차등 지급** - 누적식 계산
5. **주간 분할 지급** - 10주간 자동 분할

---

## 1️⃣ 용역자 등록 시스템

### 📂 관련 파일
```
- /routes/api/admin/users/register/+server.js  (개별 등록)
- /routes/api/admin/users/bulk/+server.js      (엑셀 일괄 등록)
- /lib/server/models/User.js                    (사용자 모델)
```

### 💡 구현 내용
```javascript
// 용역자 등록 시 자동 처리
1. loginId 자동 생성 (한글 이름 기반)
   - 중복 시 A, B, C 접미사 추가

2. 2진 트리 위치 지정
   - parentId: 부모 노드
   - position: 'L' or 'R'
   - leftChildId, rightChildId 자동 업데이트

3. 등록 즉시 BatchProcessor 실행
   - 전체 등급 재계산
   - 매출 계산
   - 지급 스케줄 생성
```

### ✅ 검증 상태
- 개별 등록: 정상 작동
- 엑셀 일괄 등록: 정상 작동
- 한글 loginId: 구현 완료
- 트리 구조 유지: 검증 완료

---

## 2️⃣ 등급 계산 시스템

### 📂 관련 파일
```
- /lib/server/services/gradeCalculation.js
- /lib/server/services/treeExtractor.js
```

### 💡 등급 조건 (work_plan.txt 기준)
```javascript
F1: 자식 0개 또는 1개
F2: 좌우 자식 모두 있음
F3: 하위 F2가 2개 && 좌우 각 1개씩
F4: 하위 F3가 2개 && 좌우 각 1개씩
F5: 하위 F4가 2개 && (좌2우1 또는 좌1우2)
F6: 하위 F5가 2개 && (좌2우1 또는 좌1우2)
F7: 하위 F6가 2개 && (좌2우1 또는 좌1우2)
F8: 하위 F7가 2개 && (좌2우1 또는 좌1우2)
```

### 💡 구현 로직
```javascript
// gradeCalculation.js
async function calculateGrade(userId) {
  const tree = await extractDescendants(userId);

  // 1. 직계 자식 확인 (F1, F2 판정)
  if (!leftChild && !rightChild) return 'F1';
  if (!leftChild || !rightChild) return 'F1';
  if (leftChild && rightChild) {
    // 2. 하위 등급 분포 계산
    const gradeCount = countGradesInSubtree(tree);

    // 3. 등급별 조건 체크
    if (checkF8Conditions(gradeCount)) return 'F8';
    if (checkF7Conditions(gradeCount)) return 'F7';
    // ... 순차적 체크
  }
}
```

### ✅ 검증 상태
- 트리 추출: 정상 작동
- 등급 계산 로직: 정상 작동
- 재귀적 계산: 구현 완료
- 0명 처리: 버그 수정 완료

---

## 3️⃣ 매출 발생 시스템

### 📂 관련 파일
```
- /lib/server/models/MonthlyRevenue.js
- /lib/server/services/revenueCalculation.js
- /lib/server/services/batchProcessor.js
```

### 💡 매출 계산 공식
```javascript
// 매출 발생 시점: 용역자 등록 월
총매출 = 신규 가입자 수 × 1,000만원
회당 지급액 = 총매출 ÷ 10회
```

### 💡 MonthlyRevenue 스키마
```javascript
{
  year: 2025,
  month: 9,
  newUsersCount: 6,           // 신규 가입자
  totalRevenue: 60000000,      // 6천만원
  revenuePerInstallment: 6000000, // 600만원/회
  gradeDistribution: {         // 등급별 인원
    F1: 5, F2: 1, F3: 0, ...
  },
  gradePayments: {             // 등급별 회당 지급액
    F1: 240000,
    F2: 1440000,
    ...
  }
}
```

### ✅ 검증 상태
- 월별 매출 계산: 정상 작동
- 자동 계산 트리거: 구현 완료
- 중복 계산 방지: 구현 완료

---

## 4️⃣ 등급별 지급액 계산

### 📂 관련 파일
```
- /lib/server/services/batchProcessor.js (calculateGradePayments)
- /lib/server/services/revenueCalculation.js
```

### 💡 누적식 계산 방식
```javascript
// 등급별 비율
const gradeRatios = {
  F1: 24%, F2: 19%, F3: 14%, F4: 9%,
  F5: 5%, F6: 3%, F7: 2%, F8: 1%
};

// 지급액 계산 (회당)
F1_지급액 = (총매출/10 × 24%) ÷ (F1인원 + F2인원)

F2_지급액 = F1_지급액 + [(총매출/10 × 19%) ÷ (F2인원 + F3인원)]

F3_지급액 = F2_지급액 + [(총매출/10 × 14%) ÷ (F3인원 + F4인원)]

// 0명 처리
if (F3인원 + F4인원 === 0) {
  F3_지급액 = F2_지급액;  // 이전 등급 금액 유지
}
```

### 💡 실제 구현 코드
```javascript
// batchProcessor.js - calculateGradePayments()
const f1Total = revenuePerInstallment * 0.24;
const f1Divisor = gradeCount.F1 + gradeCount.F2;
gradePayments.F1 = f1Divisor > 0 ? f1Total / f1Divisor : 0;

const f2Total = revenuePerInstallment * 0.19;
const f2Divisor = gradeCount.F2 + gradeCount.F3;
gradePayments.F2 = f2Divisor > 0 ?
  (f2Total / f2Divisor) + gradePayments.F1 : gradePayments.F1;
```

### ✅ 검증 상태
- 누적식 계산: 정상 작동
- 0명 처리: 정상 작동
- 소수점 처리: Math.floor 적용

---

## 5️⃣ 지급 스케줄 시스템

### 📂 관련 파일
```
- /lib/server/models/UserPaymentPlan.js   (개인별 지급 계획)
- /lib/server/models/WeeklyPayment.js     (주별 실제 지급)
- /lib/server/services/paymentService.js
```

### 💡 지급 스케줄 규칙
```
N월 매출 → N+1월부터 10주간 분할 지급

예시: 9월 매출
- 1회차: 10월 1주차
- 2회차: 10월 2주차
- 3회차: 10월 3주차
- 4회차: 10월 4주차
- 5회차: 11월 1주차
- 6회차: 11월 2주차
- ...
- 10회차: 12월 2주차
```

### 💡 UserPaymentPlan 구조
```javascript
{
  revenueMonth: { year: 2025, month: 9 },
  userId: "홍길동",
  grade: "F2",  // 9월 당시 등급 (고정)
  amountPerInstallment: 1440000,  // 회당 지급액 (고정)
  installments: [
    {
      installmentNumber: 1,
      scheduledDate: { year: 2025, month: 10, week: 1 },
      amount: 1440000,
      status: "pending"
    },
    // ... 10회분
  ]
}
```

### ⚠️ 핵심 원칙: 등급 고정
```javascript
// 매출 발생 시점(9월)의 등급과 금액으로 고정
// 10월에 등급이 변경되어도 9월 매출의 지급액은 불변
const paymentPlan = new UserPaymentPlan({
  grade: user.grade,  // 9월 등급 저장
  amountPerInstallment: gradePayments[user.grade],  // 9월 금액 고정
});
```

### ✅ 검증 상태
- 10주 스케줄 생성: 정상 작동
- 등급 고정 원칙: 구현 완료
- 원천징수 3.3%: 구현 완료

---

## 6️⃣ BatchProcessor (자동 처리 엔진)

### 📂 관련 파일
```
- /lib/server/services/batchProcessor.js
```

### 💡 자동 처리 프로세스
```javascript
용역자 등록 → BatchProcessor.processNewUsers() 실행

1단계: recalculateGrades()
  - 전체 트리 순회
  - 모든 사용자 등급 재계산

2단계: calculateMonthlyRevenue()
  - 이번달 신규 가입자 수 계산
  - 총매출 계산
  - 등급별 지급액 계산
  - MonthlyRevenue 저장

3단계: createPaymentSchedules()
  - 10주 지급 일정 생성
  - 주차별 날짜 계산

4단계: createUserPaymentPlans()
  - 개인별 지급 계획 생성
  - 등급과 금액 고정
  - UserPaymentPlan 저장
```

### ✅ 검증 상태
- 자동 실행: 정상 작동
- 트랜잭션 처리: 구현 필요
- 에러 핸들링: 기본 구현

---

## 7️⃣ 주별 지급 처리

### 📂 관련 파일
```
- /routes/api/admin/payment/weekly/+server.js
- /lib/server/models/WeeklyPayment.js
```

### 💡 WeeklyPayment 구조
```javascript
{
  userId: ObjectId,
  year: 2025,
  month: 10,
  week: 1,
  installments: [
    {
      revenueYear: 2025,
      revenueMonth: 9,
      installmentNumber: 1,
      amount: 1440000
    }
  ],
  totalAmount: 1440000,
  taxAmount: 47520,    // 3.3%
  netAmount: 1392480   // 실지급액
}
```

### ✅ 검증 상태
- 주별 집계: 구현 완료
- 원천징수 계산: 정상 작동
- 다중 매출원 처리: 설계 완료

---

## 📊 현재 시스템 상태 (2025.09.21)

### 데이터 현황
```
- 총 용역자: 6명 (9월 등록)
- 등급 분포: F1(5명), F2(1명)
- 9월 총매출: 6천만원
- 회당 지급액: 600만원
- 지급 기간: 10월 1주차 ~ 12월 2주차
```

### 등급별 지급액 (회당)
```
F1: 240,000원 × 5명 = 1,200,000원
F2: 1,440,000원 × 1명 = 1,440,000원
----------------------------------
합계: 2,640,000원/회
```

---

## ⚠️ 주의사항 및 개선 필요 사항

### 1. 트랜잭션 처리
- 현재: 각 단계별 독립 실행
- 필요: 전체 과정 트랜잭션 묶음 처리

### 2. 동시성 제어
- 현재: 동시 등록 시 충돌 가능
- 필요: Queue 또는 Lock 메커니즘

### 3. 재계산 기능
- 현재: 수동 스크립트 실행
- 필요: 관리자 UI에서 재계산 버튼

### 4. 지급 실행
- 현재: WeeklyPayment 생성만
- 필요: 실제 송금 연동 (은행 API)

### 5. 감사 로그
- 현재: 기본 로깅만
- 필요: 모든 금액 변경 이력 추적

---

## 📁 주요 스크립트

### 데이터 초기화
```bash
node scripts/reset-all-data.js
```

### 등급 재계산
```bash
node scripts/recalculate-grades.js
```

### 매출 재계산
```bash
node scripts/fix-monthly-revenue.js
```

### 트리 구조 확인
```bash
node scripts/check-tree-structure.js
```

---

## 🔍 디버깅 팁

### 1. 등급이 잘못 계산될 때
```javascript
// check-tree-structure.js 실행
// 트리 구조와 등급 조건 확인
```

### 2. 매출이 0원일 때
```javascript
// MonthlyRevenue 컬렉션 확인
// newUsersCount 필드 체크
```

### 3. 지급액이 없을 때
```javascript
// UserPaymentPlan 컬렉션 확인
// grade와 amountPerInstallment 확인
```

---

**문서 작성**: Claude Code Assistant
**최종 검토**: 2025.09.21