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

    // ⭐ 중요: 업데이트된 monthlyReg 객체를 직접 전달!
    const promotionPlan = await createPromotionPaymentPlan(
      user._id,
      user.name,
      prom.newGrade,
      promotionDate,
      updatedMonthlyReg
    );


    // ⭐ 중요: 같은 달에 등록+승급이 일어난 경우, Initial 계획 삭제!
    const initialPlan = await WeeklyPaymentPlans.findOne({
      userId: user._id,
      planType: 'initial',
      revenueMonth: promotionPlan.revenueMonth  // 같은 매출월
    });

    if (initialPlan) {
      await WeeklyPaymentPlans.deleteOne({ _id: initialPlan._id });
    }

    plans.push({
      userId: user._id.toString(),
      type: 'promotion',
      plan: promotionPlan._id,
      planObject: promotionPlan,
      deletedInitialPlan: initialPlan?._id
    });
  }


  return plans;
}

/**
