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
    logger.info(`=== 용역자 등록 처리 시작 (v7.0 모듈화) ===`, {
      userCount: userIds.length,
      timestamp: new Date().toISOString()
    });

    console.log('\n');
    console.log('='.repeat(80));
    console.log('📋 용역자 등록 처리 v7.0 (5단계)');
    console.log('='.repeat(80));

    // ========================================
    // Step 1: 사용자 정보 조회
    // ========================================
    console.log('\n[Step 1] 사용자 정보 조회');
    console.log('='.repeat(80));

    const users = await User.find({ _id: { $in: userIds } });
    if (!users || users.length === 0) {
      throw new Error('등록된 사용자를 찾을 수 없습니다.');
    }

    console.log(`  등록 대상: ${users.length}명`);
    users.forEach(u => {
      const regDate = u.registrationDate || u.createdAt;
      console.log(`    - ${u.name} (${u.loginId}), 등록일: ${regDate?.toISOString().split('T')[0]}, 등급: ${u.grade}`);
    });

    console.log('='.repeat(80));

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

    logger.info(`=== 용역자 등록 처리 완료 (v7.0 모듈화) ===`, {
      신규등록: users.length,
      승급자: promoted.length,
      지급계획: allPlans.length,
      추가지급: additionalTargets.length,
      주별총계: updatedWeeks,
      월별총계: updatedMonths
    });

    console.log('\n');
    console.log('='.repeat(80));
    console.log(`✅ 등록 처리 완료`);
    console.log('='.repeat(80));
    console.log(`  - 신규 등록: ${users.length}명`);
    console.log(`  - 승급자: ${promoted.length}명`);
    console.log(`  - 추가지급: ${additionalTargets.length}명`);
    console.log(`\n  - 지급 계획: ${allPlans.length}건`);
    console.log(`    · Initial: ${registrantPlans.length}건`);
    console.log(`    · Promotion: ${promotionPlans.length}건`);
    console.log(`    · Additional: ${additionalPlans.length}건`);
    console.log(`\n  - 총계 업데이트:`);
    console.log(`    · 주별 총계: ${updatedWeeks}건`);
    console.log(`    · 월별 총계: ${updatedMonths}건`);
    console.log(`\n  - 월별 정보:`);
    console.log(`    · 귀속월: ${monthlyReg.monthKey}`);
    console.log(`    · 등록자: ${monthlyReg.registrationCount}명 (승급 ${monthlyReg.promotedCount}명, 미승급 ${monthlyReg.nonPromotedCount}명)`);
    console.log(`    · 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);
    console.log(`    · 총 지급액: ${monthlyReg.totalPayment?.toLocaleString() || 0}원`);
    console.log('='.repeat(80));

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
    console.error('❌ 등록 처리 실패:', error);
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
