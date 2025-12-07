/**
 * 주간 지급 처리 서비스 v7.0
 * 매주 금요일 자동 지급 처리 (순수 지급만, 추가 계획 생성 안 함)
 */

import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '../models/WeeklyPaymentSummary.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import User from '../models/User.js';
import { GRADE_LIMITS } from '../utils/constants.js';

/**
 * 매주 금요일 지급 처리 메인 함수
 * Cron: 0 0 * * 5 (매주 금요일 00:00)
 */
export async function processWeeklyPayments(date = new Date()) {
  try {
    console.log(`=== 주간 지급 처리 시작: ${date.toISOString()} ===`);

    // 오늘이 금요일인지 확인
    if (date.getDay() !== 5) {
      console.log('오늘은 금요일이 아닙니다. 처리를 건너뜁니다.');
      return { success: false, message: '금요일이 아님' };
    }

    // 날짜 정규화 (시간 제거)
    const paymentDate = new Date(date);
    paymentDate.setHours(0, 0, 0, 0);

    // 1. 오늘 지급 대상 조회
    const pendingPlans = await WeeklyPaymentPlans.find({
      'installments': {
        $elemMatch: {
          scheduledDate: {
            $gte: paymentDate,
            $lt: new Date(paymentDate.getTime() + 24 * 60 * 60 * 1000)
          },
          status: 'pending'
        }
      },
      planStatus: 'active'
    });

    console.log(`처리 대상 계획: ${pendingPlans.length}개`);

    // 2. 주차별 총계 문서 준비
    const weekNumber = WeeklyPaymentPlans.getISOWeek(paymentDate);
    let summary = await WeeklyPaymentSummary.findOne({ weekNumber });

    if (!summary) {
      summary = await WeeklyPaymentSummary.create({
        weekDate: paymentDate,
        weekNumber,
        monthKey: WeeklyPaymentSummary.generateMonthKey(paymentDate),
        status: 'processing'
      });
    } else {
      summary.status = 'processing';
      await summary.save();
    }

    // 3. 각 계획별 지급 처리
    const processedPayments = [];

    for (const plan of pendingPlans) {
      const installment = plan.getInstallmentByDate(paymentDate);
      if (!installment) continue;

      // 사용자 정보 조회
      const user = await User.findById(plan.userId);
      if (!user) {
        console.log(`사용자 ${plan.userId} 없음`);
        continue;
      }

      // 보험 조건 확인 (F4-F8만 해당, F3 이하는 보험 불필요)
      const skipPayment = await checkInsuranceCondition(user, plan.baseGrade);
      if (skipPayment) {
        // ⭐ v8.0: F4-F8 보험 미가입 시 skip + 횟수 증가 (지급한 것으로 인정)
        // 나중에 보험 가입하면 이후 회차부터 정상 지급
        installment.status = 'skipped';
        installment.skipReason = skipPayment.reason;
        plan.completedInstallments += 1;  // 회차는 증가 (지급한 것으로 인정)
        await plan.save();
        console.log(`⚠️ ${user.name}(${plan.baseGrade}) 지급 건너뜀 (보험 부족): 회차 ${plan.completedInstallments}/${plan.totalInstallments}`);
        continue;
      }

      // 지급액 계산
      const paymentAmounts = await calculatePaymentAmount(
        plan.baseGrade,
        installment.revenueMonth
      );

      if (!paymentAmounts) {
        console.log(`${user.name} 지급액 계산 실패`);
        continue;
      }

      // 매출월 스냅샷에서 확정 등급 조회
      const confirmedGrade = await getConfirmedGradeForPayment(
        plan.userId,
        installment.revenueMonth
      );

      // 할부 정보 업데이트
      installment.gradeAtPayment = confirmedGrade || plan.baseGrade;
      installment.baseAmount = paymentAmounts.baseAmount;
      installment.installmentAmount = paymentAmounts.installmentAmount;
      installment.withholdingTax = paymentAmounts.withholdingTax;
      installment.netAmount = paymentAmounts.netAmount;
      installment.status = 'paid';
      installment.paidAt = new Date();

      plan.completedInstallments += 1;

      // 계획 완료 체크
      if (plan.completedInstallments >= plan.totalInstallments) {
        plan.planStatus = 'completed';
      }

      await plan.save();

      // 통계 업데이트 (userId 전달하여 유니크 카운트)
      summary.incrementPayment(
        plan.baseGrade,
        plan.planType,
        paymentAmounts.installmentAmount,
        paymentAmounts.withholdingTax,
        paymentAmounts.netAmount,
        plan.userId  // ⭐ userId 추가
      );

      processedPayments.push({
        userId: user._id.toString(),
        userName: user.name,
        grade: plan.baseGrade,
        amount: paymentAmounts.installmentAmount,
        tax: paymentAmounts.withholdingTax,
        net: paymentAmounts.netAmount
      });
    }

    // 4. 사용자 카운트는 증분 업데이트된 상태 (incrementPayment에서 처리)
    // 필요시에만 재계산 (불일치 검증용)
    // await summary.recalculateUserCount();

    // 5. 총계 문서 저장
    summary.status = 'completed';
    summary.processedAt = new Date();
    await summary.save();

    // 6. 처리 완료
    console.log(`=== 지급 처리 완료: ${processedPayments.length}건 ===`);

    return {
      success: true,
      date: paymentDate,
      weekNumber,
      processedCount: processedPayments.length,
      totalAmount: summary.totalAmount,
      totalTax: summary.totalTax,
      totalNet: summary.totalNet,
      payments: processedPayments
    };

  } catch (error) {
    console.error('주간 지급 처리 실패:', error);
    throw error;
  }
}

/**
 * 보험 조건 확인
 * ⭐ v8.0 변경:
 * - F1-F3: 보험 불필요
 * - F4-F8: 보험 필수 (등급별 금액 다름)
 *   - F4: 7만원, F5: 7만원, F6: 9만원, F7: 9만원, F8: 11만원
 * - 보험 미가입 시: skip + 횟수 증가 (지급한 것으로 인정)
 * - 나중에 보험 가입하면 이후 회차부터 정상 지급
 * 
 * @returns {null} 보험 조건 충족 또는 보험 불필요
 * @returns {{skip: true, reason: string}} 보험 부족으로 skip 필요
 */
async function checkInsuranceCondition(user, grade) {
  // GRADE_LIMITS에서 보험 조건 확인
  const gradeLimit = GRADE_LIMITS[grade];
  
  // 보험 필수가 아니면 패스
  if (!gradeLimit?.insuranceRequired) {
    return null;
  }

  // User에서 보험 금액 조회
  const insuranceAmount = user.insuranceAmount || 0;
  const requiredAmount = gradeLimit.insuranceAmount || 0;

  if (insuranceAmount < requiredAmount) {
    return {
      skip: true,
      reason: `insufficient_insurance_amount: ${insuranceAmount} < ${requiredAmount}`
    };
  }

  return null;  // 조건 충족
}

/**
 * 지급액 계산 (100원 단위 절삭 포함)
 */
async function calculatePaymentAmount(grade, revenueMonth) {
  try {
    // 월별 등록 정보 조회
    const monthlyReg = await MonthlyRegistrations.findOne({
      monthKey: revenueMonth
    });

    if (!monthlyReg) {
      console.error(`월별 등록 정보 없음: ${revenueMonth}`);
      return null;
    }

    // 실제 사용할 매출 (관리자 조정값 우선)
    const revenue = monthlyReg.getEffectiveRevenue();

    // 등급별 지급액 계산 (누적 방식)
    const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
    const baseAmount = gradePayments[grade] || 0;

    if (baseAmount === 0) {
      console.error(`등급 ${grade}의 지급액이 0원`);
      return null;
    }

    // 10분할 및 100원 단위 절삭
    const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;

    // 세지원 계산 (3.3%)
    const withholdingTax = Math.round(installmentAmount * 0.033);
    const netAmount = installmentAmount - withholdingTax;

    return {
      baseAmount,         // 등급별 총 지급액 (절삭 전)
      installmentAmount,  // 회차당 지급액 (100원 단위 절삭)
      withholdingTax,     // 세지원액
      netAmount           // 실지급액
    };
  } catch (error) {
    console.error('지급액 계산 실패:', error);
    return null;
  }
}

/**
 * 등급별 누적 지급액 계산
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
 * 매출월의 확정 등급 조회
 * ⚠️ v7.0: MonthlyTreeSnapshots 제거로 인해 간소화
 * plan.baseGrade를 사용하도록 변경됨
 */
async function getConfirmedGradeForPayment(userId, revenueMonth) {
  // MonthlyTreeSnapshots 제거로 인해 null 반환
  // 호출부에서 plan.baseGrade를 fallback으로 사용
  return null;
}

/**
 * 특정 날짜의 지급 내역 조회
 */
export async function getWeeklyPaymentReport(date) {
  try {
    const paymentDate = new Date(date);
    paymentDate.setHours(0, 0, 0, 0);

    const weekNumber = WeeklyPaymentPlans.getISOWeek(paymentDate);

    // 주차별 총계
    const summary = await WeeklyPaymentSummary.findOne({ weekNumber });

    if (!summary) {
      return {
        success: false,
        message: '해당 주차의 지급 내역이 없습니다.'
      };
    }

    // 개별 지급 내역
    const plans = await WeeklyPaymentPlans.find({
      'installments': {
        $elemMatch: {
          weekNumber: weekNumber,
          status: 'paid'
        }
      }
    });

    const payments = [];
    for (const plan of plans) {
      const installment = plan.installments.find(
        i => i.weekNumber === weekNumber && i.status === 'paid'
      );

      if (installment) {
        const user = await User.findById(plan.userId);
        payments.push({
          userId: plan.userId,
          userName: plan.userName,
          planner: user?.planner || '',
          bank: user?.bank || '',
          accountNumber: user?.accountNumber || '',
          grade: plan.baseGrade,
          planType: plan.planType,
          installmentNumber: installment.week,
          amount: installment.installmentAmount,
          tax: installment.withholdingTax,
          net: installment.netAmount
        });
      }
    }

    return {
      success: true,
      date: paymentDate,
      weekNumber,
      summary: {
        totalAmount: summary.totalAmount,
        totalTax: summary.totalTax,
        totalNet: summary.totalNet,
        totalUserCount: summary.totalUserCount,
        totalPaymentCount: summary.totalPaymentCount,
        byGrade: summary.byGrade,
        byPlanType: summary.byPlanType
      },
      payments
    };
  } catch (error) {
    console.error('주간 지급 보고서 조회 실패:', error);
    throw error;
  }
}