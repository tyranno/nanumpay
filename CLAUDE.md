# Claude 세션 컨텍스트 문서

**프로젝트**: Nanumpay MLM 시스템
**마지막 업데이트**: 2025-10-12
**현재 버전**: v6.0

---

## 📌 빠른 시작 (새 세션 시작 시)

### 개발 환경 구동 (Quick Start)
```bash
# 1. DB 초기화 (주의: 모든 데이터 삭제!)
DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db \
bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force

# 2. 개발 서버 실행
pnpm dev:web --host

# 3. 브라우저에서 접속
# http://localhost:5173/admin
# 아이디: 관리자
# 비밀번호: admin1234!!
```

### 핵심 문서 위치
1. **요구사항**: [docs/시스템_요구사항_검토문서_v4.0.md](docs/시스템_요구사항_검토문서_v4.0.md) (또는 최신 버전)
2. **설계문서**: [docs/시스템_설계_문서_v6.md](docs/시스템_설계_문서_v6.md)
3. **이 문서**: [CLAUDE.md](CLAUDE.md)

### 현재 작업 상태
- ✅ v6.0 설계 완료
- ✅ v6.0 핵심 구현 완료
- ✅ 과거 지급 일괄 처리 기능 완료
- 🔄 테스트 및 검증 필요

---

## 🎯 프로젝트 개요

### 시스템 목적
이진 트리 기반 MLM(Multi-Level Marketing) 용역비 지급 시스템

### 핵심 비즈니스 로직
- **8단계 등급**: F1 ~ F8
- **이진 트리 구조**: 각 노드는 최대 2명의 자식 (left/right)
- **주간 지급**: 매주 금요일 자동 지급
- **병행 지급**: 승급 시 기존 지급 유지 + 새 지급 추가
- **동적 계획 생성**: 10회씩 끊어서 생성 (v6.0)

---

## 📋 버전 히스토리

### v6.0 (현재 버전)
**핵심 변경**: 동적 지급 계획 생성 (10회 단위)

#### 주요 개선사항
1. **동적 계획 생성**: 등록/승급 시 10회만 생성 (기존: 전체 미리 생성)
2. **10회 완료 시점 처리**: 등록/승급 시점에 10회 완료 확인 및 추가 생성
3. **매출월 기준 변경**: 각 10회 완료 시점의 매출월로 금액 재계산
4. **조건 재확인**: 매 10회마다 등급/보험 확인

#### v6.0 설계 원칙
```
✅ 금요일 자동처리 = 순수 지급만
✅ 등록/승급 시점 = 10회 완료 확인 + 추가 계획 생성
✅ 중복 방지 = parentPlanId 존재 여부 체크
✅ WeeklyPaymentSummary = 주차별 지급대장
```

### v5.0 (이전 버전)
- 전체 지급 계획 미리 생성 (성능 문제)
- 등급 자동계산 순서 버그 (사장님이 F1로 표시)
- 정렬 기준 오류 (이름 → 등록일 순으로 수정 필요)

### v4.0 (요구사항 정리)
- 병행 지급 명확화
- 지급 규칙 상세화
- 등급별 최대 지급 횟수 정의

---

## 🗄️ 데이터베이스 구조

### 핵심 컬렉션 (4개)

#### 1. monthlyRegistrations (월별 등록 관리)
```javascript
{
  monthKey: "2025-10",
  registrationCount: 5,
  totalRevenue: 5000000,
  adjustedRevenue: null,  // 관리자 수동 조정
  registrations: [...]
}
```

#### 2. monthlyTreeSnapshots (월별 계층도 스냅샷)
```javascript
{
  monthKey: "2025-10",
  snapshotDate: Date,
  gradeDistribution: { F1: 10, F2: 5, ... },
  users: [...]
}
```

#### 3. weeklyPaymentPlans (개별 지급 계획) ⭐ v6.0
```javascript
{
  userId: "user001",
  planType: "initial" | "promotion",
  generation: 1,  // ⭐ v6.0: 1, 2, 3, ...
  baseGrade: "F2",
  revenueMonth: "2025-10",
  totalInstallments: 10,  // ⭐ v6.0: 항상 10
  completedInstallments: 0,
  planStatus: "active" | "completed",
  installments: [10개],  // ⭐ v6.0: 10회만
  parentPlanId: ObjectId,  // ⭐ v6.0: 이전 계획 ID
  createdBy: "registration" | "promotion" | "auto_generation"  // ⭐ v6.0
}
```

#### 4. weeklyPaymentSummary (주차별 총계)
```javascript
{
  weekNumber: 202542,
  weekDate: Date,
  monthKey: "2025-10",
  status: "pending" | "processing" | "completed",
  byGrade: {
    F1: { userCount: 10, totalAmount: 240000, ... },
    ...
  },
  totalAmount: 1234567,
  totalTax: 40741,
  totalNet: 1193826
}
```

---

## 🔧 핵심 서비스 구조

### 1. registrationService.js
**역할**: 용역자 등록 및 트리/등급 재계산

**처리 흐름**:
```
1. 용역자 등록 (User 생성/업데이트)
2. 트리 재계산 (영향받는 사용자만)
3. 등급 재계산 (상향식 bottom-up)
4. 월별 스냅샷 업데이트
5. 월별 등록 정보 업데이트
6. 지급 계획 생성 (신규/승급자)
7. ⭐ v6.0: 10회 완료 확인 및 추가 생성
8. 처리 완료
```

**주요 함수**:
- `registerUsers()`: 메인 등록 처리
- Step 7에서 `checkAndCreateAdditionalPlan()` 호출

**파일 위치**: [apps/web/src/lib/server/services/registrationService.js](apps/web/src/lib/server/services/registrationService.js)

### 2. weeklyPaymentService.js
**역할**: 매주 금요일 자동 지급 처리

**처리 흐름** (v6.0):
```
1. 오늘 지급 대상 조회 (pending 상태)
2. 보험 조건 확인 (F3+ 필수)
3. 지급 처리 (paid 상태 변경)
4. WeeklyPaymentSummary 업데이트
5. 완료
=== 끝! 10회 완료 확인은 등록/승급 시점에 ===
```

**⚠️ 중요**: 금요일 처리는 **순수 지급만** 수행. 추가 계획 생성 안 함!

**주요 함수**:
- `processWeeklyPayments(date)`: 금요일 자동 지급
- `processAllPastPayments()`: 과거 지급 일괄 처리 (개발용)
- `checkInsuranceCondition()`: 보험 조건 확인

**파일 위치**: [apps/web/src/lib/server/services/weeklyPaymentService.js](apps/web/src/lib/server/services/weeklyPaymentService.js)

### 3. paymentPlanService.js
**역할**: 지급 계획 생성 및 관리

**주요 함수**:
- `createInitialPlan()`: 신규 용역자 초기 10회 생성
- `createPromotionPlan()`: 승급자 추가 10회 생성
- `checkAndCreateAdditionalPlan()`: ⭐ v6.0 10회 완료 시 추가 생성

**checkAndCreateAdditionalPlan 로직**:
```javascript
1. User 모델에서 최신 등급/보험 조회
2. 최대 횟수 확인 (F1:20, F2:30, ...)
3. 등급 확인 (하락 시 생성 안 함)
4. 보험 확인 (F3+ 필수)
5. 완료 매출월 계산 (10회차 날짜 기준)
6. 매출 조회 및 금액 계산
7. 추가 10회 계획 생성
   - generation++
   - parentPlanId 설정
   - createdBy = 'auto_generation'
8. WeeklyPaymentSummary 업데이트
```

**파일 위치**: [apps/web/src/lib/server/services/paymentPlanService.js](apps/web/src/lib/server/services/paymentPlanService.js)

---

## 🔄 데이터 흐름

### 용역자 등록 흐름
```
[Excel 업로드]
    ↓
[registrationService.registerUsers()]
    ↓
[1~6단계: 등록, 트리, 등급, 스냅샷, 지급계획]
    ↓
[7단계: 10회 완료 확인] ⭐ v6.0
    ├─ WeeklyPaymentPlans.find({ completedInstallments: 10, planStatus: 'completed' })
    ├─ parentPlanId 존재 여부 확인 (중복 방지)
    └─ checkAndCreateAdditionalPlan() 호출
    ↓
[완료]
```

### 금요일 자동 지급 흐름
```
[매주 금요일 00:00 - Cron]
    ↓
[weeklyPaymentService.processWeeklyPayments()]
    ↓
[1단계: 지급 처리]
    ├─ pending → paid
    ├─ completedInstallments++
    └─ planStatus = 'completed' (10회 완료 시)
    ↓
[2단계: WeeklyPaymentSummary 업데이트]
    ↓
[완료 - 추가 계획 생성 안 함!]
```

### 10회 완료 추가 생성 흐름 ⭐ v6.0
```
[등록/승급 시점]
    ↓
[completedInstallments === 10 조회]
    ↓
[parentPlanId 존재 여부 확인]
    ├─ 있으면 → SKIP (중복 방지)
    └─ 없으면 → 계속
    ↓
[조건 확인]
    ├─ 최대 횟수 체크
    ├─ 등급 유지 확인
    └─ 보험 확인 (F3+)
    ↓
[완료 매출월 기준 금액 계산]
    ↓
[추가 10회 계획 생성]
    ├─ generation++
    ├─ parentPlanId 설정
    └─ createdBy = 'auto_generation'
    ↓
[WeeklyPaymentSummary 업데이트]
```

---

## 🧪 개발 환경 설정

### 1. DB 초기화
**스크립트 실행**:
```bash
DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db \
bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force
```

**초기 관리자 계정**:
- **아이디**: `관리자`
- **비밀번호**: `admin1234!!` (느낌표 2개 주의!)

**동작**:
- MongoDB 초기화 (nanumpay 데이터베이스)
- 기본 관리자 계정 생성
- 모든 컬렉션 삭제 및 재생성

**주의**:
- `--force` 플래그는 기존 데이터를 모두 삭제합니다
- 프로덕션 환경에서는 절대 사용 금지!

### 2. 개발 서버 실행
```bash
pnpm dev:web --host
```

**접속 정보**:
- **로컬**: http://localhost:5173
- **네트워크**: http://[IP주소]:5173
- **관리자 페이지**: http://localhost:5173/admin

**서버 종료**:
- `Ctrl + C` 또는 포트 강제 종료:
```bash
lsof -ti:5173 | xargs -r kill -9
```

### 3. MongoDB 상태 확인
**MongoDB 연결 확인**:
```bash
mongosh mongodb://localhost:27017/nanumpay
```

**주요 컬렉션 조회**:
```javascript
// 사용자 수 확인
db.users.countDocuments()

// 지급 계획 확인
db.weeklypaymentplans.find().limit(5)

// 주차별 총계 확인
db.weeklypaymentsummary.find().sort({ weekNumber: -1 }).limit(5)

// 월별 등록 확인
db.monthlyregistrations.find()
```

### 4. 과거 지급 일괄 처리
**목적**: 개발 중 7월부터 데이터 입력 시 매주 지급 수동 처리 부담 해소

**사용 방법**:
1. 환경변수 설정: `AUTO_PROCESS_PAST_PAYMENTS=true`
2. 웹 UI: 용역비 관리대장 → "과거 지급 처리" 버튼 클릭
3. 또는 API: `POST /api/admin/payment/process-past`

**동작**:
- 오늘 이전 모든 pending 지급을 주차별로 순차 처리
- 오래된 주차부터 처리하여 정확성 보장

**주의**: 프로덕션 환경에서는 환경변수 false로 설정!

---

## 📝 주요 비즈니스 규칙

### 등급별 지급 규칙
| 등급 | 기본 지급액 | 최대 횟수 | 보험 필수 |
|-----|-----------|---------|---------|
| F1  | 24,000원  | 20회    | ❌      |
| F2  | 81,000원  | 30회    | ❌      |
| F3  | 189,000원 | 40회    | ✅ 5만원 |
| F4  | 324,000원 | 40회    | ✅ 5만원 |
| F5  | 540,000원 | 50회    | ✅ 7만원 |
| F6  | 810,000원 | 50회    | ✅ 7만원 |
| F7  | 1,215,000원 | 60회  | ✅ 10만원 |
| F8  | 1,620,000원 | 60회  | ✅ 10만원 |

### 등급 승급 조건
- **F1**: 본인 + 직계 1명
- **F2**: 본인 + 직계 2명
- **F3**: 본인 + 직계 4명 (F2 이상 2명 포함)
- **F4**: 본인 + 직계 8명 (F3 이상 2명 포함)
- **F5**: 본인 + 직계 16명 (F4 이상 2명 포함)
- **F6**: 본인 + 직계 32명 (F5 이상 2명 포함)
- **F7**: 본인 + 직계 64명 (F6 이상 2명 포함)
- **F8**: 본인 + 직계 128명 (F7 이상 2명 포함)

### 병행 지급 원칙
승급 시:
- ✅ 기존 지급 계획 유지 (중단하지 않음)
- ✅ 새 등급 지급 계획 추가 생성
- ✅ 두 계획 동시 진행

예시:
```
F1 사용자가 5회 지급 후 F2 승급
→ F1 계획: 남은 5회 계속 진행 (1~10회 중 6~10회)
→ F2 계획: 새로 10회 생성 (generation 1)
→ 이후 F1 10회 완료 시: F1 추가 10회 (generation 2)
→ 이후 F2 10회 완료 시: F2 추가 10회 (generation 2)
```

---

## ⚠️ 자주 발생하는 이슈

### 1. "금요일 자동처리에서 추가 계획 생성하면 안 돼!"
**원인**: v6.0 설계 원칙 위반
**해결**:
- weeklyPaymentService.js에는 `checkAndCreateAdditionalPlan` 호출 금지
- 등록/승급 시점(registrationService.js)에서만 호출

### 2. "등급이 F1로 잘못 표시됨"
**원인**: 등급 계산 순서 (이름순 → 등록일순)
**해결**: 등록일 기준 오름차순 정렬 후 등급 계산

### 3. "지급액이 틀림"
**원인**:
- 매출월 기준 오류
- 등급별 배분율 계산 오류
**확인**:
1. MonthlyRegistrations에서 해당 월 매출 확인
2. gradeDistribution 비율 확인
3. 계산식: `기본지급액 / 10 / 100 * 100` (100원 단위)

### 4. "중복으로 계획이 생성됨"
**원인**: parentPlanId 확인 누락
**해결**:
```javascript
const hasAdditionalPlan = await WeeklyPaymentPlans.findOne({
  parentPlanId: plan._id
});
if (!hasAdditionalPlan) {
  // 생성
}
```

---

## 🔍 디버깅 체크리스트

### 지급 관련 문제
1. [ ] WeeklyPaymentPlans 상태 확인 (`planStatus`, `completedInstallments`)
2. [ ] WeeklyPaymentSummary 통계 확인
3. [ ] 보험 조건 확인 (F3+ insuranceActive)
4. [ ] 매출월 데이터 존재 확인 (MonthlyRegistrations)

### 등급 관련 문제
1. [ ] 트리 구조 확인 (leftChild, rightChild)
2. [ ] 직계 카운트 확인 (descendantsCount)
3. [ ] 등급 계산 순서 확인 (등록일순)
4. [ ] MonthlyTreeSnapshots 스냅샷 확인

### 10회 완료 관련 문제
1. [ ] completedInstallments === 10 확인
2. [ ] planStatus === 'completed' 확인
3. [ ] parentPlanId 중복 확인
4. [ ] generation 증가 확인
5. [ ] createdBy === 'auto_generation' 확인

---

## 📚 참고 문서

### 주요 문서
1. **요구사항 v4.0**: [docs/시스템_요구사항_검토문서_v4.0.md](docs/시스템_요구사항_검토문서_v4.0.md)
   - 병행 지급 명확화
   - 지급 규칙 상세화

2. **설계문서 v6.0**: [docs/시스템_설계_문서_v6.md](docs/시스템_설계_문서_v6.md)
   - 동적 계획 생성 설계
   - 데이터베이스 구조
   - 자동화 프로세스

3. **이전 설계 (참고용)**:
   - v5.0 설계 (전체 미리 생성 방식)
   - v3.0 설계 (초기 버전)

### 핵심 소스 코드
```
apps/web/src/lib/server/
├── models/
│   ├── User.js                      # 사용자 모델 (트리 구조)
│   ├── WeeklyPaymentPlans.js        # 지급 계획 (v6.0)
│   ├── WeeklyPaymentSummary.js      # 주차별 총계
│   ├── MonthlyRegistrations.js      # 월별 등록
│   └── MonthlyTreeSnapshots.js      # 월별 스냅샷
├── services/
│   ├── registrationService.js       # 등록 처리 (7단계)
│   ├── weeklyPaymentService.js      # 금요일 자동 지급
│   ├── paymentPlanService.js        # 지급 계획 생성
│   └── batchProcessor.js            # 배치 처리
└── db.js                            # MongoDB 연결

apps/web/src/routes/
├── (admin)/admin/
│   ├── payment/+page.svelte         # 용역비 관리대장
│   ├── users/+page.svelte           # 용역자 관리
│   └── dashboard/+page.svelte       # 대시보드
└── api/admin/
    ├── payment/
    │   ├── process-past/+server.js  # 과거 지급 처리
    │   ├── weekly/+server.js        # 주간 지급 API
    │   └── schedule/+server.js      # 지급 일정 API
    └── users/
        └── bulk/+server.js          # 대량 등록 API
```

---

## 🚀 다음 작업 (TODO)

### 우선순위 높음
- [ ] v6.0 전체 테스트
  - [ ] 등록 → 10회 완료 → 추가 생성 플로우
  - [ ] 승급 → 병행 지급 확인
  - [ ] 금요일 자동 지급 확인
- [ ] 과거 지급 일괄 처리 테스트
- [ ] 프론트엔드 UI 개선
  - [ ] generation 표시
  - [ ] parentPlanId 연결 표시

### 우선순위 중간
- [ ] 성능 최적화
  - [ ] MongoDB 인덱스 확인
  - [ ] 쿼리 최적화
- [ ] 로깅 개선
- [ ] 에러 핸들링 강화

### 우선순위 낮음
- [ ] 관리자 대시보드 통계 추가
- [ ] Excel 내보내기 개선
- [ ] 사용자 매뉴얼 작성

---

## 💡 팁 & 베스트 프랙티스

### 코드 수정 시
1. **설계문서 먼저 확인**: 무작정 코드 수정하지 말고 설계 원칙 확인
2. **v6.0 원칙 준수**: 금요일 = 지급만, 등록/승급 = 10회 완료 확인
3. **중복 방지**: parentPlanId 항상 확인
4. **로그 확인**: console.log로 처리 단계 추적

### 디버깅 시
1. **MongoDB 직접 확인**:
   ```bash
   # MongoDB 접속
   mongosh mongodb://localhost:27017/nanumpay

   # 특정 사용자 확인
   db.users.findOne({ userId: "user001" })

   # 지급 계획 확인 (특정 사용자)
   db.weeklypaymentplans.find({ userId: "user001" }).sort({ generation: 1 })

   # 완료된 10회 계획 확인
   db.weeklypaymentplans.find({
     completedInstallments: 10,
     planStatus: "completed"
   })

   # parentPlanId 중복 확인
   db.weeklypaymentplans.find({
     parentPlanId: { $exists: true, $ne: null }
   })
   ```

2. **WeeklyPaymentSummary 확인**:
   ```javascript
   // 최근 주차별 총계 확인
   db.weeklypaymentsummary.find().sort({ weekNumber: -1 }).limit(5)

   // 특정 주차 상세 확인
   db.weeklypaymentsummary.findOne({ weekNumber: 202542 })

   // 등급별 통계 확인
   db.weeklypaymentsummary.aggregate([
     { $group: {
       _id: "$monthKey",
       totalAmount: { $sum: "$totalAmount" }
     }}
   ])
   ```

3. **generation 추적**:
   ```javascript
   // 특정 사용자의 generation 순서 확인
   db.weeklypaymentplans.find({ userId: "user001" })
     .sort({ baseGrade: 1, generation: 1 })
     .forEach(plan => {
       print(`${plan.baseGrade} - Gen ${plan.generation} - Status: ${plan.planStatus}`)
     })
   ```

4. **서버 로그 확인**:
   - 개발 서버 콘솔에서 `console.log` 출력 확인
   - 처리 단계별 로그 추적
   - 에러 스택 트레이스 확인

5. **브라우저 개발자 도구**:
   - Network 탭: API 요청/응답 확인
   - Console 탭: 프론트엔드 에러 확인
   - Application 탭: 세션/쿠키 확인

### 새 기능 추가 시
1. **요구사항 문서 업데이트**
2. **설계문서 업데이트**
3. **이 문서(CLAUDE.md) 업데이트**
4. **구현**
5. **테스트**
6. **커밋**

---

## 📞 문의 사항

버그, 개선사항, 질문이 있으면:
1. 이 문서 확인
2. 설계문서 v6.0 확인
3. 요구사항 문서 v4.0 확인
4. 그래도 불분명하면 사용자에게 문의

---

**마지막 업데이트**: 2025-10-12 (개발 환경 설정 및 디버깅 가이드 추가)
**작성자**: Claude (AI Assistant)
**버전**: v6.0
