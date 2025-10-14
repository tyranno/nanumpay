/**
 * Registration 모듈 통합 export
 *
 * v7.0 모듈화 구조 (6단계)
 */

// Step 2: 등급 재계산 및 월별 인원 관리
export { executeStep2 } from './step2_gradeAndMonthly.js';

// Step 3: 지급 대상자 확정 및 등급별 인원 구성
export { executeStep3 } from './step3_paymentTargets.js';

// Step 4: 지급 계획 생성 (3가지 유형)
export { executeStep4 } from './step4_createPlans.js';

// Step 5: WeeklyPaymentSummary 업데이트
export { executeStep5 } from './step5_updateSummary.js';

// Step 6: 처리 완료 및 결과 반환
export { executeStep6 } from './step6_finalize.js';
