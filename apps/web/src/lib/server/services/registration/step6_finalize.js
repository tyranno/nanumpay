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
  console.log('\n[Step 6] 처리 완료 및 결과 반환');
  console.log('='.repeat(80));

  const {
    users,
    promoted,
    additionalTargets,
    plans,
    monthlyReg
  } = params;

  const { registrantPlans, promotionPlans, additionalPlans } = plans;
  const allPlans = [
    ...registrantPlans,
    ...promotionPlans,
    ...additionalPlans
  ];

  logger.info(`=== 용역자 등록 처리 완료 (v7.0 모듈화) ===`, {
    신규등록: users.length,
    승급자: promoted.length,
    지급계획: allPlans.length,
    추가지급: additionalTargets.length
  });

  console.log(`\n✅ 등록 처리 완료`);
  console.log(`  - 신규 등록: ${users.length}명`);
  console.log(`  - 승급자: ${promoted.length}명`);
  console.log(`  - 지급 계획: ${allPlans.length}건`);
  console.log(`    · Initial: ${registrantPlans.length}건`);
  console.log(`    · Promotion: ${promotionPlans.length}건`);
  console.log(`    · Additional: ${additionalPlans.length}건`);
  console.log(`  - 추가지급: ${additionalTargets.length}명`);
  console.log(`  - 월별 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);
  console.log('='.repeat(80));

  return {
    success: true,
    registeredUsers: users.length,
    promotedUsers: promoted.length,
    additionalPaymentUsers: additionalTargets.length,
    paymentPlans: allPlans.length,
    monthlyReg: {
      monthKey: monthlyReg.monthKey,
      registrationCount: monthlyReg.registrationCount,
      totalRevenue: monthlyReg.totalRevenue,
      promotedCount: monthlyReg.promotedCount,
      nonPromotedCount: monthlyReg.nonPromotedCount
    }
  };
}
