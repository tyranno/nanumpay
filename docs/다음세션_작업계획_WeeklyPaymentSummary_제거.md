# 다음 세션 작업 계획: WeeklyPaymentSummary 제거 및 상태 단순화

**작성일**: 2025-12-08
**브랜치**: refactor-business-logic-v2

---

## 1. WeeklyPaymentSummary 제거

### 배경
- `WeeklyPaymentPlans`만으로 모든 통계 집계 가능
- `WeeklyPaymentSummary`는 불필요한 중복 데이터
- 동기화 문제 발생 가능성 있음

### 제거 대상 파일 (10개)
| 파일 | 역할 | 작업 |
|-----|-----|-----|
| `models/WeeklyPaymentSummary.js` | 모델 정의 | **삭제** |
| `services/paymentPlanService.js` | 계획 생성 시 Summary 업데이트 | 업데이트 코드 제거 |
| `services/weeklyPaymentService.js` | 지급 처리 시 Summary 업데이트 | 업데이트 코드 제거 |
| `services/registration/step5_updateSummary.js` | 등록 시 Summary 업데이트 | **삭제** |
| `services/revenueService.js` | 매출 조회 | aggregation으로 대체 |
| `api/admin/payment/schedule/+server.js` | 지급 일정 API | aggregation으로 대체 |
| `api/admin/weekly-payment-info/+server.js` | 주간 지급 정보 API | aggregation으로 대체 |
| `api/admin/revenue/range/+server.js` | 기간별 매출 API | aggregation으로 대체 |
| `api/admin/db/delete-monthly/+server.js` | 월별 삭제 | Summary 삭제 코드 제거 |
| `api/admin/db/initialize/+server.js` | DB 초기화 | Summary 초기화 코드 제거 |

### 대체 방법
```javascript
// WeeklyPaymentPlans에서 직접 aggregation
const summary = await WeeklyPaymentPlans.aggregate([
  { $unwind: '$installments' },
  { $match: {
    'installments.weekNumber': weekNumber,
    'installments.status': { $nin: ['skipped', 'terminated'] }
  }},
  { $group: {
    _id: '$baseGrade',
    amount: { $sum: '$installments.installmentAmount' },
    tax: { $sum: '$installments.withholdingTax' },
    net: { $sum: '$installments.netAmount' },
    count: { $sum: 1 }
  }}
]);
```

---

## 2. 지급 계획 상태(status) 단순화

### 현재 상태 (5개)
- `pending` - 지급 예정
- `paid` - 지급 완료
- `skipped` - 건너뜀 (보험 미가입)
- `terminated` - 종료 (승급에 의해)
- `canceled` - 취소

### 변경 후 상태 (3개)
| 상태 | 의미 | 사용 시점 |
|-----|-----|---------|
| `pending` | 지급 예정 | 기본 상태, 지급될 금액 |
| `skipped` | 보험 미가입으로 중단 | 보험 해지/미가입 시 |
| `terminated` | 승급으로 종료 | 승급 시 추가지급 중단 |

### 제거되는 상태
- **`paid`**: 금요일 자동 지급 처리 기능 없음. 지급 예정 금액 = 지급 금액
- **`canceled`**: 사용처 확인 후 결정 (필요시 유지)

### 핵심 원칙
> **"지급 처리를 하지 않는다. 지급 예정 금액 그대로 지급된다."**
> - `pending` 상태 = 지급될 금액
> - 과거 날짜의 `pending` = 이미 지급된 것으로 간주
> - 미래 날짜의 `pending` = 앞으로 지급될 금액

---

## 3. 보험 조건 처리 방식

### 현재 방식 (조회 시점 체크)
```javascript
// payment-summary API에서
if (shouldSkipByInsurance(grade, insuranceAmount)) {
  continue; // 합산에서 제외
}
```

### 권장 방식 (상태로 관리)
```javascript
// 보험 가입/해지 시점에 상태 변경
installment.status = 'skipped';  // 보험 해지 시
installment.status = 'pending';  // 보험 가입 시
```

### `skipped` 설정 시점
1. **보험 API** (`/api/admin/users/insurance/+server.js`)
   - 보험 해지 시: `pending` → `skipped`
   - 보험 가입 시: `skipped` → `pending`

2. **지급계획 생성 시** (`paymentPlanService.js`)
   - F4+ 등급 + 보험 미가입 → `skipped`로 생성

---

## 4. 관련 파일 수정 필요

### paymentPlanService.js
- [ ] `shouldSkipByInsurance` import 추가
- [ ] `createInitialPaymentPlan`: 생성 시 보험 조건 체크
- [ ] `createPromotionPaymentPlan`: 생성 시 보험 조건 체크
- [ ] `createAdditionalPaymentForUser`: 생성 시 보험 조건 체크
- [ ] `updateWeeklyProjections` 함수 제거 (Summary 업데이트)

### payment-summary API
- [ ] `shouldSkipByInsurance` 조회 대신 `status !== 'skipped'` 필터링

---

## 5. 테스트 확인사항

- [ ] 설계사 지급 총액 API 정상 동작
- [ ] 보험 가입/해지 시 상태 변경 확인
- [ ] 지급계획 생성 시 보험 조건 반영 확인
- [ ] aggregation 성능 확인

---

## 6. 현재 세션에서 완료된 작업

1. ✅ 설계사 지급 총액 API (`/api/planner/payment-summary`)
   - 보험 조건 체크 (`shouldSkipByInsurance`) 적용
   - 테스트 통과 확인

2. ✅ 테스트 스크립트 (`scripts/test/test_planner_payment_summary.py`)
   - 보험 조건 체크 로직 추가
   - API와 DB 직접 계산 비교 기능

---

## 7. 참고 명령어

```bash
# 테스트 실행
python3 scripts/test/test_planner_payment_summary.py

# 테스트 서버 배포
pnpm release:deploy:test

# 전체 테스트
python3 scripts/test/run_full_test.py
```
