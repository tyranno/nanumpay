# 테스트 스크립트

v7.0 용역자 등록 및 지급 계획 생성 테스트 스크립트 모음

## 사용 전 준비

### 1. DB 초기화
```bash
DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db \
bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force
```

### 2. 개발 서버 실행
```bash
pnpm dev:web --host
```

## 테스트 스크립트 목록

### ⭐ test_step_by_step_auto.py (권장)
**설명**: 한 명씩 자동 등록하고 각 단계마다 DB 상태를 확인하는 통합 테스트

**테스트 케이스**:
- 7월 3명: 사장님, 김영수, 이미영
- 8월 3명: 박철수, 최영희, 정민수
- 9월 1명: 강민수

**실행**:
```bash
python3 scripts/test/test_step_by_step_auto.py
```

**확인 사항**:
- 각 등록 후 사용자 목록 및 등급
- 지급 계획 요약 (매출월, 등급, 타입, 추가지급단계, 상태)
- 월별 등록 정보 (등록 수, 승급자, 추가지급 대상자)

---

### test_individual_registration.py
**설명**: 7월 3명 개별 등록 (사장님, 김영수, 이미영)

**실행**:
```bash
python3 scripts/test/test_individual_registration.py
```

---

### test_august_registrations.py
**설명**: 8월 3명 등록 (박철수, 최영희, 정민수)

**실행**:
```bash
python3 scripts/test/test_august_registrations.py
```

---

### test_september_one.py
**설명**: 9월 1명 등록 (강민수)

**실행**:
```bash
python3 scripts/test/test_september_one.py
```

---

## 테스트 시나리오

### 전체 시나리오 (7월-9월)

#### 7월
1. **사장님** (루트) → F1
2. **김영수** (사장님 왼쪽) → 사장님 F1→F2 승급
3. **이미영** (사장님 오른쪽) → 7월 완료

**예상 결과**:
- 사용자: 사장님(F2), 김영수(F1), 이미영(F1)
- 지급 계획:
  - 사장님: 7월 F2 기본 10회
  - 김영수: 7월 F1 기본 10회
  - 이미영: 7월 F1 기본 10회

#### 8월
1. **박철수** (김영수 왼쪽) → 7월 추가지급 생성
2. **최영희** (김영수 오른쪽) → 김영수 F1→F2 승급
3. **정민수** (이미영 왼쪽) → 8월 완료

**예상 결과**:
- 사용자: 사장님(F2), 김영수(F2), 이미영(F1), 박철수(F1), 최영희(F1), 정민수(F1)
- 추가 지급 계획:
  - 사장님: 8월 F2 추가 10회 (7월 매출)
  - 김영수: 8월 F2 기본 10회 (승급) + 8월 F1 추가 10회 (7월 매출)
  - 이미영: 8월 F1 추가 10회 (7월 매출)

#### 9월
1. **강민수** (이미영 오른쪽) → 이미영 F1→F2, 사장님 F2→F3 승급

**예상 결과**:
- 사용자: 사장님(F3), 김영수(F2), 이미영(F2), 박철수(F1), 최영희(F1), 정민수(F1), 강민수(F1)
- 추가 지급 계획:
  - 이미영: 9월 F2 기본 10회 (승급) + 8월 F1 추가 부분 중단 (9월 pending, 10월~ canceled)
  - 사장님: 9월 F3 기본 10회 (승급) + 8월 F2 추가 부분 중단
  - 박철수, 최영희, 정민수: 9월 F1 추가 10회 (8월 매출)

---

## DB 직접 확인

### MongoDB 접속
```bash
mongosh mongodb://localhost:27017/nanumpay
```

### 유용한 쿼리

#### 사용자 목록 및 등급
```javascript
db.users.find({}, {userName: 1, grade: 1, _id: 0})
```

#### 지급 계획 요약
```javascript
db.weeklypaymentplans.find({}, {
  userName: 1,
  revenueMonth: 1,
  baseGrade: 1,
  installmentType: 1,
  추가지급단계: 1,
  planStatus: 1,
  _id: 0
}).sort({userName: 1, revenueMonth: 1})
```

#### 특정 사용자 지급 계획 상세
```javascript
db.weeklypaymentplans.find({
  userName: '이미영'
}).forEach(plan => {
  print('\n매출월:', plan.revenueMonth);
  print('등급:', plan.baseGrade);
  print('타입:', plan.installmentType);
  print('추가지급단계:', plan.추가지급단계);
  print('회차 상태:');
  plan.installments.forEach(inst => {
    const date = new Date(inst.scheduledDate).toISOString().split('T')[0];
    print('  -', date, ':', inst.status);
  });
});
```

#### 월별 등록 정보
```javascript
db.monthlyregistrations.find({}).forEach(mr => {
  print('\n월:', mr.monthKey);
  print('등록 수:', mr.registrationCount);
  if (mr.paymentTargets) {
    if (mr.paymentTargets.promoted) {
      print('승급자:', mr.paymentTargets.promoted.length);
    }
    if (mr.paymentTargets.additionalPayments) {
      print('추가지급:', mr.paymentTargets.additionalPayments.length);
    }
  }
});
```

---

## 알려진 이슈 (2025-10-14 기준)

### 🔴 이슈 1: 김영수 8월 추가지급 계획 사라짐
**발생 시점**: 8월 2명(최영희) 등록 시

**증상**: 김영수 F1→F2 승급 시 8월 F1 추가지급 계획이 삭제됨

**상태**: ⚠️ 분석 중

### 🔴 이슈 2: 김영수 승급이 paymentTargets.promoted에 기록 안 됨
**발생 시점**: 8월 2명(최영희) 등록 시

**증상**: MonthlyRegistrations의 paymentTargets.promoted에 김영수가 기록되지 않음

**상태**: ⚠️ 분석 중

---

## 참고 문서

- [CLAUDE6.md](../../CLAUDE6.md): 세션 6 작업 상세 기록
- [CLAUDE.md](../../CLAUDE.md): 프로젝트 전체 컨텍스트
- [docs/시스템_설계_문서_v7.md](../../docs/시스템_설계_문서_v7.md): v7.0 설계 문서

---

**작성일**: 2025-10-14
**작성자**: Claude
