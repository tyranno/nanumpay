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
  createPromotionPaymentPlan
} from '../paymentPlanService.js';

/**
 * 등록자 지급 계획 생성 (Initial)
 *
 * @param {Array} registrants - 등록자 목록
 * @returns {Promise<Array>} 생성된 계획 정보
 */
export async function createRegistrantPlans(registrants) {

  const plans = [];

  for (const registrant of registrants) {

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

    if (plan.installments.length > 0) {
      const first = plan.installments[0];
    }
  }


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

  const plans = [];

  for (const prom of promoted) {

    const user = await User.findById(prom.userId);
    if (!user) {
      continue;
    }

    // ⭐ v8.0: 승급 시 기존 모든 active 플랜 종료 (병행 지급 제거)
    const activePlans = await WeeklyPaymentPlans.find({
      userId: user._id,
      planStatus: 'active'
    });

    if (activePlans.length > 0) {
      console.log(`[승급 처리] ${user.name}: 기존 active 플랜 ${activePlans.length}건 종료`);
      
      for (const plan of activePlans) {
        // pending 상태인 installments를 terminated로 변경
        plan.installments.forEach(inst => {
          if (inst.status === 'pending') {
            inst.status = 'terminated';
          }
        });
        
        plan.planStatus = 'terminated';
        plan.terminatedAt = new Date();
        plan.terminationReason = 'promotion';
        plan.terminatedBy = 'promotion_additional_stop';
        
        await plan.save();
        console.log(`  - [종료] ${plan.planType} ${plan.baseGrade} (${plan.revenueMonth}): ${plan.completedInstallments}/${plan.totalInstallments}회 완료`);
      }
    }

    // ⭐ 중요: 업데이트된 monthlyReg 객체를 직접 전달!
    const promotionPlan = await createPromotionPaymentPlan(
      user._id,
      user.name,
      prom.newGrade,
      promotionDate,
      updatedMonthlyReg
    );

    plans.push({
      userId: user._id.toString(),
      type: 'promotion',
      plan: promotionPlan._id,
      planObject: promotionPlan,
      terminatedPlans: activePlans.map(p => p._id)
    });
  }


  return plans;
}

/**
