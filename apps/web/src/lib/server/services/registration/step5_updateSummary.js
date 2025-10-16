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
  console.log('\n[Step 5] 주별/월별 총계 업데이트');
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
    return { updatedWeeks: 0, updatedMonths: 0 };
  }

  // 모든 계획 조회
  const allPlans = await WeeklyPaymentPlans.find({
    _id: { $in: allPlanIds }
  });

  console.log(`  조회된 계획: ${allPlans.length}건\n`);

  // ========================================
  // 5-1. 주별 총계 생성/업데이트
  // ========================================
  console.log('  [5-1. 주별 총계 (WeeklyPaymentSummary)]');

  const weeklyData = {};

  for (const plan of allPlans) {
    const grade = plan.baseGrade;

    for (const inst of plan.installments) {
      if (inst.status !== 'pending') continue;

      const weekNumber = inst.weekNumber || getWeekNumber(inst.scheduledDate);
      const weekDate = inst.scheduledDate;
      const revenueMonth = inst.revenueMonth || plan.revenueMonth;

      if (!weeklyData[weekNumber]) {
        weeklyData[weekNumber] = {
          weekNumber,
          weekDate,
          monthKey: revenueMonth,
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
      }

      // 등급별 집계 (userId 중복 제거)
      if (weeklyData[weekNumber].byGrade[grade]) {
        weeklyData[weekNumber].byGrade[grade].totalAmount += inst.installmentAmount || 0;
        weeklyData[weekNumber].byGrade[grade].userIds.add(plan.userId);
      }
    }
  }

  // WeeklyPaymentSummary 업데이트
  let updatedWeeks = 0;

  for (const [weekNumber, data] of Object.entries(weeklyData)) {
    // ISO 주차 포맷으로 변환 (예: "202530" -> "2025-W30")
    const isoWeekNumber = weekNumber.toString().replace(/^(\d{4})(\d{2})$/, '$1-W$2');

    // 등급별 userCount 계산 (Set 크기) 및 스키마에 맞게 구성
    const byGrade = {};
    let totalAmount = 0;
    let totalTax = 0;
    let totalNet = 0;
    let totalUserCount = 0;
    let totalPaymentCount = 0;

    for (const [grade, gradeData] of Object.entries(data.byGrade)) {
      const userCount = gradeData.userIds.size;
      const amount = gradeData.totalAmount;
      const tax = Math.round(amount * 0.033);
      const net = amount - tax;
      const paymentCount = userCount; // 1인당 1건

      byGrade[grade] = {
        amount,
        tax,
        net,
        userCount,
        paymentCount
      };

      totalAmount += amount;
      totalTax += tax;
      totalNet += net;
      totalUserCount += userCount;
      totalPaymentCount += paymentCount;
    }

    // WeeklyPaymentSummary 생성/업데이트 (스키마에 맞게)
    await WeeklyPaymentSummary.findOneAndUpdate(
      { weekNumber: isoWeekNumber },
      {
        weekNumber: isoWeekNumber,  // ⭐ String 타입, ISO 형식
        weekDate: data.weekDate,
        monthKey: data.monthKey,
        totalAmount,
        totalTax,
        totalNet,
        totalUserCount,
        totalPaymentCount,
        byGrade,
        status: 'scheduled'  // ⭐ enum 값 수정
      },
      { upsert: true, new: true }
    );

    console.log(`    ✓ 주차 ${isoWeekNumber}: ${totalAmount.toLocaleString()}원 (${totalUserCount}명)`);
    updatedWeeks++;
  }

  console.log(`\n    총 ${updatedWeeks}개 주차 업데이트 완료`);

  // ========================================
  // 5-2. 월별 총계 생성/업데이트
  // ========================================
  console.log('\n  [5-2. 월별 총계 (MonthlyRegistrations)]');

  // 모든 활성 계획 조회 (해당 월 귀속)
  const allActivePlans = await WeeklyPaymentPlans.find({
    revenueMonth: registrationMonth,
    planStatus: { $in: ['active', 'completed'] }
  });

  console.log(`    ${registrationMonth} 귀속 계획: ${allActivePlans.length}건`);

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

    console.log(`    ✓ ${registrationMonth} 월별 총계: ${totalPayment.toLocaleString()}원 (${totalUsers}명)`);
  } else {
    console.log(`    ⚠️ ${registrationMonth} MonthlyRegistrations 없음`);
  }

  console.log('='.repeat(80));

  return {
    updatedWeeks,
    updatedMonths: monthlyReg ? 1 : 0
  };
}
