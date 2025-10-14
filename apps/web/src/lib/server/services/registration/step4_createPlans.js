/**
 * Step 4: 지급 계획 생성 (3가지 유형)
 *
 * 역할:
 * 1. 이번 배치 등록자 계획 생성
 *    - 미승급자: F1 Initial 계획 (10회)
 *    - 승급자: oldGrade Initial + newGrade Promotion
 * 2. 기존 사용자 중 승급자 계획 생성
 *    - newGrade Promotion 계획 (10회)
 *    - 기존 추가지급 계획 중단
 * 3. 추가지급 대상자 계획 생성
 *    - Additional 계획 (10회)
 */

import User from '../../models/User.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import { createInitialPaymentPlan, createPromotionPaymentPlan } from '../paymentPlanService.js';
import { calculateNextFriday } from '../../utils/dateUtils.js';

/**
 * Step 4 실행
 *
 * @param {Array} users - 이번 배치 등록자 배열
 * @param {Array} promoted - Step 2에서 추출한 승급자 배열
 * @param {Object} targets - Step 3 결과 (promotedTargets, registrantF1Targets, additionalTargets)
 * @param {Object} gradePayments - Step 3에서 계산한 등급별 지급액
 * @param {Object} monthlyReg - Step 2에서 업데이트한 MonthlyRegistrations
 * @param {string} registrationMonth - 귀속월
 * @returns {Promise<Object>}
 */
export async function executeStep4(users, promoted, targets, gradePayments, monthlyReg, registrationMonth) {
  console.log('\n[Step 4] 지급 계획 생성 (3가지 유형)');
  console.log('='.repeat(80));

  const { promotedTargets, registrantF1Targets, additionalTargets } = targets;

  const registrantPlans = [];
  const promotionPlans = [];
  const additionalPlans = [];

  // 4-1. 이번 배치 등록자 계획 생성
  console.log('\n  [4-1. 이번 배치 등록자 계획 생성]');

  for (const user of users) {
    const userId = user.loginId;
    const userName = user.name;
    const registrationDate = user.registrationDate || user.createdAt;

    // 승급 여부 확인
    const promotion = promoted.find(p => p.userId === userId);

    if (promotion) {
      // 승급한 경우: oldGrade Initial + newGrade Promotion
      console.log(`  ${userName}: 승급 (${promotion.oldGrade} → ${promotion.newGrade})`);

      // oldGrade Initial 계획
      const initialPlan = await createInitialPaymentPlan(
        userId,
        userName,
        promotion.oldGrade,
        registrationDate
      );
      registrantPlans.push({
        userId,
        type: 'initial',
        grade: promotion.oldGrade,
        plan: initialPlan._id
      });
      console.log(`    ✓ Initial 계획 생성 (${promotion.oldGrade}): ${initialPlan._id}`);

      // newGrade Promotion 계획
      const promotionPlan = await createPromotionPaymentPlan(
        userId,
        userName,
        promotion.newGrade,
        registrationDate,
        monthlyReg
      );
      promotionPlans.push({
        userId,
        type: 'promotion',
        grade: promotion.newGrade,
        plan: promotionPlan._id
      });
      console.log(`    ✓ Promotion 계획 생성 (${promotion.newGrade}): ${promotionPlan._id}`);

    } else {
      // 미승급 경우: F1 Initial 계획만
      console.log(`  ${userName}: 미승급 (F1)`);

      const initialPlan = await createInitialPaymentPlan(
        userId,
        userName,
        'F1',
        registrationDate
      );
      registrantPlans.push({
        userId,
        type: 'initial',
        grade: 'F1',
        plan: initialPlan._id
      });
      console.log(`    ✓ Initial 계획 생성 (F1): ${initialPlan._id}`);
    }
  }

  // 4-2. 기존 사용자 중 승급자 계획 생성
  console.log('\n  [4-2. 기존 사용자 중 승급자 계획 생성]');

  const currentBatchIds = users.map(u => u.loginId);
  const existingPromoted = promotedTargets.filter(p => !currentBatchIds.includes(p.userId));

  if (existingPromoted.length > 0) {
    console.log(`  기존 사용자 승급: ${existingPromoted.length}명`);

    for (const prom of existingPromoted) {
      const user = await User.findOne({ loginId: prom.userId });
      if (!user) {
        console.log(`    ⚠️ 사용자를 찾을 수 없음: ${prom.userId}`);
        continue;
      }

      console.log(`  ${prom.userName}: ${prom.oldGrade} → ${prom.grade}`);

      // newGrade Promotion 계획 생성
      const promotionPlan = await createPromotionPaymentPlan(
        prom.userId,
        prom.userName,
        prom.grade,
        new Date(),  // 승급일 = 현재
        monthlyReg
      );
      promotionPlans.push({
        userId: prom.userId,
        type: 'promotion',
        grade: prom.grade,
        plan: promotionPlan._id
      });
      console.log(`    ✓ Promotion 계획 생성 (${prom.grade}): ${promotionPlan._id}`);

      // 기존 추가지급 계획 중단
      const terminatedCount = await terminateAdditionalPaymentPlans(prom.userId);
      if (terminatedCount > 0) {
        console.log(`    ✓ 추가지급 계획 중단: ${terminatedCount}건`);
      }
    }
  } else {
    console.log(`  기존 사용자 승급 없음`);
  }

  // 4-3. 추가지급 대상자 계획 생성
  console.log('\n  [4-3. 추가지급 대상자 계획 생성]');

  if (additionalTargets.length > 0) {
    console.log(`  추가지급 대상자: ${additionalTargets.length}명`);

    for (const target of additionalTargets) {
      console.log(`  ${target.userName} (${target.grade})`);

      const additionalPlan = await createAdditionalPaymentPlan(
        target.userId,
        target.userName,
        target.grade,
        registrationMonth,
        gradePayments
      );

      if (additionalPlan) {
        additionalPlans.push({
          userId: target.userId,
          type: 'additional',
          grade: target.grade,
          plan: additionalPlan._id
        });
        console.log(`    ✓ Additional 계획 생성: ${additionalPlan._id}`);
      } else {
        console.log(`    ⚠️ Additional 계획 생성 실패`);
      }
    }
  } else {
    console.log(`  추가지급 대상자 없음`);
  }

  console.log('='.repeat(80));

  return {
    registrantPlans,
    promotionPlans,
    additionalPlans
  };
}

/**
 * 추가지급 계획 생성
 *
 * @param {string} userId
 * @param {string} userName
 * @param {string} grade
 * @param {string} revenueMonth - 매출 귀속 월 (YYYY-MM)
 * @param {Object} gradePayments - 등급별 지급액
 * @returns {Promise<Object|null>}
 */
async function createAdditionalPaymentPlan(userId, userName, grade, revenueMonth, gradePayments) {
  try {
    // 이전 계획 조회 (추가지급단계 계산)
    const previousPlans = await WeeklyPaymentPlans.find({
      userId: userId,
      baseGrade: grade
    }).sort({ 추가지급단계: -1 });

    const latestPlan = previousPlans[0];
    const 추가지급단계 = latestPlan ? (latestPlan.추가지급단계 || 0) + 1 : 1;

    console.log(`    추가지급단계: ${추가지급단계}`);

    // 지급액 계산
    const installmentAmount = gradePayments[grade] || 0;
    if (installmentAmount === 0) {
      console.log(`    ⚠️ 지급액이 0원 - 계획 생성 건너뜀`);
      return null;
    }

    // 지급 시작일 = 다음 달 첫 금요일
    const nextMonthStart = new Date();
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
    nextMonthStart.setDate(1);
    const firstPaymentDate = calculateNextFriday(nextMonthStart);

    // 10회 installments 생성
    const installments = [];
    for (let i = 0; i < 10; i++) {
      const paymentDate = new Date(firstPaymentDate);
      paymentDate.setDate(paymentDate.getDate() + (i * 7));  // 매주 금요일

      installments.push({
        installmentNumber: i + 1,
        scheduledDate: paymentDate,
        installmentAmount: installmentAmount,
        status: 'pending'
      });
    }

    // 계획 생성
    const newPlan = new WeeklyPaymentPlans({
      userId: userId,
      userName: userName,
      planType: 'initial',  // ⭐ TODO: 'additional' 타입 추가 필요
      installmentType: 'additional',
      추가지급단계: 추가지급단계,
      baseGrade: grade,
      revenueMonth: revenueMonth,
      totalInstallments: 10,
      completedInstallments: 0,
      planStatus: 'active',
      installments: installments,
      parentPlanId: latestPlan?._id || null,
      createdBy: 'monthly_check',
      createdAt: new Date()
    });

    await newPlan.save();

    return newPlan;

  } catch (error) {
    console.error(`추가지급 계획 생성 실패 (${userId}):`, error);
    return null;
  }
}

/**
 * 승급 시 추가지급 계획 중단
 *
 * @param {string} userId
 * @returns {Promise<number>} 중단된 계획 수
 */
async function terminateAdditionalPaymentPlans(userId) {
  try {
    const result = await WeeklyPaymentPlans.updateMany(
      {
        userId: userId,
        planStatus: 'active',
        installmentType: 'additional'
      },
      {
        $set: {
          planStatus: 'terminated',
          terminatedBy: 'promotion',
          terminatedAt: new Date()
        }
      }
    );

    return result.modifiedCount || 0;

  } catch (error) {
    console.error(`추가지급 계획 중단 실패 (${userId}):`, error);
    return 0;
  }
}
