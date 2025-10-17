/**
 * Step 6: 처리 완료 및 결과 반환
 *
 * 역할:
 * 1. 로그 출력
 * 2. 결과 객체 구성
 */

import { excelLogger as logger } from '../../logger.js';

/**
 * Step 6 실행
 *
 * @param {Object} params - 모든 처리 결과
 * @returns {Object}
 */
export function executeStep6(params) {

  const {
    registrationCount,
    promoted,
    additionalTargets,
    plans,
    updatedWeeks,
    updatedMonths,
    monthlyReg
  } = params;

  const { registrantPlans, promotionPlans, additionalPlans } = plans;
  const allPlans = [
    ...registrantPlans,
    ...promotionPlans,
    ...additionalPlans
  ];

    신규등록: registrationCount,
    승급자: promoted.length,
    지급계획: allPlans.length,
    추가지급: additionalTargets.length,
    주별총계: updatedWeeks,
    월별총계: updatedMonths
  });


  return {
    success: true,
    registeredUsers: registrationCount,
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
}
