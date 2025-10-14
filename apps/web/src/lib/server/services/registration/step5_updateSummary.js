/**
 * Step 5: WeeklyPaymentSummary 업데이트
 *
 * 역할:
 * 1. 모든 생성된 계획의 installments를 주차별로 집계
 * 2. WeeklyPaymentSummary 생성/업데이트
 */

import WeeklyPaymentSummary from '../../models/WeeklyPaymentSummary.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import { getWeekNumber } from '../../utils/dateUtils.js';

/**
 * Step 5 실행
 *
 * @param {Object} plans - Step 4 결과 (registrantPlans, promotionPlans, additionalPlans)
 * @returns {Promise<Object>}
 */
export async function executeStep5(plans) {
  console.log('\n[Step 5] WeeklyPaymentSummary 업데이트');
  console.log('='.repeat(80));

  const { registrantPlans, promotionPlans, additionalPlans } = plans;
  const allPlanIds = [
    ...registrantPlans.map(p => p.plan),
    ...promotionPlans.map(p => p.plan),
    ...additionalPlans.map(p => p.plan)
  ];

  console.log(`  총 계획 수: ${allPlanIds.length}건`);

  if (allPlanIds.length === 0) {
    console.log(`  업데이트할 계획 없음`);
    console.log('='.repeat(80));
    return { updatedWeeks: 0 };
  }

  // 모든 계획 조회
  const allPlans = await WeeklyPaymentPlans.find({
    _id: { $in: allPlanIds }
  });

  console.log(`  조회된 계획: ${allPlans.length}건`);

  // 주차별 집계
  const weeklyData = {};

  for (const plan of allPlans) {
    const grade = plan.baseGrade;

    for (const inst of plan.installments) {
      if (inst.status !== 'pending') continue;

      const weekNumber = getWeekNumber(inst.scheduledDate);
      const weekDate = inst.scheduledDate;

      if (!weeklyData[weekNumber]) {
        weeklyData[weekNumber] = {
          weekNumber,
          weekDate,
          monthKey: plan.revenueMonth,
          byGrade: {
            F1: { userCount: 0, totalAmount: 0 },
            F2: { userCount: 0, totalAmount: 0 },
            F3: { userCount: 0, totalAmount: 0 },
            F4: { userCount: 0, totalAmount: 0 },
            F5: { userCount: 0, totalAmount: 0 },
            F6: { userCount: 0, totalAmount: 0 },
            F7: { userCount: 0, totalAmount: 0 },
            F8: { userCount: 0, totalAmount: 0 }
          },
          userIds: new Set()
        };
      }

      // 등급별 집계
      if (weeklyData[weekNumber].byGrade[grade]) {
        weeklyData[weekNumber].byGrade[grade].totalAmount += inst.installmentAmount || 0;
        weeklyData[weekNumber].userIds.add(plan.userId);
      }
    }
  }

  // WeeklyPaymentSummary 업데이트
  let updatedCount = 0;

  for (const [weekNumber, data] of Object.entries(weeklyData)) {
    // 등급별 userCount 계산 (중복 제거 필요 - 여기서는 간소화)
    for (const [grade, gradeData] of Object.entries(data.byGrade)) {
      // TODO: 정확한 userCount 계산 (같은 grade의 사용자 중복 제거)
      gradeData.userCount = gradeData.totalAmount > 0 ? 1 : 0;
    }

    // totalAmount 계산
    const totalAmount = Object.values(data.byGrade).reduce(
      (sum, g) => sum + g.totalAmount,
      0
    );

    // 세금 계산 (3.3%)
    const totalTax = Math.floor(totalAmount * 0.033);
    const totalNet = totalAmount - totalTax;

    // WeeklyPaymentSummary 생성/업데이트
    const summary = await WeeklyPaymentSummary.findOneAndUpdate(
      { weekNumber: parseInt(weekNumber) },
      {
        weekNumber: parseInt(weekNumber),
        weekDate: data.weekDate,
        monthKey: data.monthKey,
        byGrade: data.byGrade,
        totalAmount,
        totalTax,
        totalNet,
        status: 'pending'
      },
      { upsert: true, new: true }
    );

    console.log(`  ✓ ${weekNumber}: ${totalAmount.toLocaleString()}원 (${data.userIds.size}명)`);
    updatedCount++;
  }

  console.log(`\n  총 ${updatedCount}개 주차 업데이트 완료`);
  console.log('='.repeat(80));

  return {
    updatedWeeks: updatedCount
  };
}
