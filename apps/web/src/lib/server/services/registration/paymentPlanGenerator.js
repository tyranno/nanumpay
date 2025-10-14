/**
 * 지급 계획 생성 모듈 v7.0
 *
 * 역할: 등록자, 승급자, 추가지급 대상자의 지급 계획 생성
 *
 * 기존 paymentPlanService.js 함수들을 활용하되,
 * 명확한 인터페이스로 제공
 */

import User from '../../models/User.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import {
  createInitialPaymentPlan,
  createPromotionPaymentPlan,
  createMonthlyAdditionalPayments
} from '../paymentPlanService.js';

/**
 * 등록자 지급 계획 생성 (Initial)
 *
 * @param {Array} registrants - 등록자 목록
 * @returns {Promise<Array>} 생성된 계획 정보
 */
export async function createRegistrantPlans(registrants) {
  console.log('\n[paymentPlanGenerator] 등록자 지급 계획 생성 시작');
  console.log(`  대상자: ${registrants.length}명`);

  const plans = [];

  for (const registrant of registrants) {
    console.log(`  - ${registrant.userName} (${registrant.grade})`);

    const plan = await createInitialPaymentPlan(
      registrant.userId,
      registrant.userName,
      registrant.grade,
      registrant.registrationDate
    );

    plans.push({
      userId: registrant.userId,
      type: 'initial',
      plan: plan._id,
      planObject: plan
    });

    console.log(`    ✓ Initial 계획 생성 완료: ${plan.installments.length}개 할부`);
    if (plan.installments.length > 0) {
      const first = plan.installments[0];
      console.log(`      첫 지급: ${first.weekNumber} (${first.paymentDate?.toISOString().split('T')[0]})`);
    }
  }

  console.log(`  ✅ 등록자 ${plans.length}건 계획 생성 완료`);

  return plans;
}

/**
 * 승급자 지급 계획 생성 (Promotion) + 기존 추가지급 중단
 *
 * @param {Array} promoted - 승급자 목록
 * @param {Date} promotionDate - 승급일
 * @param {Object} updatedMonthlyReg - 업데이트된 MonthlyRegistrations 객체
 * @returns {Promise<Array>} 생성된 계획 정보
 */
export async function createPromotionPlans(promoted, promotionDate, updatedMonthlyReg) {
  console.log('\n[paymentPlanGenerator] 승급자 지급 계획 생성 시작');
  console.log(`  대상자: ${promoted.length}명`);
  console.log(`  승급일: ${promotionDate.toISOString().split('T')[0]}`);

  const plans = [];

  for (const prom of promoted) {
    console.log(`  - ${prom.userName}: ${prom.oldGrade} → ${prom.newGrade}`);

    const user = await User.findOne({ loginId: prom.userId });
    if (!user) {
      console.log(`    ⚠️ 사용자를 찾을 수 없음: ${prom.userId}`);
      continue;
    }

    // ⭐ 중요: 업데이트된 monthlyReg 객체를 직접 전달!
    const promotionPlan = await createPromotionPaymentPlan(
      user.loginId,
      user.name,
      prom.newGrade,
      promotionDate,
      updatedMonthlyReg
    );

    console.log(`    ✓ Promotion 계획 생성 완료: ${promotionPlan._id}`);
    console.log(`      매출월: ${promotionPlan.revenueMonth}`);
    console.log(`      금액: ${promotionPlan.installments[0]?.installmentAmount || 0}원`);

    // ⭐ 중요: 같은 달에 등록+승급이 일어난 경우, Initial 계획 삭제!
    const initialPlan = await WeeklyPaymentPlans.findOne({
      userId: user.loginId,
      planType: 'initial',
      revenueMonth: promotionPlan.revenueMonth  // 같은 매출월
    });

    if (initialPlan) {
      console.log(`    [삭제] ${user.name}의 Initial 계획 삭제 (같은 달 등록+승급) - ID: ${initialPlan._id}`);
      await WeeklyPaymentPlans.deleteOne({ _id: initialPlan._id });
    }

    plans.push({
      userId: user.loginId,
      type: 'promotion',
      plan: promotionPlan._id,
      planObject: promotionPlan,
      deletedInitialPlan: initialPlan?._id
    });
  }

  console.log(`  ✅ 승급자 ${plans.length}건 계획 생성 완료`);

  return plans;
}

/**
 * 매월 추가지급 확인 및 생성 (v7.0)
 *
 * @param {string} registrationMonth - 등록 월 (YYYY-MM)
 * @returns {Promise<Object>} 추가지급 정보 { count, targets }
 */
export async function checkAndCreateAdditionalPayments(registrationMonth) {
  console.log('\n[paymentPlanGenerator] v7.0 매월 추가지급 확인 시작');
  console.log('='.repeat(80));
  console.log('📋 v7.0 핵심 로직: 매월 승급 없는 대상자에게 추가지급 생성');
  console.log('='.repeat(80));
  console.log(`  등록 월: ${registrationMonth}`);

  // 매월 추가지급 생성 (이전 월 대상자 확인)
  const additionalPaymentsInfo = await createMonthlyAdditionalPayments(registrationMonth);

  console.log('='.repeat(80));
  console.log(`[paymentPlanGenerator] v7.0 매월 추가지급 생성 완료: ${additionalPaymentsInfo?.count || 0}건`);

  return additionalPaymentsInfo;
}
