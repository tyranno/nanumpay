/**
 * GET /api/admin/revenue/range?start=2025-07&end=2025-10&viewMode=monthly|weekly
 * 기간별 매출 및 지급 통계 API (v8.0)
 *
 * v8.0 변경사항:
 * - WeeklyPaymentSummary 제거, WeeklyPaymentPlans에서 직접 aggregation
 * - terminated 되지 않은 금액만 포함
 */

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import { checkPaymentStatus } from '$lib/server/services/revenueService.js';

/**
 * ⭐ v8.0: WeeklyPaymentPlans에서 월간 등급별 지급액 집계
 *
 * @param {string} monthKey - 지급 월 (YYYY-MM)
 * @returns {Promise<Object>} 등급별 총 지급액
 */
async function calculateMonthlyGradePayments(monthKey) {
  // 해당 월에 지급될 installments를 등급별로 집계
  const results = await WeeklyPaymentPlans.aggregate([
    { $unwind: '$installments' },
    {
      $match: {
        'installments.scheduledDate': {
          $gte: new Date(`${monthKey}-01`),
          $lt: new Date(new Date(`${monthKey}-01`).setMonth(new Date(`${monthKey}-01`).getMonth() + 1))
        },
        'installments.status': { $nin: ['skipped', 'terminated'] }  // ⭐ v8.0: canceled 제거
        // planStatus 조건 제거 - inst.status로 충분
      }
    },
    {
      $group: {
        _id: '$baseGrade',
        totalAmount: { $sum: '$installments.installmentAmount' }
      }
    }
  ]);

  // 등급별 지급액 초기화 및 결과 매핑
  const gradePayments = {
    F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
  };

  for (const r of results) {
    if (gradePayments.hasOwnProperty(r._id)) {
      gradePayments[r._id] = r.totalAmount || 0;
    }
  }

  console.log(`💡 [calculateMonthlyGradePayments] ${monthKey}: grades aggregated`);

  return { gradePayments };
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
      // 주간 조회: WeeklyPaymentPlans에서 주차별 데이터 집계
      return await getWeeklyData(start, end);
    } else {
      // 월간 조회: MonthlyRegistrations + WeeklyPaymentPlans
      return await getMonthlyData(start, end);
    }
  } catch (error) {
    console.error('❌ [GET /api/admin/revenue/range] Error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

/**
 * 월간 데이터 조회 (WeeklyPaymentPlans 기반)
 */
async function getMonthlyData(start, end) {
  // 1. 기간 내 모든 MonthlyRegistrations 조회 (매출 정보용)
  const registrations = await MonthlyRegistrations.find({
    monthKey: { $gte: start, $lte: end }
  }).sort({ monthKey: 1 }).lean();

  // 2. 기간 내 모든 monthKey 생성 (7월~10월 등)
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);

  const allMonthKeys = [];
  for (let y = startYear; y <= endYear; y++) {
    const sm = (y === startYear) ? startMonth : 1;
    const em = (y === endYear) ? endMonth : 12;
    for (let m = sm; m <= em; m++) {
      allMonthKeys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }

  console.log(`📊 [getMonthlyData] Query: ${start} ~ ${end}, generating ${allMonthKeys.length} months`);

  const monthlyData = [];

  // 3. 각 월별로 WeeklyPaymentPlans에서 집계
  for (const monthKey of allMonthKeys) {
    const reg = registrations.find(r => r.monthKey === monthKey);
    const paymentStatus = reg ? await checkPaymentStatus(monthKey) : null;

    // ⭐ v8.0: WeeklyPaymentPlans에서 해당 월 지급액 집계
    const { gradePayments } = await calculateMonthlyGradePayments(monthKey);

    monthlyData.push({
      monthKey: monthKey,

      // 매출 정보 (MonthlyRegistrations에서)
      totalRevenue: reg?.totalRevenue || 0,
      adjustedRevenue: reg?.adjustedRevenue || null,
      effectiveRevenue: reg ? (reg.adjustedRevenue !== null ? reg.adjustedRevenue : reg.totalRevenue) : 0,
      isManualRevenue: reg?.isManualRevenue || false,

      // 등록자 정보 (MonthlyRegistrations에서)
      registrationCount: reg?.registrationCount || 0,
      paymentTargetsCount: reg ? (
        (reg.paymentTargets?.registrants?.length || 0) +
        (reg.paymentTargets?.promoted?.length || 0) +
        (reg.paymentTargets?.additionalPayments?.length || 0)
      ) : 0,

      // ⭐ 등급별 분포 (MonthlyRegistrations에서 - 등록월 기준)
      gradeDistribution: reg?.gradeDistribution || {
        F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
      },

      // ⭐ 등급별 지급액 (WeeklyPaymentPlans 기반 - 지급월 기준)
      gradePayments,

      // 지급 상태
      paymentStatus,

      // 매출 변경 이력
      revenueChangeHistory: reg?.revenueChangeHistory || []
    });
  }

  const totalRevenue = monthlyData.reduce((sum, m) => sum + m.effectiveRevenue, 0);
  const totalRegistrants = monthlyData.reduce((sum, m) => sum + m.registrationCount, 0);
  const avgRevenue = allMonthKeys.length > 0 ? Math.floor(totalRevenue / allMonthKeys.length) : 0;

  const response = {
    viewMode: 'monthly',
    start,
    end,
    monthlyData,
    totalRevenue,
    totalRegistrants,
    summary: {
      totalMonths: allMonthKeys.length,
      totalRevenue,
      totalRegistrants,
      avgRevenue
    }
  };

  console.log(`✅ [GET /api/admin/revenue/range] Monthly Summary:`, response.summary);

  return json(response);
}

/**
 * ⭐ v8.0: 주간 데이터 조회 (WeeklyPaymentPlans 기반)
 */
async function getWeeklyData(start, end) {
  // 1. 기간 파싱
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);

  console.log(`📅 [getWeeklyData] Range: ${startYear}-${startMonth} ~ ${endYear}-${endMonth}`);

  // 2. 날짜 범위 생성
  const startDate = new Date(startYear, startMonth - 1, 1);
  const endDate = new Date(endYear, endMonth, 0, 23, 59, 59); // 마지막 날

  // 3. WeeklyPaymentPlans에서 주차별 집계
  const weeklyResults = await WeeklyPaymentPlans.aggregate([
    { $unwind: '$installments' },
    {
      $match: {
        'installments.scheduledDate': { $gte: startDate, $lte: endDate },
        'installments.status': { $nin: ['skipped', 'terminated'] }  // ⭐ v8.0: canceled 제거
        // planStatus 조건 제거 - inst.status로 충분
      }
    },
    {
      $group: {
        _id: {
          weekNumber: '$installments.weekNumber',
          scheduledDate: { $dateToString: { format: '%Y-%m-%d', date: '$installments.scheduledDate' } },
          baseGrade: '$baseGrade'
        },
        totalAmount: { $sum: '$installments.installmentAmount' },
        paymentCount: { $sum: 1 },
        userIds: { $addToSet: '$userId' }
      }
    },
    { $sort: { '_id.scheduledDate': 1 } }
  ]);

  // 4. 주차별로 그룹화
  const weeklyMap = new Map();

  for (const r of weeklyResults) {
    const weekKey = r._id.weekNumber || r._id.scheduledDate;
    const grade = r._id.baseGrade;

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, {
        weekNumber: r._id.weekNumber,
        weekDate: new Date(r._id.scheduledDate),
        gradeDistribution: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 },
        gradePayments: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 },
        totalAmount: 0,
        userCount: 0,
        userIds: new Set()
      });
    }

    const weekData = weeklyMap.get(weekKey);
    if (weekData.gradeDistribution.hasOwnProperty(grade)) {
      weekData.gradeDistribution[grade] += r.paymentCount;
      weekData.gradePayments[grade] += r.totalAmount;
      weekData.totalAmount += r.totalAmount;
      r.userIds.forEach(id => weekData.userIds.add(id.toString()));
    }
  }

  // 5. weeklyData 배열 생성
  const weeklyData = [];
  let totalAmount = 0;
  let totalUserCount = 0;

  for (const [weekKey, data] of weeklyMap) {
    const weekDate = data.weekDate;
    const year = weekDate.getFullYear();
    const month = weekDate.getMonth() + 1;

    // 해당 월의 주차 계산 (금요일 기준)
    const firstDay = new Date(year, month - 1, 1);
    let firstFriday = new Date(firstDay);
    const dayOfWeek = firstFriday.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    firstFriday.setDate(firstFriday.getDate() + daysUntilFriday);

    const weekOfMonth = Math.floor((weekDate.getDate() - firstFriday.getDate()) / 7) + 1;
    const userCount = data.userIds.size;

    weeklyData.push({
      year,
      month,
      week: weekOfMonth > 0 ? weekOfMonth : 1,
      weekCount: 5, // 추정값
      monthKey: `${year}-${String(month).padStart(2, '0')}`,
      weekLabel: `${year}년 ${month}월 ${weekOfMonth > 0 ? weekOfMonth : 1}주`,

      // 등급별 통계
      gradeDistribution: data.gradeDistribution,
      gradePayments: data.gradePayments,

      // 주차별 합계
      totalAmount: data.totalAmount,
      userCount,

      // 메타 정보
      weekDate: data.weekDate,
      weekNumber: data.weekNumber,
      status: 'calculated'
    });

    totalAmount += data.totalAmount;
    totalUserCount += userCount;
  }

  // 날짜순 정렬
  weeklyData.sort((a, b) => new Date(a.weekDate) - new Date(b.weekDate));

  const response = {
    viewMode: 'weekly',
    start,
    end,
    weeklyData,
    totalRevenue: totalAmount,
    totalRegistrants: totalUserCount,
    summary: {
      totalWeeks: weeklyData.length,
      totalAmount,
      totalUserCount,
      avgAmount: weeklyData.length > 0 ? Math.floor(totalAmount / weeklyData.length) : 0
    }
  };

  console.log(`✅ [GET /api/admin/revenue/range] Weekly Summary:`, response.summary);

  return json(response);
}
