# 📋 작업 계획서: 매출/지급 통계 UI 개선 및 주간 집계 수정

**작성일**: 2025-10-15
**버전**: v7.1
**목표**: 매출 통계와 지급 통계를 명확히 분리하고, 주간 집계 로직 수정

---

## 🎯 작업 목표

### 핵심 문제
1. **UI 혼재**: 매출 정보(입력 시점)와 지급 통계(실제 지급 시점)가 혼재되어 혼란
2. **주간 집계 오류**: `step5_updateSummary.js`가 이번에 생성된 계획만 집계 (전체 active 계획 집계 필요)
3. **병행 지급 불명확**: 7월분+8월분이 9월에 동시 지급되는 것이 표현 안 됨

### 해결 방안
- **2개 섹션 분리**: 매출 통계 + 지급 통계
- **주간 집계 수정**: 전체 active 계획 기준으로 주차별 재계산
- **명확한 표현**: 등급별 인원만 표시 (금액은 참고용)

---

## 📊 1단계: UI 구조 개편

### 1-1. 매출 통계 섹션

**컴포넌트**: `MonthlyRevenueCard.svelte` (신규 또는 기존 분리)

**레이아웃**:
```
┌─────────────────────────────────────────────────────┐
│ 📈 매출 통계                                           │
├─────────────────────────────────────────────────────┤
│ ◉ 월간  ○ 기간    2025 년  10월 ▼                    │
├─────────────────────────────────────────────────────┤
│ 자동 매출: 1,000,000원 (등록자 1명)                    │
│ 수동 매출: 설정 안 됨                                  │
│ 적용 매출: 1,000,000원          [수동 설정] ✅ 현재월만│
│                                                      │
│ 등록/승급 현황:                                        │
│ - 신규 등록: 1명 (F1)                                 │
│ - 승급: 0명                                          │
│ - 추가지급 대상: 3명                                   │
│                                                      │
│ 등급별 대상자:                                         │
│ ┌──────┬──────┬──────────┬──────────┬────────┐    │
│ │ 등급 │ 인원 │  1회 금액 │ 10회 총액 │지급기간 │    │
│ ├──────┼──────┼──────────┼──────────┼────────┤    │
│ │ F1  │  1명 │   12,000 │  120,000 │11~1월  │    │
│ │ F2  │  2명 │   40,500 │  405,000 │11~1월  │    │
│ │ F3  │  1명 │  189,000 │1,890,000 │11~1월  │    │
│ └──────┴──────┴──────────┴──────────┴────────┘    │
│                                                      │
│ 💡 매출은 다음 달부터 10주간 지급됩니다                 │
└─────────────────────────────────────────────────────┘
```

**기능**:
- 월간/기간 선택
- 현재월만 [수동 설정] 버튼 활성화
- 등록/승급/추가지급 대상자 표시
- 등급별 1회/10회 금액 참고 표시

**데이터 소스**: `MonthlyRegistrations`

**API**: `/api/admin/revenue/monthly?monthKey=YYYY-MM`

---

### 1-2. 지급 통계 섹션

**컴포넌트**: `PaymentStatisticsCard.svelte` (신규 또는 기존 분리)

#### 월간 뷰
```
┌─────────────────────────────────────────────────────┐
│ 📊 등급별 지급 통계                                     │
├─────────────────────────────────────────────────────┤
│ 조회: ◉ 월간  ○ 주간                                  │
│ 2025 년  8월 ▼  ~  2025 년  11월 ▼                  │
├─────────────────────────────────────────────────────┤
│ 등급 │ 8월  │ 9월  │ 10월 │ 11월 │ 합계              │
│ ─────┼──────┼──────┼──────┼──────┼─────              │
│ F1  │ 0명  │ 2명  │ 5명  │ 5명  │ 5명               │
│ F2  │ 0명  │ 1명  │ 2명  │ 2명  │ 2명               │
│ F3  │ 0명  │ 0명  │ 0명  │ 1명  │ 1명               │
│ ─────┼──────┼──────┼──────┼──────┼─────              │
│ 합계│ 0명  │ 3명  │ 6명  │ 7명  │ 7명*              │
│                                                      │
│ * 중복 카운트 (병행 지급)                               │
└─────────────────────────────────────────────────────┘
```

#### 주간 뷰
```
┌─────────────────────────────────────────────────────┐
│ 📊 등급별 지급 통계                                     │
├─────────────────────────────────────────────────────┤
│ 조회: ○ 월간  ◉ 주간                                  │
│ 2025 년  9월 ▼  ~  2025 년  10월 ▼                  │
├─────────────────────────────────────────────────────┤
│ 등급│9/1주│9/2주│9/3주│9/4주│10/1주│10/2주│...      │
│ ────┼─────┼─────┼─────┼─────┼──────┼──────┼───      │
│ F1 │ 5명 │ 5명 │ 5명 │ 5명 │ 5명  │ 5명  │...      │
│ F2 │ 2명 │ 2명 │ 2명 │ 2명 │ 2명  │ 2명  │...      │
│ F3 │ 1명 │ 1명 │ 1명 │ 1명 │ 1명  │ 1명  │...      │
│ ────┼─────┼─────┼─────┼─────┼──────┼──────┼───      │
│합계│ 7명 │ 7명 │ 7명 │ 7명 │ 7명  │ 7명  │...      │
│                                                      │
│ 💡 9월: 7월분(3명) + 8월분(3명) + 9월분(1명) 병행      │
└─────────────────────────────────────────────────────┘
```

**기능**:
- 월간/주간 토글
- 등급별 지급 인원만 표시 (금액 제외)
- 병행 지급 안내 메시지

**데이터 소스**:
- 월간: `WeeklyPaymentPlans` 집계
- 주간: `WeeklyPaymentSummary`

**API**:
- `/api/admin/payment/statistics/monthly?start=YYYY-MM&end=YYYY-MM`
- `/api/admin/payment/statistics/weekly?start=YYYY-MM&end=YYYY-MM`

---

## 🔧 2단계: 백엔드 수정

### 2-1. step5_updateSummary.js 수정

**파일**: `apps/web/src/lib/server/services/registration/step5_updateSummary.js`

**현재 문제**:
```javascript
// ❌ 이번에 생성된 계획만 조회
const allPlanIds = [
  ...registrantPlans.map(p => p.plan),
  ...promotionPlans.map(p => p.plan),
  ...additionalPlans.map(p => p.plan)
];

const allPlans = await WeeklyPaymentPlans.find({
  _id: { $in: allPlanIds }
});
```

**수정 방안**:
```javascript
// ✅ 전체 활성 계획 조회
const allPlans = await WeeklyPaymentPlans.find({
  planStatus: { $in: ['active', 'completed'] }
});

console.log(`  전체 활성 계획: ${allPlans.length}건`);
```

**주차별 집계 로직**:
```javascript
const weeklyData = {};

for (const plan of allPlans) {
  const grade = plan.baseGrade;
  const userId = plan.userId;

  for (const inst of plan.installments) {
    if (inst.status !== 'pending') continue;

    const weekNumber = inst.weekNumber;

    if (!weeklyData[weekNumber]) {
      weeklyData[weekNumber] = {
        weekNumber,
        weekDate: inst.scheduledDate,
        byGrade: {
          F1: { userIds: new Set(), count: 0 },
          F2: { userIds: new Set(), count: 0 },
          F3: { userIds: new Set(), count: 0 },
          F4: { userIds: new Set(), count: 0 },
          F5: { userIds: new Set(), count: 0 },
          F6: { userIds: new Set(), count: 0 },
          F7: { userIds: new Set(), count: 0 },
          F8: { userIds: new Set(), count: 0 }
        }
      };
    }

    // 등급별 인원 집계 (중복 제거)
    weeklyData[weekNumber].byGrade[grade].userIds.add(userId);
  }
}

// Set을 count로 변환
for (const [weekNumber, data] of Object.entries(weeklyData)) {
  for (const grade of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
    data.byGrade[grade].count = data.byGrade[grade].userIds.size;
    delete data.byGrade[grade].userIds; // Set 제거
  }
}
```

**WeeklyPaymentSummary 저장**:
```javascript
for (const [weekNumber, data] of Object.entries(weeklyData)) {
  const isoWeekNumber = weekNumber.toString().replace(/^(\d{4})(\d{2})$/, '$1-W$2');

  let totalUserCount = 0;
  const byGrade = {};

  for (const [grade, gradeData] of Object.entries(data.byGrade)) {
    byGrade[grade] = {
      userCount: gradeData.count,
      // 금액 관련 필드는 제거 또는 0으로
    };
    totalUserCount += gradeData.count;
  }

  // 덮어쓰기 (upsert)
  await WeeklyPaymentSummary.findOneAndUpdate(
    { weekNumber: isoWeekNumber },
    {
      weekNumber: isoWeekNumber,
      weekDate: data.weekDate,
      totalUserCount,
      byGrade,
      status: 'scheduled'
    },
    { upsert: true, new: true }
  );
}
```

---

### 2-2. WeeklyPaymentSummary 스키마 수정 (선택 사항)

**파일**: `apps/web/src/lib/server/models/WeeklyPaymentSummary.js`

**현재**:
```javascript
byGrade: {
  F1: {
    amount: Number,
    tax: Number,
    net: Number,
    userCount: Number,
    paymentCount: Number
  },
  // ...
}
```

**수정안** (간소화):
```javascript
byGrade: {
  F1: {
    userCount: Number  // 인원만 저장
  },
  // ...
}
```

**이유**: 병행 지급으로 인해 금액 합산이 의미 없음

---

### 2-3. 새 API 엔드포인트 추가 (선택 사항)

#### `/api/admin/payment/statistics/monthly/+server.js` (신규)

**기능**: 월간 지급 통계 (등급별 인원)

```javascript
export async function GET({ url }) {
  const start = url.searchParams.get('start'); // 2025-08
  const end = url.searchParams.get('end');     // 2025-11

  // WeeklyPaymentPlans에서 집계
  const plans = await WeeklyPaymentPlans.find({
    planStatus: { $in: ['active', 'completed'] }
  });

  // 월별 등급별 인원 집계
  const monthlyStats = {};

  for (const plan of plans) {
    for (const inst of plan.installments) {
      if (inst.status !== 'pending') continue;

      const monthKey = inst.scheduledDate.toISOString().slice(0, 7); // YYYY-MM
      if (monthKey < start || monthKey > end) continue;

      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = {
          F1: new Set(), F2: new Set(), F3: new Set(), F4: new Set(),
          F5: new Set(), F6: new Set(), F7: new Set(), F8: new Set()
        };
      }

      monthlyStats[monthKey][plan.baseGrade].add(plan.userId);
    }
  }

  // Set을 count로 변환
  const result = [];
  for (const [monthKey, gradeData] of Object.entries(monthlyStats)) {
    result.push({
      monthKey,
      byGrade: {
        F1: gradeData.F1.size,
        F2: gradeData.F2.size,
        F3: gradeData.F3.size,
        F4: gradeData.F4.size,
        F5: gradeData.F5.size,
        F6: gradeData.F6.size,
        F7: gradeData.F7.size,
        F8: gradeData.F8.size
      }
    });
  }

  return json({ monthlyData: result });
}
```

#### `/api/admin/payment/statistics/weekly/+server.js` (신규)

**기능**: 주간 지급 통계 (WeeklyPaymentSummary 조회)

```javascript
export async function GET({ url }) {
  const start = url.searchParams.get('start'); // 2025-09
  const end = url.searchParams.get('end');     // 2025-10

  // WeeklyPaymentSummary 조회
  const summaries = await WeeklyPaymentSummary.find({
    weekNumber: {
      $gte: convertToISOWeek(start),
      $lte: convertToISOWeek(end)
    }
  }).sort({ weekNumber: 1 });

  return json({ weeklyData: summaries });
}
```

---

## 🎨 3단계: 프론트엔드 구현

### 3-1. 파일 구조

```
apps/web/src/
├── lib/components/admin/
│   ├── MonthlyRevenueCard.svelte        ← 신규 (매출 통계)
│   ├── PaymentStatisticsCard.svelte    ← 신규 (지급 통계)
│   └── GradePaymentCard.svelte          ← 기존 (분리 또는 제거)
└── routes/(admin)/admin/+page.svelte
```

### 3-2. admin/+page.svelte 수정

```svelte
<script>
  import MonthlyRevenueCard from '$lib/components/admin/MonthlyRevenueCard.svelte';
  import PaymentStatisticsCard from '$lib/components/admin/PaymentStatisticsCard.svelte';
</script>

<svelte:head>
  <title>관리자 홈 - 나눔페이</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
  <!-- 매출 통계 -->
  <MonthlyRevenueCard />

  <!-- 지급 통계 -->
  <PaymentStatisticsCard />
</div>
```

### 3-3. MonthlyRevenueCard.svelte 구현

**주요 기능**:
- 월간/기간 라디오 선택
- 연도/월 드롭다운
- 현재월만 [수동 설정] 버튼 활성화
- MonthlyRegistrations 데이터 표시

**스크립트**:
```svelte
<script>
  let viewMode = 'single'; // 'single' | 'range'
  let selectedYear = 2025;
  let selectedMonth = 10;

  let monthlyData = null;
  let isCurrentMonth = false;

  // 현재월 확인
  $: {
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const selectedMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    isCurrentMonth = (selectedMonthKey === currentMonthKey);
  }

  async function loadData() {
    const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const res = await fetch(`/api/admin/revenue/monthly?monthKey=${monthKey}`);
    monthlyData = await res.json();
  }

  function getPaymentPeriod(year, month) {
    const startMonth = month + 1 > 12 ? 1 : month + 1;
    const startYear = month + 1 > 12 ? year + 1 : year;
    const endMonth = startMonth + 2 > 12 ? startMonth + 2 - 12 : startMonth + 2;
    const endYear = startMonth + 2 > 12 ? startYear + 1 : startYear;
    return `${startMonth}~${endMonth}월`;
  }
</script>

<div class="bg-white shadow rounded-lg">
  <div class="px-4 py-3 border-b">
    <h3>📈 매출 통계</h3>

    <!-- 월간/기간 선택 -->
    <div class="flex items-center gap-3">
      <label>
        <input type="radio" bind:group={viewMode} value="single" />
        <span>월간</span>
      </label>
      <label>
        <input type="radio" bind:group={viewMode} value="range" />
        <span>기간</span>
      </label>

      {#if viewMode === 'single'}
        <input type="number" bind:value={selectedYear} class="w-20 border rounded px-2 py-1" />
        <span>년</span>
        <select bind:value={selectedMonth} class="border rounded px-2 py-1">
          {#each Array(12) as _, i}
            <option value={i + 1}>{i + 1}월</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  <div class="p-4">
    {#if monthlyData}
      <div class="space-y-4">
        <!-- 매출 정보 -->
        <div>
          <p>자동 매출: {monthlyData.totalRevenue.toLocaleString()}원 (등록자 {monthlyData.registrationCount}명)</p>
          <p>수동 매출: {monthlyData.adjustedRevenue ? monthlyData.adjustedRevenue.toLocaleString() + '원' : '설정 안 됨'}</p>
          <p>적용 매출: {monthlyData.effectiveRevenue.toLocaleString()}원</p>

          {#if isCurrentMonth}
            <button class="px-3 py-1 bg-blue-600 text-white rounded">수동 설정</button>
          {:else}
            <span class="text-gray-400 text-xs">현재월만 설정 가능</span>
          {/if}
        </div>

        <!-- 등록/승급 현황 -->
        <div>
          <h4 class="font-semibold">등록/승급 현황:</h4>
          <ul>
            <li>신규 등록: {monthlyData.paymentTargets?.registrants?.length || 0}명</li>
            <li>승급: {monthlyData.paymentTargets?.promoted?.length || 0}명</li>
            <li>추가지급 대상: {monthlyData.paymentTargets?.additionalPayments?.length || 0}명</li>
          </ul>
        </div>

        <!-- 등급별 대상자 테이블 -->
        <table class="w-full border">
          <thead>
            <tr class="bg-gray-100">
              <th class="border p-2">등급</th>
              <th class="border p-2">인원</th>
              <th class="border p-2">1회 금액</th>
              <th class="border p-2">10회 총액</th>
              <th class="border p-2">지급 기간</th>
            </tr>
          </thead>
          <tbody>
            {#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
              {@const count = monthlyData.gradeDistribution?.[grade] || 0}
              {@const perAmount = monthlyData.gradePayments?.[grade] || 0}
              {#if count > 0}
                <tr>
                  <td class="border p-2 text-center">{grade}</td>
                  <td class="border p-2 text-center">{count}명</td>
                  <td class="border p-2 text-right">{perAmount.toLocaleString()}원</td>
                  <td class="border p-2 text-right">{(perAmount * 10).toLocaleString()}원</td>
                  <td class="border p-2 text-center">{getPaymentPeriod(selectedYear, selectedMonth)}</td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>

        <p class="text-sm text-gray-600">💡 매출은 다음 달부터 10주간 지급됩니다</p>
      </div>
    {:else}
      <p class="text-gray-500">데이터를 불러오는 중...</p>
    {/if}
  </div>
</div>
```

### 3-4. PaymentStatisticsCard.svelte 구현

**주요 기능**:
- 월간/주간 토글
- 월간: 월별 등급별 인원 테이블
- 주간: 주차별 등급별 인원 테이블

**스크립트**:
```svelte
<script>
  let paymentViewMode = 'monthly'; // 'monthly' | 'weekly'
  let startYear = 2025;
  let startMonth = 8;
  let endYear = 2025;
  let endMonth = 11;

  let statisticsData = null;

  async function loadData() {
    const start = `${startYear}-${String(startMonth).padStart(2, '0')}`;
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}`;

    const endpoint = paymentViewMode === 'monthly'
      ? `/api/admin/payment/statistics/monthly?start=${start}&end=${end}`
      : `/api/admin/payment/statistics/weekly?start=${start}&end=${end}`;

    const res = await fetch(endpoint);
    statisticsData = await res.json();
  }

  function getTotalForGrade(grade) {
    if (!statisticsData?.monthlyData) return 0;
    const max = Math.max(...statisticsData.monthlyData.map(m => m.byGrade[grade] || 0));
    return max;
  }
</script>

<div class="bg-white shadow rounded-lg">
  <div class="px-4 py-3 border-b">
    <h3>📊 등급별 지급 통계</h3>

    <div class="flex items-center gap-3">
      <span>조회:</span>
      <label>
        <input type="radio" bind:group={paymentViewMode} value="monthly" />
        <span>월간</span>
      </label>
      <label>
        <input type="radio" bind:group={paymentViewMode} value="weekly" />
        <span>주간</span>
      </label>

      <!-- 기간 선택 -->
      <input type="number" bind:value={startYear} class="w-20 border rounded px-2 py-1" />
      <span>년</span>
      <select bind:value={startMonth} class="border rounded px-2 py-1">
        {#each Array(12) as _, i}
          <option value={i + 1}>{i + 1}월</option>
        {/each}
      </select>
      <span>~</span>
      <input type="number" bind:value={endYear} class="w-20 border rounded px-2 py-1" />
      <span>년</span>
      <select bind:value={endMonth} class="border rounded px-2 py-1">
        {#each Array(12) as _, i}
          <option value={i + 1}>{i + 1}월</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="p-4">
    {#if paymentViewMode === 'monthly' && statisticsData?.monthlyData}
      <!-- 월간 테이블 -->
      <table class="w-full border">
        <thead>
          <tr class="bg-gray-100">
            <th class="border p-2">등급</th>
            {#each statisticsData.monthlyData as month}
              <th class="border p-2">{month.monthKey}</th>
            {/each}
            <th class="border p-2">합계</th>
          </tr>
        </thead>
        <tbody>
          {#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
            <tr>
              <td class="border p-2 text-center font-semibold">{grade}</td>
              {#each statisticsData.monthlyData as month}
                <td class="border p-2 text-center">{month.byGrade[grade] || 0}명</td>
              {/each}
              <td class="border p-2 text-center font-semibold">{getTotalForGrade(grade)}명</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <p class="text-sm text-gray-600 mt-2">* 합계는 중복 카운트 (병행 지급)</p>

    {:else if paymentViewMode === 'weekly' && statisticsData?.weeklyData}
      <!-- 주간 테이블 -->
      <div class="overflow-x-auto">
        <table class="w-full border">
          <thead>
            <tr class="bg-gray-100">
              <th class="border p-2 sticky left-0 bg-gray-100">등급</th>
              {#each statisticsData.weeklyData as week}
                <th class="border p-2">{week.weekNumber}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
              <tr>
                <td class="border p-2 text-center font-semibold sticky left-0 bg-white">{grade}</td>
                {#each statisticsData.weeklyData as week}
                  <td class="border p-2 text-center">{week.byGrade[grade]?.userCount || 0}명</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="text-sm text-gray-600 mt-2">💡 병행 지급: 여러 매출월이 동시에 지급됩니다</p>

    {:else}
      <p class="text-gray-500">데이터를 불러오는 중...</p>
    {/if}
  </div>
</div>
```

---

## ✅ 4단계: 테스트 계획

### 4-1. DB 초기화 및 데이터 입력

```bash
# DB 초기화
DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db \
bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force

# 서버 실행
pnpm dev:web --host
```

**테스트 데이터**:
1. 7월: 사장님, 김영수, 이미영 등록 (3명)
2. 8월: 박철수, 최영희, 정민수 등록 (3명)
3. 9월: 강민지 등록 (1명)

### 4-2. 검증 항목

#### 매출 통계
- [ ] 7월 매출: 3,000,000원 (3명) 표시
- [ ] 8월 매출: 3,000,000원 (3명) 표시
- [ ] 9월 매출: 1,000,000원 (1명) 표시
- [ ] 10월(현재월): [수동 설정] 버튼 활성화 ✅
- [ ] 9월(과거월): [수동 설정] 버튼 비활성화 ❌

#### 지급 통계 - 월간
- [ ] 8월: 0명 (아직 지급 시작 전)
- [ ] 9월: 3명 (7월분 지급 시작)
- [ ] 10월: 6명 (7월분 + 8월분 병행)
- [ ] 11월: 7명 (7월분 + 8월분 + 9월분 병행)

#### 지급 통계 - 주간
- [ ] 9월 1주차: F1 2명, F2 1명 (7월분)
- [ ] 10월 1주차: F1 5명, F2 2명 (7월분 + 8월분)
- [ ] 병행 지급 안내 메시지 표시

#### WeeklyPaymentSummary 검증
```bash
mongosh mongodb://localhost:27017/nanumpay --quiet --eval "
db.weeklypaymentsummaries.find().sort({ weekNumber: 1 }).forEach(w => {
  print('주차:', w.weekNumber, '인원:', w.totalUserCount);
  print('등급별:', JSON.stringify(w.byGrade));
});
"
```

---

## 📝 5단계: 문서화

### 5-1. CLAUDE.md 업데이트

**추가 섹션**:
```markdown
## 🎨 UI 구조 (v7.1)

### 관리자 대시보드
- **매출 통계**: 등록 시점 기준 매출 정보
- **지급 통계**: 실제 지급 시점 기준 통계 (월간/주간)

### 주간 집계 로직
- step5_updateSummary.js: 전체 active 계획 기준 재계산
- WeeklyPaymentSummary: 주차별 등급별 인원 저장
- 병행 지급: 여러 매출월이 동시에 지급됨
```

### 5-2. 코드 주석 추가

**step5_updateSummary.js**:
```javascript
/**
 * Step 5: 주별/월별 총계 업데이트 (v7.1)
 *
 * ⭐ 중요: 전체 활성 계획을 기준으로 주차별 재계산!
 * - 이번에 생성된 계획만이 아님
 * - planStatus = 'active' 또는 'completed'인 모든 계획
 * - 이유: 병행 지급으로 인해 여러 매출월이 동시에 지급됨
 *
 * 예시:
 * - 7월 등록 → 8~10월 지급
 * - 8월 등록 → 9~11월 지급
 * - 9월 1주차 = 7월분 + 8월분 병행!
 */
```

---

## 🚀 작업 순서 요약

### Phase 1: 백엔드 (1-2시간)
1. ✅ `step5_updateSummary.js` 수정
   - 전체 active 계획 조회
   - 주차별 등급별 인원 집계
   - WeeklyPaymentSummary 저장
2. ✅ 새 API 엔드포인트 추가 (선택)
   - `/api/admin/payment/statistics/monthly`
   - `/api/admin/payment/statistics/weekly`

### Phase 2: 프론트엔드 (2-3시간)
1. ✅ `MonthlyRevenueCard.svelte` 생성
   - 매출 통계 섹션
   - 월간/기간 선택
   - 현재월만 수동 설정
2. ✅ `PaymentStatisticsCard.svelte` 생성
   - 지급 통계 섹션
   - 월간/주간 토글
   - 등급별 인원 테이블
3. ✅ `admin/+page.svelte` 수정
   - 2개 컴포넌트 배치

### Phase 3: 테스트 (30분-1시간)
1. ✅ DB 초기화 및 데이터 입력
2. ✅ 매출 통계 검증
3. ✅ 지급 통계 검증 (월간/주간)
4. ✅ WeeklyPaymentSummary DB 검증

### Phase 4: 정리 (30분)
1. ✅ CLAUDE.md 업데이트
2. ✅ 코드 주석 추가
3. ✅ 기존 GradePaymentCard.svelte 제거 또는 보관

---

## 📌 주의사항

### 반드시 지켜야 할 것
1. **전체 active 계획 집계**: step5에서 이번 생성분만 조회하지 말 것!
2. **현재월만 수동 설정**: 과거 월은 수정 불가
3. **등급별 인원만 표시**: 지급 통계에서는 금액 제외 (병행 지급으로 의미 없음)
4. **WeeklyPaymentSummary 덮어쓰기**: upsert로 매번 재계산

### 선택적으로 고려할 것
1. WeeklyPaymentSummary 스키마 간소화 (금액 필드 제거)
2. 새 API 엔드포인트 추가 vs 기존 API 확장
3. GradePaymentCard.svelte 제거 vs 내부 리팩토링

---

## 📂 작업 파일 목록

### 백엔드
- `apps/web/src/lib/server/services/registration/step5_updateSummary.js` ⭐ 필수
- `apps/web/src/routes/api/admin/payment/statistics/monthly/+server.js` (신규, 선택)
- `apps/web/src/routes/api/admin/payment/statistics/weekly/+server.js` (신규, 선택)
- `apps/web/src/lib/server/models/WeeklyPaymentSummary.js` (스키마 수정, 선택)

### 프론트엔드
- `apps/web/src/lib/components/admin/MonthlyRevenueCard.svelte` ⭐ 필수 (신규)
- `apps/web/src/lib/components/admin/PaymentStatisticsCard.svelte` ⭐ 필수 (신규)
- `apps/web/src/routes/(admin)/admin/+page.svelte` ⭐ 필수 (수정)
- `apps/web/src/lib/components/admin/GradePaymentCard.svelte` (제거 또는 보관)

### 문서
- `CLAUDE.md` (v7.1 내용 추가)

---

## 🎯 완료 기준

### 기능 완료
- [ ] 매출 통계 섹션이 등록 시점 정보를 명확히 표시
- [ ] 지급 통계 섹션이 실제 지급 시점 정보를 표시
- [ ] 월간 뷰에서 병행 지급 확인 가능
- [ ] 주간 뷰에서 주차별 지급 인원 확인 가능
- [ ] 현재월만 매출 수동 설정 가능

### 데이터 정합성
- [ ] 7월 3명 등록 → 9월 1주차 3명 표시
- [ ] 8월 3명 등록 → 10월 1주차 6명 표시 (7월분+8월분)
- [ ] 9월 1명 등록 → 11월 1주차 7명 표시 (7월분+8월분+9월분)
- [ ] WeeklyPaymentSummary가 전체 계획 기준으로 정확히 집계됨

---

**작성 완료**: 2025-10-15
**다음 세션**: 이 계획서대로 단계별 구현 시작
