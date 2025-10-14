# Claude 세션 컨텍스트 문서 v3.1

**프로젝트**: Nanumpay MLM 시스템
**작성일**: 2025-10-14
**현재 버전**: v7.0 모듈화 완료 ✅
**이전 문서**: CLAUDE3.md (v3.0)

---

## 🎉 작업 완료 (2025-10-14)

### ✅ 완료된 작업

1. **registrationService.js 모듈화 완료**
   - 기존 755줄 → 530줄 (30% 감소)
   - 12단계 명확한 처리 흐름 구조화
   - 모듈별 책임 분리

2. **신규 모듈 파일 생성**
   - `services/registration/paymentTargetExtractor.js` - 지급 대상자 추출
   - `services/registration/gradeCalculationModule.js` - 등급 재계산
   - `services/registration/snapshotModule.js` - 스냅샷 관리
   - `services/registration/paymentPlanGenerator.js` - 지급 계획 생성
   - `utils/paymentCalculator.js` - 금액 계산 순수 함수
   - `utils/distributionCalculator.js` - 등급 분포 계산 순수 함수

3. **버그 수정**
   - 사장님 추가지급 생성 안 되는 문제 해결
   - `paymentPlanService.js`의 `createAdditionalPaymentForUser` 함수에서 `baseGrade` 조건 제거

4. **테스트 성공**
   - 7월 등록 (3명): 사장님(F2), 김영수(F1), 이미영(F1)
   - 8월 등록 (3명): 박철수, 최영희, 정민수 (모두 F1)
   - 8월 승급 (1명): 김영수 (F1 → F2)
   - 8월 추가지급 (2명): 사장님(F2, 40,500원/회), 이미영(F1, 12,000원/회) ✅

---

## 📊 테스트 결과 (v7.0)

### 7월 등록 (3명)
```
사장님: F1 → F2 (승급)
김영수: F1
이미영: F1
```

**7월 매출**:
- 등록자 수: 3명
- 매출: 3,000,000원
- 등급 분포: F1=2, F2=1

**7월 지급액**:
- F1: 24,000원/회
- F2: 81,000원/회

### 8월 등록 (3명) + 승급 (1명)
```
등록: 박철수(F1), 최영희(F1), 정민수(F1)
승급: 김영수 (F1 → F2)
```

**8월 매출**:
- 등록자 수: 3명
- 매출: 3,000,000원
- 등급 분포 (스냅샷): F1=4, F2=2 ✅

**8월 추가지급** (v7.0):
- 사장님: F2, 단계=1, 매출월=2025-07, 금액=40,500원/회 ✅
- 이미영: F1, 단계=1, 매출월=2025-07, 금액=12,000원/회 ✅

**⭐ 핵심 검증**:
- 추가지급 금액이 **8월 등급 분포(F1=4명, F2=2명) 기준**으로 정확히 계산됨!
- 매출 귀속은 **7월 (원래 등록 월)** 유지됨!

---

## 🏗️ 새로운 파일 구조

```
apps/web/src/lib/server/
├── services/
│   ├── registrationService.js          ⭐ 리팩토링 완료 (530줄)
│   ├── registrationService.js.backup   (백업)
│   │
│   ├── registration/                   ⭐ 신규 모듈 디렉토리
│   │   ├── paymentTargetExtractor.js   - 지급 대상자 추출
│   │   ├── gradeCalculationModule.js   - 등급 재계산
│   │   ├── snapshotModule.js            - 스냅샷 관리
│   │   ├── paymentPlanGenerator.js      - 지급 계획 생성
│   │   └── index.js                     - 통합 export
│   │
│   ├── paymentPlanService.js           ⭐ 버그 수정 완료
│   ├── weeklyPaymentService.js         (기존 유지)
│   └── ...
│
└── utils/                               ⭐ 신규 디렉토리
    ├── paymentCalculator.js             - 금액 계산 순수 함수
    └── distributionCalculator.js        - 등급 분포 계산 순수 함수
```

---

## 🔧 주요 수정 사항

### 1. registrationService.js (모듈화)

**변경 전** (755줄):
- 복잡한 processUserRegistration 함수
- 모든 로직이 한 파일에 섞여 있음
- 디버깅 어려움

**변경 후** (530줄):
- 12단계 명확한 처리 흐름
- 모듈별 책임 분리
- 디버깅 및 유지보수 용이

**12단계 처리 흐름**:
1. 사용자 정보 조회
2. 등급 재계산
3. 최신 사용자 정보 재조회
4. 월별 등록 정보 업데이트
5. 월별 트리 스냅샷 업데이트
6. 지급 대상자 추출
7. 지급 계획 생성 (등록자)
8. 승급자 등급 분포 업데이트
9. 지급 계획 생성 (승급자)
10. 매월 추가지급 확인 (v7.0)
11. 현재 월 등급 분포에 추가지급 대상자 반영
12. 처리 완료

### 2. paymentPlanService.js (버그 수정)

**문제**: 사장님 추가지급 생성 안 됨
- 사장님은 7월에 F1로 등록 → F2로 승급
- 8월에 추가지급 생성 시, `baseGrade: F2`로 조회하여 계획을 찾지 못함

**해결**:
```javascript
// 변경 전 (863줄)
const lastPlan = await WeeklyPaymentPlans.findOne({
  userId,
  baseGrade: grade,  // ❌ 승급한 경우 찾을 수 없음!
  planStatus: { $in: ['active', 'completed'] }
});

// 변경 후 (857줄)
const lastPlan = await WeeklyPaymentPlans.findOne({
  userId,  // ✅ baseGrade 조건 제거!
  planStatus: { $in: ['active', 'completed'] }
}).sort({ 추가지급단계: -1, createdAt: -1 });
```

---

## ✅ 수정 완료 (2025-10-14 오후)

### 2. 등급 분포 불일치 문제 해결 ⭐

**문제 발견**:
- `MonthlyTreeSnapshots` (8월): `{"F1":4,"F2":2}` ✅ 올바름
- `MonthlyRegistrations` (8월): `{"F1":3,"F2":2}` ❌ 추가지급 대상자 미반영

**근본 원인 분석**:

1. **snapshotModule.js - Step 5 문제**:
   ```javascript
   // ❌ 잘못된 코드 (line 107-113):
   if (monthlyReg) {
     monthlyReg.gradeDistribution = gradeDistribution;  // 덮어쓰기!
     await monthlyReg.save();
   }
   ```
   - Step 5에서 `MonthlyRegistrations.gradeDistribution`을 `MonthlyTreeSnapshots.gradeDistribution`으로 **덮어썼습니다**
   - 하지만 이 시점에는 **추가지급 대상자가 아직 반영되지 않음** (Step 10/11에서 추가됨)

2. **registrationService.js - Step 8 문제**:
   ```javascript
   // ❌ 잘못된 코드 (line 199-204):
   if (gradeDistribution[prom.oldGrade] !== undefined && gradeDistribution[prom.oldGrade] > 0) {
     gradeDistribution[prom.oldGrade]--;  // ❌ 불필요!
   }
   if (gradeDistribution[prom.newGrade] !== undefined) {
     gradeDistribution[prom.newGrade]++;
   }
   ```
   - 승급자를 반영할 때 `oldGrade--; newGrade++`로 처리
   - 하지만 승급자는 **이번 달 등록자가 아니므로** 이미 등록자 카운트에 포함되어 있지 않음
   - 따라서 `oldGrade--`는 **불필요**함

**해결 방법**:

1. **snapshotModule.js 수정** (line 279-282):
   ```javascript
   // ✅ 수정된 코드:
   // ⚠️ v7.0 수정: MonthlyRegistrations 등급 분포는 여기서 업데이트하지 않음!
   // 이유: 추가지급 대상자가 아직 반영되지 않았기 때문
   // Step 8 (승급자)와 Step 11 (추가지급)에서 순차적으로 업데이트됨
   logger.info(`월별 트리 스냅샷 업데이트 완료: ${currentMonth}`, gradeDistribution);
   ```

2. **registrationService.js 수정** (line 198-201):
   ```javascript
   // ✅ 수정된 코드:
   // ⭐ 수정: 승급자는 단순히 newGrade만 +1 (이미 등록자 카운트에 없음)
   if (gradeDistribution[prom.newGrade] !== undefined) {
     gradeDistribution[prom.newGrade]++;
   }
   ```

**검증 결과**:
```
✅ 등급 분포 일치!
   MonthlyRegistrations: F1=4, F2=2
   MonthlyTreeSnapshots: F1=4, F2=2

✅ paymentTargets 정확!
   - registrants: 3명 (등록자)
   - promoted: 1명 (승급자)
   - additionalPayments: 2명 (추가지급)
   합계: 6명 = F1(4명) + F2(2명)

✅ 추가지급 금액 정확!
   - 사장님: F2, 40,500원/회 (8월 등급 분포 기준)
   - 이미영: F1, 12,000원/회 (8월 등급 분포 기준)
```

---

## 📝 다음 세션 시작 시

### 1. 환경 준비
```bash
# 개발 서버 실행
pnpm dev:web --host

# DB 초기화 (필요 시)
DB_DIR=/home/doowon/project/my/nanumpay/apps/web/install/linux/db \
bash /home/doowon/project/my/nanumpay/apps/web/install/linux/db_init.sh --hash='$2a$10$4J8dN6s9jx5kNXTZXva8w.uQ6T8vRLB32weZf638xLIWYcpSE1UOi' --force
```

### 2. 테스트 실행
```bash
# Python 자동 테스트
python3 test_registration.py --auto

# MongoDB 등급 분포 검증
mongosh mongodb://localhost:27017/nanumpay --quiet --eval "
const reg = db.monthlyregistrations.findOne({monthKey: '2025-08'});
const snap = db.monthlytreesnapshots.findOne({monthKey: '2025-08'});
print('MonthlyRegistrations: F1=' + reg.gradeDistribution.F1 + ', F2=' + reg.gradeDistribution.F2);
print('MonthlyTreeSnapshots: F1=' + snap.gradeDistribution.F1 + ', F2=' + snap.gradeDistribution.F2);
if (reg.gradeDistribution.F1 === snap.gradeDistribution.F1) print('✅ 일치!');
else print('❌ 불일치!');
"

# 추가지급 계획 확인
mongosh mongodb://localhost:27017/nanumpay --quiet --eval "
db.weeklypaymentplans.find({installmentType: 'additional'}).forEach(p => {
  print(p.userName + ': ' + p.baseGrade + ', 단계:' + p.추가지급단계 +
        ', 매출월:' + p.revenueMonth + ', 금액:' + p.installments[0].installmentAmount + '원');
});
"
```

### 3. 향후 작업
- [ ] 9월 등록 시나리오 추가 테스트
- [ ] 다중 월 병행 지급 시나리오 테스트
- [ ] 성능 최적화 (필요 시)

---

## 📚 참고 문서

1. **CLAUDE.md**: v7.0 전체 개요
2. **docs/시스템_설계_문서_v7.md**: v7.0 설계 문서
3. **docs/시스템_요구사항_검토문서_v5.0.md**: v5.0 요구사항
4. **이 문서 (CLAUDE3.md)**: 모듈화 작업 기록

---

## 🎯 핵심 성과

1. ✅ **복잡도 감소**: 755줄 → 530줄 (30%)
2. ✅ **가독성 향상**: 12단계 명확한 흐름
3. ✅ **유지보수성 향상**: 모듈별 책임 분리
4. ✅ **버그 수정 1**: 사장님 추가지급 생성 문제 해결 (`paymentPlanService.js` baseGrade 조건 제거)
5. ✅ **버그 수정 2**: 등급 분포 불일치 문제 해결 (`snapshotModule.js`, `registrationService.js` Step 8/11)
6. ✅ **테스트 성공**: 7월+8월 등록 시나리오 검증
7. ✅ **v7.0 검증**: 추가지급 금액 정확성 확인
8. ✅ **데이터 일관성 확보**: MonthlyRegistrations ↔ MonthlyTreeSnapshots 등급 분포 일치

---

## 🔄 전면 리팩토링 계획 (2025-10-14 오후)

### 핵심 변경 사항

#### 문제 인식:
1. **MonthlyTreeSnapshots**: 과도한 스냅샷 (전체 사용자 트리 저장)
2. **복잡한 Step 구조**: 12단계로 과도하게 세분화
3. **중복 데이터**: MonthlyRegistrations와 Snapshots에 중복 정보
4. **불명확한 책임**: 각 Step의 목적이 모호

#### 해결 방안:
- **12 Steps → 6 Steps** 단순화
- **MonthlyTreeSnapshots 제거**
- **MonthlyRegistrations 강화** (promotedCount, nonPromotedCount 추가)
- **명확한 책임 분리**

### 새로운 6단계 구조

```
Step 1: 사용자 정보 조회 및 계층 구조 구성
Step 2: 등급 재계산 및 월별 인원 관리 ⭐ 핵심
Step 3: 지급 대상자 확정 및 등급별 인원 구성
Step 4: 지급 계획 생성 (3가지 유형)
Step 5: WeeklyPaymentSummary 업데이트
Step 6: 처리 완료 및 결과 반환
```

### Step 2의 핵심 목표

```javascript
console.log(`[${registrationMonth} 월별 인원 현황]`);
console.log(`  - 전체 등록자: ${monthlyReg.registrationCount}명`);
console.log(`  - 승급자: ${monthlyReg.promotedCount}명`);
console.log(`  - 미승급자 (F1): ${monthlyReg.nonPromotedCount}명`);
console.log(`  - 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);
```

### 상세 계획

📄 **[REFACTORING_PLAN.md](REFACTORING_PLAN.md)** 참고
- 전체 Step 구조
- MonthlyRegistrations 스키마 수정
- 작업 순서
- 주의사항

---

**작성일**: 2025-10-14 (오후 업데이트)
**작성자**: Claude (AI Assistant)
**상태**: 🔄 전면 리팩토링 계획 수립 (12 Steps → 6 Steps)
**다음 작업**: REFACTORING_PLAN.md 참고하여 새 구조 구현
