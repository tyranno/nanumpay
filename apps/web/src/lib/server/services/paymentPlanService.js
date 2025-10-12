/**
 * 지급 계획 서비스 v6.0
 * 동적 지급 계획 생성 (10회 단위)
 */

import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '../models/WeeklyPaymentSummary.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import MonthlyTreeSnapshots from '../models/MonthlyTreeSnapshots.js';

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
    console.log(`\n[지급계획생성] Initial 계획 생성 시작 - ${userName} (${userId})`);
    console.log(`  등록일: ${registrationDate.toISOString().split('T')[0]}`);
    console.log(`  등급: ${grade}`);

    // 지급 시작일 계산 (등록일+1개월 후 첫 금요일)
    const startDate = WeeklyPaymentPlans.getPaymentStartDate(registrationDate);
    console.log(`  계산된 지급 시작일: ${startDate.toISOString().split('T')[0]} (${WeeklyPaymentPlans.getISOWeek(startDate)})`);

    // 매출 귀속 월 결정
    const revenueMonth = MonthlyRegistrations.generateMonthKey(registrationDate);
    console.log(`  매출 귀속 월: ${revenueMonth}`);

    // v6.0: 초기 계획은 10회만 생성
    const totalInstallments = 10;
    console.log(`  v6.0: 초기 10회 생성 (등급별 최대: ${MAX_INSTALLMENTS[grade]}회)`);

    // 등급별 지급액 계산 (미리 계산)
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
    let baseAmount = 0;
    let installmentAmount = 0;
    let withholdingTax = 0;
    let netAmount = 0;

    if (monthlyReg) {
      const revenue = monthlyReg.getEffectiveRevenue();
      console.log(`  ${revenueMonth} 총매출: ${revenue.toLocaleString()}원`);

      const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
      baseAmount = gradePayments[grade] || 0;
      console.log(`  ${grade} 등급 기본 지급액: ${baseAmount.toLocaleString()}원`);

      if (baseAmount > 0) {
        console.log(`  10분할 계산: floor(${baseAmount} ÷ 10 ÷ 100) × 100`);
        installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
        console.log(`  회차당 지급액: ${installmentAmount.toLocaleString()}원 (100원 단위 절삭)`);

        withholdingTax = Math.round(installmentAmount * 0.033);
        console.log(`  원천징수세: ${withholdingTax.toLocaleString()}원 (3.3%)`);

        netAmount = installmentAmount - withholdingTax;
        console.log(`  실수령액: ${netAmount.toLocaleString()}원`);
      } else {
        console.log(`  ${revenueMonth} 매출 없음 - 지급액 0원`);
      }
    } else {
      console.log(`  ${revenueMonth} 등록 정보 없음 - 지급액 0원`);
    }

    // 할부 생성 (v6.0: 10회만)
    console.log(`  할부 생성 중... (총 ${totalInstallments}회)`);
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

        status: 'pending',
        installmentType: 'initial'  // v6.0: 항상 initial
      });
    }

    if (installments.length > 0) {
      console.log(`  첫 3개 할부 정보:`);
      installments.slice(0, 3).forEach((inst, idx) => {
        console.log(`    ${idx + 1}회차: ${inst.weekNumber} (${inst.scheduledDate.toISOString().split('T')[0]}) - ${inst.installmentAmount.toLocaleString()}원 (${inst.installmentType})`);
      });
    }

    // 계획 생성 (v6.0: generation, createdBy 추가)
    const plan = await WeeklyPaymentPlans.create({
      userId,
      userName,
      planType: 'initial',
      generation: 1,  // v6.0: 첫 번째 10회
      baseGrade: grade,
      revenueMonth,
      startDate,
      totalInstallments,
      completedInstallments: 0,
      installments,
      planStatus: 'active',
      createdBy: 'registration'  // v6.0: 등록에 의한 생성
    });

    console.log(`[지급계획생성] Initial 계획 생성 완료 - ID: ${plan._id}\n`);

    // 주차별 총계 업데이트 (미래 예측)
    await updateWeeklyProjections(plan, 'add');

    return plan;
  } catch (error) {
    console.error('Initial 계획 생성 실패:', error);
    throw error;
  }
}

/**
 * Promotion 지급 계획 생성 (승급 시)
 */
export async function createPromotionPaymentPlan(userId, userName, newGrade, promotionDate) {
  try {
    // 지급 시작일 계산 (승급일+1개월 후 첫 금요일)
    const startDate = WeeklyPaymentPlans.getPaymentStartDate(promotionDate);

    // 매출 귀속 월 (승급 시점 기준)
    const revenueMonth = MonthlyRegistrations.generateMonthKey(promotionDate);

    // Promotion 계획은 항상 10회 (initial 10회만)
    const totalInstallments = 10;

    // 등급별 지급액 계산 (미리 계산)
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
    let baseAmount = 0;
    let installmentAmount = 0;
    let withholdingTax = 0;
    let netAmount = 0;

    if (monthlyReg) {
      const revenue = monthlyReg.getEffectiveRevenue();
      const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
      baseAmount = gradePayments[newGrade] || 0;
      
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

        status: 'pending',
        installmentType: 'initial' // Promotion도 1~10회는 initial
      });
    }

    // 계획 생성 (v6.0: generation, createdBy 추가)
    const plan = await WeeklyPaymentPlans.create({
      userId,
      userName,
      planType: 'promotion',
      generation: 1,  // v6.0: 첫 번째 10회
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
    console.error('Promotion 계획 생성 실패:', error);
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
      console.log(`등급 ${grade}는 추가 지급 횟수가 없음`);
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

        status: 'pending',
        installmentType: 'additional'
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
    console.error('Additional 계획 생성 실패:', error);
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
      // pending 상태의 additional 할부 종료
      let hasTerminated = false;
      for (const inst of plan.installments) {
        if (inst.installmentType === 'additional' && inst.status === 'pending') {
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
    console.error('Additional 계획 종료 실패:', error);
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
      console.error(`월별 등록 정보 없음: ${plan.revenueMonth}`);
      return;
    }

    // 등급별 지급액 계산
    const revenue = monthlyReg.getEffectiveRevenue();
    const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
    const baseAmount = gradePayments[plan.baseGrade] || 0;

    if (baseAmount === 0) {
      console.warn(`등급 ${plan.baseGrade}의 지급액이 0원 - 예측 업데이트 건너뜀`);
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
          netAmount
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
    console.error('주차별 예측 업데이트 실패:', error);
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
    console.log(`\n[추가계획생성] 10회 완료 확인 - ${completedPlan.userName} (${completedPlan.userId})`);
    console.log(`  완료 계획 ID: ${completedPlan._id}`);
    console.log(`  planType: ${completedPlan.planType}, generation: ${completedPlan.generation}`);

    // User 모델에서 최신 등급 및 보험 정보 조회
    const User = mongoose.model('User');
    const user = await User.findOne({ loginId: completedPlan.userId });

    if (!user) {
      console.log(`  사용자 없음 - 추가 생성 안 함`);
      return null;
    }

    console.log(`  현재 등급: ${user.grade}, 계획 기준 등급: ${completedPlan.baseGrade}`);
    console.log(`  보험 상태: ${user.insuranceActive}`);

    // 1. 최대 횟수 확인
    const totalCompleted = await calculateTotalCompletedInstallments(completedPlan.userId, completedPlan.planType);
    const maxInstallments = MAX_INSTALLMENTS[user.grade];

    console.log(`  총 완료 횟수: ${totalCompleted}, 최대 횟수: ${maxInstallments}`);

    if (totalCompleted >= maxInstallments) {
      console.log(`  최대 횟수 도달 - 추가 생성 안 함`);
      return null;
    }

    // 2. 등급 확인 (하락하면 추가 생성 안 함)
    if (user.grade < completedPlan.baseGrade) {
      console.log(`  등급 하락 - 추가 생성 안 함`);
      return null;
    }

    // 3. 보험 확인 (F3 이상은 보험 필수)
    if (user.grade >= 'F3' && !user.insuranceActive) {
      console.log(`  보험 미가입 (F3+) - 추가 생성 안 함`);
      return null;
    }

    // 4. 완료 매출월 계산 (10회차의 실제 지급일 또는 예정일)
    const lastInstallment = completedPlan.installments[9]; // 10회차 (0-based)
    const completionDate = lastInstallment.paidAt || lastInstallment.scheduledDate;
    const revenueMonth = MonthlyRegistrations.generateMonthKey(completionDate);

    console.log(`  완료일: ${completionDate.toISOString().split('T')[0]}`);
    console.log(`  완료 매출월: ${revenueMonth}`);

    // 5. 매출 조회 및 금액 계산
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
    if (!monthlyReg) {
      console.log(`  매출 정보 없음 - 추가 생성 안 함`);
      return null;
    }

    const revenue = monthlyReg.getEffectiveRevenue();
    const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
    const baseAmount = gradePayments[user.grade];

    if (!baseAmount || baseAmount === 0) {
      console.log(`  지급액 0원 - 추가 생성 안 함`);
      return null;
    }

    const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
    const withholdingTax = Math.round(installmentAmount * 0.033);
    const netAmount = installmentAmount - withholdingTax;

    console.log(`  ${revenueMonth} 총매출: ${revenue.toLocaleString()}원`);
    console.log(`  ${user.grade} 등급 기본 지급액: ${baseAmount.toLocaleString()}원`);
    console.log(`  회차당 지급액: ${installmentAmount.toLocaleString()}원`);

    // 6. 추가 10회 계획 생성
    const nextGeneration = completedPlan.generation + 1;
    const startDate = WeeklyPaymentPlans.getNextFriday(completionDate);
    startDate.setDate(startDate.getDate() + 7); // 완료일 다음주 금요일

    console.log(`  다음 generation: ${nextGeneration}`);
    console.log(`  시작일: ${startDate.toISOString().split('T')[0]}`);

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
        insuranceSkipped: false,
        installmentType: 'initial' // v6.0: 매 10회는 항상 initial
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

    console.log(`[추가계획생성] 생성 완료 - ID: ${newPlan._id}, Generation: ${nextGeneration}\n`);

    // 8. 주차별 총계 업데이트
    await updateWeeklyProjections(newPlan, 'add');

    return newPlan;
  } catch (error) {
    console.error('[추가계획생성] 실패:', error);
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