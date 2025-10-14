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

  logger.info(`=== 용역자 등록 처리 완료 (v7.0 모듈화) ===`, {
    신규등록: registrationCount,
    승급자: promoted.length,
    지급계획: allPlans.length,
    추가지급: additionalTargets.length,
    주별총계: updatedWeeks,
    월별총계: updatedMonths
  });

  console.log(`\n✅ 등록 처리 완료`);
  console.log(`  - 신규 등록: ${registrationCount}명`);
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
