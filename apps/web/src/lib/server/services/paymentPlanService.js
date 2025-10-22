/**
 * 지급 계획 서비스 v7.0
 * 매월 기준 동적 지급 계획 생성 (10회 단위)
 */

import mongoose from 'mongoose';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '../models/WeeklyPaymentSummary.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';

// 등급별 최대 수령 횟수 정의
const MAX_INSTALLMENTS = {
  F1: 20, F2: 30, F3: 40, F4: 40,
  F5: 50, F6: 50, F7: 60, F8: 60
};

/**
 * Initial 지급 계획 생성 (등록 시)
 */
export async function createInitialPaymentPlan(userId, userName, grade, registrationDate) {
  try {

    // 지급 시작일 계산 (등록일+1개월 후 첫 금요일)
    const startDate = WeeklyPaymentPlans.getPaymentStartDate(registrationDate);

    // 매출 귀속 월 결정
    const revenueMonth = MonthlyRegistrations.generateMonthKey(registrationDate);

    // v6.0: 초기 계획은 10회만 생성
    const totalInstallments = 10;

    // 등급별 지급액 계산 (미리 계산)
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
    let baseAmount = 0;
    let installmentAmount = 0;
    let withholdingTax = 0;
    let netAmount = 0;

    if (monthlyReg) {
      // 조정된 금액이 있으면 사용, 없으면 계산
      if (monthlyReg.adjustedGradePayments?.[grade]?.totalAmount) {
        baseAmount = monthlyReg.adjustedGradePayments[grade].totalAmount;
        console.log(`[createInitialPaymentPlan] ${userName} - 조정된 금액 사용: ${grade} = ${baseAmount}원`);
      } else {
        const revenue = monthlyReg.getEffectiveRevenue();
        const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
        baseAmount = gradePayments[grade] || 0;
        console.log(`[createInitialPaymentPlan] ${userName} - 계산된 금액 사용: ${grade} = ${baseAmount}원`);
      }

      if (baseAmount > 0) {
        installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;

        withholdingTax = Math.round(installmentAmount * 0.033);

        netAmount = installmentAmount - withholdingTax;
      } else {
      }
    } else {
    }

    // 할부 생성 (v6.0: 10회만)
    const installments = [];
    for (let i = 1; i <= totalInstallments; i++) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + (i - 1) * 7); // 매주 금요일

      installments.push({
        week: i,
        weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
        scheduledDate,
        revenueMonth,
        gradeAtPayment: null,  // 지급 시점에 확정

        baseAmount,
        installmentAmount,
        withholdingTax,
        netAmount,

        status: 'pending'
      });
    }

    if (installments.length > 0) {
      installments.slice(0, 3).forEach((inst, idx) => {
      });
    }

    // 계획 생성 (v7.0: 추가지급단계 추가)
    const plan = await WeeklyPaymentPlans.create({
      userId,
      userName,
      planType: 'initial',
      generation: 1,  // v6.0: 첫 번째 10회
      추가지급단계: 0,  // v7.0: 기본 지급
      installmentType: 'basic',  // v7.0: 기본 10회
      baseGrade: grade,
      revenueMonth,
      startDate,
      totalInstallments,
      completedInstallments: 0,
      installments,
      planStatus: 'active',
      createdBy: 'registration'  // v6.0: 등록에 의한 생성
    });


    // 주차별 총계 업데이트 (미래 예측)
    await updateWeeklyProjections(plan, 'add');

    return plan;
  } catch (error) {
    throw error;
  }
}

/**
 * Promotion 지급 계획 생성 (승급 시)
 */
export async function createPromotionPaymentPlan(userId, userName, newGrade, promotionDate, monthlyRegData = null) {
  try {
    // 지급 시작일 계산 (승급일+1개월 후 첫 금요일)
    const startDate = WeeklyPaymentPlans.getPaymentStartDate(promotionDate);

    // 매출 귀속 월 (승급 시점 기준)
    const revenueMonth = MonthlyRegistrations.generateMonthKey(promotionDate);

    // Promotion 계획은 항상 10회 (initial 10회만)
    const totalInstallments = 10;

    // 등급별 지급액 계산
    // ⭐ 중요: monthlyRegData가 전달되면 사용, 없으면 DB 조회
    let monthlyReg = monthlyRegData;
    if (!monthlyReg) {
      monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
    }
    
    let baseAmount = 0;
    let installmentAmount = 0;
    let withholdingTax = 0;
    let netAmount = 0;

    if (monthlyReg) {
      // 조정된 금액이 있으면 사용, 없으면 계산
      if (monthlyReg.adjustedGradePayments?.[newGrade]?.totalAmount) {
        baseAmount = monthlyReg.adjustedGradePayments[newGrade].totalAmount;
        console.log(`[createPromotionPaymentPlan] ${userName} - 조정된 금액 사용: ${newGrade} = ${baseAmount}원`);
      } else {
        const revenue = monthlyReg.getEffectiveRevenue();
        const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
        baseAmount = gradePayments[newGrade] || 0;
        console.log(`[createPromotionPaymentPlan] ${userName} - 계산된 금액 사용: ${newGrade} = ${baseAmount}원`);
      }

      if (baseAmount > 0) {
        installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
        withholdingTax = Math.round(installmentAmount * 0.033);
        netAmount = installmentAmount - withholdingTax;
      }
    }

    // 할부 생성
    const installments = [];
    for (let i = 1; i <= totalInstallments; i++) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + (i - 1) * 7);

      installments.push({
        week: i,
        weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
        scheduledDate,
        revenueMonth,
        gradeAtPayment: null,

        baseAmount,
        installmentAmount,
        withholdingTax,
        netAmount,

        status: 'pending'
      });
    }

    // ⭐ v7.0: 추가지급 중단은 step4_createPlans.js의 terminateAdditionalPaymentPlans에서 처리
    // (승급 다음 달부터만 중단하는 로직)

    // 계획 생성 (v7.0: 추가지급단계 추가)
    const plan = await WeeklyPaymentPlans.create({
      userId,
      userName,
      planType: 'promotion',
      generation: 1,  // v6.0: 첫 번째 10회
      추가지급단계: 0,  // v7.0: 기본 지급
      installmentType: 'basic',  // v7.0: 기본 10회
      baseGrade: newGrade,
      revenueMonth,
      startDate,
      totalInstallments,
      completedInstallments: 0,
      installments,
      planStatus: 'active',
      createdBy: 'promotion'  // v6.0: 승급에 의한 생성
    });

    // 주차별 총계 업데이트
    await updateWeeklyProjections(plan, 'add');

    return plan;
  } catch (error) {
    throw error;
  }
}

/**
 * Additional 지급 계획 생성 (10회 완료 후 등급 유지 시)
 */
export async function createAdditionalPaymentPlan(userId, userName, grade, baseRevenueMonth, lastCompletedWeek) {
  try {
    // 마지막 지급일 다음 금요일부터 시작
    const startDate = new Date(lastCompletedWeek);
    startDate.setDate(startDate.getDate() + 7);

    // 추가 지급 가능 횟수 계산
    const maxCount = MAX_INSTALLMENTS[grade];
    const additionalCount = maxCount - 10; // 이미 10회 완료

    if (additionalCount <= 0) {
      return null;
    }

    // 등급별 지급액 계산 (미리 계산)
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: baseRevenueMonth });
    let baseAmount = 0;
    let installmentAmount = 0;
    let withholdingTax = 0;
    let netAmount = 0;

    if (monthlyReg) {
      const revenue = monthlyReg.getEffectiveRevenue();
      const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
      baseAmount = gradePayments[grade] || 0;
      
      if (baseAmount > 0) {
        installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
        withholdingTax = Math.round(installmentAmount * 0.033);
        netAmount = installmentAmount - withholdingTax;
      }
    }

    // 할부 생성 (11회부터)
    const installments = [];
    for (let i = 11; i <= maxCount; i++) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + (i - 11) * 7);

      installments.push({
        week: i,
        weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
        scheduledDate,
        revenueMonth: baseRevenueMonth, // 원래 매출월 기준
        gradeAtPayment: null,

        baseAmount,
        installmentAmount,
        withholdingTax,
        netAmount,

        status: 'pending'
      });
    }

    // 계획 생성
    const plan = await WeeklyPaymentPlans.create({
      userId,
      userName,
      planType: 'additional',
      baseGrade: grade,
      revenueMonth: baseRevenueMonth,
      startDate,
      totalInstallments: additionalCount,
      completedInstallments: 0,
      installments,
      planStatus: 'active'
    });

    // 주차별 총계 업데이트
    await updateWeeklyProjections(plan, 'add');

    return plan;
  } catch (error) {
    throw error;
  }
}

/**
 * Additional 계획 종료 (승급 시)
 */
export async function terminateAdditionalPlans(userId) {
  try {
    const additionalPlans = await WeeklyPaymentPlans.find({
      userId,
      planType: 'additional',
      planStatus: 'active'
    });

    for (const plan of additionalPlans) {
      // pending 상태의 할부 종료
      let hasTerminated = false;
      for (const inst of plan.installments) {
        if (inst.status === 'pending') {
          inst.status = 'terminated';
          hasTerminated = true;
        }
      }

      if (hasTerminated) {
        plan.planStatus = 'terminated';
        plan.terminatedAt = new Date();
        plan.terminationReason = 'promotion';

        await plan.save();

        // 주차별 총계에서 제거
        await updateWeeklyProjections(plan, 'remove');
      }
    }
  } catch (error) {
    throw error;
  }
}

/**
 * 주차별 총계 예측 업데이트
 */
async function updateWeeklyProjections(plan, operation) {
  try {
    // 매출 정보 조회
    const monthlyReg = await MonthlyRegistrations.findOne({
      monthKey: plan.revenueMonth
    });

    if (!monthlyReg) {
      return;
    }

    // 등급별 지급액 계산
    const revenue = monthlyReg.getEffectiveRevenue();
    const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
    const baseAmount = gradePayments[plan.baseGrade] || 0;

    if (baseAmount === 0) {
      return;
    }

    // 10분할 및 100원 단위 절삭
    const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
    const withholdingTax = Math.round(installmentAmount * 0.033);
    const netAmount = installmentAmount - withholdingTax;

    // 주차별 업데이트
    const uniqueWeeks = [...new Set(plan.installments
      .filter(inst => inst.status === 'pending')
      .map(inst => inst.weekNumber))];

    for (const weekNumber of uniqueWeeks) {
      // 주차별 총계 문서 찾기 또는 생성
      let summary = await WeeklyPaymentSummary.findOne({ weekNumber });

      if (!summary) {
        const weekInstallment = plan.installments.find(i => i.weekNumber === weekNumber);
        summary = await WeeklyPaymentSummary.create({
          weekDate: weekInstallment.scheduledDate,
          weekNumber,
          monthKey: WeeklyPaymentSummary.generateMonthKey(weekInstallment.scheduledDate),
          status: 'scheduled'
        });
      }

      // 금액 증분 또는 차감
      if (operation === 'add') {
        summary.incrementPayment(
          plan.baseGrade,
          plan.planType,
          installmentAmount,
          withholdingTax,
          netAmount,
          plan.userId  // ⭐ userId 추가
        );
      } else if (operation === 'remove') {
        // 차감 로직
        summary.totalAmount -= installmentAmount;
        summary.totalTax -= withholdingTax;
        summary.totalNet -= netAmount;
        summary.totalPaymentCount -= 1;

        if (summary.byGrade[plan.baseGrade]) {
          summary.byGrade[plan.baseGrade].amount -= installmentAmount;
          summary.byGrade[plan.baseGrade].tax -= withholdingTax;
          summary.byGrade[plan.baseGrade].net -= netAmount;
          summary.byGrade[plan.baseGrade].paymentCount -= 1;
        }

        if (summary.byPlanType[plan.planType]) {
          summary.byPlanType[plan.planType].amount -= installmentAmount;
          summary.byPlanType[plan.planType].tax -= withholdingTax;
          summary.byPlanType[plan.planType].net -= netAmount;
          summary.byPlanType[plan.planType].paymentCount -= 1;
        }
      }

      await summary.save();
    }
  } catch (error) {
  }
}

/**
 * 등급별 누적 지급액 계산 (헬퍼 함수)
 */
function calculateGradePayments(totalRevenue, gradeDistribution) {
  const rates = {
    F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
    F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
  };

  const payments = {};
  let previousAmount = 0;

  const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

  for (let i = 0; i < grades.length; i++) {
    const grade = grades[i];
    const nextGrade = grades[i + 1];

    const currentCount = gradeDistribution[grade] || 0;
    const nextCount = gradeDistribution[nextGrade] || 0;

    if (currentCount > 0) {
      const poolAmount = totalRevenue * rates[grade];
      const poolCount = currentCount + nextCount;

      if (poolCount > 0) {
        const additionalPerPerson = poolAmount / poolCount;
        payments[grade] = previousAmount + additionalPerPerson;
        previousAmount = payments[grade];
      } else {
        payments[grade] = previousAmount;
      }
    } else {
      payments[grade] = 0;
    }
  }

  return payments;
}

/**
 * 헬퍼 함수들
 */
function getNextMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const nextDate = new Date(year, month, 1);  // month는 0-based가 아님에 주의
  return MonthlyRegistrations.generateMonthKey(nextDate);
}

function getFirstFridayOfMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);  // month는 1-based

  // 첫 금요일 찾기
  const dayOfWeek = firstDay.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  firstDay.setDate(firstDay.getDate() + daysUntilFriday);

  return firstDay;
}

/**
 * v6.0: 10회 완료 후 추가 지급 계획 생성
 * 설계문서 4.1 checkAndCreateAdditionalPlan 구현
 */
export async function checkAndCreateAdditionalPlan(completedPlan) {
  try {

    // User 모델에서 최신 등급 및 보험 정보 조회
    const User = mongoose.model('User');
    const user = await User.findOne({ loginId: completedPlan.userId });

    if (!user) {
      return null;
    }


    // 1. 최대 횟수 확인
    const totalCompleted = await calculateTotalCompletedInstallments(completedPlan.userId, completedPlan.planType);
    const maxInstallments = MAX_INSTALLMENTS[user.grade];


    if (totalCompleted >= maxInstallments) {
      return null;
    }

    // 2. 등급 확인 (하락하면 추가 생성 안 함)
    if (user.grade < completedPlan.baseGrade) {
      return null;
    }

    // 3. 보험 확인 (F3 이상은 보험 필수)
    if (user.grade >= 'F3' && !user.insuranceActive) {
      return null;
    }

    // 4. 완료 매출월 계산 (10회차의 실제 지급일 또는 예정일)
    const lastInstallment = completedPlan.installments[9]; // 10회차 (0-based)
    const completionDate = lastInstallment.paidAt || lastInstallment.scheduledDate;
    const revenueMonth = MonthlyRegistrations.generateMonthKey(completionDate);


    // 5. 매출 조회 및 금액 계산
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
    if (!monthlyReg) {
      return null;
    }

    const revenue = monthlyReg.getEffectiveRevenue();
    const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
    const baseAmount = gradePayments[user.grade];

    if (!baseAmount || baseAmount === 0) {
      return null;
    }

    const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
    const withholdingTax = Math.round(installmentAmount * 0.033);
    const netAmount = installmentAmount - withholdingTax;


    // 6. 추가 10회 계획 생성
    const nextGeneration = completedPlan.generation + 1;
    const startDate = WeeklyPaymentPlans.getNextFriday(completionDate);
    startDate.setDate(startDate.getDate() + 7); // 완료일 다음주 금요일


    const installments = [];
    for (let i = 1; i <= 10; i++) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + (i - 1) * 7);

      installments.push({
        week: i,
        weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
        scheduledDate,
        revenueMonth,
        gradeAtPayment: null,
        baseAmount,
        installmentAmount,
        withholdingTax,
        netAmount,
        status: 'pending',
        insuranceSkipped: false
      });
    }

    // 7. DB 저장
    const newPlan = await WeeklyPaymentPlans.create({
      userId: completedPlan.userId,
      userName: completedPlan.userName,
      planType: completedPlan.planType, // initial 또는 promotion 유지
      generation: nextGeneration,
      baseGrade: user.grade, // 현재 등급 기준
      revenueMonth,
      startDate,
      totalInstallments: 10,
      completedInstallments: 0,
      planStatus: 'active',
      installments,
      parentPlanId: completedPlan._id,
      createdBy: 'auto_generation'
    });


    // 8. 주차별 총계 업데이트
    await updateWeeklyProjections(newPlan, 'add');

    return newPlan;
  } catch (error) {
    return null;
  }
}

/**
 * 총 완료 횟수 계산 (같은 planType 내에서)
 */
async function calculateTotalCompletedInstallments(userId, planType) {
  const plans = await WeeklyPaymentPlans.find({
    userId,
    planType,
    planStatus: { $in: ['active', 'completed'] }
  });

  return plans.reduce((sum, p) => sum + p.completedInstallments, 0);
}

/**
 * v7.0: 승급 시 추가지급 중단
 * ⭐ 핵심: installmentType='additional'만 중단! (기본지급은 끝까지 지급)
 */
export async function terminateAdditionalPlansOnPromotion(userId) {
  try {

    // ⭐ installmentType='additional'인 active 계획만 조회
    const additionalPlans = await WeeklyPaymentPlans.find({
      userId,
      installmentType: 'additional',  // 추가지급만 중단!
      planStatus: 'active'
    });


    for (const plan of additionalPlans) {

      // pending 상태의 할부들을 terminated로 변경
      let terminatedCount = 0;
      for (const inst of plan.installments) {
        if (inst.status === 'pending') {
          inst.status = 'terminated';
          terminatedCount++;
        }
      }

      if (terminatedCount > 0) {
        plan.planStatus = 'terminated';
        plan.terminatedAt = new Date();
        plan.terminationReason = 'promotion';
        plan.terminatedBy = 'promotion_additional_stop';  // v7.0 신규

        await plan.save();

        // 주차별 총계에서 제거
        await updateWeeklyProjections(plan, 'remove');
      }
    }

  } catch (error) {
    throw error;
  }
}
