# Claude 작업 세션 2: 관리자 대시보드 월별 매출 관리 기능

**작업일**: 2025-10-15
**버전**: v7.1
**상태**: ⚠️ 구현 완료, 디버깅 필요

---

## 📋 작업 개요

[docs/작업계획서_관리자_대시보드_월별매출관리.md](docs/작업계획서_관리자_대시보드_월별매출관리.md)에 따라 관리자 대시보드의 월별 매출 관리 기능을 구현했습니다.

### 목표
1. MonthlyRegistrations 기반 월별 통계 표출
2. 매출액 수동 조정 기능
3. 안전 장치 (지급 진행 중 경고)

---

## ✅ 완료된 작업

### Phase 1: 백엔드 구현 (완료)

#### 1.1 MonthlyRegistrations 스키마 확장
**파일**: [apps/web/src/lib/server/models/MonthlyRegistrations.js](apps/web/src/lib/server/models/MonthlyRegistrations.js#L52-L87)

**추가된 필드**:
```javascript
// v7.1: 수동 매출 설정 관련 필드
isManualRevenue: Boolean,           // 수동으로 매출을 설정했는지 여부
revenueModifiedBy: ObjectId,        // 매출을 수정한 관리자 ID
revenueModifiedAt: Date,            // 매출 수정 시각
revenueChangeReason: String,        // 매출 변경 사유
revenueChangeHistory: [{            // 변경 이력
  previousRevenue: Number,
  newRevenue: Number,
  modifiedBy: ObjectId,
  modifiedAt: Date,
  reason: String
}]
```

#### 1.2 revenueService.js 생성
**파일**: [apps/web/src/lib/server/services/revenueService.js](apps/web/src/lib/server/services/revenueService.js)

**주요 함수**:
- `checkPaymentStatus(monthKey)`: 지급 상태 확인
  - 반환: `{ hasPaid, paidCount, totalCount }`

- `regeneratePaymentPlans(monthKey, newRevenue, adminUser, reason, force)`: 지급 계획 재생성
  - 기존 계획 삭제
  - 새 매출 기준 금액 재계산
  - paymentTargets 기준 계획 재생성
  - WeeklyPaymentSummary 재계산

- `adjustRevenue(monthKey, adjustedRevenue, adminUser, reason, force)`: 매출 수동 조정 메인 함수

**내장 함수**:
- `calculateGradePayments()`: 등급별 지급액 계산
- `startOfWeek()`: 금요일 시작 날짜 계산
- `getWeekNumber()`: ISO 주차 번호 계산

#### 1.3 API 엔드포인트 생성

1. **POST /api/admin/revenue/adjust**
   - **파일**: [apps/web/src/routes/api/admin/revenue/adjust/+server.js](apps/web/src/routes/api/admin/revenue/adjust/+server.js)
   - **기능**: 매출 수동 조정
   - **파라미터**:
     ```javascript
     {
       monthKey: "2025-10",
       adjustedRevenue: 5000000,
       reason: "회계 조정 - 특별 인센티브",
       force: false  // paid 있어도 강제 실행
     }
     ```

2. **GET /api/admin/revenue/monthly?monthKey=2025-10**
   - **파일**: [apps/web/src/routes/api/admin/revenue/monthly/+server.js](apps/web/src/routes/api/admin/revenue/monthly/+server.js)
   - **기능**: 월별 통계 조회
   - **기존 API 확장**: 기존 전체 조회 + 특정 월 조회 추가

3. **GET /api/admin/revenue/range?start=2025-07&end=2025-10**
   - **파일**: [apps/web/src/routes/api/admin/revenue/range/+server.js](apps/web/src/routes/api/admin/revenue/range/+server.js)
   - **기능**: 기간별 통계 조회

---

### Phase 2: 프론트엔드 구현 (완료)

#### 2.1 GradePaymentCard.svelte 전면 개편
**파일**: [apps/web/src/lib/components/admin/GradePaymentCard.svelte](apps/web/src/lib/components/admin/GradePaymentCard.svelte)
**백업**: [GradePaymentCard.svelte.backup](apps/web/src/lib/components/admin/GradePaymentCard.svelte.backup)

**주요 변경사항**:
- ❌ 기존: 전체 사용자 기준 통계
- ✅ 신규: MonthlyRegistrations 기반 통계

**새로운 기능**:
1. **조회 모드**
   - 단일 월 조회
   - 기간 조회 (시작월 ~ 종료월)

2. **단일 월 뷰**
   - 📈 매출 정보
     - 자동 매출 (등록자 수 × 1,000,000)
     - 수동 매출 (설정 시)
     - [수동 설정] 버튼

   - 👥 지급 대상자
     - 등록자 / 승급자 / 추가지급 / 총 대상자

   - 📊 등급별 분포 및 지급액
     - 등급 / 인원 / 1회 지급액 / 총 지급 예정액(10회분)

   - ⚙️ 지급 상태
     - ✅ 대기 중 (변경 가능)
     - ⚠️ 진행 중 (변경 주의)
     - 총 계획 / 완료 / 대기

3. **기간 뷰**
   - 월별 누적 테이블
   - 월 / 매출액 / 등록자 / 대상자 / 지급 완료
   - 기간 합계 (총 매출, 총 등록자, 평균 월 매출)

#### 2.2 RevenueAdjustModal.svelte 생성
**파일**: [apps/web/src/lib/components/admin/RevenueAdjustModal.svelte](apps/web/src/lib/components/admin/RevenueAdjustModal.svelte)

**기능**:
1. **매출 수동 설정 UI**
   - 대상 월 표시
   - 현재 매출 (자동/수동 구분)
   - 새 매출액 입력
   - 변경 금액 및 비율 표시
   - 변경 사유 입력

2. **안전 장치**
   - 지급 대기 중: 일반 경고 표시
   - 지급 진행 중: 강력한 경고 + 확인 모달
     - 완료된 지급 건수 표시
     - 위험성 고지
     - force 옵션 필요

3. **확인 모달** (지급 진행 중일 때)
   - 최종 확인 단계
   - 위험성 재고지
   - 취소 / 변경 진행 버튼

---

### Phase 3: 서비스 로직 통합 (완료)

**확인 사항**:
- ✅ paymentPlanService.js에서 이미 `getEffectiveRevenue()` 사용 중
- ✅ step3_paymentTargets.js에서 이미 `getEffectiveRevenue()` 사용 중
- ✅ adjustedRevenue 우선 사용 로직 이미 구현됨

**MonthlyRegistrations 모델**:
```javascript
// 헬퍼 메소드: 실제 사용할 매출 가져오기
getEffectiveRevenue() {
  return this.adjustedRevenue !== null ? this.adjustedRevenue : this.totalRevenue;
}
```

---

## ⚠️ 현재 상태 및 이슈

### 실행 상태
- **서버**: http://localhost:3101/
- **상태**: 정상 실행 중
- **문제**: 프론트엔드에서 "로딩 중..." 상태로 멈춤

### 발생한 에러 및 해결

#### 에러 1: import 경로 오류
**문제**:
```
Failed to load url ./paymentCalculations.js (resolved id: ./paymentCalculations.js)
```

**원인**: `paymentCalculations.js` 파일이 존재하지 않음

**해결**:
revenueService.js에 필요한 함수들을 직접 구현:
- `calculateGradePayments()`: paymentPlanService.js와 동일한 로직
- `startOfWeek()`: 금요일 날짜 계산
- `getWeekNumber()`: ISO 주차 번호 계산

### 남은 이슈 (다음 세션에서 디버깅)

1. **프론트엔드 로딩 이슈**
   - 증상: "로딩 중..." 상태로 멈춤
   - 추정 원인:
     - API 응답 오류
     - 데이터 구조 불일치
     - React/Svelte 렌더링 오류
   - 디버깅 필요:
     - 브라우저 콘솔 에러 확인
     - Network 탭에서 API 응답 확인
     - 서버 로그 확인

2. **API 응답 검증**
   - `/api/admin/revenue/monthly` 응답 구조 확인
   - effectiveRevenue 필드 존재 여부
   - paymentStatus 필드 존재 여부

3. **데이터 초기화**
   - 현재 MonthlyRegistrations에 isManualRevenue 필드 없을 수 있음
   - 기존 데이터 마이그레이션 필요할 수 있음

---

## 📂 변경된 파일 목록

### 신규 생성
```
apps/web/src/lib/server/services/revenueService.js
apps/web/src/routes/api/admin/revenue/adjust/+server.js
apps/web/src/routes/api/admin/revenue/range/+server.js
apps/web/src/lib/components/admin/RevenueAdjustModal.svelte
apps/web/src/lib/components/admin/GradePaymentCard.svelte.backup
```

### 수정
```
apps/web/src/lib/server/models/MonthlyRegistrations.js
apps/web/src/routes/api/admin/revenue/monthly/+server.js
apps/web/src/lib/components/admin/GradePaymentCard.svelte
```

---

## 🔍 다음 세션 디버깅 체크리스트

### 1. 브라우저 개발자 도구 확인
```bash
# 1. http://localhost:3101/admin 접속
# 2. F12 또는 우클릭 > 검사
# 3. Console 탭: 에러 메시지 확인
# 4. Network 탭:
#    - /api/admin/revenue/monthly 요청 확인
#    - 응답 Status 확인 (200 OK?)
#    - 응답 Body 확인 (데이터 구조)
```

### 2. 서버 로그 확인
```bash
# 백그라운드 프로세스 출력 확인
# API 호출 시 서버 콘솔에 에러 출력되는지 확인
```

### 3. API 직접 테스트
```bash
# curl로 직접 API 호출
curl http://localhost:3101/api/admin/revenue/monthly?monthKey=2025-10

# 예상 응답:
# {
#   "monthKey": "2025-10",
#   "totalRevenue": 0,
#   "adjustedRevenue": null,
#   "effectiveRevenue": 0,  # <- 이 필드 확인!
#   "isManualRevenue": false,
#   ...
# }
```

### 4. GradePaymentCard 간소화 테스트
```javascript
// 임시로 간단한 UI로 교체하여 데이터 로딩 확인
<div class="p-4">
  {#if monthlyData}
    <pre>{JSON.stringify(monthlyData, null, 2)}</pre>
  {:else}
    <p>데이터 없음</p>
  {/if}
</div>
```

### 5. DB 데이터 확인
```bash
mongosh mongodb://localhost:27017/nanumpay

# MonthlyRegistrations 조회
db.monthlyregistrations.findOne()

# 필드 확인:
# - isManualRevenue 존재?
# - adjustedRevenue 존재?
# - paymentTargets 존재?
```

---

## 🚀 다음 세션 작업 순서

### Step 1: 디버깅
1. 브라우저 콘솔 에러 확인
2. API 응답 구조 확인
3. 서버 로그 확인
4. 문제 원인 파악

### Step 2: 수정
1. 발견된 이슈 수정
2. 간단한 테스트 케이스 작성
3. 단계별 기능 검증

### Step 3: 테스트 (작업계획서 Phase 4)
1. **시나리오 1**: 지급 전 매출 변경
   ```
   - 7월 3명 등록 (자동 3,000,000원)
   - 매출 5,000,000원으로 변경
   - 지급액 증가 확인
   ```

2. **시나리오 2**: 지급 진행 중 매출 변경
   ```
   - 8월 3명 등록
   - 일부 지급 완료
   - 매출 변경 시도
   - 경고 메시지 확인
   ```

3. **시나리오 3**: 기간 조회
   ```
   - 7-10월 기간 조회
   - 월별 통계 정확성 확인
   ```

---

## 📝 참고 문서

- [작업계획서](docs/작업계획서_관리자_대시보드_월별매출관리.md)
- [시스템 설계 문서 v7.0](docs/시스템_설계_문서_v7.md)
- [시스템 요구사항 v5.0](docs/시스템_요구사항_검토문서_v5.0.md)
- [CLAUDE.md](CLAUDE.md) - 메인 컨텍스트 문서

---

## 💡 주요 설계 결정

### 1. adjustedRevenue 우선 사용
- `getEffectiveRevenue()` 메소드로 통일
- `adjustedRevenue !== null` 이면 우선 사용
- 그렇지 않으면 `totalRevenue` 사용

### 2. 지급 계획 재생성 전략
- 기존 계획 전체 삭제 (해당 월 귀속만)
- 새 매출 기준으로 재계산
- paymentTargets 기준으로 재생성
  - 등록자 → 기본지급 10회
  - 승급자 → 기본지급 10회
  - 추가지급 대상자 → 추가지급 10회

### 3. 안전 장치
- hasPaid = true 시 force 플래그 필수
- 확인 모달로 2단계 확인
- 변경 이력 자동 기록
- 관리자 ID 및 시각 기록

### 4. UI/UX 설계
- 용역비 지급명부와 일관된 UI
- 단일 월 / 기간 조회 모드
- 명확한 경고 메시지
- 변경 전 확인 모달

---

## 🔐 보안 고려사항

1. **관리자 권한 체크**
   ```javascript
   if (!locals.user || locals.user.type !== 'admin') {
     return json({ message: '권한이 없습니다.' }, { status: 401 });
   }
   ```

2. **감사 로그**
   - 모든 변경 사항 revenueChangeHistory에 기록
   - modifiedBy, modifiedAt, reason 필수

3. **Force 옵션**
   - 지급 진행 중일 때만 필요
   - 2단계 확인 필요

---

**다음 세션에서 계속...**

---

**작성자**: Claude (AI Assistant)
**마지막 업데이트**: 2025-10-15
