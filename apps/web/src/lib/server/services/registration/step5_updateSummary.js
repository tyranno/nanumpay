/**
 * Step 5: 주별/월별 총계 업데이트
 *
 * 역할:
 * 1. 모든 생성된 계획의 installments를 주차별로 집계
 * 2. WeeklyPaymentSummary 생성/업데이트 (주별 총계)
 * 3. MonthlyRegistrations의 월별 총계 업데이트
 */

import WeeklyPaymentSummary from '../../models/WeeklyPaymentSummary.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import MonthlyRegistrations from '../../models/MonthlyRegistrations.js';
import { getWeekNumber } from '../../utils/dateUtils.js';

/**
 * Step 5 실행
 *
 * @param {Object} plans - Step 4 결과 (registrantPlans, promotionPlans, additionalPlans)
 * @param {string} registrationMonth - 귀속월 (YYYY-MM)
 * @returns {Promise<Object>}
 */
export async function executeStep5(plans, registrationMonth) {

  const { registrantPlans, promotionPlans, additionalPlans } = plans;
  const allPlanIds = [
    ...registrantPlans.map(p => p.plan),
    ...promotionPlans.map(p => p.plan),
    ...additionalPlans.map(p => p.plan)
  ];


  if (allPlanIds.length === 0) {
    return { updatedWeeks: 0, updatedMonths: 0 };
  }

  // 모든 계획 조회
  const allPlans = await WeeklyPaymentPlans.find({
    _id: { $in: allPlanIds }
  });


  // ========================================
  // 5-1. 주별 총계 생성/업데이트
  // ⭐ 귀속월 다음달 첫 금요일부터 10주간 조사
  // ========================================

  // 귀속월 다음달 첫 금요일 계산
  const [year, month] = registrationMonth.split('-').map(Number);
  const nextMonthStart = new Date(year, month, 1);  // 다음 달 1일

  // 첫 금요일 찾기 (UTC 기준)
  let firstFriday = new Date(nextMonthStart);
  const dayOfWeek = firstFriday.getUTCDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  firstFriday.setUTCDate(firstFriday.getUTCDate() + daysUntilFriday);

  // 10주간의 금요일 날짜 리스트 생성 (UTC 기준)
  const fridayDates = [];
  for (let i = 0; i < 10; i++) {
    const friday = new Date(firstFriday);
    friday.setUTCDate(friday.getUTCDate() + (i * 7));
    fridayDates.push(friday);
  }

  console.log(`\n📅 [Step5] 주간 통계 갱신: ${fridayDates[0].toISOString().split('T')[0]} ~ ${fridayDates[9].toISOString().split('T')[0]}`);

  // 각 금요일에 대해 WeeklyPaymentSummary 갱신
  let updatedWeeks = 0;

  for (const friday of fridayDates) {
    const weekNumber = getWeekNumber(friday);
    const monthKey = WeeklyPaymentSummary.generateMonthKey(friday);

    // 해당 주차에 지급될 모든 계획 조회 (상태 무관, terminated 제외)
    // ⭐ UTC 기준으로 날짜 범위 설정 (타임존 문제 방지)
    const fridayStart = new Date(friday);
    fridayStart.setUTCHours(0, 0, 0, 0);
    const fridayEnd = new Date(friday);
    fridayEnd.setUTCHours(23, 59, 59, 999);

    const plansForWeek = await WeeklyPaymentPlans.find({
      'installments': {
        $elemMatch: {
          scheduledDate: {
            $gte: fridayStart,
            $lt: fridayEnd
          }
        }
      },
      planStatus: { $ne: 'terminated' }  // ⭐ terminated 제외
    });

    // 등급별 집계
    const byGrade = {
      F1: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 },
      F2: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 },
      F3: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 },
      F4: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 },
      F5: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 },
      F6: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 },
      F7: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 },
      F8: { userIds: new Set(), totalAmount: 0, totalTax: 0, totalNet: 0, paymentCount: 0 }
    };

    for (const plan of plansForWeek) {
      const grade = plan.baseGrade;

      // 해당 금요일의 installment 찾기 (UTC 날짜 비교)
      const inst = plan.installments.find(i => {
        const instDate = new Date(i.scheduledDate);
        return (
          instDate.getUTCFullYear() === friday.getUTCFullYear() &&
          instDate.getUTCMonth() === friday.getUTCMonth() &&
          instDate.getUTCDate() === friday.getUTCDate()
        );
      });

      if (inst && inst.status !== 'canceled') {  // ⭐ canceled 제외
        byGrade[grade].userIds.add(plan.userId);
        byGrade[grade].totalAmount += inst.installmentAmount || 0;
        byGrade[grade].totalTax += inst.withholdingTax || Math.round((inst.installmentAmount || 0) * 0.033);
        byGrade[grade].totalNet += inst.netAmount || (inst.installmentAmount || 0) - Math.round((inst.installmentAmount || 0) * 0.033);
        byGrade[grade].paymentCount += 1;
      }
    }

    // 전체 총계 계산
    let totalAmount = 0;
    let totalTax = 0;
    let totalNet = 0;
    let totalUserCount = 0;
    let totalPaymentCount = 0;

    const byGradeFormatted = {};
    for (const [grade, data] of Object.entries(byGrade)) {
      byGradeFormatted[grade] = {
        amount: data.totalAmount,
        tax: data.totalTax,
        net: data.totalNet,
        userCount: data.userIds.size,
        paymentCount: data.paymentCount
      };

      totalAmount += data.totalAmount;
      totalTax += data.totalTax;
      totalNet += data.totalNet;
      totalUserCount += data.userIds.size;
      totalPaymentCount += data.paymentCount;
    }

    // WeeklyPaymentSummary 생성/갱신 (ISO 주차 형식)
    const isoWeekNumber = weekNumber.toString().replace(/^(\d{4})(\d{2})$/, '$1-W$2');

    await WeeklyPaymentSummary.findOneAndUpdate(
      { weekNumber: isoWeekNumber },
      {
        weekNumber: isoWeekNumber,
        weekDate: friday,
        monthKey: monthKey,
        totalAmount,
        totalTax,
        totalNet,
        totalUserCount,
        totalPaymentCount,
        byGrade: byGradeFormatted,
        status: 'scheduled'
      },
      { upsert: true, new: true }
    );

    // 주차별 결과 로그 (금액이 있는 경우만)
    if (totalAmount > 0) {
      const gradesSummary = Object.entries(byGradeFormatted)
        .filter(([_, data]) => data.amount > 0)
        .map(([grade, data]) => `${grade}:${data.userCount}명/${data.amount.toLocaleString()}원`)
        .join(', ');

      console.log(`  ${friday.toISOString().split('T')[0]} (${isoWeekNumber}): ${totalUserCount}명, ${totalAmount.toLocaleString()}원 [${gradesSummary}]`);
    }

    updatedWeeks++;
  }

  console.log(`✅ [Step5-1] 주간 통계: ${updatedWeeks}주 갱신 완료\n`);


  // ========================================
  // 5-2. 월별 총계 생성/업데이트
  // ========================================

  // 모든 활성 계획 조회 (해당 월 귀속)
  const allActivePlans = await WeeklyPaymentPlans.find({
    revenueMonth: registrationMonth,
    planStatus: { $in: ['active', 'completed'] }
  });

  console.log(`📊 [Step5-2] 월별 총계 계산: ${registrationMonth} (${allActivePlans.length}개 계획)`);


  // 월별 총계 계산
  const monthlyData = {
    byGrade: {
      F1: { userIds: new Set(), totalAmount: 0 },
      F2: { userIds: new Set(), totalAmount: 0 },
      F3: { userIds: new Set(), totalAmount: 0 },
      F4: { userIds: new Set(), totalAmount: 0 },
      F5: { userIds: new Set(), totalAmount: 0 },
      F6: { userIds: new Set(), totalAmount: 0 },
      F7: { userIds: new Set(), totalAmount: 0 },
      F8: { userIds: new Set(), totalAmount: 0 }
    }
  };

  for (const plan of allActivePlans) {
    const grade = plan.baseGrade;

    for (const inst of plan.installments) {
      if (inst.status === 'cancelled') continue;

      if (monthlyData.byGrade[grade]) {
        monthlyData.byGrade[grade].totalAmount += inst.installmentAmount || 0;
        monthlyData.byGrade[grade].userIds.add(plan.userId);
      }
    }
  }

  // MonthlyRegistrations 업데이트
  const monthlyReg = await MonthlyRegistrations.findOne({
    monthKey: registrationMonth
  });

  if (monthlyReg) {
    // 월별 총계 저장
    const monthlyTotals = {};
    let totalPayment = 0;
    let totalUsers = 0;

    for (const [grade, gradeData] of Object.entries(monthlyData.byGrade)) {
      const userCount = gradeData.userIds.size;
      const totalAmount = gradeData.totalAmount;

      monthlyTotals[grade] = {
        userCount,
        totalAmount
      };

      totalPayment += totalAmount;
      totalUsers += userCount;
    }

    monthlyReg.monthlyTotals = monthlyTotals;
    monthlyReg.totalPayment = totalPayment;

    await monthlyReg.save();

    // 월별 총계 결과 로그
    const gradesSummary = Object.entries(monthlyTotals)
      .filter(([_, data]) => data.totalAmount > 0)
      .map(([grade, data]) => `${grade}:${data.userCount}명/${data.totalAmount.toLocaleString()}원`)
      .join(', ');

    console.log(`✅ [Step5-2] 월별 총계: ${totalUsers}명, ${totalPayment.toLocaleString()}원 [${gradesSummary}]`);
  } else {
    console.log(`⚠️ [Step5-2] MonthlyRegistrations 없음: ${registrationMonth}`);
  }


  return {
    updatedWeeks,
    updatedMonths: monthlyReg ? 1 : 0
  };
}
