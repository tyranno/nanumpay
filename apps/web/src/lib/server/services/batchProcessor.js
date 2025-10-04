import { db } from '../db.js';
import User from '../models/User.js';
import UserPaymentPlan from '../models/UserPaymentPlan.js';
import WeeklyPayment from '../models/WeeklyPayment.js';
import { recalculateAllGrades } from './gradeCalculation.js';
import { excelLogger as logger } from '../logger.js';
import { calculatePaymentWeek } from '../../utils/fridayWeekCalculator.js';

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
   * 신규 용역자 등록 시 자동 처리 (개선된 워크플로우)
   * 1. 등록 후 트리 구조 생성/변경
   * 2. 변경된 인원 추출
   * 3. 월별로 분리하여 스냅샷 생성
   * 4. 각 월별 변경된 인원에 대해 매출/지급계획 생성
   */
  async processNewUsers(userIds, options = {}) {
    const startTime = Date.now();
    logger.info(`=== 용역자 등록 자동 처리 시작 (개선된 워크플로우) ===`, {
      userCount: userIds.length,
      timestamp: new Date().toISOString()
    });

    try {
      // 1. 트리 구조 변경 및 등급 재계산
      logger.info('1단계: 트리 구조 변경 및 등급 재계산');
      const gradeChangeResult = await this.recalculateGrades();

      // 2. 등록된 사용자들을 월별로 그룹화
      logger.info('2단계: 월별 사용자 그룹화');
      const users = await User.find({ _id: { $in: userIds } });
      const monthGroups = {};

      for (const user of users) {
        const year = user.createdAt.getFullYear();
        const month = user.createdAt.getMonth() + 1;
        const key = `${year}-${month}`;

        if (!monthGroups[key]) {
          monthGroups[key] = {
            year,
            month,
            userIds: [],
            users: []
          };
        }
        monthGroups[key].userIds.push(user._id.toString());
        monthGroups[key].users.push(user);
      }

      // 3. 각 월별로 스냅샷 생성 및 변경된 사용자에 대해서만 처리
      const { default: SnapshotService } = await import('./snapshotService.js');
      const allResults = [];

      for (const [key, group] of Object.entries(monthGroups)) {
        logger.info(`3단계: ${group.year}년 ${group.month}월 스냅샷 생성 및 처리`);

        // 월별 스냅샷 생성 (변경된 사용자 추출)
        const snapshotResult = await SnapshotService.createMonthlySnapshot(
          group.userIds,
          group.year,
          group.month
        );

        logger.info(`${group.year}년 ${group.month}월 변경 사항:`, {
          신규등록: snapshotResult.newUsers.length,
          등급변경: snapshotResult.affectedUsers.filter(u => u.changeType === 'grade_change').length,
          총영향: snapshotResult.affectedUsers.length
        });

        // 4. 해당 월의 변경된 사용자들에 대해서만 매출 계산 및 지급 계획 생성
        if (snapshotResult.affectedUsers.length > 0) {
          // 매출 계산 (해당 월 신규 등록자 기준)
          const revenueResult = await this.calculateMonthlyRevenue(group.year, group.month);

          // 지급 계획 생성 (변경된 사용자들만)
          const affectedUserIds = snapshotResult.affectedUsers.map(u => u.userId);
          const planResult = await this.createUserPaymentPlansForAffectedUsers(
            revenueResult,
            affectedUserIds
          );

          allResults.push({
            month: key,
            snapshot: {
              newUsers: snapshotResult.newUsers.length,
              affectedUsers: snapshotResult.affectedUsers.length,
              gradeDistribution: snapshotResult.gradeDistribution
            },
            revenue: {
              totalRevenue: revenueResult.totalRevenue,
              newUsersCount: revenueResult.newUsersCount
            },
            plans: {
              created: planResult.length,
              users: planResult.map(p => p.userName)
            }
          });
        }
      }

      const processingTime = Date.now() - startTime;
      logger.info(`=== 자동 처리 완료 (${processingTime}ms) ===`, {
        monthsProcessed: Object.keys(monthGroups).length,
        totalResults: allResults
      });

      return {
        success: true,
        processingTime,
        results: allResults.length === 1 ? allResults[0] : { months: allResults }
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
   * @param {Number} targetYear - 계산할 연도 (옵션)
   * @param {Number} targetMonth - 계산할 월 (옵션)
   */
  async calculateMonthlyRevenue(targetYear = null, targetMonth = null) {
    const now = new Date();
    const year = targetYear || now.getFullYear();
    const month = targetMonth || (now.getMonth() + 1);

    // 이번달 신규 가입자 수 조회 (관리자 제외)
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0, 23, 59, 59);

    const newUsersCount = await User.countDocuments({
      createdAt: { $gte: firstDay, $lte: lastDay },
      type: { $ne: 'admin' } // 관리자는 매출 계산에서 제외
    });

    // 총매출 계산 (1인당 100만원)
    const totalRevenue = newUsersCount * 1000000;
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

    // 매출 정보 객체 생성 (MonthlyRevenue 모델 없이)
    const monthlyRevenue = {
      year,
      month,
      totalRevenue,
      newUsersCount,
      revenuePerInstallment,
      gradeDistribution: gradeCount,
      gradePayments,
      isCalculated: true,
      calculatedAt: new Date()
    };

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
      payments.F1 = Math.floor(f1Base / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F1;
    } else {
      payments.F1 = 0;
    }

    // F2 계산 (F1 금액 누적)
    if (gradeCount.F2 > 0 && gradeCount.F2 + gradeCount.F3 > 0) {
      const f2Base = (totalRevenue * gradeRatios.F2) / (gradeCount.F2 + gradeCount.F3);
      const f2Total = f2Base + previousPayment;
      payments.F2 = Math.floor(f2Total / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F2;
    } else {
      payments.F2 = 0;
    }

    // F3 계산 (F2 금액 누적)
    if (gradeCount.F3 > 0 && gradeCount.F3 + gradeCount.F4 > 0) {
      const f3Base = (totalRevenue * gradeRatios.F3) / (gradeCount.F3 + gradeCount.F4);
      const f3Total = f3Base + previousPayment;
      payments.F3 = Math.floor(f3Total / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F3;
    } else {
      payments.F3 = 0;
    }

    // F4 계산 (F3 금액 누적)
    if (gradeCount.F4 > 0 && gradeCount.F4 + gradeCount.F5 > 0) {
      const f4Base = (totalRevenue * gradeRatios.F4) / (gradeCount.F4 + gradeCount.F5);
      const f4Total = f4Base + previousPayment;
      payments.F4 = Math.floor(f4Total / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F4;
    } else {
      payments.F4 = 0;
    }

    // F5 계산 (F4 금액 누적)
    if (gradeCount.F5 > 0 && gradeCount.F5 + gradeCount.F6 > 0) {
      const f5Base = (totalRevenue * gradeRatios.F5) / (gradeCount.F5 + gradeCount.F6);
      const f5Total = f5Base + previousPayment;
      payments.F5 = Math.floor(f5Total / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F5;
    } else {
      payments.F5 = 0;
    }

    // F6 계산 (F5 금액 누적)
    if (gradeCount.F6 > 0 && gradeCount.F6 + gradeCount.F7 > 0) {
      const f6Base = (totalRevenue * gradeRatios.F6) / (gradeCount.F6 + gradeCount.F7);
      const f6Total = f6Base + previousPayment;
      payments.F6 = Math.floor(f6Total / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F6;
    } else {
      payments.F6 = 0;
    }

    // F7 계산 (F6 금액 누적)
    if (gradeCount.F7 > 0 && gradeCount.F7 + gradeCount.F8 > 0) {
      const f7Base = (totalRevenue * gradeRatios.F7) / (gradeCount.F7 + gradeCount.F8);
      const f7Total = f7Base + previousPayment;
      payments.F7 = Math.floor(f7Total / 100) * 100; // 100원 단위 절삭
      previousPayment = payments.F7;
    } else {
      payments.F7 = 0;
    }

    // F8 계산 (F7 금액 누적)
    if (gradeCount.F8 > 0) {
      const f8Base = (totalRevenue * gradeRatios.F8) / gradeCount.F8;
      const f8Total = f8Base + previousPayment;
      payments.F8 = Math.floor(f8Total / 100) * 100; // 100원 단위 절삭
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
    const { year, month, totalRevenue } = monthlyRevenue;

    // 최신 등급 분포 조회 (등급 재계산 후의 실제 분포)
    const gradeDistribution = await User.aggregate([
      { $match: { status: 'active', type: { $ne: 'admin' } } },
      { $group: { _id: '$grade', count: { $sum: 1 } } }
    ]);

    const gradeCount = {
      F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
    };

    gradeDistribution.forEach(item => {
      if (item._id) gradeCount[item._id] = item.count;
    });

    // 등급별 지급액 계산 (최신 등급 분포 사용)
    const gradePayments = this.calculateGradePayments(totalRevenue, gradeCount);

    logger.info(`등급별 지급액 계산:`, {
      totalRevenue,
      gradeCount,
      gradePayments
    });

    // 해당 월에 등록된 사용자들만 조회
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0, 23, 59, 59);

    const users = await User.find({
      status: 'active',
      type: { $ne: 'admin' },
      createdAt: { $gte: firstDay, $lte: lastDay }
    }).select('_id loginId name grade');

    logger.info(`${year}년 ${month}월 등록 사용자 ${users.length}명 발견`);

    const plans = [];

    for (const user of users) {
      const grade = user.grade || 'F1';
      const totalPayment = gradePayments[grade] || 0;
      const installmentAmount = Math.floor((totalPayment / 10) / 100) * 100; // 100원 단위 절삭

      logger.info(`사용자 ${user.name} (${user.loginId}) - 등급: ${grade}, 총지급액: ${totalPayment}, 회당: ${installmentAmount}`);

      // 기존 계획이 있는지 확인
      const existingPlan = await UserPaymentPlan.findOne({
        userId: user._id,
        'revenueMonth.year': year,
        'revenueMonth.month': month
      });

      if (!existingPlan && installmentAmount > 0) {
        const plan = new UserPaymentPlan({
          // 매출 정보
          revenueMonth: {
            year,
            month
          },
          totalRevenue: monthlyRevenue.totalRevenue,
          revenuePerInstallment: monthlyRevenue.revenuePerInstallment,

          // 사용자 정보
          userId: user._id,
          userName: user.name,
          grade,

          // 지급 정보
          amountPerInstallment: installmentAmount,
          totalAmount: totalPayment,

          // 지급 스케줄
          installments: this.generateInstallments(year, month, installmentAmount)
        });

        await plan.save();
        plans.push(plan);
      }
    }

    logger.info(`개인별 지급 계획 생성 완료: ${plans.length}명`);
    return plans;
  }

  /**
   * 변경된 사용자들에 대해서만 지급 계획 생성
   * @param {Object} monthlyRevenue - 월별 매출 정보
   * @param {Array} affectedUserIds - 변경된 사용자 ID 목록
   */
  async createUserPaymentPlansForAffectedUsers(monthlyRevenue, affectedUserIds) {
    const { year, month, totalRevenue } = monthlyRevenue;

    // 현재 등급 분포 조회 (등급 재계산 후의 실제 분포)
    const gradeDistribution = await User.aggregate([
      { $match: { status: 'active', type: { $ne: 'admin' } } },
      { $group: { _id: '$grade', count: { $sum: 1 } } }
    ]);

    const gradeCount = {
      F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
    };

    gradeDistribution.forEach(item => {
      if (item._id) gradeCount[item._id] = item.count;
    });

    // 등급별 지급액 계산
    const gradePayments = this.calculateGradePayments(totalRevenue, gradeCount);

    logger.info(`변경된 사용자 지급 계획 생성:`, {
      affectedUsers: affectedUserIds.length,
      gradePayments
    });

    // 변경된 사용자들만 조회
    const users = await User.find({
      _id: { $in: affectedUserIds },
      status: 'active',
      type: { $ne: 'admin' }
    }).select('_id loginId name grade');

    const plans = [];

    for (const user of users) {
      const grade = user.grade || 'F1';
      const totalPayment = gradePayments[grade] || 0;
      const installmentAmount = Math.floor((totalPayment / 10) / 100) * 100; // 100원 단위 절삭

      // 기존 계획 업데이트 또는 생성
      const existingPlan = await UserPaymentPlan.findOne({
        userId: user._id,
        'revenueMonth.year': year,
        'revenueMonth.month': month
      });

      if (installmentAmount > 0) {
        const planData = {
          revenueMonth: { year, month },
          totalRevenue: monthlyRevenue.totalRevenue,
          revenuePerInstallment: monthlyRevenue.revenuePerInstallment,
          userId: user._id,
          userName: user.name,
          grade,
          amountPerInstallment: installmentAmount,
          totalAmount: totalPayment,
          installments: this.generateInstallments(year, month, installmentAmount)
        };

        if (existingPlan) {
          // 기존 계획 업데이트
          Object.assign(existingPlan, planData);
          await existingPlan.save();
          plans.push(existingPlan);
          logger.info(`지급 계획 업데이트: ${user.name} (${grade})`);
        } else {
          // 새 계획 생성
          const plan = new UserPaymentPlan(planData);
          await plan.save();
          plans.push(plan);
          logger.info(`지급 계획 생성: ${user.name} (${grade})`);
        }
      }
    }

    logger.info(`변경된 사용자 지급 계획 처리 완료: ${plans.length}명`);
    return plans;
  }

  /**
   * 10회 분할 스케줄 생성
   */
  generateInstallments(sourceYear, sourceMonth, amount) {
    const installments = [];

    for (let i = 1; i <= 10; i++) {
      // 정확한 주차 계산 (월별 실제 주차 수 고려)
      const paymentSchedule = calculatePaymentWeek(sourceYear, sourceMonth, i);

      installments.push({
        installmentNumber: i,
        scheduledDate: {
          year: paymentSchedule.year,
          month: paymentSchedule.month,
          week: paymentSchedule.week
        },
        amount,
        status: 'pending',
        paidAt: null
      });
    }

    return installments;
  }
}

// 싱글톤 인스턴스
export const batchProcessor = new BatchProcessor();