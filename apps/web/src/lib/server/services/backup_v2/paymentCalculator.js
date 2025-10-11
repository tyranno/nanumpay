import User from '../models/User.js';
import UserPaymentPlan from '../models/UserPaymentPlan.js';
import TreeSnapshot from '../models/TreeSnapshot.js';
import { excelLogger as logger } from '../logger.js';

/**
 * 지급 계획 계산 서비스
 * 요구사항: 각 금요일마다 등급 기준일의 등급으로 금액 재계산
 */
export class PaymentCalculator {
  static GRADE_RATIOS = {
    F1: 0.24,
    F2: 0.19,
    F3: 0.14,
    F4: 0.09,
    F5: 0.05,
    F6: 0.03,
    F7: 0.02,
    F8: 0.01
  };

  /**
   * 특정 날짜의 사용자 등급 조회 (스냅샷 우선)
   * @param {String} userId - 사용자 loginId
   * @param {Date} referenceDate - 기준일
   * @returns {String} 등급
   */
  static async getUserGradeAtDate(userId, referenceDate) {
    // 스냅샷에서 조회
    const grade = await TreeSnapshot.getUserGradeAtDate(userId, referenceDate);

    if (grade) {
      return grade;
    }

    // 스냅샷이 없으면 현재 등급 반환 (fallback)
    logger.warn('스냅샷 없음 - 현재 등급 사용', { userId, referenceDate });
    const user = await User.findOne({ loginId: userId });
    return user ? user.grade || 'F1' : 'F1';
  }

  /**
   * 특정 날짜의 등급 분포 조회 (스냅샷 우선)
   * @param {Date} referenceDate - 기준일
   * @returns {Object} 등급별 인원수
   */
  static async getGradeDistributionAtDate(referenceDate) {
    // 스냅샷에서 조회
    const distribution = await TreeSnapshot.getGradeDistributionAtDate(referenceDate);

    // 값이 있으면 반환
    const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);
    if (total > 0) {
      return distribution;
    }

    // 스냅샷이 없으면 현재 분포 반환 (fallback)
    logger.warn('스냅샷 없음 - 현재 분포 사용', { referenceDate });

    const gradeDistribution = await User.aggregate([
      {
        $match: {
          status: 'active',
          type: { $ne: 'admin' },
          createdAt: { $lte: new Date(referenceDate) }
        }
      },
      { $group: { _id: '$grade', count: { $sum: 1 } } }
    ]);

    const gradeCount = {
      F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
    };

    gradeDistribution.forEach(item => {
      if (item._id) gradeCount[item._id] = item.count;
    });

    return gradeCount;
  }

  /**
   * 등급별 지급액 계산 (누적 방식)
   * @param {Number} totalRevenue - 총매출
   * @param {Object} gradeCount - 등급별 인원수
   * @returns {Object} 등급별 지급액
   */
  static calculateGradePayments(totalRevenue, gradeCount) {
    const payments = {};
    let previousPayment = 0;

    // F1 계산
    if (gradeCount.F1 + gradeCount.F2 > 0) {
      const f1Base = (totalRevenue * this.GRADE_RATIOS.F1) / (gradeCount.F1 + gradeCount.F2);
      payments.F1 = Math.floor(f1Base / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F1;
    } else {
      payments.F1 = 0;
    }

    // F2 계산 (F1 금액 누적)
    if (gradeCount.F2 + gradeCount.F3 > 0) {
      const f2Base = (totalRevenue * this.GRADE_RATIOS.F2) / (gradeCount.F2 + gradeCount.F3);
      const f2Total = f2Base + previousPayment;
      payments.F2 = Math.floor(f2Total / 100) * 100;
      previousPayment = payments.F2;
    } else {
      payments.F2 = previousPayment;
    }

    // F3 계산 (F2 금액 누적)
    if (gradeCount.F3 + gradeCount.F4 > 0) {
      const f3Base = (totalRevenue * this.GRADE_RATIOS.F3) / (gradeCount.F3 + gradeCount.F4);
      const f3Total = f3Base + previousPayment;
      payments.F3 = Math.floor(f3Total / 100) * 100;
      previousPayment = payments.F3;
    } else {
      payments.F3 = previousPayment;
    }

    // F4 계산 (F3 금액 누적)
    if (gradeCount.F4 + gradeCount.F5 > 0) {
      const f4Base = (totalRevenue * this.GRADE_RATIOS.F4) / (gradeCount.F4 + gradeCount.F5);
      const f4Total = f4Base + previousPayment;
      payments.F4 = Math.floor(f4Total / 100) * 100;
      previousPayment = payments.F4;
    } else {
      payments.F4 = previousPayment;
    }

    // F5 계산 (F4 금액 누적)
    if (gradeCount.F5 + gradeCount.F6 > 0) {
      const f5Base = (totalRevenue * this.GRADE_RATIOS.F5) / (gradeCount.F5 + gradeCount.F6);
      const f5Total = f5Base + previousPayment;
      payments.F5 = Math.floor(f5Total / 100) * 100;
      previousPayment = payments.F5;
    } else {
      payments.F5 = previousPayment;
    }

    // F6 계산 (F5 금액 누적)
    if (gradeCount.F6 + gradeCount.F7 > 0) {
      const f6Base = (totalRevenue * this.GRADE_RATIOS.F6) / (gradeCount.F6 + gradeCount.F7);
      const f6Total = f6Base + previousPayment;
      payments.F6 = Math.floor(f6Total / 100) * 100;
      previousPayment = payments.F6;
    } else {
      payments.F6 = previousPayment;
    }

    // F7 계산 (F6 금액 누적)
    if (gradeCount.F7 + gradeCount.F8 > 0) {
      const f7Base = (totalRevenue * this.GRADE_RATIOS.F7) / (gradeCount.F7 + gradeCount.F8);
      const f7Total = f7Base + previousPayment;
      payments.F7 = Math.floor(f7Total / 100) * 100;
      previousPayment = payments.F7;
    } else {
      payments.F7 = previousPayment;
    }

    // F8 계산 (F7 금액 누적)
    if (gradeCount.F8 > 0) {
      const f8Base = (totalRevenue * this.GRADE_RATIOS.F8) / gradeCount.F8;
      const f8Total = f8Base + previousPayment;
      payments.F8 = Math.floor(f8Total / 100) * 100;
    } else {
      payments.F8 = previousPayment;
    }

    return payments;
  }

  /**
   * 특정 회차의 지급액 계산 (등급 기준일 기준)
   * @param {Object} plan - UserPaymentPlan 문서
   * @param {Number} installmentNumber - 회차 번호 (1-10)
   * @returns {Object} 계산 결과
   */
  static async calculateInstallmentAmount(plan, installmentNumber) {
    const installment = plan.installments.find(i => i.installmentNumber === installmentNumber);
    if (!installment) {
      throw new Error(`회차 ${installmentNumber}를 찾을 수 없습니다.`);
    }

    // 1. 등급 기준일의 사용자 등급 조회
    const userGrade = await this.getUserGradeAtDate(plan.userId, installment.gradeReferenceDate);

    // 2. 등급 기준일의 전체 등급 분포 조회
    const gradeDistribution = await this.getGradeDistributionAtDate(installment.gradeReferenceDate);

    // 3. 해당 시점의 등급별 지급액 계산
    // 회차별 매출 = 총매출 / 10
    const revenuePerInstallment = plan.totalRevenue / 10;
    const gradePayments = this.calculateGradePayments(revenuePerInstallment, gradeDistribution);

    // 4. 사용자 등급에 해당하는 금액
    const calculatedAmount = gradePayments[userGrade] || 0;

    logger.info(`회차별 지급액 계산:`, {
      planId: plan._id,
      installmentNumber,
      userId: plan.userId,
      userName: plan.userName,
      gradeReferenceDate: installment.gradeReferenceDate,
      userGrade,
      gradeDistribution,
      gradePayments,
      calculatedAmount
    });

    return {
      gradeAtPayment: userGrade,
      calculatedAmount,
      gradeDistribution,
      gradePayments
    };
  }

  /**
   * 지급 계획의 모든 회차 재계산
   * @param {String} planId - UserPaymentPlan ID
   * @returns {Object} 업데이트 결과
   */
  static async recalculatePlan(planId) {
    const plan = await UserPaymentPlan.findById(planId);
    if (!plan) {
      throw new Error('지급 계획을 찾을 수 없습니다.');
    }

    logger.info(`지급 계획 재계산 시작:`, {
      planId: plan._id,
      userId: plan.userId,
      userName: plan.userName,
      revenueMonth: plan.revenueMonth
    });

    const updatedInstallments = [];
    let totalDifference = 0;

    for (const installment of plan.installments) {
      const originalAmount = installment.amount || 0;

      // 각 회차별로 등급 기준일 기준으로 재계산
      const calculation = await this.calculateInstallmentAmount(plan, installment.installmentNumber);

      // installment 업데이트
      installment.gradeAtPayment = calculation.gradeAtPayment;
      installment.calculatedAmount = calculation.calculatedAmount;

      // fixedAmount가 없으면 calculatedAmount 사용
      if (!installment.fixedAmount) {
        installment.amount = calculation.calculatedAmount;
      }

      const difference = installment.amount - originalAmount;
      totalDifference += difference;

      updatedInstallments.push({
        installmentNumber: installment.installmentNumber,
        originalAmount,
        newAmount: installment.amount,
        difference,
        grade: calculation.gradeAtPayment
      });

      logger.info(`회차 ${installment.installmentNumber} 재계산:`, {
        originalAmount,
        newAmount: installment.amount,
        difference,
        grade: calculation.gradeAtPayment
      });
    }

    // 변경사항 저장
    await plan.save();

    logger.info(`지급 계획 재계산 완료:`, {
      planId: plan._id,
      totalDifference,
      updatedInstallments
    });

    return {
      planId: plan._id,
      userId: plan.userId,
      userName: plan.userName,
      totalDifference,
      updatedInstallments
    };
  }

  /**
   * 모든 지급 계획 재계산 (특정 월)
   * @param {Number} year - 매출 년도
   * @param {Number} month - 매출 월
   * @returns {Array} 업데이트 결과
   */
  static async recalculateAllPlansForMonth(year, month) {
    const plans = await UserPaymentPlan.find({
      'revenueMonth.year': year,
      'revenueMonth.month': month
    });

    logger.info(`${year}년 ${month}월 지급 계획 재계산 시작: ${plans.length}건`);

    const results = [];
    for (const plan of plans) {
      try {
        const result = await this.recalculatePlan(plan._id);
        results.push(result);
      } catch (error) {
        logger.error(`지급 계획 재계산 실패:`, {
          planId: plan._id,
          error: error.message
        });
        results.push({
          planId: plan._id,
          error: error.message
        });
      }
    }

    logger.info(`${year}년 ${month}월 지급 계획 재계산 완료:`, {
      total: plans.length,
      success: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length
    });

    return results;
  }

  /**
   * 모든 지급 계획 재계산
   * @returns {Array} 업데이트 결과
   */
  static async recalculateAllPlans() {
    const plans = await UserPaymentPlan.find({});

    logger.info(`전체 지급 계획 재계산 시작: ${plans.length}건`);

    const results = [];
    for (const plan of plans) {
      try {
        const result = await this.recalculatePlan(plan._id);
        results.push(result);
      } catch (error) {
        logger.error(`지급 계획 재계산 실패:`, {
          planId: plan._id,
          error: error.message
        });
        results.push({
          planId: plan._id,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => !r.error).length;
    const failedCount = results.filter(r => r.error).length;

    logger.info(`전체 지급 계획 재계산 완료:`, {
      total: plans.length,
      success: successCount,
      failed: failedCount
    });

    return {
      total: plans.length,
      success: successCount,
      failed: failedCount,
      results
    };
  }
}

export default PaymentCalculator;