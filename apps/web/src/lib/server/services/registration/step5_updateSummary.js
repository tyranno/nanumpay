/**
 * Step 5: 월별 총계 업데이트
 *
 * 역할:
 * - MonthlyRegistrations의 월별 총계 업데이트
 * 
 * ⭐ v8.0 변경: WeeklyPaymentSummary 제거
 * - WeeklyPaymentPlans에서 직접 aggregation으로 조회 가능
 * - 중복 데이터 제거 및 동기화 문제 해결
 */

import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import MonthlyRegistrations from '../../models/MonthlyRegistrations.js';

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
    return { updatedMonths: 0 };
  }

    // ========================================
  // 월별 총계 생성/업데이트
  // ========================================

  // 모든 계획 조회 (해당 월 귀속)
  const allActivePlans = await WeeklyPaymentPlans.find({
    revenueMonth: registrationMonth
    // planStatus 조건 제거 - 모든 계획 조회
  });

  console.log(`📊 [Step5] 월별 총계 계산: ${registrationMonth} (${allActivePlans.length}개 계획)`);


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
      // ⭐ v8.0: skipped, terminated 상태 제외
      if (['skipped', 'terminated'].includes(inst.status)) continue;

      if (monthlyData.byGrade[grade]) {
        // ⭐ v8.0 변경: 보험 체크는 지급 시점에서만 수행
        // 월별 총계는 계획된 금액 기준
        const installmentAmount = inst.installmentAmount || 0;

        monthlyData.byGrade[grade].totalAmount += installmentAmount;
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

    console.log(`✅ [Step5] 월별 총계: ${totalUsers}명, ${totalPayment.toLocaleString()}원 [${gradesSummary}]`);
  } else {
    console.log(`⚠️ [Step5] MonthlyRegistrations 없음: ${registrationMonth}`);
  }


  return {
    updatedMonths: monthlyReg ? 1 : 0
  };
}
