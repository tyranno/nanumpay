/**
 * 매출 관리 서비스 (v7.1)
 * - 월별 매출 수동 조정
 * - 지급 계획 재생성
 * - 지급 상태 확인
 */

import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '../models/WeeklyPaymentSummary.js';

/**
 * 등급별 누적 지급액 계산 (paymentPlanService.js와 동일)
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
 * 금요일 시작 날짜 계산
 */
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  // 금요일 찾기 (월요일 + 4일)
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return friday;
}

/**
 * 주차 번호 계산 (ISO week number)
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return parseInt(`${d.getUTCFullYear()}${String(weekNo).padStart(2, '0')}`);
}

/**
 * 지급 상태 확인
 * @param {string} monthKey - 월 키 (YYYY-MM)
 * @returns {Promise<{hasPaid: boolean, paidCount: number, totalCount: number}>}
 */
export async function checkPaymentStatus(monthKey) {
  try {
    // 해당 월 귀속 지급 계획 조회
    const plans = await WeeklyPaymentPlans.find({
      revenueMonth: monthKey
    });

    const totalCount = plans.reduce((sum, plan) => sum + plan.installments.length, 0);

    // paid 상태 카운트
    let paidCount = 0;
    for (const plan of plans) {
      for (const inst of plan.installments) {
        if (inst.paymentStatus === 'paid') {
          paidCount++;
        }
      }
    }

    return {
      hasPaid: paidCount > 0,
      paidCount,
      totalCount
    };
  } catch (error) {
    console.error(`❌ [checkPaymentStatus] Error for ${monthKey}:`, error);
    throw error;
  }
}

/**
 * 지급 계획 재생성
 * @param {string} monthKey - 월 키 (YYYY-MM)
 * @param {number} newRevenue - 새 매출액
 * @param {Object} adminUser - 관리자 정보
 * @param {string} reason - 변경 사유
 * @param {boolean} force - paid 있어도 강제 실행
 * @returns {Promise<{deletedPlans: number, recreatedPlans: number, affectedUsers: number}>}
 */
export async function regeneratePaymentPlans(monthKey, newRevenue, adminUser, reason, force = false) {
  console.log(`\n🔄 [regeneratePaymentPlans] Starting for ${monthKey} with revenue ${newRevenue}`);

  try {
    // Step 1: MonthlyRegistrations 조회
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });
    if (!monthlyReg) {
      throw new Error(`MonthlyRegistrations not found for ${monthKey}`);
    }

    // Step 2: 지급 상태 확인
    const paymentStatus = await checkPaymentStatus(monthKey);
    if (paymentStatus.hasPaid && !force) {
      throw new Error(
        `이미 ${paymentStatus.paidCount}건의 지급이 완료되었습니다. ` +
        `변경하려면 force 옵션을 사용하세요.`
      );
    }

    // Step 3: 기존 지급 계획 삭제 (해당 월 귀속만)
    const plansToDelete = await WeeklyPaymentPlans.find({
      revenueMonth: monthKey
    });

    const deletedCount = plansToDelete.length;
    const affectedUserIds = [...new Set(plansToDelete.map(p => p.userId))];

    console.log(`📋 Deleting ${deletedCount} payment plans for ${affectedUserIds.length} users`);

    // 실제 삭제
    await WeeklyPaymentPlans.deleteMany({
      revenueMonth: monthKey
    });

    // Step 4: 새 매출 기준으로 금액 재계산
    const { paymentTargets, gradeDistribution } = monthlyReg;

    // 등급별 배분율 계산
    const totalTargets =
      (paymentTargets.registrants?.length || 0) +
      (paymentTargets.promoted?.length || 0) +
      (paymentTargets.additionalPayments?.length || 0);

    console.log(`👥 Total payment targets: ${totalTargets}`);
    console.log(`📊 Grade distribution:`, gradeDistribution);

    // 등급별 지급액 계산
    const gradePayments = {};
    for (const grade of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
      const count = gradeDistribution[grade] || 0;
      if (count > 0) {
        const baseAmount = calculateBasePaymentForGrade(grade);
        const totalBaseAmount = baseAmount * count;
        const percentage = totalBaseAmount / (newRevenue || 1);
        const allocatedAmount = Math.floor(newRevenue * percentage / 100) * 100; // 100원 단위
        gradePayments[grade] = Math.floor(allocatedAmount / 10 / 100) * 100; // 10회 분할, 100원 단위
      } else {
        gradePayments[grade] = 0;
      }
    }

    console.log(`💰 Grade payments (per installment):`, gradePayments);

    // Step 5: paymentTargets 기준으로 계획 재생성
    let recreatedCount = 0;
    const allTargets = [];

    // 5-1. 등록자 (기본지급)
    if (paymentTargets.registrants) {
      for (const registrant of paymentTargets.registrants) {
        allTargets.push({
          userId: registrant.userId,
          userName: registrant.userName,
          grade: registrant.grade,
          planType: 'initial',
          추가지급단계: 0,
          installmentType: 'basic',
          createdBy: 'registration'
        });
      }
    }

    // 5-2. 승급자 (기본지급)
    if (paymentTargets.promoted) {
      for (const promoted of paymentTargets.promoted) {
        allTargets.push({
          userId: promoted.userId,
          userName: promoted.userName,
          grade: promoted.newGrade,
          planType: 'promotion',
          추가지급단계: 0,
          installmentType: 'basic',
          createdBy: 'promotion'
        });
      }
    }

    // 5-3. 추가지급 대상자
    if (paymentTargets.additionalPayments) {
      for (const additional of paymentTargets.additionalPayments) {
        allTargets.push({
          userId: additional.userId,
          userName: additional.userName,
          grade: additional.grade,
          planType: 'initial', // 원래 계획 타입 유지
          추가지급단계: additional.추가지급단계,
          installmentType: 'additional',
          createdBy: 'monthly_check'
        });
      }
    }

    // 금요일 시작 날짜 계산 (다음 금요일부터)
    const today = new Date();
    let firstFriday = startOfWeek(today);
    if (firstFriday <= today) {
      firstFriday = new Date(firstFriday.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // 각 대상자별로 지급 계획 생성
    for (const target of allTargets) {
      const installmentAmount = gradePayments[target.grade];
      if (!installmentAmount || installmentAmount === 0) {
        console.warn(`⚠️ No payment amount for ${target.userName} (${target.grade})`);
        continue;
      }

      // 10회 installments 생성
      const installments = [];
      let currentDate = new Date(firstFriday);

      for (let i = 0; i < 10; i++) {
        const weekNum = getWeekNumber(currentDate);
        installments.push({
          installmentNumber: i + 1,
          paymentDate: new Date(currentDate),
          weekNumber: weekNum,
          installmentAmount,
          paymentStatus: 'pending',
          taxAmount: 0,
          netAmount: installmentAmount,
          createdAt: new Date()
        });

        // 다음 금요일
        currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      }

      // WeeklyPaymentPlans 생성
      const newPlan = new WeeklyPaymentPlans({
        userId: target.userId,
        userName: target.userName,
        planType: target.planType,
        추가지급단계: target.추가지급단계,
        installmentType: target.installmentType,
        baseGrade: target.grade,
        revenueMonth: monthKey,
        totalInstallments: 10,
        completedInstallments: 0,
        planStatus: 'active',
        installments,
        createdBy: target.createdBy,
        createdAt: new Date()
      });

      await newPlan.save();
      recreatedCount++;
    }

    console.log(`✅ Recreated ${recreatedCount} payment plans`);

    // Step 6: WeeklyPaymentSummary 재계산
    await recalculateWeeklyPaymentSummary(monthKey);

    // Step 7: MonthlyRegistrations 업데이트
    monthlyReg.adjustedRevenue = newRevenue;
    monthlyReg.isManualRevenue = true;
    monthlyReg.revenueModifiedBy = adminUser._id;
    monthlyReg.revenueModifiedAt = new Date();
    monthlyReg.revenueChangeReason = reason;

    // 변경 이력 추가
    monthlyReg.revenueChangeHistory.push({
      previousRevenue: monthlyReg.totalRevenue,
      newRevenue,
      modifiedBy: adminUser._id,
      modifiedAt: new Date(),
      reason
    });

    // gradePayments 업데이트
    monthlyReg.gradePayments = gradePayments;

    await monthlyReg.save();

    console.log(`✅ [regeneratePaymentPlans] Completed successfully`);

    return {
      deletedPlans: deletedCount,
      recreatedPlans: recreatedCount,
      affectedUsers: affectedUserIds.length,
      paidInstallments: paymentStatus.paidCount
    };
  } catch (error) {
    console.error(`❌ [regeneratePaymentPlans] Error:`, error);
    throw error;
  }
}

/**
 * WeeklyPaymentSummary 재계산 (특정 월의 모든 주차)
 * @param {string} monthKey - 월 키 (YYYY-MM)
 */
async function recalculateWeeklyPaymentSummary(monthKey) {
  console.log(`\n📊 [recalculateWeeklyPaymentSummary] Starting for ${monthKey}`);

  try {
    // 해당 월 귀속 지급 계획 조회
    const plans = await WeeklyPaymentPlans.find({
      revenueMonth: monthKey,
      planStatus: { $in: ['active', 'completed'] }
    });

    console.log(`📋 Found ${plans.length} payment plans`);

    // 주차별로 그룹화
    const weeklyData = {};

    for (const plan of plans) {
      for (const inst of plan.installments) {
        const weekNum = inst.weekNumber;

        if (!weeklyData[weekNum]) {
          weeklyData[weekNum] = {
            weekNumber: weekNum,
            weekDate: inst.paymentDate,
            monthKey: monthKey,
            status: 'pending',
            byGrade: {
              F1: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 },
              F2: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 },
              F3: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 },
              F4: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 },
              F5: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 },
              F6: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 },
              F7: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 },
              F8: { userCount: 0, totalAmount: 0, taxAmount: 0, netAmount: 0 }
            },
            totalAmount: 0,
            totalTax: 0,
            totalNet: 0
          };
        }

        const grade = plan.baseGrade;
        const gradeData = weeklyData[weekNum].byGrade[grade];

        // 해당 주차에서 이 사용자의 첫 installment인지 확인
        const isFirstInWeek = !weeklyData[weekNum][`_counted_${plan.userId}`];
        if (isFirstInWeek) {
          gradeData.userCount++;
          weeklyData[weekNum][`_counted_${plan.userId}`] = true;
        }

        gradeData.totalAmount += inst.installmentAmount;
        gradeData.taxAmount += inst.taxAmount;
        gradeData.netAmount += inst.netAmount;

        weeklyData[weekNum].totalAmount += inst.installmentAmount;
        weeklyData[weekNum].totalTax += inst.taxAmount;
        weeklyData[weekNum].totalNet += inst.netAmount;

        // 지급 상태 업데이트
        if (inst.paymentStatus === 'paid') {
          weeklyData[weekNum].status = 'completed';
        }
      }
    }

    // WeeklyPaymentSummary 업데이트 (upsert)
    for (const [weekNum, data] of Object.entries(weeklyData)) {
      // _counted_ 필드 제거
      const cleanData = { ...data };
      for (const key of Object.keys(cleanData)) {
        if (key.startsWith('_counted_')) {
          delete cleanData[key];
        }
      }

      await WeeklyPaymentSummary.findOneAndUpdate(
        { weekNumber: parseInt(weekNum) },
        cleanData,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Updated ${Object.keys(weeklyData).length} weekly summaries`);
  } catch (error) {
    console.error(`❌ [recalculateWeeklyPaymentSummary] Error:`, error);
    throw error;
  }
}

/**
 * 매출 수동 조정 (메인 함수)
 * @param {string} monthKey - 월 키 (YYYY-MM)
 * @param {number} adjustedRevenue - 새 매출액
 * @param {Object} adminUser - 관리자 정보
 * @param {string} reason - 변경 사유
 * @param {boolean} force - paid 있어도 강제 실행
 * @returns {Promise<{success: boolean, message: string, details: Object}>}
 */
export async function adjustRevenue(monthKey, adjustedRevenue, adminUser, reason, force = false) {
  console.log(`\n💰 [adjustRevenue] Starting for ${monthKey}`);
  console.log(`   New revenue: ${adjustedRevenue}`);
  console.log(`   Reason: ${reason}`);
  console.log(`   Force: ${force}`);

  try {
    // MonthlyRegistrations 조회
    const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });
    if (!monthlyReg) {
      throw new Error(`MonthlyRegistrations not found for ${monthKey}`);
    }

    const previousRevenue = monthlyReg.getEffectiveRevenue();

    // 지급 계획 재생성
    const details = await regeneratePaymentPlans(
      monthKey,
      adjustedRevenue,
      adminUser,
      reason,
      force
    );

    const message = `매출이 ${previousRevenue.toLocaleString()}원에서 ${adjustedRevenue.toLocaleString()}원으로 변경되고 ` +
      `${details.recreatedPlans}개의 지급 계획이 재생성되었습니다`;

    console.log(`✅ [adjustRevenue] ${message}`);

    return {
      success: true,
      message,
      details: {
        previousRevenue,
        newRevenue: adjustedRevenue,
        ...details
      }
    };
  } catch (error) {
    console.error(`❌ [adjustRevenue] Error:`, error);
    return {
      success: false,
      message: error.message,
      details: null
    };
  }
}
