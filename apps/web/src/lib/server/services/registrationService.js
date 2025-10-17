/**
 * 용역자 등록 서비스 v7.0 (모듈화 버전)
 *
 * 변경사항:
 * - 복잡한 processUserRegistration을 5단계로 간소화
 * - 각 단계를 별도 모듈로 분리
 * - 명확한 책임 분리 및 유지보수 용이성 향상
 *
 * 처리 흐름:
 * Step 1: 사용자 정보 조회
 * Step 2: 등급 재계산 및 월별 인원 관리 ⭐ 핵심
 * Step 3: 지급 대상자 확정 및 등급별 인원 구성
 * Step 4: 지급 계획 생성 (3가지 유형)
 * Step 5: 주별/월별 총계 업데이트
 */

import User from '../models/User.js';
import { excelLogger as logger } from '../logger.js';

// Step 모듈 import
import {
  executeStep2,
  executeStep3,
  executeStep4,
  executeStep5
} from './registration/index.js';

/**
 * 용역자 등록 시 전체 프로세스 처리 (v7.0 모듈화)
 *
 * @param {Array} userIds - 등록할 사용자 ID 배열 (MongoDB ObjectId)
 * @returns {Promise<Object>} 처리 결과
 */
export async function processUserRegistration(userIds) {
  try {
    // ========================================
    // Step 1: 사용자 정보 조회
    // ========================================
    const users = await User.find({ _id: { $in: userIds } });
    if (!users || users.length === 0) {
      throw new Error('등록된 사용자를 찾을 수 없습니다.');
    }


    // ========================================
    // Step 2: 등급 재계산 및 월별 인원 관리 ⭐ 핵심
    // ========================================
    const step2Result = await executeStep2(users);
    const { promoted, monthlyReg, registrationMonth } = step2Result;

    // ========================================
    // Step 3: 지급 대상자 확정 및 등급별 인원 구성
    // ========================================
    const step3Result = await executeStep3(promoted, monthlyReg, registrationMonth);
    const {
      promotedTargets,
      registrantF1Targets,
      additionalTargets,
      gradeDistribution,
      gradePayments
    } = step3Result;

    // ========================================
    // Step 4: 지급 계획 생성 (3가지 유형) + paymentTargets 저장
    // ========================================
    const step4Result = await executeStep4(
      promoted,
      { promotedTargets, registrantF1Targets, additionalTargets },
      gradePayments,
      monthlyReg,
      registrationMonth
    );
    const { registrantPlans, promotionPlans, additionalPlans } = step4Result;

    // ========================================
    // Step 5: 주별/월별 총계 업데이트
    // ========================================
    const step5Result = await executeStep5(
      { registrantPlans, promotionPlans, additionalPlans },
      registrationMonth
    );
    const { updatedWeeks, updatedMonths } = step5Result;

    // ========================================
    // 처리 완료 및 결과 반환
    // ========================================
    const allPlans = [
      ...registrantPlans,
      ...promotionPlans,
      ...additionalPlans
    ];


    return {
      success: true,
      registeredUsers: users.length,
      promotedUsers: promoted.length,
      additionalPaymentUsers: additionalTargets.length,
      paymentPlans: allPlans.length,
      updatedWeeks,
      updatedMonths,
      monthlyReg: {
        monthKey: monthlyReg.monthKey,
        registrationCount: monthlyReg.registrationCount,
        totalRevenue: monthlyReg.totalRevenue,
        totalPayment: monthlyReg.totalPayment || 0,
        promotedCount: monthlyReg.promotedCount,
        nonPromotedCount: monthlyReg.nonPromotedCount
      }
    };

  } catch (error) {
    logger.error('용역자 등록 처리 실패:', error);
    throw error;
  }
}

/**
 * 보험 설정 업데이트
 *
 * @param {string} userId - 사용자 로그인 ID
 * @param {Object} insuranceSettings - 보험 설정
 * @returns {Promise<Object>}
 */
export async function updateUserInsuranceSettings(userId, insuranceSettings) {
  try {
    const user = await User.findOne({ loginId: userId });
    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    // 보험 설정 업데이트
    user.insuranceSettings = {
      ...user.insuranceSettings,
      ...insuranceSettings,
      lastUpdated: new Date()
    };

    // 보험 이력 추가
    if (!user.insuranceHistory) {
      user.insuranceHistory = [];
    }

    const MonthlyRegistrations = (await import('../models/MonthlyRegistrations.js')).default;
    user.insuranceHistory.push({
      period: MonthlyRegistrations.generateMonthKey(new Date()),
      maintained: insuranceSettings.maintained,
      amount: insuranceSettings.amount
    });

    await user.save();

    return {
      success: true,
      userId,
      insuranceSettings: user.insuranceSettings
    };
  } catch (error) {
    logger.error('보험 설정 업데이트 실패:', error);
    throw error;
  }
}
