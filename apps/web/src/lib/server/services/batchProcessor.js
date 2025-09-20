import { db } from '../db.js';
import User from '../models/User.js';
import MonthlyRevenue from '../models/MonthlyRevenue.js';
import UserPaymentPlan from '../models/UserPaymentPlan.js';
import WeeklyPayment from '../models/WeeklyPayment.js';
import { recalculateAllGrades } from './gradeCalculation.js';
import { excelLogger as logger } from '../logger.js';

/**
 * 용역자 등록 시 자동 처리 시스템
 * - 등급 계산
 * - 매출 계산
 * - 지급 스케줄 생성
 * - 개인별 지급 계획 생성
 */
export class BatchProcessor {
  constructor() {
    this.processingQueue = [];
    this.isProcessing = false;
  }

  /**
   * 용역자 등록 후 처리 (개별 또는 엑셀 일괄)
   * @param {Array} userIds - 등록된 사용자 ID 배열
   * @param {Object} options - 처리 옵션
   */
  async processNewUsers(userIds, options = {}) {
    const startTime = Date.now();
    logger.info(`=== 용역자 등록 자동 처리 시작 ===`, {
      userCount: userIds.length,
      timestamp: new Date().toISOString()
    });

    try {
      // 1. 등급 재계산
      logger.info('1단계: 전체 등급 재계산');
      await this.recalculateGrades();

      // 2. 이번달 매출 계산
      logger.info('2단계: 매출 계산');
      const revenueResult = await this.calculateMonthlyRevenue();

      // 3. 지급 스케줄 생성
      logger.info('3단계: 지급 스케줄 생성');
      const scheduleResult = await this.createPaymentSchedules(revenueResult);

      // 4. 개인별 지급 계획 생성
      logger.info('4단계: 개인별 지급 계획 생성');
      const planResult = await this.createUserPaymentPlans(revenueResult);

      const processingTime = Date.now() - startTime;
      logger.info(`=== 자동 처리 완료 (${processingTime}ms) ===`, {
        revenue: revenueResult,
        schedules: scheduleResult,
        plans: planResult
      });

      return {
        success: true,
        processingTime,
        results: {
          revenue: revenueResult,
          schedules: scheduleResult,
          plans: planResult
        }
      };
    } catch (error) {
      logger.error('자동 처리 실패:', error);
      throw error;
    }
  }

  /**
   * 1단계: 등급 재계산
   */
  async recalculateGrades() {
    await recalculateAllGrades();
    logger.info('등급 재계산 완료');
  }

  /**
   * 2단계: 매출 계산
   */
  async calculateMonthlyRevenue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 이번달 신규 가입자 수 조회
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0, 23, 59, 59);

    const newUsersCount = await User.countDocuments({
      createdAt: { $gte: firstDay, $lte: lastDay }
    });

    // 총매출 계산 (1인당 1천만원)
    const totalRevenue = newUsersCount * 10000000;
    const revenuePerInstallment = totalRevenue / 10;

    // 등급별 인원 분포
    const gradeDistribution = await User.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$grade', count: { $sum: 1 } } }
    ]);

    const gradeCount = {
      F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
    };

    gradeDistribution.forEach(item => {
      if (item._id) gradeCount[item._id] = item.count;
    });

    // 등급별 지급액 계산 (누적식)
    const gradePayments = this.calculateGradePayments(totalRevenue, gradeCount);

    // MonthlyRevenue 저장 또는 업데이트
    const monthlyRevenue = await MonthlyRevenue.findOneAndUpdate(
      { year, month },
      {
        year,
        month,
        totalRevenue,
        newUsersCount,
        revenuePerInstallment,
        gradeDistribution: gradeCount,
        gradePayments,
        isCalculated: true,
        calculatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    logger.info(`${year}년 ${month}월 매출 계산 완료:`, {
      newUsers: newUsersCount,
      totalRevenue: totalRevenue.toLocaleString(),
      installment: revenuePerInstallment.toLocaleString()
    });

    return monthlyRevenue;
  }

  /**
   * 등급별 지급액 계산 (누적 방식)
   */
  calculateGradePayments(totalRevenue, gradeCount) {
    const gradeRatios = {
      F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
      F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
    };

    const payments = {};
    let previousPayment = 0;

    // F1 계산
    if (gradeCount.F1 > 0 && gradeCount.F1 + gradeCount.F2 > 0) {
      const f1Base = (totalRevenue * gradeRatios.F1) / (gradeCount.F1 + gradeCount.F2);
      payments.F1 = f1Base;
      previousPayment = f1Base;
    } else {
      payments.F1 = 0;
    }

    // F2 계산 (F1 금액 누적)
    if (gradeCount.F2 > 0 && gradeCount.F2 + gradeCount.F3 > 0) {
      const f2Base = (totalRevenue * gradeRatios.F2) / (gradeCount.F2 + gradeCount.F3);
      payments.F2 = f2Base + previousPayment;
      previousPayment = payments.F2;
    } else {
      payments.F2 = 0;
    }

    // F3 계산 (F2 금액 누적)
    if (gradeCount.F3 > 0 && gradeCount.F3 + gradeCount.F4 > 0) {
      const f3Base = (totalRevenue * gradeRatios.F3) / (gradeCount.F3 + gradeCount.F4);
      payments.F3 = f3Base + previousPayment;
      previousPayment = payments.F3;
    } else {
      payments.F3 = 0;
    }

    // F4 계산 (F3 금액 누적)
    if (gradeCount.F4 > 0 && gradeCount.F4 + gradeCount.F5 > 0) {
      const f4Base = (totalRevenue * gradeRatios.F4) / (gradeCount.F4 + gradeCount.F5);
      payments.F4 = f4Base + previousPayment;
      previousPayment = payments.F4;
    } else {
      payments.F4 = 0;
    }

    // F5 계산 (F4 금액 누적)
    if (gradeCount.F5 > 0 && gradeCount.F5 + gradeCount.F6 > 0) {
      const f5Base = (totalRevenue * gradeRatios.F5) / (gradeCount.F5 + gradeCount.F6);
      payments.F5 = f5Base + previousPayment;
      previousPayment = payments.F5;
    } else {
      payments.F5 = 0;
    }

    // F6 계산 (F5 금액 누적)
    if (gradeCount.F6 > 0 && gradeCount.F6 + gradeCount.F7 > 0) {
      const f6Base = (totalRevenue * gradeRatios.F6) / (gradeCount.F6 + gradeCount.F7);
      payments.F6 = f6Base + previousPayment;
      previousPayment = payments.F6;
    } else {
      payments.F6 = 0;
    }

    // F7 계산 (F6 금액 누적)
    if (gradeCount.F7 > 0 && gradeCount.F7 + gradeCount.F8 > 0) {
      const f7Base = (totalRevenue * gradeRatios.F7) / (gradeCount.F7 + gradeCount.F8);
      payments.F7 = f7Base + previousPayment;
      previousPayment = payments.F7;
    } else {
      payments.F7 = 0;
    }

    // F8 계산 (F7 금액 누적)
    if (gradeCount.F8 > 0) {
      const f8Base = (totalRevenue * gradeRatios.F8) / gradeCount.F8;
      payments.F8 = f8Base + previousPayment;
    } else {
      payments.F8 = 0;
    }

    return payments;
  }

  /**
   * 3단계: 지급 스케줄 생성 (스킵 - UserPaymentPlan에서 처리)
   */
  async createPaymentSchedules(monthlyRevenue) {
    // UserPaymentPlan에서 개인별로 관리하므로 여기서는 스킵
    logger.info('지급 스케줄은 UserPaymentPlan에서 관리');
    return [];
  }

  /**
   * 4단계: 개인별 지급 계획 생성
   */
  async createUserPaymentPlans(monthlyRevenue) {
    const { year, month, gradePayments } = monthlyRevenue;

    // 현재 활성 사용자 조회
    const users = await User.find({ status: 'active' }).select('_id loginId name grade');
    const plans = [];

    for (const user of users) {
      const grade = user.grade || 'F1';
      const totalPayment = gradePayments[grade] || 0;
      const installmentAmount = totalPayment / 10;

      // 기존 계획이 있는지 확인
      const existingPlan = await UserPaymentPlan.findOne({
        userId: user._id,
        sourceYear: year,
        sourceMonth: month
      });

      if (!existingPlan && installmentAmount > 0) {
        const plan = new UserPaymentPlan({
          userId: user._id,
          userLoginId: user.loginId,
          userName: user.name,
          sourceYear: year,
          sourceMonth: month,
          grade,
          totalAmount: totalPayment,
          installmentAmount,
          installments: this.generateInstallments(year, month, installmentAmount),
          status: 'active'
        });

        await plan.save();
        plans.push(plan);
      }
    }

    logger.info(`개인별 지급 계획 생성 완료: ${plans.length}명`);
    return plans;
  }

  /**
   * 10회 분할 스케줄 생성
   */
  generateInstallments(sourceYear, sourceMonth, amount) {
    const installments = [];
    let targetYear = sourceYear;
    let targetMonth = sourceMonth + 1;
    let targetWeek = 1;

    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear++;
    }

    for (let i = 1; i <= 10; i++) {
      installments.push({
        installment: i,
        year: targetYear,
        month: targetMonth,
        week: targetWeek,
        amount,
        tax: amount * 0.033,
        netAmount: amount * 0.967,
        status: 'pending',
        paymentDate: null
      });

      targetWeek++;
      if (targetWeek > 4) {
        targetWeek = 1;
        targetMonth++;
        if (targetMonth > 12) {
          targetMonth = 1;
          targetYear++;
        }
      }
    }

    return installments;
  }
}

// 싱글톤 인스턴스
export const batchProcessor = new BatchProcessor();