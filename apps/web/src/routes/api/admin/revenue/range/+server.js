/**
 * GET /api/admin/revenue/range?start=2025-07&end=2025-10&viewMode=monthly|weekly
 * 기간별 매출 및 지급 통계 API (v7.3)
 *
 * v7.3 변경사항:
 * - 월간 모드: WeeklyPaymentPlans에서 installmentAmount 기반 지급액 계산
 * - terminated 되지 않은 금액만 포함
 */

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
import { checkPaymentStatus } from '$lib/server/services/revenueService.js';
import { getAllWeeksInPeriod } from '$lib/utils/fridayWeekCalculator.js';

/**
 * WeeklyPaymentSummary에서 월간 등급별 지급액 합산
 *
 * @param {string} monthKey - 매출 귀속 월 (YYYY-MM)
 * @returns {Promise<Object>} 등급별 총 지급액 및 인원수
 */
async function calculateMonthlyGradePaymentsFromSummary(monthKey) {
  // 해당 월의 모든 주간 통계 조회
  const weeklySummaries = await WeeklyPaymentSummary.find({
    monthKey: monthKey
  }).sort({ weekNumber: 1 }).lean();

  console.log(`💡 [calculateMonthlyGradePayments] ${monthKey}: ${weeklySummaries.length} weeks found`);

  // 등급별 합산
  const gradeStats = {
    F1: { totalAmount: 0, userCount: 0 },
    F2: { totalAmount: 0, userCount: 0 },
    F3: { totalAmount: 0, userCount: 0 },
    F4: { totalAmount: 0, userCount: 0 },
    F5: { totalAmount: 0, userCount: 0 },
    F6: { totalAmount: 0, userCount: 0 },
    F7: { totalAmount: 0, userCount: 0 },
    F8: { totalAmount: 0, userCount: 0 }
  };

  // 각 주간 통계의 등급별 금액을 합산
  for (const summary of weeklySummaries) {
    if (!summary.byGrade) continue;

    for (const grade of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
      const gradeData = summary.byGrade[grade];
      if (gradeData) {
        gradeStats[grade].totalAmount += gradeData.amount || 0;
        // userCount는 최대값 사용 (중복 방지)
        gradeStats[grade].userCount = Math.max(
          gradeStats[grade].userCount,
          gradeData.userCount || 0
        );
      }
    }
  }

  // 등급별 평균 1회 지급액 계산
  const gradePayments = {};
  const gradeDistribution = {};

  for (const grade of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
    const stats = gradeStats[grade];
    const weekCount = weeklySummaries.length;

    // 월간 평균 1회 지급액 = 총액 ÷ 주수
    gradePayments[grade] = weekCount > 0
      ? Math.floor(stats.totalAmount / weekCount)
      : 0;

    gradeDistribution[grade] = stats.userCount;
  }

  return { gradePayments, gradeDistribution };
}

export async function GET({ url, locals }) {
  try {
    // 권한 체크
    if (!locals.user || locals.user.type !== 'admin') {
      return json({ message: '권한이 없습니다.' }, { status: 401 });
    }

    await db();

    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const viewMode = url.searchParams.get('viewMode') || 'monthly'; // 'monthly' | 'weekly'

    if (!start || !end) {
      return json({ error: 'start and end parameters are required' }, { status: 400 });
    }

    // monthKey 형식 (YYYY-MM)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(end)) {
      return json({ error: 'start and end must be in YYYY-MM format' }, { status: 400 });
    }

    console.log(`\n=== [GET /api/admin/revenue/range] Query: ${start} ~ ${end}, viewMode: ${viewMode}`);

    if (viewMode === 'weekly') {
      // 주간 조회: WeeklyPaymentSummary에서 실제 주차별 데이터 가져오기
      return await getWeeklyData(start, end);
    } else {
      // 월간 조회: MonthlyRegistrations에서 월별 데이터 가져오기 (매출 통계용)
      return await getMonthlyData(start, end);
    }
  } catch (error) {
    console.error('❌ [GET /api/admin/revenue/range] Error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

/**
 * 월간 데이터 조회 (매출 통계용)
 */
async function getMonthlyData(start, end) {
  const registrations = await MonthlyRegistrations.find({
    monthKey: {
      $gte: start,
      $lte: end
    }
  }).sort({ monthKey: 1 }).lean();

  console.log(`📊 [getMonthlyData] Found ${registrations.length} months between ${start} and ${end}`);

  const monthlyData = [];
  let totalRevenue = 0;
  let totalRegistrants = 0;

  for (const reg of registrations) {
    const paymentStatus = await checkPaymentStatus(reg.monthKey);
    const effectiveRevenue = reg.adjustedRevenue !== null ? reg.adjustedRevenue : reg.totalRevenue;

    const paymentTargetsCount =
      (reg.paymentTargets?.registrants?.length || 0) +
      (reg.paymentTargets?.promoted?.length || 0) +
      (reg.paymentTargets?.additionalPayments?.length || 0);

    // ⭐ WeeklyPaymentSummary에서 월간 통계 합산
    const { gradePayments, gradeDistribution } = await calculateMonthlyGradePaymentsFromSummary(reg.monthKey);

    // 컴포넌트가 필요로 하는 모든 필드 포함
    monthlyData.push({
      monthKey: reg.monthKey,

      // 매출 정보
      totalRevenue: reg.totalRevenue || 0,
      adjustedRevenue: reg.adjustedRevenue,
      effectiveRevenue,
      isManualRevenue: reg.isManualRevenue || false,

      // 등록자 정보
      registrationCount: reg.registrationCount || 0,
      paymentTargetsCount,

      // ⭐ 등급별 통계 (WeeklyPaymentSummary 기반)
      gradeDistribution,

      // ⭐ 등급별 평균 1회 지급액 (WeeklyPaymentSummary 기반)
      gradePayments,

      // 지급 상태
      paymentStatus,

      // 매출 변경 이력
      revenueChangeHistory: reg.revenueChangeHistory || []
    });

    totalRevenue += effectiveRevenue;
    totalRegistrants += reg.registrationCount || 0;
  }

  const avgRevenue = registrations.length > 0 ? Math.floor(totalRevenue / registrations.length) : 0;

  const response = {
    viewMode: 'monthly',
    start,
    end,
    monthlyData,
    // 컴포넌트가 기대하는 최상위 필드 (하위 호환성)
    totalRevenue,
    totalRegistrants,
    // 상세 요약 정보
    summary: {
      totalMonths: registrations.length,
      totalRevenue,
      totalRegistrants,
      avgRevenue
    }
  };

  console.log(`✅ [GET /api/admin/revenue/range] Monthly Summary:`, response.summary);

  return json(response);
}

/**
 * 주간 데이터 조회
 */
async function getWeeklyData(start, end) {
  // 1. 기간 파싱
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);

  console.log(`📅 [getWeeklyData] Range: ${startYear}-${startMonth} ~ ${endYear}-${endMonth}`);

  // 2. monthKey 생성
  const monthKeys = [];
  for (let y = startYear; y <= endYear; y++) {
    const sm = (y === startYear) ? startMonth : 1;
    const em = (y === endYear) ? endMonth : 12;
    for (let m = sm; m <= em; m++) {
      monthKeys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }

  // 3. WeeklyPaymentSummary에서 실제 데이터 조회 (DB에 있는 것만)
  const allSummaries = await WeeklyPaymentSummary.find({
    monthKey: { $in: monthKeys }
  }).sort({ monthKey: 1, weekNumber: 1 }).lean();

  console.log(`📊 [getWeeklyData] Found ${allSummaries.length} summaries for monthKeys:`, monthKeys);

  // 4. DB에 있는 summary를 기준으로 weeklyData 생성
  const weeklyData = [];
  let totalAmount = 0;
  let totalUserCount = 0;

  // monthKey별로 그룹화하여 주차 순번 부여
  const summaryByMonth = {};
  allSummaries.forEach(s => {
    if (!summaryByMonth[s.monthKey]) {
      summaryByMonth[s.monthKey] = [];
    }
    summaryByMonth[s.monthKey].push(s);
  });

  // 각 monthKey별로 주차 처리
  for (const monthKey of monthKeys) {
    const monthSummaries = summaryByMonth[monthKey] || [];

    monthSummaries.forEach((summary, index) => {
      const [year, month] = monthKey.split('-').map(Number);
      const weekNumber = index + 1;  // 1부터 시작하는 주차 번호

      // 해당 주차의 등급별 통계 (반드시 모든 등급 포함)
      const gradeDistribution = {
        F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
      };
      const gradePayments = {
        F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
      };
      let weekTotalAmount = 0;
      let weekUserCount = 0;

      if (summary && summary.byGrade) {
        Object.entries(summary.byGrade).forEach(([grade, data]) => {
          const userCount = data.userCount || 0;
          const totalAmount = data.amount || 0;  // ⭐ 스키마에 맞게 수정
          const amountPerUser = userCount > 0 ? Math.floor(totalAmount / userCount) : 0;

          gradeDistribution[grade] = userCount;
          gradePayments[grade] = amountPerUser;  // 1인당 평균 지급액
          weekTotalAmount += totalAmount;
          weekUserCount += userCount;
        });
      }

      // 컴포넌트가 필요로 하는 형식으로 데이터 구성
      weeklyData.push({
        year: year,
        month: month,
        week: weekNumber,
        weekCount: monthSummaries.length,  // 해당 월의 총 주차 수
        monthKey: monthKey,
        weekLabel: `${year}년 ${month}월 ${weekNumber}주`,

        // 등급별 통계
        gradeDistribution,
        gradePayments,

        // 주차별 합계
        totalAmount: weekTotalAmount,
        userCount: weekUserCount,

        // 메타 정보
        weekDate: summary?.weekDate || null,
        weekNumber: summary?.weekNumber || null,
        status: summary?.status || 'pending'
      });

      totalAmount += weekTotalAmount;
      totalUserCount += weekUserCount;
    });
  }

  const response = {
    viewMode: 'weekly',
    start,
    end,
    weeklyData,
    // 컴포넌트가 기대하는 최상위 필드 (하위 호환성)
    totalRevenue: totalAmount,  // 주간은 totalAmount를 totalRevenue로 매핑
    totalRegistrants: totalUserCount,
    // 상세 요약 정보
    summary: {
      totalWeeks: weeklyData.length,  // DB에 실제 있는 주차 수
      totalAmount,
      totalUserCount,
      avgAmount: weeklyData.length > 0 ? Math.floor(totalAmount / weeklyData.length) : 0
    }
  };

  console.log(`✅ [GET /api/admin/revenue/range] Weekly Summary:`, response.summary);

  return json(response);
}
