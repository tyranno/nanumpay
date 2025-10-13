# Claude 세션 컨텍스트 문서 v3

**프로젝트**: Nanumpay MLM 시스템
**작성일**: 2025-10-13
**현재 버전**: v7.0 재정비 진행 중
**이전 문서**: CLAUDE2.md

---

## 🔥 현재 상황 (2025-10-13)

### 문제점
- `processUserRegistration()` 함수가 너무 복잡함
- 등급 재계산, 승급자 처리, 지급 계획 생성, 추가지급 처리가 모두 한 함수에 섞여 있음
- 디버깅 및 유지보수 어려움
- 모듈화 필요!

### 작업 목표
**`processUserRegistration()` 함수를 모듈별로 분리**

---

## 📋 현재 데이터 흐름

### 전체 흐름
```
[Bulk API / Register API]
    ↓
registerUsers() (userRegistrationService.js)
    ↓
1단계: validateUsers() - 검증
2단계: createUsers() - User 생성
    → this.registeredUsers에 저장 (신규 등록자들)
3단계: restructureTree() - 트리 재구성 완료
    → leftChild, rightChild 설정
    → treeResults.structure에 배치 정보
    ↓
4단계: processBatch() ⭐ 여기서 작업 시작!
    → 월별 신규 등록자 그룹화
    → processUserRegistration(userIds) 호출
```

### processBatch() 시점의 상태
```javascript
// ✅ 이미 완료된 것
- User 생성 완료 (DB 저장됨)
- 트리 구조 완료 (leftChild, rightChild 설정)
- this.registeredUsers에 신규 등록자 정보 저장

// ❌ 아직 안 된 것
- 등급 재계산 (아직 모두 F1)
- 스냅샷 생성
- 승급자 파악
- 지급 계획 생성
```

### processUserRegistration() 내부 (복잡!)
```javascript
export async function processUserRegistration(userIds) {
    // 1. 사용자 조회
    const users = await User.find({ _id: { $in: userIds } });

    // 2. 등급 재계산 ⭐
    const gradeChangeResult = await recalculateAllGrades();
    const changedUsers = gradeChangeResult.changedUsers || [];

    // 3. 최신 사용자 정보 다시 조회
    const updatedUsers = await User.find({ _id: { $in: userIds } });

    // 4. 월별 등록 정보 업데이트
    await updateMonthlyRegistrations(updatedUsers);

    // 5. 월별 트리 스냅샷 업데이트 ⭐
    await updateMonthlyTreeSnapshots(updatedUsers, changedUsers);

    // 6. 지급 계획 생성 ⭐ (가장 복잡!)
    // 6-1. 신규 등록자 Initial 계획
    // 6-2. 승급자 필터링
    // 6-3. 승급자 등급 분포 업데이트
    // 6-4. 승급자 Promotion 계획
    // 6-5. 승급 시 추가지급 중단

    // 7. 매월 추가지급 확인 ⭐
    await checkAndCreateMonthlyAdditionalPayments(...);

    // 8. 등급 분포 반영

    return batchResult;
}
```

---

## 🎯 작업 계획 (우선순위)

### 1단계: processUserRegistration() 모듈 분리 ⭐ 최우선
**목표**: 복잡한 함수를 명확한 단위로 분리

```javascript
// 새로운 구조 (안)
export async function processUserRegistration(userIds) {
    // 1. 등급 재계산 모듈
    const gradeResult = await recalculateGradesModule(userIds);

    // 2. 스냅샷 생성 모듈
    await createSnapshotsModule(gradeResult);

    // 3. 지급 대상자 추출 모듈 ⭐ 핵심!
    const targets = await extractPaymentTargetsModule(gradeResult);
    // → targets = { registrants: [], promoted: [], additionalPayments: [] }

    // 4. 지급 계획 생성 모듈
    const plans = await createPaymentPlansModule(targets);

    return { gradeResult, targets, plans };
}
```

**분리할 모듈**:
1. `gradeCalculationModule.js` - 등급 재계산
2. `snapshotModule.js` - 스냅샷 생성
3. `paymentTargetExtractor.js` ⭐ - 지급 대상자 추출 (등록자/승급자/추가지급)
4. `paymentPlanGenerator.js` - 지급 계획 생성

### 2단계: 지급 대상자 추출 로직 명확화
**파일**: `paymentTargetExtractor.js` (신규)

**역할**:
```javascript
export async function extractPaymentTargets(monthKey, gradeChangeResult) {
    // 1. 등록자 추출
    const registrants = extractRegistrants(gradeChangeResult.newUsers);

    // 2. 승급자 추출 (이번 등록으로 승급된 사람들)
    const promoted = extractPromoted(gradeChangeResult.changedUsers);

    // 3. 추가지급 대상자 추출 (이전 월 미승급자)
    const additional = await extractAdditionalPaymentTargets(monthKey, promoted);

    return { registrants, promoted, additional };
}
```

**출력 예시**:
```
[2025-07] 지급 대상자 추출 완료
  등록자: 3명 (사장님, 김영수, 이미영)
  승급자: 1명 (사장님 F1→F2)
  추가지급: 0명
  전체 대상: 4명 (등록3 + 승급1)
  매출액: 3,000,000원 (등록자 3명 × 1,000,000원)
```

### 3단계: 등급별 배분 계산 명확화
**파일**: `paymentCalculator.js` (신규)

```javascript
export function calculateGradePayments(totalRevenue, gradeDistribution) {
    // 누적 방식 계산
    // 7월: F1=2, F2=1 → F1: 240,000원, F2: 810,000원
    // 8월: F1=4, F2=2 → F1: 120,000원, F2: 405,000원
}

export function calculateGradeDistribution(targets) {
    // 등록자 + 승급자 + 추가지급 대상자 전체 기준
    // { F1: 4, F2: 2, ... }
}
```

### 4단계: 지급 계획 생성 단순화
**파일**: `paymentPlanGenerator.js` (신규)

```javascript
export async function createPaymentPlans(monthKey, targets, gradePayments) {
    const plans = [];

    // 1. 등록자 기본지급
    for (const reg of targets.registrants) {
        const plan = await createBasicPlan(reg, gradePayments);
        plans.push(plan);
    }

    // 2. 승급자 기본지급 + 기존 추가지급 중단
    for (const prom of targets.promoted) {
        const plan = await createPromotionPlan(prom, gradePayments);
        await terminateAdditionalPayments(prom.userId);
        plans.push(plan);
    }

    // 3. 추가지급 대상자
    for (const add of targets.additional) {
        const plan = await createAdditionalPlan(add, gradePayments);
        plans.push(plan);
    }

    return plans;
}
```

---

## 📂 파일 구조 (계획)

```
apps/web/src/lib/server/
├── services/
│   ├── userRegistrationService.js       ⭐ 현재: 메인 등록 로직
│   ├── registrationService.js           ⭐ 현재: 복잡함! 분리 필요!
│   │
│   ├── registration/                    ⭐ 신규: 모듈 분리
│   │   ├── gradeCalculationModule.js   - 등급 재계산
│   │   ├── snapshotModule.js            - 스냅샷 생성
│   │   ├── paymentTargetExtractor.js   - 지급 대상자 추출 ⭐ 핵심!
│   │   ├── paymentPlanGenerator.js      - 지급 계획 생성
│   │   └── index.js                     - 통합 export
│   │
│   ├── paymentPlanService.js            - 기존 유지 (개별 계획 생성)
│   ├── weeklyPaymentService.js          - 기존 유지 (금요일 지급)
│   └── treeRestructure.js               - 기존 유지
│
└── utils/
    ├── paymentCalculator.js             ⭐ 신규: 금액 계산 (순수 함수)
    └── distributionCalculator.js        ⭐ 신규: 등급 분포 계산
```

---

## 🔍 핵심 개념 정리

### 지급 대상자 3가지 유형
1. **등록자 (registrants)**: 이번 달 신규 등록
   - 매출 기여: ✅ (1,000,000원/명)
   - 기본지급 10회 생성

2. **승급자 (promoted)**: 이번 등록으로 등급 상승
   - 매출 기여: ❌ (이미 등록되어 있던 사람)
   - 신규 등급 기본지급 10회 생성
   - 기존 추가지급 중단 ⭐

3. **추가지급 대상자 (additional)**: 이전 월 미승급자
   - 매출 기여: ❌
   - 추가지급 10회 생성 (추가지급단계++)

### 등급별 배분 계산
**전체 대상자 = 등록자 + 승급자 + 추가지급 대상자**

예시:
```
8월 등록: 박철수(F1), 최영희(F1), 정민수(F1)
8월 승급: 김영수(F1→F2)
8월 추가지급: 사장님(F2), 이미영(F1)

전체 대상자: 6명
등급 분포: F1=4명 (등록3 + 추가지급1), F2=2명 (승급1 + 추가지급1)
매출: 3,000,000원 (등록자 3명만)

금액 계산:
- F1: 120,000원 (3,000,000 × 0.24 / 6)
- F2: 405,000원 (120,000 + 3,000,000 × 0.19 / 2)
```

---

## 🚀 다음 세션 시작 시

### 1. DB 초기화 (선택)
```bash
DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db \
bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force
```

### 2. 서버 실행
```bash
pnpm dev:web --host
```

### 3. 작업 순서
1. **paymentTargetExtractor.js 생성** - 지급 대상자 추출 로직 분리
2. **paymentCalculator.js 생성** - 금액 계산 순수 함수
3. **registrationService.js 리팩토링** - 모듈 적용
4. **테스트** - 7월+8월 개별 등록으로 검증

---

## 📝 참고 문서

1. **CLAUDE.md**: v7.0 전체 개요
2. **CLAUDE2.md**: 이전 작업 내용 (금액 계산 문제)
3. **이 문서 (CLAUDE3.md)**: 모듈화 작업 계획

---

## ⚠️ 주의사항

### 절대 건드리지 말 것
- ✅ `userRegistrationService.js`: 메인 등록 로직 (유지)
- ✅ `treeRestructure.js`: 트리 재구성 (유지)
- ✅ `weeklyPaymentService.js`: 금요일 자동 지급 (유지)

### 리팩토링 대상
- ⚠️ `registrationService.js`: **모듈로 분리 필요!**

---

**작성일**: 2025-10-13
**작성자**: Claude (AI Assistant)
**다음 작업**: paymentTargetExtractor.js 생성부터 시작
